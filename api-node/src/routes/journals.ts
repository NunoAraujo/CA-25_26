import { NextFunction, Request, Response, Router } from "express";
import Joi from "joi";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const router = Router();

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

router.post("/", async (_req: Request, res: Response) => {
  res.status(501).json({
    message: "Audio upload pipeline will be implemented in Phase 3.",
  });
});

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
        return res
          .status(400)
          .json({
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
          await tx.prosodyFeature.upsert({
            where: { journalId },
            create: {
              journalId,
              meanPitchHz:
                typeof prosodyFeatures.meanPitchHz === "number"
                  ? prosodyFeatures.meanPitchHz
                  : null,
              pitchStdDev:
                typeof prosodyFeatures.pitchStdDev === "number"
                  ? prosodyFeatures.pitchStdDev
                  : null,
              minPitchHz:
                typeof prosodyFeatures.minPitchHz === "number"
                  ? prosodyFeatures.minPitchHz
                  : null,
              maxPitchHz:
                typeof prosodyFeatures.maxPitchHz === "number"
                  ? prosodyFeatures.maxPitchHz
                  : null,
              pitchContourReg:
                typeof prosodyFeatures.pitchContourReg === "number"
                  ? prosodyFeatures.pitchContourReg
                  : null,
              meanEnergy:
                typeof prosodyFeatures.meanEnergy === "number"
                  ? prosodyFeatures.meanEnergy
                  : null,
              energyStdDev:
                typeof prosodyFeatures.energyStdDev === "number"
                  ? prosodyFeatures.energyStdDev
                  : null,
              speechRate:
                typeof prosodyFeatures.speechRate === "number"
                  ? prosodyFeatures.speechRate
                  : null,
              pauseRatio:
                typeof prosodyFeatures.pauseRatio === "number"
                  ? prosodyFeatures.pauseRatio
                  : null,
              mfccMean: Array.isArray(prosodyFeatures.mfccMean)
                ? prosodyFeatures.mfccMean.filter(
                    (item): item is number => typeof item === "number",
                  )
                : [],
              spectralCentroid:
                typeof prosodyFeatures.spectralCentroid === "number"
                  ? prosodyFeatures.spectralCentroid
                  : null,
              spectralSpread:
                typeof prosodyFeatures.spectralSpread === "number"
                  ? prosodyFeatures.spectralSpread
                  : null,
              jitter:
                typeof prosodyFeatures.jitter === "number"
                  ? prosodyFeatures.jitter
                  : null,
              shimmer:
                typeof prosodyFeatures.shimmer === "number"
                  ? prosodyFeatures.shimmer
                  : null,
              voicedRatio:
                typeof prosodyFeatures.voicedRatio === "number"
                  ? prosodyFeatures.voicedRatio
                  : null,
            },
            update: {
              meanPitchHz:
                typeof prosodyFeatures.meanPitchHz === "number"
                  ? prosodyFeatures.meanPitchHz
                  : null,
              pitchStdDev:
                typeof prosodyFeatures.pitchStdDev === "number"
                  ? prosodyFeatures.pitchStdDev
                  : null,
              minPitchHz:
                typeof prosodyFeatures.minPitchHz === "number"
                  ? prosodyFeatures.minPitchHz
                  : null,
              maxPitchHz:
                typeof prosodyFeatures.maxPitchHz === "number"
                  ? prosodyFeatures.maxPitchHz
                  : null,
              pitchContourReg:
                typeof prosodyFeatures.pitchContourReg === "number"
                  ? prosodyFeatures.pitchContourReg
                  : null,
              meanEnergy:
                typeof prosodyFeatures.meanEnergy === "number"
                  ? prosodyFeatures.meanEnergy
                  : null,
              energyStdDev:
                typeof prosodyFeatures.energyStdDev === "number"
                  ? prosodyFeatures.energyStdDev
                  : null,
              speechRate:
                typeof prosodyFeatures.speechRate === "number"
                  ? prosodyFeatures.speechRate
                  : null,
              pauseRatio:
                typeof prosodyFeatures.pauseRatio === "number"
                  ? prosodyFeatures.pauseRatio
                  : null,
              mfccMean: Array.isArray(prosodyFeatures.mfccMean)
                ? prosodyFeatures.mfccMean.filter(
                    (item): item is number => typeof item === "number",
                  )
                : [],
              spectralCentroid:
                typeof prosodyFeatures.spectralCentroid === "number"
                  ? prosodyFeatures.spectralCentroid
                  : null,
              spectralSpread:
                typeof prosodyFeatures.spectralSpread === "number"
                  ? prosodyFeatures.spectralSpread
                  : null,
              jitter:
                typeof prosodyFeatures.jitter === "number"
                  ? prosodyFeatures.jitter
                  : null,
              shimmer:
                typeof prosodyFeatures.shimmer === "number"
                  ? prosodyFeatures.shimmer
                  : null,
              voicedRatio:
                typeof prosodyFeatures.voicedRatio === "number"
                  ? prosodyFeatures.voicedRatio
                  : null,
            },
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
