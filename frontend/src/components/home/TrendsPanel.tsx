import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  averageEmotionScores,
  dominantEmotionFromScores,
  emotionMetricKeys,
  formatDayLabel,
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

type CalendarViewMode = "month" | "week";

const EMOTION_LABELS: Record<EmotionMetricKey, string> = {
  joy: "Alegria",
  sadness: "Tristeza",
  anger: "Raiva",
  fear: "Medo",
  disgust: "Nojo",
  surprise: "Surpresa",
};

const EMOTION_CHART_COLORS: Record<EmotionMetricKey, string> = {
  joy: "#34d399",
  sadness: "#818cf8",
  anger: "#f87171",
  fear: "#fbbf24",
  disgust: "#a3e635",
  surprise: "#fb923c",
};

const EMOTION_BG: Record<EmotionMetricKey, string> = {
  joy: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
  sadness: "bg-indigo-500/20 border-indigo-500/30 text-indigo-400",
  anger: "bg-red-500/20 border-red-500/30 text-red-400",
  fear: "bg-amber-500/20 border-amber-500/30 text-amber-400",
  disgust: "bg-lime-500/20 border-lime-500/30 text-lime-400",
  surprise: "bg-orange-500/20 border-orange-500/30 text-orange-400",
};

function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildEmotionScoresFromTrend(trend: DailyTrendPoint): EmotionScores {
  return {
    joy: trend.joy,
    sadness: trend.sadness,
    anger: trend.anger,
    fear: trend.fear,
    disgust: trend.disgust,
    surprise: trend.surprise,
  };
}

function buildMonthGrid(viewDate: Date) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function topEmotionKeys(scores: EmotionScores, limit = 2): EmotionMetricKey[] {
  return [...emotionMetricKeys]
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, limit);
}

// ─── JournalEntryCard ─────────────────────────────────────────────────────────

type JournalEntryCardProps = {
  journal: JournalTimelineItem;
  emotionLabels: Record<EmotionMetricKey, string>;
  emotionBg: Record<EmotionMetricKey, string>;
  emotionChartColors: Record<EmotionMetricKey, string>;
};

