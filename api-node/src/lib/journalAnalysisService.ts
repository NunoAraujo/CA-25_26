import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildProsodyFeatureData } from "./audioFileValidation";

type CallbackPayload = {
  status: "complete" | "failed";
  transcription?: string | null;
  emotionVector?: {
    joy?: number;
    sadness?: number;
    anger?: number;
    anxiety?: number;
    calm?: number;
    energy?: number;
  };
  prosodyFeatures?: Record<string, unknown>;
  errorMessage?: string;
};

export type CallbackProcessingResult =
  | { type: "not_found" }
  | { type: "duplicate"; status: "complete" | "failed" }
  | { type: "conflict"; status: string }
  | { type: "accepted" };

export async function processJournalAnalysisCallback(
  journalId: string,
  value: CallbackPayload,
): Promise<CallbackProcessingResult> {
  const journal = await prisma.journal.findUnique({
    where: { id: journalId },
  });

  if (!journal) {
    return { type: "not_found" };
  }

  const journalIsFinal =
    journal.status === "complete" || journal.status === "failed";

  if (journalIsFinal) {
    if (journal.status === value.status) {
      return { type: "duplicate", status: journal.status };
    }

    return { type: "conflict", status: journal.status };
  }

  const emotionVector = value.emotionVector ?? {};
  const prosodyFeatures = value.prosodyFeatures;

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

  return { type: "accepted" };
}
