import {
  EmotionMetricKey,
  EmotionScores,
  RecommendationPreset,
} from "../types/home";

export const emotionMetricKeys: EmotionMetricKey[] = [
  "joy",
  "sadness",
  "anger",
  "anxiety",
  "calm",
  "energy",
];

export function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function getRecordingStateLabel(
  isRecording: boolean,
  hasAudio: boolean,
) {
  if (isRecording) {
    return "A gravar";
  }

  if (hasAudio) {
    return "Pronto";
  }

  return "Em espera";
}

export function statusBadgeClasses(status: string) {
  if (status === "complete") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  if (status === "failed") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }

  if (status === "analyzing" || status === "transcribing") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }

  return "border-slate-300 bg-slate-50 text-slate-700";
}

export function formatDayLabel(rawDate: string) {
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime())
    ? rawDate
    : date.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
      });
}

export function formatFullDateLabel(rawDate: string) {
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime())
    ? rawDate
    : date.toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
}

export function deltaDirection(delta: number) {
  if (delta > 0.001) {
    return "up";
  }

  if (delta < -0.001) {
    return "down";
  }

  return "flat";
}

export function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
}

export function applyRecommendationPreset(
  preset: RecommendationPreset,
  setIntensity: (value: string) => void,
  setEmotion: (value: string) => void,
  setOrder: (value: string) => void,
) {
  if (preset === "calming") {
    setIntensity("low");
    setEmotion("anxiety");
    setOrder("confidence");
    return;
  }

  if (preset === "energizing") {
    setIntensity("medium");
    setEmotion("low_energy");
    setOrder("confidence");
    return;
  }

  setIntensity("all");
  setEmotion("all");
  setOrder("duration");
}

export function toDayKey(rawDate: string) {
  const date = new Date(rawDate);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("pt-PT", {
    month: "long",
    year: "numeric",
  });
}

export function monthIdFromDate(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

export function hasEmotionScores(scores: Partial<Record<EmotionMetricKey, number | null>>) {
  return emotionMetricKeys.some((key) => typeof scores[key] === "number");
}

export function dominantEmotionFromScores(scores: EmotionScores) {
  return emotionMetricKeys.reduce((bestKey, currentKey) =>
    scores[currentKey] > scores[bestKey] ? currentKey : bestKey,
  );
}

export function averageEmotionScores(
  scoreList: Partial<Record<EmotionMetricKey, number | null>>[],
) {
  const validList = scoreList.filter((scores) => hasEmotionScores(scores));

  if (validList.length === 0) {
    return null;
  }

  const totals = emotionMetricKeys.reduce((accumulator, key) => {
    accumulator[key] = 0;
    return accumulator;
  }, {} as EmotionScores);

  for (const scores of validList) {
    for (const key of emotionMetricKeys) {
      totals[key] += typeof scores[key] === "number" ? scores[key] ?? 0 : 0;
    }
  }

  const averages = emotionMetricKeys.reduce((accumulator, key) => {
    accumulator[key] = totals[key] / validList.length;
    return accumulator;
  }, {} as EmotionScores);

  return averages;
}
