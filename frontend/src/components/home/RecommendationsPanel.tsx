import { toast } from "sonner";
import { Recommendation } from "../../types/home";

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

export function RecommendationsPanel({
  recommendations,
  sortedRecommendations,
  isLoadingRecommendations,
  recommendationError,
  recommendationInfo,
  recommendationIntensityFilter,
  recommendationEmotionFilter,
  recommendationOrderBy,
  recommendationIntensityOptions,
  recommendationEmotionOptions,
  completingRecommendationId,
  feedbackingRecommendationId,
  isGeneratingRecommendations,
  onGenerate,
  onRefresh,
  onComplete,
  onFeedback,
  onSetIntensityFilter,
  onSetEmotionFilter,
  onSetOrderBy,
  onApplyPreset,
}: Readonly<RecommendationsPanelProps>) {
  return (
    <section
      className="mx-auto mt-6 max-w-6xl rounded-4xl border border-(--line) bg-(--paper) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]"
      id="recommendations"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-(--accent-deep)">
            Recomendacoes
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Plano diario de autorregulacao
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full bg-(--accent) px-5 py-2 text-sm font-semibold text-white transition hover:bg-(--accent-deep) disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isGeneratingRecommendations || isLoadingRecommendations}
            onClick={() => {
              void onGenerate();
            }}
            type="button"
          >
            {isGeneratingRecommendations ? "A gerar..." : "Gerar dia"}
          </button>
          <button
            className="rounded-full border border-(--line) px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoadingRecommendations || isGeneratingRecommendations}
            onClick={() => {
              void onRefresh();
            }}
            type="button"
          >
            {isLoadingRecommendations ? "A atualizar..." : "Atualizar lista"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          <span>Intensidade</span>
          <select
            className="mt-2 w-full rounded-2xl border border-(--line) bg-white px-3 py-2 text-sm text-slate-800"
            onChange={(event) => {
              onSetIntensityFilter(event.target.value);
            }}
            value={recommendationIntensityFilter}
          >
            <option value="all">Todas</option>
            {recommendationIntensityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          <span>Emocao alvo</span>
          <select
            className="mt-2 w-full rounded-2xl border border-(--line) bg-white px-3 py-2 text-sm text-slate-800"
            onChange={(event) => {
              onSetEmotionFilter(event.target.value);
            }}
            value={recommendationEmotionFilter}
          >
            <option value="all">Todas</option>
            {recommendationEmotionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          <span>Ordenacao</span>
          <select
            className="mt-2 w-full rounded-2xl border border-(--line) bg-white px-3 py-2 text-sm text-slate-800"
            onChange={(event) => {
              onSetOrderBy(event.target.value);
            }}
            value={recommendationOrderBy}
          >
            <option value="confidence">Confianca</option>
            <option value="duration">Duracao</option>
            <option value="newest">Mais recentes</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-full border border-(--line) bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-(--paper-strong)"
          onClick={() => {
            onApplyPreset("calming");
            toast.success("Preset calming aplicado.");
          }}
          type="button"
        >
          Calming
        </button>
        <button
          className="rounded-full border border-(--line) bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-(--paper-strong)"
          onClick={() => {
            onApplyPreset("energizing");
            toast.success("Preset energizing aplicado.");
          }}
          type="button"
        >
          Energizing
        </button>
        <button
          className="rounded-full border border-(--line) bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-(--paper-strong)"
          onClick={() => {
            onApplyPreset("short");
            toast.success("Preset short aplicado.");
          }}
          type="button"
        >
          Short
        </button>
      </div>

      {recommendationError ? (
        <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {recommendationError}
        </div>
      ) : null}

      {recommendationInfo ? (
        <div className="mt-5 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {recommendationInfo}
        </div>
      ) : null}

      {!isLoadingRecommendations && recommendations.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-(--line) bg-(--paper-strong) p-5 text-(--ink-soft)">
          Ainda nao existem recomendacoes para mostrar. Gera o dia no API e
          volta a atualizar esta vista.
        </div>
      ) : null}

      {!isLoadingRecommendations &&
      recommendations.length > 0 &&
      sortedRecommendations.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-(--line) bg-(--paper-strong) p-5 text-(--ink-soft)">
          Nenhuma recomendacao corresponde aos filtros selecionados.
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedRecommendations.map((recommendation) => {
          let completionButtonText = "Marcar como feita";
          if (completingRecommendationId === recommendation.id) {
            completionButtonText = "A guardar...";
          } else if (recommendation.completedAt) {
            completionButtonText = "Concluida";
          }

          return (
            <article
              className="rounded-3xl border border-(--line) bg-(--paper-strong) p-5"
              key={recommendation.id}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-(--ink-soft)">
                {recommendation.activityIntensity} intensidade
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">
                {recommendation.activityName}
              </h3>
              <p className="mt-2 text-sm text-(--ink-soft)">
                {recommendation.activityDurationMin} min · confianca{" "}
                {Math.round(recommendation.confidence * 100)}%
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {recommendation.rationale}
              </p>
              <p className="mt-3 text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                impacto: {recommendation.expectedImpactMetric} ({" "}
                {recommendation.expectedImpactDelta.toFixed(2)})
              </p>
              <p className="mt-2 text-xs text-(--ink-soft)">
                Feedback atual: {recommendation.feedback ?? "sem feedback"}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-(--ink-soft)">
                  {recommendation.completedAt
                    ? `Concluida em ${new Date(recommendation.completedAt).toLocaleString("pt-PT")}`
                    : "Ainda por concluir"}
                </span>
                <button
                  className="rounded-full bg-(--accent) px-4 py-2 text-xs font-semibold text-white transition hover:bg-(--accent-deep) disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    Boolean(recommendation.completedAt) ||
                    completingRecommendationId === recommendation.id
                  }
                  onClick={() => {
                    void onComplete(recommendation.id);
                  }}
                  type="button"
                >
                  {completionButtonText}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={feedbackingRecommendationId === recommendation.id}
                  onClick={() => {
                    void onFeedback(recommendation.id, "positive");
                  }}
                  type="button"
                >
                  Positivo
                </button>
                <button
                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={feedbackingRecommendationId === recommendation.id}
                  onClick={() => {
                    void onFeedback(recommendation.id, "neutral");
                  }}
                  type="button"
                >
                  Neutro
                </button>
                <button
                  className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={feedbackingRecommendationId === recommendation.id}
                  onClick={() => {
                    void onFeedback(recommendation.id, "negative");
                  }}
                  type="button"
                >
                  Negativo
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
