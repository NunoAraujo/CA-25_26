import { Journal } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "./prisma";
import { getOrCreateDefaultUser } from "./defaultUser";
import {
  inferAudioExtension,
  normalizeDurationSeconds,
} from "./audioFileValidation";
import {
  buildInternalObjectUrl,
  buildPublicObjectUrl,
  uploadAudioObject,
} from "./minio";
import { enqueueAnalysisJob } from "./analysisQueue";

type UploadedAudioFile = {
  mimetype: string;
  originalname: string;
  buffer: Buffer;
};

export async function listJournals() {
  const journals = await prisma.journal.findMany({
    where: { deletedAt: null },
    orderBy: { uploadedAt: "desc" },
    include: {
      prosodyFeature: true,
    },
  });

  return { journals, total: journals.length };
}

export type CreateJournalResult = {
  type: "created";
  payload: {
    id: string;
    status: Journal["status"];
    jobId: string;
    audioUrl: string;
    createdAt: Date;
  };
};

export async function createJournalFromAudioUpload(
  file: UploadedAudioFile,
  rawDurationSeconds: unknown,
  rawRecordedAt: unknown,
): Promise<CreateJournalResult> {
  const defaultUser = await getOrCreateDefaultUser();
  const extension = inferAudioExtension(file.mimetype, file.originalname);
  const objectKey = `journals/${defaultUser.id}/${uuidv4()}.${extension}`;
  const durationSeconds = normalizeDurationSeconds(rawDurationSeconds);
  const recordedAt =
    typeof rawRecordedAt === "string" ? new Date(rawRecordedAt) : undefined;

  await uploadAudioObject(objectKey, file.buffer, file.mimetype);

  const journal = await prisma.journal.create({
    data: {
      userId: defaultUser.id,
      audioObjectKey: objectKey,
      audioUrl: buildInternalObjectUrl(objectKey),
      durationSeconds,
      recordedAt:
        recordedAt && !Number.isNaN(recordedAt.getTime()) ? recordedAt : null,
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

    return {
      type: "created",
      payload: {
        id: journal.id,
        status: journal.status,
        jobId: String(job.id),
        audioUrl: buildPublicObjectUrl(objectKey),
        createdAt: journal.uploadedAt,
      },
    };
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
}

export async function getJournalById(journalId: string) {
  return prisma.journal.findFirst({
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
}

export async function getJournalStatus(journalId: string) {
  return prisma.journal.findUnique({
    where: { id: journalId },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      statusUpdatedAt: true,
    },
  });
}

export type DeleteJournalResult = "not_found" | "deleted";

export async function softDeleteJournal(
  journalId: string,
): Promise<DeleteJournalResult> {
  const existing = await prisma.journal.findUnique({
    where: { id: journalId },
  });

  if (!existing || existing.deletedAt) {
    return "not_found";
  }

  await prisma.journal.update({
    where: { id: journalId },
    data: { deletedAt: new Date() },
  });

  return "deleted";
}
