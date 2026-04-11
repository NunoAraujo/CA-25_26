import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  averageEmotionScores,
  deltaDirection,
  dominantEmotionFromScores,
  emotionMetricKeys,
  formatDayLabel,
  formatDelta,
  formatFullDateLabel,
  formatMonthLabel,
  monthIdFromDate,
  parseDayKey,
  toDayKey,
} from "../../lib/homeUtils";
import {
  DailyTrendPoint,
  EmotionMetricKey,
  EmotionScores,
  JournalTimelineItem,
} from "../../types/home";

type TrendDeltaCard = {
  key: string;
  label: string;
  current: number;
  delta: number;
  color: string;
};

type TrendsPanelProps = {
  dailyTrends: DailyTrendPoint[];
  journals: JournalTimelineItem[];
  isLoadingDailyTrends: boolean;
  isLoadingJournals: boolean;
  dailyTrendsError: string | null;
  trendDeltaCards: TrendDeltaCard[];
  onRefresh: () => Promise<void>;
  onRefreshTimeline: () => Promise<void>;
};

type CalendarViewMode = "month" | "week" | "day";

type EmotionPresentation = {
  label: string;
  chipClass: string;
  surfaceClass: string;
  mutedClass: string;
  valueClass: string;
};

const emotionPresentationMap: Record<EmotionMetricKey, EmotionPresentation> = {
  joy: {
    label: "Alegria",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    surfaceClass: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    mutedClass: "text-emerald-800/80",
    valueClass: "text-emerald-700",
  },
  sadness: {
    label: "Tristeza",
    chipClass: "border-indigo-200 bg-indigo-50 text-indigo-800",
    surfaceClass: "border-indigo-200 bg-indigo-50/70 text-indigo-900",
    mutedClass: "text-indigo-800/80",
    valueClass: "text-indigo-700",
  },
  anger: {
    label: "Raiva",
    chipClass: "border-rose-200 bg-rose-50 text-rose-800",
    surfaceClass: "border-rose-200 bg-rose-50/70 text-rose-900",
    mutedClass: "text-rose-800/80",
    valueClass: "text-rose-700",
  },
  anxiety: {
    label: "Ansiedade",
    chipClass: "border-amber-200 bg-amber-50 text-amber-800",
    surfaceClass: "border-amber-200 bg-amber-50/70 text-amber-900",
    mutedClass: "text-amber-800/80",
    valueClass: "text-amber-700",
  },
  calm: {
    label: "Calma",
    chipClass: "border-cyan-200 bg-cyan-50 text-cyan-800",
    surfaceClass: "border-cyan-200 bg-cyan-50/70 text-cyan-900",
    mutedClass: "text-cyan-800/80",
    valueClass: "text-cyan-700",
  },
  energy: {
    label: "Energia",
    chipClass: "border-orange-200 bg-orange-50 text-orange-800",
    surfaceClass: "border-orange-200 bg-orange-50/70 text-orange-900",
    mutedClass: "text-orange-800/80",
    valueClass: "text-orange-700",
  },
};

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildEmotionScoresFromTrend(trend: DailyTrendPoint): EmotionScores {
  return {
    joy: trend.joy,
    sadness: trend.sadness,
    anger: trend.anger,
    anxiety: trend.anxiety,
    calm: trend.calm,
    energy: trend.energy,
  };
}

function buildEmotionScoresFromJournal(journal: JournalTimelineItem) {
  return averageEmotionScores([
    {
      joy: journal.joyScore,
      sadness: journal.sadnessScore,
      anger: journal.angerScore,
      anxiety: journal.anxietyScore,
      calm: journal.calmScore,
      energy: journal.energyScore,
    },
  ]);
}

function buildMonthGrid(viewDate: Date) {
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const mondayIndex = (firstDayOfMonth.getDay() + 6) % 7;
  const firstCellDate = new Date(firstDayOfMonth);
  firstCellDate.setDate(firstDayOfMonth.getDate() - mondayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const currentDate = new Date(firstCellDate);
    currentDate.setDate(firstCellDate.getDate() + index);
    return currentDate;
  });
}

function topEmotionKeys(scores: EmotionScores, limit = 2) {
  return [...emotionMetricKeys]
    .sort((left, right) => scores[right] - scores[left])
    .slice(0, limit);
}

