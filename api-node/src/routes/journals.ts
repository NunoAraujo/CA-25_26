import { NextFunction, Request, Response, Router } from "express";
import Joi from "joi";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import { getOrCreateDefaultUser } from "../lib/defaultUser";
import {
  buildInternalObjectUrl,
  buildPublicObjectUrl,
  uploadAudioObject,
} from "../lib/minio";
import { enqueueAnalysisJob } from "../lib/analysisQueue";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

const allowedMimeTypes = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
]);

const callbackSchema = Joi.object({
  status: Joi.string().valid("complete", "failed").required(),
  transcription: Joi.string().allow(null, ""),
  emotionVector: Joi.object({
    joy: Joi.number(),
    sadness: Joi.number(),
    anger: Joi.number(),
    anxiety: Joi.number(),
    calm: Joi.number(),
    energy: Joi.number(),
  }).optional(),
  prosodyFeatures: Joi.object().optional(),
  errorMessage: Joi.string().optional(),
});

function inferAudioExtension(mimeType: string, originalName: string) {
  const filenameExtension = originalName.includes(".")
    ? originalName.split(".").pop()?.toLowerCase()
    : undefined;

  if (filenameExtension) {
    return filenameExtension;
  }

  if (mimeType.includes("webm")) {
    return "webm";
  }

  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "wav";
}

function normalizeDurationSeconds(rawValue: unknown) {
  if (typeof rawValue !== "string") {
    return 0;
  }

  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function buildProsodyFeatureData(prosodyFeatures: Record<string, unknown>) {
  return {
    meanPitchHz: numberOrNull(prosodyFeatures.meanPitchHz),
    pitchStdDev: numberOrNull(prosodyFeatures.pitchStdDev),
    minPitchHz: numberOrNull(prosodyFeatures.minPitchHz),
    maxPitchHz: numberOrNull(prosodyFeatures.maxPitchHz),
    pitchContourReg: numberOrNull(prosodyFeatures.pitchContourReg),
    meanEnergy: numberOrNull(prosodyFeatures.meanEnergy),
    energyStdDev: numberOrNull(prosodyFeatures.energyStdDev),
    speechRate: numberOrNull(prosodyFeatures.speechRate),
    pauseRatio: numberOrNull(prosodyFeatures.pauseRatio),
    mfccMean: Array.isArray(prosodyFeatures.mfccMean)
      ? prosodyFeatures.mfccMean.filter(
          (item): item is number => typeof item === "number",
        )
      : [],
    spectralCentroid: numberOrNull(prosodyFeatures.spectralCentroid),
    spectralSpread: numberOrNull(prosodyFeatures.spectralSpread),
    jitter: numberOrNull(prosodyFeatures.jitter),
    shimmer: numberOrNull(prosodyFeatures.shimmer),
    voicedRatio: numberOrNull(prosodyFeatures.voicedRatio),
  };
}

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const journals = await prisma.journal.findMany({
      where: { deletedAt: null },
      orderBy: { uploadedAt: "desc" },
      include: {
        prosodyFeature: true,
      },
    });

    res.json({ journals, total: journals.length });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  upload.single("audio"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "Audio file is required" });
      }

      if (!allowedMimeTypes.has(file.mimetype)) {
        return res.status(400).json({
          message: "Unsupported audio format",
          supportedFormats: Array.from(allowedMimeTypes),
        });
      }

      const defaultUser = await getOrCreateDefaultUser();
      const extension = inferAudioExtension(file.mimetype, file.originalname);
      const objectKey = `journals/${defaultUser.id}/${uuidv4()}.${extension}`;
      const durationSeconds = normalizeDurationSeconds(
        req.body.durationSeconds,
      );
      const recordedAt =
        typeof req.body.recordedAt === "string"
          ? new Date(req.body.recordedAt)
          : undefined;

      await uploadAudioObject(objectKey, file.buffer, file.mimetype);

      const journal = await prisma.journal.create({
        data: {
          userId: defaultUser.id,
          audioObjectKey: objectKey,
          audioUrl: buildInternalObjectUrl(objectKey),
          durationSeconds,
          recordedAt:
            recordedAt && !Number.isNaN(recordedAt.getTime())
              ? recordedAt
              : null,
          status: "queued",
        },
      });

      try {
        const job = await enqueueAnalysisJob({
          journalId: journal.id,
          audioObjectKey: objectKey,
          audioUrl: journal.audioUrl,
          durationSeconds,
          language: "pt-BR",
        });

        return res.status(201).json({
          id: journal.id,
          status: journal.status,
          jobId: String(job.id),
          audioUrl: buildPublicObjectUrl(objectKey),
          createdAt: journal.uploadedAt,
        });
      } catch (queueError) {
        await prisma.journal.update({
          where: { id: journal.id },
          data: {
            status: "failed",
            errorMessage:
              queueError instanceof Error
                ? queueError.message
                : "Failed to queue analysis job",
          },
        });

        throw queueError;
      }
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/:journalId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);

      const journal = await prisma.journal.findFirst({
        where: {
          id: journalId,
          deletedAt: null,
        },
        include: {
          prosodyFeature: true,
          journalSuggestions: {
            include: {
              recommendation: true,
            },
          },
        },
      });

      if (!journal) {
        return res.status(404).json({ message: "Journal not found" });
      }

      return res.json(journal);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/:journalId/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);

      const journal = await prisma.journal.findUnique({
        where: { id: journalId },
        select: {
          id: true,
          status: true,
          errorMessage: true,
          statusUpdatedAt: true,
        },
      });

      if (!journal) {
        return res.status(404).json({ message: "Journal not found" });
      }

      return res.json(journal);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/:journalId/analysis-callback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);
      const { error, value } = callbackSchema.validate(req.body, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          message: "Invalid callback payload",
          details: error.details,
        });
      }

      const journal = await prisma.journal.findUnique({
        where: { id: journalId },
      });

      if (!journal) {
        return res.status(404).json({ message: "Journal not found" });
      }

      const journalIsFinal =
        journal.status === "complete" || journal.status === "failed";

      if (journalIsFinal) {
        if (journal.status === value.status) {
          return res.json({
            message: "Duplicate callback ignored",
            status: journal.status,
          });
        }

        return res.status(409).json({
          message: "Journal already finalized with a different status",
          status: journal.status,
        });
      }

      const emotionVector = value.emotionVector ?? {};
      const prosodyFeatures = value.prosodyFeatures as
        | Record<string, unknown>
        | undefined;

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.journal.update({
          where: { id: journalId },
          data: {
            status: value.status,
            transcription: value.transcription ?? null,
            errorMessage: value.errorMessage ?? null,
            joyScore: emotionVector.joy ?? null,
            sadnessScore: emotionVector.sadness ?? null,
            angerScore: emotionVector.anger ?? null,
            anxietyScore: emotionVector.anxiety ?? null,
            calmScore: emotionVector.calm ?? null,
            energyScore: emotionVector.energy ?? null,
          },
        });

        if (prosodyFeatures) {
          const prosodyData = buildProsodyFeatureData(prosodyFeatures);

          await tx.prosodyFeature.upsert({
            where: { journalId },
            create: {
              journalId,
              ...prosodyData,
            },
            update: prosodyData,
          });
        }
      });

      return res.json({ message: "Analysis callback accepted" });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  "/:journalId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);
      const existing = await prisma.journal.findUnique({
        where: { id: journalId },
      });

      if (!existing || existing.deletedAt) {
        return res.status(404).json({ message: "Journal not found" });
      }

      await prisma.journal.update({
        where: { id: journalId },
        data: { deletedAt: new Date() },
      });

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
