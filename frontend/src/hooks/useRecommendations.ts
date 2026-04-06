import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Recommendation,
  RecommendationFeedback,
  RecommendationPreset,
} from "../types/home";
import { applyRecommendationPreset } from "../lib/homeUtils";

export function useRecommendations(apiBaseUrl: string) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] =
    useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(
    null,
  );
  const [recommendationInfo, setRecommendationInfo] = useState<string | null>(
    null,
  );
  const [recommendationIntensityFilter, setRecommendationIntensityFilter] =
    useState("all");
  const [recommendationEmotionFilter, setRecommendationEmotionFilter] =
    useState("all");
  const [recommendationOrderBy, setRecommendationOrderBy] =
    useState("confidence");
  const [completingRecommendationId, setCompletingRecommendationId] = useState<
    string | null
  >(null);
  const [feedbackingRecommendationId, setFeedbackingRecommendationId] =
    useState<string | null>(null);
  const [isGeneratingRecommendations, setIsGeneratingRecommendations] =
    useState(false);

  const recommendationIntensityOptions = useMemo(
    () =>
      Array.from(
        new Set(recommendations.map((item) => item.activityIntensity)),
      ).sort((a, b) => a.localeCompare(b)),
    [recommendations],
  );

  const recommendationEmotionOptions = useMemo(
    () =>
      Array.from(
        new Set(recommendations.map((item) => item.expectedImpactMetric)),
      ).sort((a, b) => a.localeCompare(b)),
    [recommendations],
  );

  const sortedRecommendations = useMemo(() => {
    const filteredRecommendations = recommendations.filter((item) => {
      const intensityMatch =
        recommendationIntensityFilter === "all" ||
        item.activityIntensity === recommendationIntensityFilter;
      const emotionMatch =
        recommendationEmotionFilter === "all" ||
        item.expectedImpactMetric === recommendationEmotionFilter;

      return intensityMatch && emotionMatch;
    });

    return [...filteredRecommendations].sort((a, b) => {
      if (recommendationOrderBy === "duration") {
        return a.activityDurationMin - b.activityDurationMin;
      }

      if (recommendationOrderBy === "newest") {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }

      return b.confidence - a.confidence;
    });
  }, [
    recommendationEmotionFilter,
    recommendationIntensityFilter,
    recommendationOrderBy,
    recommendations,
  ]);

  async function loadRecommendations() {
    setIsLoadingRecommendations(true);
    setRecommendationError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/recommendations`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ??
            payload.error ??
            "Falha ao carregar recomendacoes.",
        );
      }

      setRecommendations(
        Array.isArray(payload.recommendations) ? payload.recommendations : [],
      );
      toast.success("Recomendacoes atualizadas.");
    } catch (error) {
      setRecommendationError(
        error instanceof Error
          ? error.message
          : "Falha ao carregar recomendacoes.",
      );
      toast.error("Falha ao carregar recomendacoes.");
    } finally {
      setIsLoadingRecommendations(false);
    }
  }

  async function generateDailyRecommendations() {
    setIsGeneratingRecommendations(true);
    setRecommendationError(null);
    setRecommendationInfo(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/recommendations/generate-daily`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ??
            payload.error ??
            "Falha ao gerar recomendacoes diarias.",
        );
      }

      const created =
        Array.isArray(payload.recommendations) && payload.recommendations.length
          ? payload.recommendations.length
          : Number(payload.created ?? 0);
      setRecommendationInfo(`Geracao concluida: ${created} recomendacoes.`);
      toast.success(`Geracao concluida: ${created} recomendacoes.`);
      await loadRecommendations();
    } catch (error) {
      setRecommendationError(
        error instanceof Error
          ? error.message
          : "Falha ao gerar recomendacoes diarias.",
      );
      toast.error("Falha ao gerar recomendacoes diarias.");
    } finally {
      setIsGeneratingRecommendations(false);
    }
  }

  async function completeRecommendation(recommendationId: string) {
    setCompletingRecommendationId(recommendationId);
    setRecommendationError(null);
    setRecommendationInfo(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/recommendations/${recommendationId}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ?? payload.error ?? "Falha ao concluir recomendacao.",
        );
      }

      setRecommendations((current) =>
        current.map((item) =>
          item.id === recommendationId
            ? {
                ...item,
                completedAt:
                  typeof payload?.recommendation?.completedAt === "string"
                    ? payload.recommendation.completedAt
                    : new Date().toISOString(),
              }
            : item,
        ),
      );
      setRecommendationInfo("Recomendacao marcada como concluida.");
      toast.success("Recomendacao marcada como concluida.");
    } catch (error) {
      setRecommendationError(
        error instanceof Error
          ? error.message
          : "Falha ao concluir recomendacao.",
      );
      toast.error("Falha ao concluir recomendacao.");
    } finally {
      setCompletingRecommendationId(null);
    }
  }

  async function submitRecommendationFeedback(
    recommendationId: string,
    feedback: RecommendationFeedback,
  ) {
    setFeedbackingRecommendationId(recommendationId);
    setRecommendationError(null);
    setRecommendationInfo(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/recommendations/${recommendationId}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ feedback }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ?? payload.error ?? "Falha ao guardar feedback.",
        );
      }

      setRecommendations((current) =>
        current.map((item) =>
          item.id === recommendationId
            ? {
                ...item,
                feedback,
              }
            : item,
        ),
      );

      setRecommendationInfo("Feedback guardado com sucesso.");
      toast.success("Feedback guardado com sucesso.");
    } catch (error) {
      setRecommendationError(
        error instanceof Error ? error.message : "Falha ao guardar feedback.",
      );
      toast.error("Falha ao guardar feedback.");
    } finally {
      setFeedbackingRecommendationId(null);
    }
  }

  function applyPreset(preset: RecommendationPreset) {
    applyRecommendationPreset(
      preset,
      setRecommendationIntensityFilter,
      setRecommendationEmotionFilter,
      setRecommendationOrderBy,
    );
  }

  return {
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
    loadRecommendations,
    generateDailyRecommendations,
    completeRecommendation,
    submitRecommendationFeedback,
    setRecommendationIntensityFilter,
    setRecommendationEmotionFilter,
    setRecommendationOrderBy,
    applyPreset,
  };
}
