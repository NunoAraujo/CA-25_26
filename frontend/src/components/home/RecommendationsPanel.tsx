import { useState } from "react";
import { toast } from "sonner";
import { Recommendation } from "../../types/home";

const EMOTION_LABELS: Record<string, string> = {
  joy: "Alegria",
  sadness: "Tristeza",
  anger: "Raiva",
  fear: "Medo",
  disgust: "Nojo",
  surprise: "Surpresa",
};

const EMOTION_COLORS: Record<string, string> = {
  joy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  sadness: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  anger: "border-red-500/30 bg-red-500/10 text-red-400",
  fear: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  disgust: "border-lime-500/30 bg-lime-500/10 text-lime-400",
  surprise: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  default: "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]",
};

const INTENSITY_COLORS: Record<string, string> = {
  low: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  high: "border-red-500/20 bg-red-500/10 text-red-400",
};

type RecommendationsPanelProps = {
  recommendations: Recommendation[];
  sortedRecommendations: Recommendation[];
  isLoadingRecommendations: boolean;
  recommendationError: string | null;
  recommendationInfo: string | null;
  recommendationIntensityFilter: string;
  recommendationEmotionFilter: string;
  recommendationOrderBy: string;
  recommendationIntensityOptions: string[];
  recommendationEmotionOptions: string[];
  completingRecommendationId: string | null;
  feedbackingRecommendationId: string | null;
  isGeneratingRecommendations: boolean;
  onGenerate: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onLoadAll: () => Promise<void>;
  onComplete: (recommendationId: string) => Promise<void>;
  onFeedback: (
    recommendationId: string,
    feedback: "positive" | "neutral" | "negative",
  ) => Promise<void>;
  onSetIntensityFilter: (value: string) => void;
  onSetEmotionFilter: (value: string) => void;
  onSetOrderBy: (value: string) => void;
  onApplyPreset: (preset: "calming" | "energizing" | "short") => void;
};

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getRecommendationDayKey(rec: Recommendation): string | null {
  const raw = rec.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  if (isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function RecommendationCard({
  recommendation,
  isCompleting,
  isFeedbackPending,
  onComplete,
  onFeedback,
}: {
  recommendation: Recommendation;
  isCompleting: boolean;
  isFeedbackPending: boolean;
  onComplete: () => void;
  onFeedback: (feedback: "positive" | "neutral" | "negative") => void;
}) {
  const emotionKey = recommendation.expectedImpactMetric?.toLowerCase() ?? "";
  const intensityKey = recommendation.activityIntensity?.toLowerCase() ?? "";
  const emotionColorClass = EMOTION_COLORS[emotionKey] ?? EMOTION_COLORS.default;
  const intensityColorClass = INTENSITY_COLORS[intensityKey] ?? "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]";
  const isCompleted = Boolean(recommendation.completedAt);
  const hasFeedback = Boolean(recommendation.feedback);

  return (
    <article
      className={[
        "group flex flex-col rounded-2xl border p-5 transition-all duration-200",
        isCompleted
          ? "border-[var(--success-soft)] bg-[var(--success-soft)]/50 opacity-75"
          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent-soft)] hover:shadow-[0_4px_24px_rgba(124,58,237,0.12)]",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${intensityColorClass}`}>
            {recommendation.activityIntensity ?? "—"}
          </span>
          {emotionKey && (
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${emotionColorClass}`}>
              {EMOTION_LABELS[emotionKey] ?? emotionKey}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent-light)]">
          {Math.round(recommendation.confidence * 100)}%
        </span>
      </div>

      {/* Title */}
      <h3 className="mt-3 text-base font-semibold text-[var(--text)]">
        {recommendation.activityName}
      </h3>
      <p className="mt-1 text-xs text-[var(--text-subtle)]">
        {recommendation.activityDurationMin} min
      </p>

      {/* Rationale */}
      <p className="mt-3 flex-1 text-sm leading-6 text-[var(--text-muted)]">
        {recommendation.rationale}
      </p>

      {/* Completion */}
      {isCompleted ? (
        <div className="mt-4 rounded-lg border border-[var(--success-soft)] bg-[var(--success-soft)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--success-text)]">
            ✓ Concluída
            {recommendation.completedAt
              ? ` · ${new Date(recommendation.completedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </p>
        </div>
      ) : (
        <button
          className="mt-4 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isCompleting}
          onClick={onComplete}
          type="button"
        >
          {isCompleting ? "A guardar..." : "Marcar como feita"}
        </button>
      )}

      {/* Feedback */}
      {isCompleted && !hasFeedback && (
        <div className="mt-3 flex gap-2">
          <button
            className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-40"
            disabled={isFeedbackPending}
            onClick={() => onFeedback("positive")}
            type="button"
          >
            👍 Positivo
          </button>
          <button
            className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] py-2 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] disabled:opacity-40"
            disabled={isFeedbackPending}
            onClick={() => onFeedback("neutral")}
            type="button"
          >
            😐 Neutro
          </button>
          <button
            className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-40"
            disabled={isFeedbackPending}
            onClick={() => onFeedback("negative")}
            type="button"
          >
            👎 Negativo
          </button>
        </div>
      )}

      {hasFeedback && (
        <p className="mt-3 text-center text-xs text-[var(--text-subtle)]">
          Feedback: <span className="font-semibold text-[var(--text-muted)]">{recommendation.feedback}</span>
        </p>
      )}
    </article>
  );
}

export function RecommendationsPanel({
  recommendations,
  sortedRecommendations,
  isLoadingRecommendations,
  recommendationError,
  recommendationInfo,
  completingRecommendationId,
  feedbackingRecommendationId,
  isGeneratingRecommendations,
  onGenerate,
  onRefresh,
  onLoadAll,
  onComplete,
  onFeedback,
  onApplyPreset,
}: Readonly<RecommendationsPanelProps>) {
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");

  const todayKey = getTodayKey();

  const todayRecs = sortedRecommendations.filter(
    (rec) => getRecommendationDayKey(rec) === todayKey,
  );

  // Group history by day (exclude today)
  const historyByDay = sortedRecommendations
    .filter((rec) => getRecommendationDayKey(rec) !== todayKey)
    .reduce<Record<string, Recommendation[]>>((acc, rec) => {
      const key = getRecommendationDayKey(rec) ?? "desconhecido";
      acc[key] = [...(acc[key] ?? []), rec];
      return acc;
    }, {});

  const historyDays = Object.keys(historyByDay).sort((a, b) => b.localeCompare(a));

  const displayRecs = activeTab === "today" ? todayRecs : [];

  return (
    <section
      className="mx-auto mt-6 max-w-6xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
      id="recommendations"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-light)]">
            Recomendações
          </p>
          <h2 className="mt-1.5 text-2xl font-bold text-[var(--text)]">
            Plano de autorregulação
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick presets */}
          <button
            className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
            onClick={() => { onApplyPreset("calming"); toast.success("Preset calmante aplicado."); }}
            type="button"
          >
            😮‍💨 Calmante
          </button>
          <button
            className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
            onClick={() => { onApplyPreset("energizing"); toast.success("Preset energizante aplicado."); }}
            type="button"
          >
            ⚡ Energizante
          </button>
          <button
            className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-400"
            onClick={() => { onApplyPreset("short"); toast.success("Preset curto aplicado."); }}
            type="button"
          >
            ⏱ Rápido
          </button>

          <div className="mx-1 h-4 w-px bg-[var(--line)]" />

          <button
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isGeneratingRecommendations || isLoadingRecommendations}
            onClick={() => { void onGenerate(); }}
            type="button"
          >
            {isGeneratingRecommendations ? "A gerar..." : "Gerar plano"}
          </button>
          <button
            className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-40"
            disabled={isLoadingRecommendations || isGeneratingRecommendations}
            onClick={() => { void onRefresh(); }}
            type="button"
          >
            {isLoadingRecommendations ? "..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Messages */}
      {recommendationError ? (
        <div className="mt-4 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">
          {recommendationError}
        </div>
      ) : null}
      {recommendationInfo ? (
        <div className="mt-4 rounded-xl border border-[var(--success-soft)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success-text)]">
          {recommendationInfo}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1">
        <button
          className={[
            "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition",
            activeTab === "today"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          ].join(" ")}
          onClick={() => setActiveTab("today")}
          type="button"
        >
          Hoje
          {todayRecs.length > 0 && (
            <span className={[
              "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              activeTab === "today" ? "bg-white/20 text-white" : "bg-[var(--accent-soft)] text-[var(--accent-light)]",
            ].join(" ")}>
              {todayRecs.length}
            </span>
          )}
        </button>
        <button
          className={[
            "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition",
            activeTab === "history"
              ? "bg-[var(--accent)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          ].join(" ")}
          onClick={() => { setActiveTab("history"); void onLoadAll(); }}
          type="button"
        >
          Histórico
          {historyDays.length > 0 && (
            <span className={[
              "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              activeTab === "history" ? "bg-white/20 text-white" : "bg-[var(--surface-3)] text-[var(--text-subtle)]",
            ].join(" ")}>
              {historyDays.length}d
            </span>
          )}
        </button>
      </div>

      {/* Today tab */}
      {activeTab === "today" && (
        <>
          {!isLoadingRecommendations && recommendations.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-10 text-center">
              <span className="text-4xl">🧘</span>
              <p className="mt-4 text-base font-semibold text-[var(--text)]">
                Sem recomendações para hoje
              </p>
              <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
                Regista uma entrada de áudio e clica em{" "}
                <strong className="text-[var(--text)]">Gerar plano</strong> para
                receberes sugestões personalizadas.
              </p>
            </div>
          ) : !isLoadingRecommendations && todayRecs.length === 0 && recommendations.length > 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-10 text-center">
              <span className="text-4xl">📅</span>
              <p className="mt-4 text-base font-semibold text-[var(--text)]">
                Ainda sem recomendações para hoje
              </p>
              <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
                Clica em <strong className="text-[var(--text)]">Gerar plano</strong> para criar um plano com base nas tuas entradas de hoje.
                Vê o Histórico para dias anteriores.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayRecs.map((rec) => (
                <RecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  isCompleting={completingRecommendationId === rec.id}
                  isFeedbackPending={feedbackingRecommendationId === rec.id}
                  onComplete={() => { void onComplete(rec.id); }}
                  onFeedback={(feedback) => { void onFeedback(rec.id, feedback); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <>
          {historyDays.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-10 text-center">
              <span className="text-4xl">📖</span>
              <p className="mt-4 text-base font-semibold text-[var(--text)]">
                Nenhum histórico ainda
              </p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Volta aqui depois de teres gerado planos em dias anteriores.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-8">
              {historyDays.map((dayKey) => {
                const dayRecs = historyByDay[dayKey] ?? [];
                const date = new Date(dayKey);
                const dateLabel = date.toLocaleDateString("pt-PT", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                });

                return (
                  <div key={dayKey}>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-[var(--line)]" />
                      <p className="text-xs font-semibold capitalize text-[var(--text-subtle)]">
                        {dateLabel}
                      </p>
                      <div className="h-px flex-1 bg-[var(--line)]" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {dayRecs.map((rec) => (
                        <RecommendationCard
                          key={rec.id}
                          recommendation={rec}
                          isCompleting={completingRecommendationId === rec.id}
                          isFeedbackPending={feedbackingRecommendationId === rec.id}
                          onComplete={() => { void onComplete(rec.id); }}
                          onFeedback={(feedback) => { void onFeedback(rec.id, feedback); }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