function JournalEntryCard({
  journal: j,
  emotionLabels,
  emotionBg,
  emotionChartColors,
}: Readonly<JournalEntryCardProps>) {
  const [expanded, setExpanded] = useState(false);
  const [showScores, setShowScores] = useState(false);

  const src = j.recordedAt ?? j.uploadedAt;
  const entryScores = averageEmotionScores([{
    joy: j.joyScore, sadness: j.sadnessScore, anger: j.angerScore,
    fear: j.fearScore, disgust: j.disgustScore, surprise: j.surpriseScore,
  }]);
  const top = entryScores ? topEmotionKeys(entryScores, 2) : [];
  const hasLongText = (j.transcription?.length ?? 0) > 180;
  const hasScores = entryScores && emotionMetricKeys.some(k => entryScores[k] > 0);

  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--text)]">
          {new Date(src).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
          <span className="ml-2 text-xs text-[var(--text-subtle)]">· {j.durationSeconds ?? 0}s</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {top.map(k => (
            <span key={k} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${emotionBg[k]}`}>
              {emotionLabels[k]}
            </span>
          ))}
        </div>
      </div>

      {/* Transcription */}
      {j.transcription && (
        <div className="mt-3">
          <p
            className={[
              "text-sm leading-6 text-[var(--text-muted)] transition-all duration-300",
              !expanded && hasLongText ? "line-clamp-3" : "",
            ].join(" ")}
          >
            {j.transcription}
          </p>
          {hasLongText && (
            <button
              type="button"
              className="mt-1 text-xs font-semibold text-[var(--accent-light)] hover:underline"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? "Ver menos ↑" : "Ver mais ↓"}
            </button>
          )}
        </div>
      )}

      {/* Scores toggle */}
      {hasScores && (
        <div className="mt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)] hover:text-[var(--text)]"
            onClick={() => setShowScores(s => !s)}
          >
            <span>{showScores ? "▲" : "▼"}</span>
            <span>Resultados desta gravação</span>
          </button>

          {showScores && entryScores && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--line-muted)] bg-[var(--surface-2)] p-3">
              {emotionMetricKeys.map(k => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-16 text-[11px] text-[var(--text-muted)]">{emotionLabels[k]}</span>
                  <div className="flex-1 rounded-full bg-[var(--surface-3)]" style={{ height: 5 }}>
                    <div
                      className="rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round(entryScores[k] * 100)}%`,
                        height: 5,
                        background: emotionChartColors[k],
                      }}
                    />
                  </div>
                  <span className="w-9 text-right text-[11px] font-bold" style={{ color: emotionChartColors[k] }}>
                    {(entryScores[k] * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
              <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
                Scores desta gravação individualmente — a média do dia aparece na barra lateral.
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ─── TrendsPanel ──────────────────────────────────────────────────────────────

export function TrendsPanel({
  dailyTrends,
  journals,
  isLoadingDailyTrends,
  isLoadingJournals,
  dailyTrendsError,
  onRefresh,
  onRefreshTimeline,
}: Readonly<TrendsPanelProps>) {
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [mounted, setMounted] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");
  const [visibleMonthDate, setVisibleMonthDate] = useState<Date>(
    () => new Date(2000, 0, 1), // stable SSR placeholder, overridden on mount
  );

  // Hydrate date-dependent state only on the client to avoid SSR mismatch
  useEffect(() => {
    const now = new Date();
    setSelectedDayKey(toDayKey(now.toISOString()));
    setVisibleMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setMounted(true);
  }, []);

  const dailyTrendByDay = useMemo(() =>
    dailyTrends.reduce<Record<string, DailyTrendPoint>>((acc, item) => {
      const k = toDayKey(item.dayStart);
      if (k) acc[k] = item;
      return acc;
    }, {}),
    [dailyTrends],
  );

  const journalsByDay = useMemo(() => {
    const grouped = journals.reduce<Record<string, JournalTimelineItem[]>>((acc, j) => {
      const k = toDayKey(j.recordedAt ?? j.uploadedAt);
      if (!k) return acc;
      acc[k] = [...(acc[k] ?? []), j];
      return acc;
    }, {});
    for (const k of Object.keys(grouped)) {
      grouped[k].sort((a, b) =>
        new Date(b.recordedAt ?? b.uploadedAt).getTime() -
        new Date(a.recordedAt ?? a.uploadedAt).getTime(),
      );
    }
    return grouped;
  }, [journals]);

  const availableDayKeys = useMemo(() =>
    Array.from(new Set([...Object.keys(dailyTrendByDay), ...Object.keys(journalsByDay)])).sort(),
    [dailyTrendByDay, journalsByDay],
  );

  useEffect(() => {
    if (!availableDayKeys.length) return;
    setSelectedDayKey(k => availableDayKeys.includes(k) ? k : availableDayKeys[availableDayKeys.length - 1]);
  }, [availableDayKeys]);

  useEffect(() => {
    if (!availableDayKeys.length) return;
    setVisibleMonthDate(cur => {
      const curId = monthIdFromDate(cur);
      const hasData = availableDayKeys.some(k => monthIdFromDate(parseDayKey(k)) === curId);
      if (hasData) return cur;
      const fallback = parseDayKey(availableDayKeys[availableDayKeys.length - 1]);
      return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
    });
  }, [availableDayKeys]);

  const selectedDayEntries = journalsByDay[selectedDayKey] ?? [];
  const selectedDailyTrend = dailyTrendByDay[selectedDayKey] ?? null;

  const selectedDayScores = useMemo(() => {
    if (selectedDailyTrend) return buildEmotionScoresFromTrend(selectedDailyTrend);
    return averageEmotionScores(selectedDayEntries.map(j => ({
      joy: j.joyScore, sadness: j.sadnessScore, anger: j.angerScore,
      fear: j.fearScore, disgust: j.disgustScore, surprise: j.surpriseScore,
    })));
  }, [selectedDailyTrend, selectedDayEntries]);

  const selectedDayDominant = selectedDayScores ? dominantEmotionFromScores(selectedDayScores) : null;
  const selectedDayTopEmotions = selectedDayScores ? topEmotionKeys(selectedDayScores, 3) : [];

  const monthGridDays = useMemo(() =>
    buildMonthGrid(visibleMonthDate).map(date => {
      const k = toDayKey(date.toISOString());
      const trend = dailyTrendByDay[k] ?? null;
      const entries = journalsByDay[k] ?? [];
      const scores = trend
        ? buildEmotionScoresFromTrend(trend)
        : averageEmotionScores(entries.map(j => ({
            joy: j.joyScore, sadness: j.sadnessScore, anger: j.angerScore,
            fear: j.fearScore, disgust: j.disgustScore, surprise: j.surpriseScore,
          })));
      return {
        dayKey: k,
        date,
        isCurrentMonth: date.getMonth() === visibleMonthDate.getMonth(),
        entryCount: trend?.entryCount ?? entries.length,
        dominant: scores ? dominantEmotionFromScores(scores) : null,
      };
    }),
    [dailyTrendByDay, journalsByDay, visibleMonthDate],
  );

  const weekDays = useMemo(() => {
    const sel = parseDayKey(selectedDayKey);
    const mondayOffset = (sel.getDay() + 6) % 7;
    const monday = new Date(sel);
    monday.setDate(sel.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const k = toDayKey(d.toISOString());
      const trend = dailyTrendByDay[k] ?? null;
      const entries = journalsByDay[k] ?? [];
      const scores = trend
        ? buildEmotionScoresFromTrend(trend)
        : averageEmotionScores(entries.map(j => ({
            joy: j.joyScore, sadness: j.sadnessScore, anger: j.angerScore,
            fear: j.fearScore, disgust: j.disgustScore, surprise: j.surpriseScore,
          })));
      return {
        dayKey: k, date: d,
        entryCount: trend?.entryCount ?? entries.length,
        dominant: scores ? dominantEmotionFromScores(scores) : null,
      };
    });
  }, [dailyTrendByDay, journalsByDay, selectedDayKey]);

  const chartData = useMemo(() => dailyTrends, [dailyTrends]);

  return (
    <section
      className="mx-auto mt-6 max-w-6xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
      id="trends"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-light)]">
            Tendência Emocional
          </p>
          <h2 className="mt-1.5 text-2xl font-bold text-[var(--text)]">
            Evolução diária
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-40"
            disabled={isLoadingJournals}
            onClick={() => { void onRefreshTimeline(); }}
            type="button"
          >
            {isLoadingJournals ? "..." : "Atualizar"}
          </button>
          <button
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-40"
            disabled={isLoadingDailyTrends}
            onClick={() => { void onRefresh(); }}
            type="button"
          >
            {isLoadingDailyTrends ? "..." : "Gráfico"}
          </button>
        </div>
      </div>

      {dailyTrendsError && (
        <div className="mt-4 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">
          {dailyTrendsError}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="mt-6 h-64 rounded-xl border border-[var(--line-muted)] bg-[var(--surface-2)] p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,246,252,0.06)" />
              <XAxis dataKey="dayStart" tickFormatter={formatDayLabel} tick={{ fill: "#6e7681", fontSize: 11 }} />
              <YAxis domain={[0, 1]} tick={{ fill: "#6e7681", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid rgba(240,246,252,0.1)", borderRadius: "12px", color: "#e6edf3" }}
                formatter={(v: number | null) => typeof v === "number" ? v.toFixed(2) : "—"}
                labelFormatter={(v: string) => `Dia: ${formatDayLabel(v)}`}
              />
              {emotionMetricKeys.map(k => (
                <Line key={k} type="monotone" dataKey={k} stroke={EMOTION_CHART_COLORS[k]} dot={false} connectNulls strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !isLoadingDailyTrends && (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-6 text-center text-sm text-[var(--text-subtle)]">
            Ainda sem dados suficientes para o gráfico.
          </div>
        )
      )}

      {/* Emotion legend chips */}
      {chartData.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {emotionMetricKeys.map(k => (
            <span key={k} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${EMOTION_BG[k]}`}>
              {EMOTION_LABELS[k]}
            </span>
          ))}
        </div>
      )}

      {/* Calendar section — only rendered client-side to avoid date hydration mismatch */}
      {mounted && <div className="mt-8 rounded-xl border border-[var(--line-muted)] bg-[var(--surface-2)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
              Calendário Emocional
            </p>
            <h3 className="mt-1 text-lg font-bold text-[var(--text)]">
              Leitura mensal
            </h3>
          </div>
          <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-1">
            {(["month", "week"] as const).map(mode => (
              <button
                key={mode}
                className={[
                  "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
                  calendarViewMode === mode
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                ].join(" ")}
                onClick={() => setCalendarViewMode(mode)}
                type="button"
              >
                {mode === "month" ? "Mês" : "Semana"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="space-y-3">
            {/* Month nav */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <button
                className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                onClick={() => setVisibleMonthDate(d => addMonths(d, -1))}
                type="button"
              >
                ←
              </button>
              <p className="text-sm font-semibold capitalize text-[var(--text)]">
                {formatMonthLabel(visibleMonthDate)}
              </p>
              <button
                className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                onClick={() => setVisibleMonthDate(d => addMonths(d, 1))}
                type="button"
              >
                →
              </button>
            </div>

            {/* Selected day info */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
                Dia selecionado
              </p>
              <p className="mt-2 text-sm font-semibold capitalize text-[var(--text)]">
                {formatFullDateLabel(parseDayKey(selectedDayKey).toISOString())}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {selectedDayEntries.length} entrada(s)
              </p>
              {selectedDayDominant && (
                <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${EMOTION_BG[selectedDayDominant]}`}>
                  {EMOTION_LABELS[selectedDayDominant]}
                </span>
              )}
            </div>

            {/* Emotion scores for selected day */}
            {selectedDayScores && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
                  Scores do dia
                </p>
                <div className="space-y-2">
                  {emotionMetricKeys.map(k => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-16 text-xs text-[var(--text-muted)]">{EMOTION_LABELS[k]}</span>
                      <div className="flex-1 rounded-full bg-[var(--surface-3)]" style={{ height: 6 }}>
                        <div
                          className="rounded-full"
                          style={{
                            width: `${Math.round(selectedDayScores[k] * 100)}%`,
                            height: 6,
                            background: EMOTION_CHART_COLORS[k],
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-semibold text-[var(--text-muted)]">
                        {selectedDayScores[k].toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Calendar grid */}
          <div>
            {availableDayKeys.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[var(--line)] text-sm text-[var(--text-subtle)]">
                Assim que existirem entradas analisadas, o calendário vai preencher-se.
              </div>
            ) : calendarViewMode === "month" ? (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(l => (
                    <div key={l} className="py-2">{l}</div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {monthGridDays.map(day => {
                    const isSelected = day.dayKey === selectedDayKey;
                    const bgClass = day.dominant
                      ? EMOTION_BG[day.dominant]
                      : day.isCurrentMonth
                        ? "border-[var(--line)] bg-[var(--surface-3)] text-[var(--text)]"
                        : "border-transparent bg-transparent text-[var(--text-subtle)] opacity-40";

                    return (
                      <button
                        key={day.dayKey}
                        className={[
                          "min-h-16 rounded-xl border p-2 text-left transition hover:-translate-y-0.5",
                          bgClass,
                          isSelected ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-2)]" : "",
                        ].join(" ")}
                        onClick={() => setSelectedDayKey(day.dayKey)}
                        type="button"
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-bold">{day.date.getDate()}</span>
                          {day.entryCount > 0 && (
                            <span className="rounded-full bg-white/20 px-1 text-[10px] font-bold">
                              {day.entryCount}
                            </span>
                          )}
                        </div>
                        {day.dominant && (
                          <p className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-wide">
                            {EMOTION_LABELS[day.dominant]}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="grid gap-2">
                {weekDays.map(day => {
                  const isSelected = day.dayKey === selectedDayKey;
                  const bgClass = day.dominant
                    ? EMOTION_BG[day.dominant]
                    : "border-[var(--line)] bg-[var(--surface-3)] text-[var(--text)]";
                  return (
                    <button
                      key={day.dayKey}
                      className={[
                        "grid grid-cols-[120px_1fr_60px] items-center gap-4 rounded-xl border px-5 py-4 text-left transition hover:brightness-110",
                        bgClass,
                        isSelected ? "ring-2 ring-[var(--accent)]" : "",
                      ].join(" ")}
                      onClick={() => {
                        setSelectedDayKey(day.dayKey);
                        const d = parseDayKey(day.dayKey);
                        setVisibleMonthDate(new Date(d.getFullYear(), d.getMonth(), 1));
                      }}
                      type="button"
                    >
                      <div>
                        <p className="text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                          {day.date.toLocaleDateString("pt-PT", { weekday: "long" })}
                        </p>
                        <p className="mt-1 text-2xl font-bold">{day.date.getDate()}</p>
                      </div>
                      <p className="text-sm font-semibold">
                        {day.dominant ? EMOTION_LABELS[day.dominant] : "Sem dados"}
                      </p>
                      <p className="text-right text-xl font-bold">{day.entryCount}</p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Entries for selected day */}
            {selectedDayEntries.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
                    Entradas — {formatFullDateLabel(parseDayKey(selectedDayKey).toISOString())}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">{selectedDayEntries.length} entrada(s)</p>
                </div>
                <div className="mt-3 space-y-3">
                  {selectedDayEntries.map(j => (
                    <JournalEntryCard
                      key={j.id}
                      journal={j}
                      emotionLabels={EMOTION_LABELS}
                      emotionBg={EMOTION_BG}
                      emotionChartColors={EMOTION_CHART_COLORS}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>}
    </section>
  );
}
