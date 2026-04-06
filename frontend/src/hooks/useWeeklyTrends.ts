import { useMemo, useState } from "react";
import { WeeklyTrendPoint } from "../types/home";

type TrendDeltaCard = {
  key: string;
  label: string;
  current: number;
  delta: number;
  color: string;
};

export function useWeeklyTrends(apiBaseUrl: string) {
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyTrendPoint[]>([]);
  const [isLoadingWeeklyTrends, setIsLoadingWeeklyTrends] = useState(false);
  const [weeklyTrendsError, setWeeklyTrendsError] = useState<string | null>(
    null,
  );

  const trendDeltaCards = useMemo<TrendDeltaCard[]>(() => {
    const latestTrendPoint =
      weeklyTrends.length > 0 ? weeklyTrends[weeklyTrends.length - 1] : null;
    const previousTrendPoint =
      weeklyTrends.length > 1 ? weeklyTrends[weeklyTrends.length - 2] : null;

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
  }, [weeklyTrends]);

  async function loadWeeklyTrends() {
    setIsLoadingWeeklyTrends(true);
    setWeeklyTrendsError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/trends/weekly`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ??
            payload.error ??
            "Falha ao carregar tendencia semanal.",
        );
      }

      const points = Array.isArray(payload.trends)
        ? payload.trends.map((item: Record<string, unknown>) => ({
            weekStart: String(item.weekStart ?? ""),
            joy: typeof item.avgJoyScore === "number" ? item.avgJoyScore : 0,
            sadness:
              typeof item.avgSadnessScore === "number"
                ? item.avgSadnessScore
                : 0,
            anger:
              typeof item.avgAngerScore === "number" ? item.avgAngerScore : 0,
            anxiety:
              typeof item.avgAnxietyScore === "number"
                ? item.avgAnxietyScore
                : 0,
            calm: typeof item.avgCalmScore === "number" ? item.avgCalmScore : 0,
            energy:
              typeof item.avgEnergyScore === "number" ? item.avgEnergyScore : 0,
          }))
        : [];

      setWeeklyTrends(points);
    } catch (error) {
      setWeeklyTrendsError(
        error instanceof Error
          ? error.message
          : "Falha ao carregar tendencia semanal.",
      );
    } finally {
      setIsLoadingWeeklyTrends(false);
    }
  }

  return {
    weeklyTrends,
    isLoadingWeeklyTrends,
    weeklyTrendsError,
    trendDeltaCards,
    loadWeeklyTrends,
  };
}