export function TrendsPanel({
  dailyTrends,
  journals,
  isLoadingDailyTrends,
  isLoadingJournals,
  dailyTrendsError,
  trendDeltaCards,
  onRefresh,
  onRefreshTimeline,
}: Readonly<TrendsPanelProps>) {
  const [calendarViewMode, setCalendarViewMode] =
    useState<CalendarViewMode>("month");
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    toDayKey(new Date().toISOString()),
  );
  const [visibleMonthDate, setVisibleMonthDate] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  const dailyTrendByDay = useMemo(() => {
    return dailyTrends.reduce<Record<string, DailyTrendPoint>>((accumulator, item) => {
      const dayKey = toDayKey(item.dayStart);
      if (dayKey) {
        accumulator[dayKey] = item;
      }
      return accumulator;
    }, {});
  }, [dailyTrends]);

  const journalsByDay = useMemo(() => {
    const grouped = journals.reduce<Record<string, JournalTimelineItem[]>>(
      (accumulator, journal) => {
        const sourceDate = journal.recordedAt ?? journal.uploadedAt;
        const dayKey = toDayKey(sourceDate);

        if (!dayKey) {
          return accumulator;
        }

        accumulator[dayKey] = [...(accumulator[dayKey] ?? []), journal];
        return accumulator;
      },
      {},
    );

    for (const dayKey of Object.keys(grouped)) {
      grouped[dayKey].sort(
        (left, right) =>
          new Date(right.recordedAt ?? right.uploadedAt).getTime() -
          new Date(left.recordedAt ?? left.uploadedAt).getTime(),
      );
    }

    return grouped;
  }, [journals]);

  const availableDayKeys = useMemo(() => {
    return Array.from(
      new Set([...Object.keys(dailyTrendByDay), ...Object.keys(journalsByDay)]),
    ).sort();
  }, [dailyTrendByDay, journalsByDay]);

  useEffect(() => {
    if (availableDayKeys.length === 0) {
      return;
    }

    setSelectedDayKey((currentDayKey) => {
      if (availableDayKeys.includes(currentDayKey)) {
        return currentDayKey;
      }

      return availableDayKeys[availableDayKeys.length - 1];
    });
  }, [availableDayKeys]);

  useEffect(() => {
    if (availableDayKeys.length === 0) {
      return;
    }

    setVisibleMonthDate((currentDate) => {
      const currentMonthId = monthIdFromDate(currentDate);
      const currentMonthHasData = availableDayKeys.some(
        (dayKey) => monthIdFromDate(parseDayKey(dayKey)) === currentMonthId,
      );

      if (currentMonthHasData) {
        return currentDate;
      }

      const fallbackDate = parseDayKey(availableDayKeys[availableDayKeys.length - 1]);
      return new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), 1);
    });
  }, [availableDayKeys]);

  const selectedDayEntries = journalsByDay[selectedDayKey] ?? [];
  const selectedDailyTrend = dailyTrendByDay[selectedDayKey] ?? null;

  const selectedDayScores = useMemo(() => {
    if (selectedDailyTrend) {
      return buildEmotionScoresFromTrend(selectedDailyTrend);
    }

    return averageEmotionScores(
      selectedDayEntries.map((journal) => ({
        joy: journal.joyScore,
        sadness: journal.sadnessScore,
        anger: journal.angerScore,
        anxiety: journal.anxietyScore,
        calm: journal.calmScore,
        energy: journal.energyScore,
      })),
    );
  }, [selectedDailyTrend, selectedDayEntries]);

  const selectedDayDominantEmotion =
    selectedDayScores ? dominantEmotionFromScores(selectedDayScores) : null;
  const selectedDayTopEmotions = selectedDayScores
    ? topEmotionKeys(selectedDayScores, 3)
    : [];

  const selectedDayVolatilityLabel =
    typeof selectedDailyTrend?.emotionalVolatility === "number"
      ? selectedDailyTrend.emotionalVolatility.toFixed(2)
      : null;

  const monthGridDays = useMemo(() => {
    return buildMonthGrid(visibleMonthDate).map((currentDate) => {
      const dayKey = toDayKey(currentDate.toISOString());
      const dayTrend = dailyTrendByDay[dayKey] ?? null;
      const dayEntries = journalsByDay[dayKey] ?? [];
      const scores = dayTrend
        ? buildEmotionScoresFromTrend(dayTrend)
        : averageEmotionScores(
            dayEntries.map((journal) => ({
              joy: journal.joyScore,
              sadness: journal.sadnessScore,
              anger: journal.angerScore,
              anxiety: journal.anxietyScore,
              calm: journal.calmScore,
              energy: journal.energyScore,
            })),
          );

      return {
        dayKey,
        date: currentDate,
        isCurrentMonth: currentDate.getMonth() === visibleMonthDate.getMonth(),
        entryCount: dayTrend?.entryCount ?? dayEntries.length,
        dominantEmotion: scores ? dominantEmotionFromScores(scores) : null,
      };
    });
  }, [dailyTrendByDay, journalsByDay, visibleMonthDate]);

  const weekDays = useMemo(() => {
    const selectedDate = parseDayKey(selectedDayKey);
    const mondayIndex = (selectedDate.getDay() + 6) % 7;
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - mondayIndex);

    return Array.from({ length: 7 }, (_, index) => {
      const currentDate = new Date(monday);
      currentDate.setDate(monday.getDate() + index);
      const dayKey = toDayKey(currentDate.toISOString());
      const dayTrend = dailyTrendByDay[dayKey] ?? null;
      const dayEntries = journalsByDay[dayKey] ?? [];
      const scores = dayTrend
        ? buildEmotionScoresFromTrend(dayTrend)
        : averageEmotionScores(
            dayEntries.map((journal) => ({
              joy: journal.joyScore,
              sadness: journal.sadnessScore,
              anger: journal.angerScore,
              anxiety: journal.anxietyScore,
              calm: journal.calmScore,
              energy: journal.energyScore,
            })),
          );

      return {
        dayKey,
        date: currentDate,
        entryCount: dayTrend?.entryCount ?? dayEntries.length,
        dominantEmotion: scores ? dominantEmotionFromScores(scores) : null,
      };
    });
  }, [dailyTrendByDay, journalsByDay, selectedDayKey]);

  const selectedDayIndex = availableDayKeys.indexOf(selectedDayKey);
  const previousDayKey = selectedDayIndex > 0 ? availableDayKeys[selectedDayIndex - 1] : null;
  const nextDayKey =
    selectedDayIndex >= 0 && selectedDayIndex < availableDayKeys.length - 1
      ? availableDayKeys[selectedDayIndex + 1]
      : null;

  const monthDaysWithDataCount = monthGridDays.filter(
    (day) => day.entryCount > 0 || day.dominantEmotion,
  ).length;

  const chartData = useMemo(() => {
    if (!dailyTrends.length) {
      return [];
    }

    const result: Array<
      | DailyTrendPoint
      | {
          dayStart: string;
          joy: null;
          sadness: null;
          anger: null;
          anxiety: null;
          calm: null;
          energy: null;
        }
    > = [];

    let previousYear: string | null = null;

    for (const point of dailyTrends) {
      const currentYear = point.dayStart.slice(0, 4);

      if (previousYear !== null && currentYear !== previousYear) {
        result.push({
          dayStart: `year-${currentYear}`,
          joy: null,
          sadness: null,
          anger: null,
          anxiety: null,
          calm: null,
          energy: null,
        });
      }

      result.push(point);
      previousYear = currentYear;
    }

    return result;
  }, [dailyTrends]);

  function formatChartTick(value: string) {
    if (value.startsWith("year-")) {
      return value.replace("year-", "");
    }

    return formatDayLabel(value);
  }

  function formatChartTooltipLabel(value: string) {
    if (value.startsWith("year-")) {
      return `Ano ${value.replace("year-", "")}`;
    }

    return `Dia: ${formatDayLabel(value)}`;
  }

  return (
    <section
      className="mx-auto mt-6 max-w-6xl rounded-4xl border border-(--line) bg-(--paper) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]"
      id="trends"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-(--accent-deep)">
            Tendencia emocional
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Evolucao diaria</h2>
        </div>
        <button
          className="rounded-full border border-(--line) px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoadingDailyTrends}
          onClick={() => {
            void onRefresh();
          }}
          type="button"
        >
          {isLoadingDailyTrends ? "A atualizar..." : "Atualizar grafico"}
        </button>
      </div>

      {dailyTrendsError ? (
        <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {dailyTrendsError}
        </div>
      ) : null}

      {trendDeltaCards.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trendDeltaCards.map((card) => {
            const direction = deltaDirection(card.delta);
            let marker = "FLAT";
            if (direction === "up") {
              marker = "UP";
            } else if (direction === "down") {
              marker = "DOWN";
            }

            let directionClass = "text-slate-600";
            if (direction === "up") {
              directionClass = "text-emerald-700";
            } else if (direction === "down") {
              directionClass = "text-rose-700";
            }

            return (
              <article
                className="rounded-3xl border border-(--line) bg-(--paper-strong) p-4"
                key={card.key}
              >
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                  {card.label}
                </p>
                <p className={`mt-2 text-2xl font-semibold ${card.color}`}>
                  {card.current.toFixed(2)}
                </p>
                <p className={`mt-1 text-xs font-semibold ${directionClass}`}>
                  {marker} {formatDelta(card.delta)} vs. dia anterior
                </p>
              </article>
            );
          })}
        </div>
      ) : null}

      {!isLoadingDailyTrends && dailyTrends.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-(--line) bg-(--paper-strong) p-5 text-(--ink-soft)">
          Ainda nao existem dados suficientes para desenhar a tendencia diaria.
        </div>
      ) : null}

      {chartData.length > 0 ? (
        <div className="mt-6 h-80 rounded-3xl border border-(--line) bg-(--paper-strong) p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(100,116,139,0.2)"
              />
              <XAxis
                dataKey="dayStart"
                tickFormatter={formatChartTick}
                tick={{ fill: "#64748b", fontSize: 12 }}
              />
              <YAxis domain={[0, 1]} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip
                formatter={(value: number | null) =>
                  typeof value === "number" ? value.toFixed(2) : "-"
                }
                labelFormatter={(value: string) => formatChartTooltipLabel(value)}
              />
              <Legend />
              
              <Line
                type="monotone"
                dataKey="sadness"
                stroke="#6366f1"
                dot={false}
                connectNulls
              />
              <Line type="monotone" dataKey="anger" stroke="#ef4444" dot={false} connectNulls />
              <Line
                type="monotone"
                dataKey="anxiety"
                stroke="#f59e0b"
                dot={false}
                connectNulls
              />
              <Line type="monotone" dataKey="calm" stroke="#06b6d4" dot={false} connectNulls />
              <Line
                type="monotone"
                dataKey="energy"
                stroke="#f97316"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="mt-8 rounded-[2rem] border border-(--line) bg-(--paper-strong) p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-(--accent-deep)">
              Calendario emocional
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">
              Leitura mensal da tua tendencia
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-(--ink-soft)">
              Cada dia recebe uma cor com base na emocao dominante. Seleciona um
              dia para inspecionar as entradas e alterna entre vista mensal,
              semanal e diaria para seguir a evolucao emocional.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "month", label: "Mes" },
              { key: "week", label: "Semana" },
              { key: "day", label: "Dia" },
            ] as const).map((option) => {
              const isActive = calendarViewMode === option.key;
              return (
                <button
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    isActive
                      ? "bg-(--accent) text-white"
                      : "border border-(--line) bg-white text-slate-700 hover:bg-(--paper)",
                  ].join(" ")}
                  key={option.key}
                  onClick={() => {
                    setCalendarViewMode(option.key);
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[0.34fr_0.66fr]">
          <aside className="rounded-3xl border border-(--line) bg-white/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <button
                className="rounded-full border border-(--line) px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
                onClick={() => {
                  setVisibleMonthDate((current) => addMonths(current, -1));
                }}
                type="button"
              >
                Mes anterior
              </button>
              <p className="text-sm font-semibold capitalize text-slate-900">
                {formatMonthLabel(visibleMonthDate)}
              </p>
              <button
                className="rounded-full border border-(--line) px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
                onClick={() => {
                  setVisibleMonthDate((current) => addMonths(current, 1));
                }}
                type="button"
              >
                Mes seguinte
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-(--line) bg-(--paper) p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                Mes em foco
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {monthDaysWithDataCount}
              </p>
              <p className="mt-1 text-sm text-(--ink-soft)">
                dias com tendencia ou entradas registadas.
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-(--line) bg-(--paper) p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                Dia selecionado
              </p>
              <p className="mt-2 text-sm font-semibold capitalize text-slate-900">
                {formatFullDateLabel(parseDayKey(selectedDayKey).toISOString())}
              </p>
              <p className="mt-2 text-sm text-(--ink-soft)">
                {selectedDayEntries.length} entrada(s) associada(s)
                {selectedDayVolatilityLabel ? ` · volatilidade ${selectedDayVolatilityLabel}` : ""}
              </p>
              {selectedDayDominantEmotion ? (
                <span
                  className={[
                    "mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                    emotionPresentationMap[selectedDayDominantEmotion].chipClass,
                  ].join(" ")}
                >
                  Dominante: {emotionPresentationMap[selectedDayDominantEmotion].label}
                </span>
              ) : (
                <p className="mt-3 text-xs text-(--ink-soft)">
                  Sem emocao dominante calculada para este dia.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-(--line) bg-(--paper) p-4">
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                Legenda
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {emotionMetricKeys.map((emotionKey) => (
                  <div
                    className={[
                      "flex items-center justify-between rounded-2xl border px-3 py-2 text-sm",
                      emotionPresentationMap[emotionKey].surfaceClass,
                    ].join(" ")}
                    key={emotionKey}
                  >
                    <span>{emotionPresentationMap[emotionKey].label}</span>
                    <span className="text-xs font-semibold uppercase">
                      {emotionKey}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="rounded-3xl border border-(--line) bg-white/60 p-4">
            {availableDayKeys.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-(--line) bg-(--paper) p-6 text-sm text-(--ink-soft)">
                Assim que existirem entradas analisadas, o calendario mensal vai
                preencher-se com cores, dias clicaveis e detalhe por emocao.
              </div>
            ) : null}

            {calendarViewMode === "month" && availableDayKeys.length > 0 ? (
              <>
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-(--ink-soft)">
                  {[
                    "Seg",
                    "Ter",
                    "Qua",
                    "Qui",
                    "Sex",
                    "Sab",
                    "Dom",
                  ].map((label) => (
                    <div className="py-2" key={label}>
                      {label}
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {monthGridDays.map((day) => {
                    const emotion = day.dominantEmotion;
                    const isSelected = day.dayKey === selectedDayKey;
                    const surfaceClass = emotion
                      ? emotionPresentationMap[emotion].surfaceClass
                      : day.isCurrentMonth
                        ? "border-(--line) bg-(--paper) text-slate-900"
                        : "border-(--line) bg-white/40 text-slate-400";

                    return (
                      <button
                        className={[
                          "min-h-28 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(82,55,31,0.08)]",
                          surfaceClass,
                          isSelected ? "ring-2 ring-(--accent)" : "",
                        ].join(" ")}
                        key={day.dayKey}
                        onClick={() => {
                          setSelectedDayKey(day.dayKey);
                        }}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold">
                            {day.date.getDate()}
                          </span>
                          {day.entryCount > 0 ? (
                            <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-700">
                              {day.entryCount}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-6">
                          {emotion ? (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                                {emotionPresentationMap[emotion].label}
                              </p>
                              <p className="mt-1 text-xs opacity-80">
                                Toque para ver o dia
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-(--ink-soft)">
                              {day.isCurrentMonth
                                ? "Sem dados neste dia"
                                : "Fora do mes em foco"}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {calendarViewMode === "week" && availableDayKeys.length > 0 ? (
              <div className="grid min-h-[560px] grid-rows-7 gap-3">
                {weekDays.map((day) => {
                  const emotion = day.dominantEmotion;
                  const isSelected = day.dayKey === selectedDayKey;
                  return (
                    <button
                      className={[
                        "grid h-full grid-cols-[minmax(92px,120px)_1fr_auto] items-center gap-4 rounded-3xl border px-5 py-4 text-left transition hover:-translate-y-0.5 hover:bg-white",
                        emotion
                          ? emotionPresentationMap[emotion].surfaceClass
                          : "border-(--line) bg-(--paper)",
                        isSelected ? "ring-2 ring-(--accent) shadow-[0_10px_24px_rgba(82,55,31,0.08)]" : "",
                      ].join(" ")}
                      key={day.dayKey}
                      onClick={() => {
                        setSelectedDayKey(day.dayKey);
                      }}
                      type="button"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-(--ink-soft)">
                          {day.date.toLocaleDateString("pt-PT", {
                            weekday: "long",
                          })}
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-slate-900">
                          {day.date.getDate()}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.08em]">
                          {emotion
                            ? emotionPresentationMap[emotion].label
                            : "Sem emocao dominante"}
                        </p>
                        <p className="mt-1 text-sm text-(--ink-soft)">
                          {emotion
                            ? "Seleciona para inspecionar as entradas deste dia."
                            : "Dia sem tendencia consolidada ou sem entradas registadas."}
                        </p>
                      </div>

                      <div className="justify-self-end text-right">
                        <p className="text-2xl font-semibold text-slate-900">
                          {day.entryCount}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                          entrada(s)
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {calendarViewMode === "day" && availableDayKeys.length > 0 ? (
              <div className="grid min-h-[560px] grid-rows-[auto_auto_1fr] gap-4 rounded-3xl border border-(--line) bg-(--paper) p-5">
                <div
                  className={[
                    "grid gap-4 rounded-3xl border px-5 py-5 md:grid-cols-[minmax(140px,200px)_1fr_auto] md:items-center",
                    selectedDayDominantEmotion
                      ? emotionPresentationMap[selectedDayDominantEmotion].surfaceClass
                      : "border-(--line) bg-white/70 text-slate-900",
                  ].join(" ")}
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                      Vista diaria
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-slate-900">
                      {parseDayKey(selectedDayKey).getDate()}
                    </p>
                    <p className="mt-1 text-sm capitalize text-slate-700">
                      {parseDayKey(selectedDayKey).toLocaleDateString("pt-PT", {
                        weekday: "long",
                        month: "long",
                      })}
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xl font-semibold capitalize text-slate-900">
                      {formatFullDateLabel(parseDayKey(selectedDayKey).toISOString())}
                    </h4>
                    <p className="mt-2 text-sm text-slate-700">
                      {selectedDayDominantEmotion
                        ? `Leitura consolidada do dia com predominio de ${emotionPresentationMap[selectedDayDominantEmotion].label.toLowerCase()}.`
                        : "Leitura diaria pronta para inspecionar as entradas e a distribuicao emocional deste dia."}
                    </p>
                  </div>

                  <div className="justify-self-end text-right">
                    <p className="text-2xl font-semibold text-slate-900">
                      {selectedDayEntries.length}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                      entrada(s)
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-3xl border border-(--line) bg-white/75 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                      Emocao dominante
                    </p>
                    <div className="mt-3">
                      {selectedDayDominantEmotion ? (
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                            emotionPresentationMap[selectedDayDominantEmotion].chipClass,
                          ].join(" ")}
                        >
                          {emotionPresentationMap[selectedDayDominantEmotion].label}
                        </span>
                      ) : (
                        <p className="text-sm text-slate-700">Sem emocao dominante calculada.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-(--line) bg-white/75 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                      Volatilidade
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-slate-900">
                      {selectedDayVolatilityLabel ?? "—"}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {selectedDayVolatilityLabel
                        ? "Variacao emocional agregada para este dia."
                        : "Ainda sem valor consolidado para este indicador."}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-(--line) bg-white/75 p-4">
                    <p className="text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                      Top emocoes
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedDayTopEmotions.length > 0 ? (
                        selectedDayTopEmotions.map((emotionKey) => (
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                              emotionPresentationMap[emotionKey].chipClass,
                            ].join(" ")}
                            key={emotionKey}
                          >
                            {emotionPresentationMap[emotionKey].label}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-slate-700">Sem dados emocionais suficientes.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex h-full flex-col justify-between rounded-3xl border border-(--line) bg-white/75 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                      Navegacao diaria
                    </p>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                      Usa esta vista para percorrer os dias sequencialmente e acompanhar a tua evolucao emocional com mais detalhe, mantendo o mesmo estilo de leitura em blocos da vista semanal.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      className="rounded-3xl border border-(--line) bg-(--paper) px-5 py-4 text-left transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!previousDayKey}
                      onClick={() => {
                        if (!previousDayKey) {
                          return;
                        }
                        setSelectedDayKey(previousDayKey);
                        const nextVisibleDate = parseDayKey(previousDayKey);
                        setVisibleMonthDate(
                          new Date(
                            nextVisibleDate.getFullYear(),
                            nextVisibleDate.getMonth(),
                            1,
                          ),
                        );
                      }}
                      type="button"
                    >
                      <p className="text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                        Navegar
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">Dia anterior</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {previousDayKey
                          ? formatFullDateLabel(parseDayKey(previousDayKey).toISOString())
                          : "Nao existe um dia anterior com dados."}
                      </p>
                    </button>

                    <button
                      className="rounded-3xl border border-(--line) bg-(--paper) px-5 py-4 text-left transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!nextDayKey}
                      onClick={() => {
                        if (!nextDayKey) {
                          return;
                        }
                        setSelectedDayKey(nextDayKey);
                        const nextVisibleDate = parseDayKey(nextDayKey);
                        setVisibleMonthDate(
                          new Date(
                            nextVisibleDate.getFullYear(),
                            nextVisibleDate.getMonth(),
                            1,
                          ),
                        );
                      }}
                      type="button"
                    >
                      <p className="text-xs uppercase tracking-[0.12em] text-(--ink-soft)">
                        Navegar
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">Dia seguinte</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {nextDayKey
                          ? formatFullDateLabel(parseDayKey(nextDayKey).toISOString())
                          : "Nao existe um dia seguinte com dados."}
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-(--line) bg-white/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-(--ink-soft)">
                Inspecao do dia
              </p>
              <h4 className="mt-2 text-xl font-semibold capitalize text-slate-900">
                {formatFullDateLabel(parseDayKey(selectedDayKey).toISOString())}
              </h4>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {selectedDayDominantEmotion ? (
                <span
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-semibold",
                    emotionPresentationMap[selectedDayDominantEmotion].chipClass,
                  ].join(" ")}
                >
                  Emocao dominante: {emotionPresentationMap[selectedDayDominantEmotion].label}
                </span>
              ) : null}
              <button
                className="rounded-full border border-(--line) px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoadingJournals}
                onClick={() => {
                  void onRefreshTimeline();
                }}
                type="button"
              >
                {isLoadingJournals ? "A atualizar..." : "Atualizar timeline"}
              </button>
            </div>
          </div>

          {selectedDayScores ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {emotionMetricKeys.map((emotionKey) => {
                const emotionConfig = emotionPresentationMap[emotionKey];
                return (
                  <article
                    className="rounded-3xl border border-(--line) bg-(--paper) p-4"
                    key={emotionKey}
                  >
                    <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                      {emotionConfig.label}
                    </p>
                    <p className={`mt-2 text-2xl font-semibold ${emotionConfig.valueClass}`}>
                      {selectedDayScores[emotionKey].toFixed(2)}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-(--line) bg-(--paper) p-5 text-sm text-(--ink-soft)">
              Ainda nao existem scores emocionais calculados para o dia selecionado.
            </div>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                Entradas do dia
              </p>
              <p className="text-sm text-(--ink-soft)">
                {selectedDayEntries.length} entrada(s)
              </p>
            </div>

            {selectedDayEntries.length === 0 ? (
              <div className="mt-3 rounded-3xl border border-dashed border-(--line) bg-(--paper) p-5 text-sm text-(--ink-soft)">
                Este dia ainda nao tem entradas listadas na timeline.
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                {selectedDayEntries.map((journal: JournalTimelineItem) => {
                  const entryScores = buildEmotionScoresFromJournal(journal);
                  const entryTopEmotionKeys = entryScores
                    ? topEmotionKeys(entryScores)
                    : [];
                  const sourceDate = journal.recordedAt ?? journal.uploadedAt;

                  return (
                    <article
                      className="rounded-3xl border border-(--line) bg-(--paper) p-4"
                      key={journal.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {new Date(sourceDate).toLocaleTimeString("pt-PT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="mt-1 text-xs text-(--ink-soft)">
                            {journal.durationSeconds ?? 0}s · {journal.id}
                          </p>
                        </div>
                        <span className="rounded-full border border-(--line) bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                          {journal.status}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {entryTopEmotionKeys.length > 0 ? (
                          entryTopEmotionKeys.map((emotionKey) => (
                            <span
                              className={[
                                "rounded-full border px-3 py-1 text-xs font-semibold",
                                emotionPresentationMap[emotionKey].chipClass,
                              ].join(" ")}
                              key={`${journal.id}-${emotionKey}`}
                            >
                              {emotionPresentationMap[emotionKey].label} · {entryScores?.[emotionKey].toFixed(2)}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full border border-(--line) bg-white px-3 py-1 text-xs text-(--ink-soft)">
                            Sem scores emocionais disponiveis ainda
                          </span>
                        )}
                      </div>

                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-700">
                        {journal.transcription && journal.transcription.length > 0
                          ? journal.transcription
                          : "Sem transcricao disponivel para esta entrada."}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
