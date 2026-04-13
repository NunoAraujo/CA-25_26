import { useMemo, useState } from "react";
import { DailyTrendPoint } from "../types/home";

type TrendDeltaCard = {
  key: string;
  label: string;
  current: number;
  delta: number;
  color: string;
};

type JournalTrendSource = {
  status?: unknown;
  recordedAt?: unknown;
  uploadedAt?: unknown;
  joyScore?: unknown;
  sadnessScore?: unknown;
  angerScore?: unknown;
  fearScore?: unknown;
  disgustScore?: unknown;
  surpriseScore?: unknown;
  anxietyScore?: unknown;
  calmScore?: unknown;
  energyScore?: unknown;
};

type DailyAccumulator = {
  dayStart: string;
  joy: number[];
  sadness: number[];
  anger: number[];
  fear: number[];
  disgust: number[];
  surprise: number[];
  entryCount: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function buildLocalDayKey(rawDate: unknown) {
  if (typeof rawDate !== "string") {
    return null;
  }

  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function emotionValue(journal: JournalTrendSource, primary: keyof JournalTrendSource, legacy?: keyof JournalTrendSource) {
  const primaryValue = journal[primary];
  if (isFiniteNumber(primaryValue)) {
    return primaryValue;
  }
  const legacyValue = legacy ? journal[legacy] : undefined;
  return isFiniteNumber(legacyValue) ? legacyValue : null;
}

function buildDailyTrendsFromJournals(journals: JournalTrendSource[]) {
  const days = new Map<string, DailyAccumulator>();

  for (const journal of journals) {
    if (journal.status !== "complete") {
      continue;
    }

    const dayStart =
      buildLocalDayKey(journal.recordedAt) ?? buildLocalDayKey(journal.uploadedAt);

    if (!dayStart) {
      continue;
    }

    const current = days.get(dayStart) ?? {
      dayStart,
      joy: [],
      sadness: [],
      anger: [],
      fear: [],
      disgust: [],
      surprise: [],
      entryCount: 0,
    };

    const joy = emotionValue(journal, "joyScore");
    const sadness = emotionValue(journal, "sadnessScore");
    const anger = emotionValue(journal, "angerScore");
    const fear = emotionValue(journal, "fearScore", "anxietyScore");
    const disgust = emotionValue(journal, "disgustScore", "calmScore");
    const surprise = emotionValue(journal, "surpriseScore", "energyScore");

    if (isFiniteNumber(joy)) current.joy.push(joy);
    if (isFiniteNumber(sadness)) current.sadness.push(sadness);
    if (isFiniteNumber(anger)) current.anger.push(anger);
    if (isFiniteNumber(fear)) current.fear.push(fear);
    if (isFiniteNumber(disgust)) current.disgust.push(disgust);
    if (isFiniteNumber(surprise)) current.surprise.push(surprise);

    current.entryCount += 1;
    days.set(dayStart, current);
  }

  return Array.from(days.values())
    .map<DailyTrendPoint>((day) => ({
      dayStart: day.dayStart,
      joy: average(day.joy),
      sadness: average(day.sadness),
      anger: average(day.anger),
      fear: average(day.fear),
      disgust: average(day.disgust),
      surprise: average(day.surprise),
      entryCount: day.entryCount,
      emotionalVolatility: stdDev([
        ...day.joy,
        ...day.sadness,
        ...day.anger,
        ...day.fear,
        ...day.disgust,
        ...day.surprise,
      ]),
    }))
    .sort((a, b) => a.dayStart.localeCompare(b.dayStart));
}

export function useDailyTrends(apiBaseUrl: string) {
  const [dailyTrends, setDailyTrends] = useState<DailyTrendPoint[]>([]);
  const [isLoadingDailyTrends, setIsLoadingDailyTrends] = useState(false);
  const [dailyTrendsError, setDailyTrendsError] = useState<string | null>(
    null,
  );

  const trendDeltaCards = useMemo<TrendDeltaCard[]>(() => {
    const latestTrendPoint = dailyTrends.at(-1) ?? null;
    const previousTrendPoint = dailyTrends.at(-2) ?? null;

    if (!latestTrendPoint || !previousTrendPoint) {
      return [];
    }

    return [
      {
        key: "joy",
        label: "Joy",
        current: latestTrendPoint.joy,
        delta: latestTrendPoint.joy - previousTrendPoint.joy,
        color: "text-emerald-700",
      },
      {
        key: "sadness",
        label: "Sadness",
        current: latestTrendPoint.sadness,
        delta: latestTrendPoint.sadness - previousTrendPoint.sadness,
        color: "text-indigo-700",
      },
      {
        key: "anger",
        label: "Anger",
        current: latestTrendPoint.anger,
        delta: latestTrendPoint.anger - previousTrendPoint.anger,
        color: "text-rose-700",
      },
      {
        key: "fear",
        label: "Fear",
        current: latestTrendPoint.fear,
        delta: latestTrendPoint.fear - previousTrendPoint.fear,
        color: "text-amber-700",
      },
      {
        key: "disgust",
        label: "Disgust",
        current: latestTrendPoint.disgust,
        delta: latestTrendPoint.disgust - previousTrendPoint.disgust,
        color: "text-lime-700",
      },
      {
        key: "surprise",
        label: "Surprise",
        current: latestTrendPoint.surprise,
        delta: latestTrendPoint.surprise - previousTrendPoint.surprise,
        color: "text-orange-700",
      },
    ];
  }, [dailyTrends]);

  async function loadDailyTrends() {
    setIsLoadingDailyTrends(true);
    setDailyTrendsError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/journals`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ?? payload.error ?? "Falha ao carregar tendencia diaria.",
        );
      }

      const points = Array.isArray(payload.journals)
        ? buildDailyTrendsFromJournals(payload.journals as JournalTrendSource[])
        : [];

      setDailyTrends(points);
    } catch (error) {
      setDailyTrendsError(
        error instanceof Error
          ? error.message
          : "Falha ao carregar tendencia diaria.",
      );
    } finally {
      setIsLoadingDailyTrends(false);
    }
  }

  return {
    dailyTrends,
    isLoadingDailyTrends,
    dailyTrendsError,
    trendDeltaCards,
    loadDailyTrends,
  };
}
