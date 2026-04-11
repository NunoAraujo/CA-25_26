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
  anxietyScore?: unknown;
  calmScore?: unknown;
  energyScore?: unknown;
};

type DailyAccumulator = {
  dayStart: string;
  joy: number[];
  sadness: number[];
  anger: number[];
  anxiety: number[];
  calm: number[];
  energy: number[];
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
      anxiety: [],
      calm: [],
      energy: [],
    };

    if (isFiniteNumber(journal.joyScore)) {
      current.joy.push(journal.joyScore);
    }
    if (isFiniteNumber(journal.sadnessScore)) {
      current.sadness.push(journal.sadnessScore);
    }
    if (isFiniteNumber(journal.angerScore)) {
      current.anger.push(journal.angerScore);
    }
    if (isFiniteNumber(journal.anxietyScore)) {
      current.anxiety.push(journal.anxietyScore);
    }
    if (isFiniteNumber(journal.calmScore)) {
      current.calm.push(journal.calmScore);
    }
    if (isFiniteNumber(journal.energyScore)) {
      current.energy.push(journal.energyScore);
    }

    days.set(dayStart, current);
  }

  return Array.from(days.values())
    .map<DailyTrendPoint>((day) => ({
      dayStart: day.dayStart,
      joy: average(day.joy),
      sadness: average(day.sadness),
      anger: average(day.anger),
      anxiety: average(day.anxiety),
      calm: average(day.calm),
      energy: average(day.energy),
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
        key: "anxiety",
        label: "Anxiety",
        current: latestTrendPoint.anxiety,
        delta: latestTrendPoint.anxiety - previousTrendPoint.anxiety,
        color: "text-amber-700",
      },
      {
        key: "calm",
        label: "Calm",
        current: latestTrendPoint.calm,
        delta: latestTrendPoint.calm - previousTrendPoint.calm,
        color: "text-cyan-700",
      },
      {
        key: "energy",
        label: "Energy",
        current: latestTrendPoint.energy,
        delta: latestTrendPoint.energy - previousTrendPoint.energy,
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
