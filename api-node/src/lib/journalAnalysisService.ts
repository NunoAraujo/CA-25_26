import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildProsodyFeatureData } from "./audioFileValidation";

type EkmanEmotionVector = {
  joy?: number;
  sadness?: number;
  anger?: number;
  fear?: number;
  disgust?: number;
  surprise?: number;
  neutral?: number;
};

type LegacyEmotionVector = {
  anxiety?: number;
  calm?: number;
  energy?: number;
};

type CallbackPayload = {
  status: "complete" | "failed";
  transcription?: string | null;
  transcriptionModelKey?: string | null;
  transcriptionModelId?: string | null;
  emotionVector?: EkmanEmotionVector & LegacyEmotionVector;
  semanticScores?: (EkmanEmotionVector & LegacyEmotionVector) | null;
  prosodyScores?: (EkmanEmotionVector & LegacyEmotionVector) | null;
  prosodyFeatures?: Record<string, unknown>;
  semanticWeight?: number;
  prosodyWeight?: number;
  modelVersion?: string;
  errorMessage?: string;
};

export type CallbackProcessingResult =
  | { type: "not_found" }
  | { type: "duplicate"; status: "complete" | "failed" }
  | { type: "conflict"; status: string }
  | { type: "accepted" };

function mapEmotionVector(value?: EkmanEmotionVector & LegacyEmotionVector) {
  const source = value ?? {};

  return {
    joyScore: typeof source.joy === "number" ? source.joy : null,
    sadnessScore: typeof source.sadness === "number" ? source.sadness : null,
    angerScore: typeof source.anger === "number" ? source.anger : null,
    fearScore:
      typeof source.fear === "number"
        ? source.fear
        : typeof source.anxiety === "number"
          ? source.anxiety
          : null,
    disgustScore:
      typeof source.disgust === "number"
        ? source.disgust
        : typeof source.calm === "number"
          ? source.calm
          : null,
    surpriseScore:
      typeof source.surprise === "number"
        ? source.surprise
        : typeof source.energy === "number"
          ? source.energy
          : null,
  };
}

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

  const emotionVector = mapEmotionVector(value.emotionVector);
  const prosodyFeatures = value.prosodyFeatures;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.journal.update({
      where: { id: journalId },
      data: {
        status: value.status,
        transcription: value.transcription ?? null,
        transcriptionModelKey: value.transcriptionModelKey ?? null,
        transcriptionModelId: value.transcriptionModelId ?? null,
        errorMessage: value.errorMessage ?? null,
        semanticWeight: value.semanticWeight ?? undefined,
        prosodyWeight: value.prosodyWeight ?? undefined,
        modelVersion: value.modelVersion ?? undefined,
        ...emotionVector,
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
