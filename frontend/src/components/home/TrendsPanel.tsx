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
  deltaDirection,
  formatDelta,
  formatDayLabel,
} from "../../lib/homeUtils";
import { DailyTrendPoint } from "../../types/home";

type TrendDeltaCard = {
  key: string;
  label: string;
  current: number;
  delta: number;
  color: string;
};

type TrendsPanelProps = {
  dailyTrends: DailyTrendPoint[];
  isLoadingDailyTrends: boolean;
  dailyTrendsError: string | null;
  trendDeltaCards: TrendDeltaCard[];
  onRefresh: () => Promise<void>;
};

export function TrendsPanel({
  dailyTrends,
  isLoadingDailyTrends,
  dailyTrendsError,
  trendDeltaCards,
  onRefresh,
}: Readonly<TrendsPanelProps>) {
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

      {dailyTrends.length > 0 ? (
        <div className="mt-6 h-80 rounded-3xl border border-(--line) bg-(--paper-strong) p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrends}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(100,116,139,0.2)"
              />
              <XAxis
                dataKey="dayStart"
                tickFormatter={formatDayLabel}
                tick={{ fill: "#64748b", fontSize: 12 }}
              />
              <YAxis domain={[0, 1]} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => value.toFixed(2)}
                labelFormatter={(value: string) =>
                  `Dia: ${formatDayLabel(value)}`
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="joy"
                stroke="#10b981"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="sadness"
                stroke="#6366f1"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="anger"
                stroke="#ef4444"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="anxiety"
                stroke="#f59e0b"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="calm"
                stroke="#06b6d4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="energy"
                stroke="#f97316"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}
