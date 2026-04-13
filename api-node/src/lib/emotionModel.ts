import { DailyTrend, Journal } from "@prisma/client";

export type EkmanEmotionKey =
  | "joy"
  | "sadness"
  | "anger"
  | "fear"
  | "disgust"
  | "surprise";

export const ekmanEmotionKeys: EkmanEmotionKey[] = [
  "joy",
  "sadness",
  "anger",
  "fear",
  "disgust",
  "surprise",
];

type ExternalEmotionVector = Partial<Record<EkmanEmotionKey | "anxiety" | "calm" | "energy", number | null | undefined>>;

type JournalLike = Partial<Journal> & Record<string, unknown>;
type DailyTrendLike = Partial<DailyTrend> & Record<string, unknown>;

export function mapExternalEmotionVectorToStorage(vector: ExternalEmotionVector) {
  return {
    joy: typeof vector.joy === "number" ? vector.joy : null,
    sadness: typeof vector.sadness === "number" ? vector.sadness : null,
    anger: typeof vector.anger === "number" ? vector.anger : null,
    anxiety:
      typeof vector.fear === "number"
        ? vector.fear
        : typeof vector.anxiety === "number"
          ? vector.anxiety
          : null,
    calm:
      typeof vector.disgust === "number"
        ? vector.disgust
        : typeof vector.calm === "number"
          ? vector.calm
          : null,
    energy:
      typeof vector.surprise === "number"
        ? vector.surprise
        : typeof vector.energy === "number"
          ? vector.energy
          : null,
  };
}

export function buildExternalScoresFromJournal(journal: JournalLike) {
  const joyScore = typeof journal.joyScore === "number" ? journal.joyScore : null;
  const sadnessScore =
    typeof journal.sadnessScore === "number" ? journal.sadnessScore : null;
  const angerScore = typeof journal.angerScore === "number" ? journal.angerScore : null;
  const fearScore =
    typeof journal.fearScore === "number"
      ? Number(journal.fearScore)
      : typeof journal.anxietyScore === "number"
        ? journal.anxietyScore
        : null;
  const disgustScore =
    typeof journal.disgustScore === "number"
      ? Number(journal.disgustScore)
      : typeof journal.calmScore === "number"
        ? journal.calmScore
        : null;
  const surpriseScore =
    typeof journal.surpriseScore === "number"
      ? Number(journal.surpriseScore)
      : typeof journal.energyScore === "number"
        ? journal.energyScore
        : null;

  return {
    joyScore,
    sadnessScore,
    angerScore,
    fearScore,
    disgustScore,
    surpriseScore,
    anxietyScore: fearScore,
    calmScore: disgustScore,
    energyScore: surpriseScore,
  };
}

export function serializeJournalEkman<T extends JournalLike>(journal: T) {
  return {
    ...journal,
    ...buildExternalScoresFromJournal(journal),
  };
}

export function serializeDailyTrendEkman<T extends DailyTrendLike>(trend: T) {
  const joy = typeof trend.avgJoyScore === "number" ? trend.avgJoyScore : typeof trend.joyTrend === "number" ? trend.joyTrend : 0;
  const sadness = typeof trend.avgSadnessScore === "number" ? trend.avgSadnessScore : typeof trend.sadnessTrend === "number" ? trend.sadnessTrend : 0;
  const anger = typeof trend.avgAngerScore === "number" ? trend.avgAngerScore : typeof trend.angerTrend === "number" ? trend.angerTrend : 0;
  const fear = typeof trend.avgAnxietyScore === "number" ? trend.avgAnxietyScore : typeof trend.anxietyTrend === "number" ? trend.anxietyTrend : 0;
  const disgust = typeof trend.avgCalmScore === "number" ? trend.avgCalmScore : typeof trend.calmTrend === "number" ? trend.calmTrend : 0;
  const surprise = typeof trend.avgEnergyScore === "number" ? trend.avgEnergyScore : typeof trend.energyTrend === "number" ? trend.energyTrend : 0;

  return {
    ...trend,
    joy,
    sadness,
    anger,
    fear,
    disgust,
    surprise,
    anxiety: fear,
    calm: disgust,
    energy: surprise,
  };
}
