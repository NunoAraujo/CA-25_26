"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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

type UploadState = {
  journalId: string;
  status: string;
  createdAt: string;
};

type JournalStatusState = {
  id: string;
  status: string;
  errorMessage: string | null;
  statusUpdatedAt: string | null;
};

type Recommendation = {
  id: string;
  activityName: string;
  activityDurationMin: number;
  activityIntensity: string;
  rationale: string;
  confidence: number;
  expectedImpactMetric: string;
  expectedImpactDelta: number;
  feedback: string | null;
  completedAt: string | null;
  createdAt: string;
};

type JournalTimelineItem = {
  id: string;
  status: string;
  uploadedAt: string;
  durationSeconds: number | null;
  transcription: string | null;
};

type JournalDetail = {
  id: string;
  transcription: string | null;
  joyScore: number | null;
  sadnessScore: number | null;
  angerScore: number | null;
  anxietyScore: number | null;
  calmScore: number | null;
  energyScore: number | null;
};

type WeeklyTrendPoint = {
  weekStart: string;
  joy: number;
  sadness: number;
  anger: number;
  anxiety: number;
  calm: number;
  energy: number;
};

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getRecordingStateLabel(isRecording: boolean, hasAudio: boolean) {
  if (isRecording) {
    return "A gravar";
  }

  if (hasAudio) {
    return "Pronto";
  }

  return "Em espera";
}

function statusBadgeClasses(status: string) {
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

function formatWeekLabel(rawDate: string) {
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime())
    ? rawDate
    : date.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
      });
}

function deltaDirection(delta: number) {
  if (delta > 0.001) {
    return "up";
  }

  if (delta < -0.001) {
    return "down";
  }

  return "flat";
}

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function applyRecommendationPreset(
  preset: "calming" | "energizing" | "short",
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

export default function HomePage() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const statusPollTimerRef = useRef<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [recordedAt, setRecordedAt] = useState<string>(
    new Date().toISOString(),
  );
  const [journalStatus, setJournalStatus] = useState<JournalStatusState | null>(
    null,
  );
  const [journalStatusError, setJournalStatusError] = useState<string | null>(
    null,
  );
  const [isPollingJournalStatus, setIsPollingJournalStatus] = useState(false);
  const [statusPollAttempt, setStatusPollAttempt] = useState(0);
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyTrendPoint[]>([]);
  const [isLoadingWeeklyTrends, setIsLoadingWeeklyTrends] = useState(false);
  const [weeklyTrendsError, setWeeklyTrendsError] = useState<string | null>(
    null,
  );
  const [journals, setJournals] = useState<JournalTimelineItem[]>([]);
  const [isLoadingJournals, setIsLoadingJournals] = useState(false);
  const [journalsError, setJournalsError] = useState<string | null>(null);
  const [expandedJournalId, setExpandedJournalId] = useState<string | null>(
    null,
  );
  const [journalDetailsById, setJournalDetailsById] = useState<
    Record<string, JournalDetail>
  >({});
  const [loadingJournalDetailId, setLoadingJournalDetailId] = useState<
    string | null
  >(null);
  const [journalDetailError, setJournalDetailError] = useState<string | null>(
    null,
  );
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

  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api",
    [],
  );
  const recordingStateLabel = getRecordingStateLabel(
    isRecording,
    Boolean(audioBlob),
  );
  const latestTrendPoint =
    weeklyTrends.length > 0 ? weeklyTrends[weeklyTrends.length - 1] : null;
  const previousTrendPoint =
    weeklyTrends.length > 1 ? weeklyTrends[weeklyTrends.length - 2] : null;
  const trendDeltaCards =
    latestTrendPoint && previousTrendPoint
      ? [
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
        ]
      : [];
  const recommendationIntensityOptions = Array.from(
    new Set(recommendations.map((item) => item.activityIntensity)),
  ).sort((a, b) => a.localeCompare(b));
  const recommendationEmotionOptions = Array.from(
    new Set(recommendations.map((item) => item.expectedImpactMetric)),
  ).sort((a, b) => a.localeCompare(b));
  const filteredRecommendations = recommendations.filter((item) => {
    const intensityMatch =
      recommendationIntensityFilter === "all" ||
      item.activityIntensity === recommendationIntensityFilter;
    const emotionMatch =
      recommendationEmotionFilter === "all" ||
      item.expectedImpactMetric === recommendationEmotionFilter;

    return intensityMatch && emotionMatch;
  });
  const sortedRecommendations = [...filteredRecommendations].sort((a, b) => {
    if (recommendationOrderBy === "duration") {
      return a.activityDurationMin - b.activityDurationMin;
    }

    if (recommendationOrderBy === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }

    return b.confidence - a.confidence;
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      if (statusPollTimerRef.current) {
        window.clearTimeout(statusPollTimerRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  function isTerminalJournalStatus(status: string) {
    return status === "complete" || status === "failed";
  }

  function stopJournalStatusPolling() {
    if (statusPollTimerRef.current) {
      window.clearTimeout(statusPollTimerRef.current);
      statusPollTimerRef.current = null;
    }

    setIsPollingJournalStatus(false);
  }

  async function pollJournalStatus(journalId: string, attempt = 1) {
    setIsPollingJournalStatus(true);
    setStatusPollAttempt(attempt);

    try {
      const response = await fetch(
        `${apiBaseUrl}/journals/${journalId}/status`,
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ??
            payload.error ??
            "Falha ao consultar estado do journal.",
        );
      }

      const nextState: JournalStatusState = {
        id: payload.id,
        status: payload.status,
        errorMessage:
          typeof payload.errorMessage === "string"
            ? payload.errorMessage
            : null,
        statusUpdatedAt:
          typeof payload.statusUpdatedAt === "string"
            ? payload.statusUpdatedAt
            : null,
      };
      setJournalStatus(nextState);
      setJournalStatusError(null);

      if (isTerminalJournalStatus(nextState.status) || attempt >= 20) {
        stopJournalStatusPolling();
        return;
      }

      statusPollTimerRef.current = window.setTimeout(() => {
        void pollJournalStatus(journalId, attempt + 1);
      }, 2000);
    } catch (error) {
      setJournalStatusError(
        error instanceof Error
          ? error.message
          : "Falha ao consultar estado do journal.",
      );
      stopJournalStatusPolling();
    }
  }

  useEffect(() => {
    if (!audioBlob) {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(audioBlob);
    setAudioUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return nextUrl;
    });
  }, [audioBlob]);

  useEffect(() => {
    void loadWeeklyTrends();
  }, []);

  useEffect(() => {
    void loadJournals();
  }, []);

  useEffect(() => {
    void loadRecommendations();
  }, []);

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

  async function loadJournals() {
    setIsLoadingJournals(true);
    setJournalsError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/journals`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ?? payload.error ?? "Falha ao carregar journals.",
        );
      }

      const timeline = Array.isArray(payload.journals)
        ? payload.journals.map((item: Record<string, unknown>) => ({
            id: String(item.id),
            status: String(item.status ?? "queued"),
            uploadedAt: String(item.uploadedAt ?? new Date().toISOString()),
            durationSeconds:
              typeof item.durationSeconds === "number"
                ? item.durationSeconds
                : null,
            transcription:
              typeof item.transcription === "string"
                ? item.transcription
                : null,
          }))
        : [];

      setJournals(timeline.slice(0, 8));
      if (timeline.length > 0) {
        toast.success("Timeline atualizada.");
      }
    } catch (error) {
      setJournalsError(
        error instanceof Error ? error.message : "Falha ao carregar journals.",
      );
      toast.error("Falha ao carregar journals.");
    } finally {
      setIsLoadingJournals(false);
    }
  }

  async function loadJournalDetail(journalId: string) {
    setLoadingJournalDetailId(journalId);
    setJournalDetailError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/journals/${journalId}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ??
            payload.error ??
            "Falha ao carregar detalhe do journal.",
        );
      }

      const detail: JournalDetail = {
        id: String(payload.id),
        transcription:
          typeof payload.transcription === "string"
            ? payload.transcription
            : null,
        joyScore:
          typeof payload.joyScore === "number" ? payload.joyScore : null,
        sadnessScore:
          typeof payload.sadnessScore === "number"
            ? payload.sadnessScore
            : null,
        angerScore:
          typeof payload.angerScore === "number" ? payload.angerScore : null,
        anxietyScore:
          typeof payload.anxietyScore === "number"
            ? payload.anxietyScore
            : null,
        calmScore:
          typeof payload.calmScore === "number" ? payload.calmScore : null,
        energyScore:
          typeof payload.energyScore === "number" ? payload.energyScore : null,
      };

      setJournalDetailsById((current) => ({
        ...current,
        [journalId]: detail,
      }));
    } catch (error) {
      setJournalDetailError(
        error instanceof Error
          ? error.message
          : "Falha ao carregar detalhe do journal.",
      );
    } finally {
      setLoadingJournalDetailId(null);
    }
  }

  async function toggleJournalDetail(journalId: string) {
    if (expandedJournalId === journalId) {
      setExpandedJournalId(null);
      return;
    }

    setExpandedJournalId(journalId);

    if (!journalDetailsById[journalId]) {
      await loadJournalDetail(journalId);
    }
  }

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

  async function generateWeeklyRecommendations() {
    setIsGeneratingRecommendations(true);
    setRecommendationError(null);
    setRecommendationInfo(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/recommendations/generate-weekly`,
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
            "Falha ao gerar recomendacoes semanais.",
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
          : "Falha ao gerar recomendacoes semanais.",
      );
      toast.error("Falha ao gerar recomendacoes semanais.");
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
    feedback: "positive" | "neutral" | "negative",
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

  async function startRecording() {
    setErrorMessage(null);
    setUploadState(null);
    setJournalStatus(null);
    setJournalStatusError(null);
    setStatusPollAttempt(0);
    stopJournalStatusPolling();

    if (!("mediaDevices" in navigator) || !("MediaRecorder" in window)) {
      setErrorMessage(
        "O navegador nao suporta gravacao de audio nesta versao.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setElapsedSeconds(0);
      setAudioBlob(null);
      setRecordedAt(new Date().toISOString());

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel iniciar a gravacao.",
      );
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }

  async function uploadRecording() {
    if (!audioBlob) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setUploadState(null);
    setJournalStatus(null);
    setJournalStatusError(null);
    setStatusPollAttempt(0);
    stopJournalStatusPolling();

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "journal-entry.webm");
      formData.append("durationSeconds", String(elapsedSeconds));
      formData.append("recordedAt", recordedAt);

      const response = await fetch(`${apiBaseUrl}/journals`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.message ?? payload.error ?? "Falha no envio do audio.",
        );
      }

      setUploadState({
        journalId: payload.id,
        status: payload.status,
        createdAt: payload.createdAt,
      });
      setJournalStatus({
        id: payload.id,
        status: payload.status,
        errorMessage: null,
        statusUpdatedAt:
          typeof payload.createdAt === "string"
            ? payload.createdAt
            : new Date().toISOString(),
      });
      toast.success("Entrada enviada para analise.");
      void pollJournalStatus(payload.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Falha no envio do audio.",
      );
      toast.error("Falha no envio do audio.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
      <nav className="mx-auto mb-6 flex max-w-6xl flex-wrap gap-2 rounded-full border border-(--line) bg-(--paper) p-2 shadow-[0_18px_50px_rgba(82,55,31,0.08)]">
        <a className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white" href="#capture">
          Captura
        </a>
        <a className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white" href="#trends">
          Tendencias
        </a>
        <a className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white" href="#timeline">
          Timeline
        </a>
        <a className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white" href="#recommendations">
          Recomendacoes
        </a>
      </nav>
      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-4xl border border-(--line) bg-(--paper) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)] backdrop-blur">
          <p className="text-sm uppercase tracking-[0.35em] text-(--accent-deep)">
            Diario emocional em audio
          </p>
          <h1 className="mt-4 max-w-2xl text-5xl leading-tight font-semibold text-slate-900 sm:text-6xl">
            Regista o dia em voz alta e deixa a evolucao emocional ganhar forma.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-(--ink-soft)">
            Esta primeira versao grava audios curtos, envia-os para analise
            asincrona e prepara a base para tendencias semanais e sugestoes de
            autorregulacao.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <article className="rounded-3xl border border-(--line) bg-(--paper-strong) p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-(--ink-soft)">
                Hoje
              </p>
              <p className="mt-3 text-3xl font-semibold">
                {formatClock(elapsedSeconds)}
              </p>
              <p className="mt-2 text-sm text-(--ink-soft)">
                Tempo da ultima captura
              </p>
            </article>
            <article className="rounded-3xl border border-(--line) bg-(--paper-strong) p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-(--ink-soft)">
                Estado
              </p>
              <p className="mt-3 text-3xl font-semibold">
                {recordingStateLabel}
              </p>
              <p className="mt-2 text-sm text-(--ink-soft)">
                Captura, revisao e envio
              </p>
            </article>
            <article className="rounded-3xl border border-(--line) bg-(--paper-strong) p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-(--ink-soft)">
                Idioma alvo
              </p>
              <p className="mt-3 text-3xl font-semibold">PT</p>
              <p className="mt-2 text-sm text-(--ink-soft)">
                Pipeline de analise em portugues
              </p>
            </article>
          </div>
        </div>

        <div className="rounded-4xl border border-(--line) bg-(--paper-strong) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]" id="capture">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-(--accent-deep)">
                Captura
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Entrada rapida</h2>
            </div>
            <div className="rounded-full bg-(--accent-soft) px-4 py-2 text-sm text-(--accent-deep)">
              {isRecording ? "microfone ativo" : "ate 15 MB"}
            </div>
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-dashed border-(--line) bg-white/60 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-(--ink-soft)">
              Tempo atual
            </p>
            <p className="mt-3 text-6xl font-semibold tracking-tight">
              {formatClock(elapsedSeconds)}
            </p>
            <p className="mt-3 text-sm text-(--ink-soft)">
              Fala livre sobre o teu dia. O backend guarda o audio e coloca a
              analise em fila.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-(--accent) px-6 py-3 text-sm font-semibold text-white transition hover:bg-(--accent-deep) disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isRecording || isUploading}
              onClick={startRecording}
              type="button"
            >
              Iniciar gravacao
            </button>
            <button
              className="rounded-full border border-(--line) px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isRecording}
              onClick={stopRecording}
              type="button"
            >
              Parar
            </button>
            <button
              className="rounded-full border border-(--accent) px-6 py-3 text-sm font-semibold text-(--accent-deep) transition hover:bg-(--accent-soft) disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!audioBlob || isRecording || isUploading}
              onClick={uploadRecording}
              type="button"
            >
              {isUploading ? "A enviar..." : "Enviar para analise"}
            </button>
          </div>

          {audioUrl ? (
            <div className="mt-6 rounded-3xl border border-(--line) bg-white/70 p-4">
              <p className="text-sm font-medium text-slate-700">Pre-escuta</p>
              <audio className="mt-3 w-full" controls src={audioUrl}>
                <track
                  kind="captions"
                  label="Sem legendas"
                  src="data:text/vtt,WEBVTT"
                  srcLang="pt"
                />
              </audio>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-6 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {uploadState ? (
            <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
              <p className="font-semibold">Entrada enviada com sucesso</p>
              <p className="mt-2">Journal: {uploadState.journalId}</p>
              <p className="mt-1">Estado inicial: {uploadState.status}</p>
              <p className="mt-1">
                Criado em:{" "}
                {new Date(uploadState.createdAt).toLocaleString("pt-PT")}
              </p>

              <div className="mt-4 rounded-2xl border border-emerald-300 bg-white/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-emerald-800">
                    Estado de processamento
                  </p>
                  <button
                    className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPollingJournalStatus}
                    onClick={() => {
                      void pollJournalStatus(uploadState.journalId);
                    }}
                    type="button"
                  >
                    {isPollingJournalStatus ? "A verificar..." : "Atualizar"}
                  </button>
                </div>

                <p className="mt-2 text-sm">
                  Atual: {journalStatus?.status ?? uploadState.status}
                </p>
                <p className="mt-1 text-xs text-emerald-900/80">
                  Tentativa de polling: {statusPollAttempt}
                </p>

                {journalStatus?.statusUpdatedAt ? (
                  <p className="mt-1 text-xs text-emerald-900/80">
                    Atualizado em:{" "}
                    {new Date(journalStatus.statusUpdatedAt).toLocaleString(
                      "pt-PT",
                    )}
                  </p>
                ) : null}

                {journalStatus?.errorMessage ? (
                  <p className="mt-2 text-xs text-red-700">
                    Erro no processamento: {journalStatus.errorMessage}
                  </p>
                ) : null}

                {journalStatusError ? (
                  <p className="mt-2 text-xs text-red-700">
                    {journalStatusError}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto mt-6 max-w-6xl rounded-4xl border border-(--line) bg-(--paper) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]" id="trends">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-(--accent-deep)">
              Tendencia emocional
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Evolucao semanal</h2>
          </div>
          <button
            className="rounded-full border border-(--line) px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoadingWeeklyTrends}
            onClick={() => {
              void loadWeeklyTrends();
            }}
            type="button"
          >
            {isLoadingWeeklyTrends ? "A atualizar..." : "Atualizar grafico"}
          </button>
        </div>

        {weeklyTrendsError ? (
          <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {weeklyTrendsError}
          </div>
        ) : null}

        {trendDeltaCards.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trendDeltaCards.map((card) => {
              const direction = deltaDirection(card.delta);
              const marker =
                direction === "up"
                  ? "UP"
                  : direction === "down"
                    ? "DOWN"
                    : "FLAT";
              const directionClass =
                direction === "up"
                  ? "text-emerald-700"
                  : direction === "down"
                    ? "text-rose-700"
                    : "text-slate-600";

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
                    {marker} {formatDelta(card.delta)} vs. semana anterior
                  </p>
                </article>
              );
            })}
          </div>
        ) : null}

        {!isLoadingWeeklyTrends && weeklyTrends.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-(--line) bg-(--paper-strong) p-5 text-(--ink-soft)">
            Ainda nao existem dados suficientes para desenhar a tendencia
            semanal.
          </div>
        ) : null}

        {weeklyTrends.length > 0 ? (
          <div className="mt-6 h-80 rounded-3xl border border-(--line) bg-(--paper-strong) p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyTrends}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(100,116,139,0.2)"
                />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={formatWeekLabel}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number) => value.toFixed(2)}
                  labelFormatter={(value: string) =>
                    `Semana: ${formatWeekLabel(value)}`
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

      <section className="mx-auto mt-6 max-w-6xl rounded-4xl border border-(--line) bg-(--paper) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]" id="timeline">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-(--accent-deep)">
              Timeline
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Entradas recentes</h2>
          </div>
          <button
            className="rounded-full border border-(--line) px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoadingJournals}
            onClick={() => {
              void loadJournals();
            }}
            type="button"
          >
            {isLoadingJournals ? "A atualizar..." : "Atualizar timeline"}
          </button>
        </div>

        {journalsError ? (
          <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {journalsError}
          </div>
        ) : null}

        {journalDetailError ? (
          <div className="mt-5 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {journalDetailError}
          </div>
        ) : null}

        {!isLoadingJournals && journals.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-(--line) bg-(--paper-strong) p-5 text-(--ink-soft)">
            Ainda nao existem entradas para mostrar.
          </div>
        ) : null}

        <div className="mt-6 grid gap-3">
          {journals.map((journal) => (
            <article
              className="rounded-3xl border border-(--line) bg-(--paper-strong) p-4"
              key={journal.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">
                  {new Date(journal.uploadedAt).toLocaleString("pt-PT")}
                </p>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClasses(journal.status)}`}
                >
                  {journal.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-(--ink-soft)">ID: {journal.id}</p>
              <p className="mt-1 text-sm text-(--ink-soft)">
                Duracao: {journal.durationSeconds ?? 0}s
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                {journal.transcription && journal.transcription.length > 0
                  ? journal.transcription
                  : "Sem transcricao disponivel ainda."}
              </p>

              <div className="mt-3 flex justify-end">
                <button
                  className="rounded-full border border-(--line) px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loadingJournalDetailId === journal.id}
                  onClick={() => {
                    void toggleJournalDetail(journal.id);
                  }}
                  type="button"
                >
                  {loadingJournalDetailId === journal.id
                    ? "A carregar..."
                    : expandedJournalId === journal.id
                      ? "Ocultar detalhes"
                      : "Ver detalhes"}
                </button>
              </div>

              {expandedJournalId === journal.id ? (
                <div className="mt-3 rounded-2xl border border-(--line) bg-white/60 p-3">
                  <p className="text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                    Scores emocionais
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-3">
                    <p>
                      Joy:{" "}
                      {journalDetailsById[journal.id]?.joyScore?.toFixed(2) ??
                        "-"}
                    </p>
                    <p>
                      Sadness:{" "}
                      {journalDetailsById[journal.id]?.sadnessScore?.toFixed(
                        2,
                      ) ?? "-"}
                    </p>
                    <p>
                      Anger:{" "}
                      {journalDetailsById[journal.id]?.angerScore?.toFixed(2) ??
                        "-"}
                    </p>
                    <p>
                      Anxiety:{" "}
                      {journalDetailsById[journal.id]?.anxietyScore?.toFixed(
                        2,
                      ) ?? "-"}
                    </p>
                    <p>
                      Calm:{" "}
                      {journalDetailsById[journal.id]?.calmScore?.toFixed(2) ??
                        "-"}
                    </p>
                    <p>
                      Energy:{" "}
                      {journalDetailsById[journal.id]?.energyScore?.toFixed(
                        2,
                      ) ?? "-"}
                    </p>
                  </div>

                  <p className="mt-3 text-xs uppercase tracking-[0.15em] text-(--ink-soft)">
                    Transcricao completa
                  </p>
                  <p className="mt-2 max-h-40 overflow-auto rounded-xl bg-white px-3 py-2 text-sm leading-6 text-slate-700">
                    {journalDetailsById[journal.id]?.transcription &&
                    (journalDetailsById[journal.id]?.transcription?.length ??
                      0) > 0
                      ? journalDetailsById[journal.id].transcription
                      : "Sem transcricao completa disponivel."}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-6 max-w-6xl rounded-4xl border border-(--line) bg-(--paper) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]" id="recommendations">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-(--accent-deep)">
              Recomendacoes
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Plano semanal de autorregulacao
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full bg-(--accent) px-5 py-2 text-sm font-semibold text-white transition hover:bg-(--accent-deep) disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isGeneratingRecommendations || isLoadingRecommendations}
              onClick={() => {
                void generateWeeklyRecommendations();
              }}
              type="button"
            >
              {isGeneratingRecommendations ? "A gerar..." : "Gerar semana"}
            </button>
            <button
              className="rounded-full border border-(--line) px-5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoadingRecommendations || isGeneratingRecommendations}
              onClick={() => {
                void loadRecommendations();
              }}
              type="button"
            >
              {isLoadingRecommendations ? "A atualizar..." : "Atualizar lista"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Intensidade
            <select
              className="mt-2 w-full rounded-2xl border border-(--line) bg-white px-3 py-2 text-sm text-slate-800"
              onChange={(event) => {
                setRecommendationIntensityFilter(event.target.value);
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
            Emocao alvo
            <select
              className="mt-2 w-full rounded-2xl border border-(--line) bg-white px-3 py-2 text-sm text-slate-800"
              onChange={(event) => {
                setRecommendationEmotionFilter(event.target.value);
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
            Ordenacao
            <select
              className="mt-2 w-full rounded-2xl border border-(--line) bg-white px-3 py-2 text-sm text-slate-800"
              onChange={(event) => {
                setRecommendationOrderBy(event.target.value);
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
              applyRecommendationPreset(
                "calming",
                setRecommendationIntensityFilter,
                setRecommendationEmotionFilter,
                setRecommendationOrderBy,
              );
              toast.success("Preset calming aplicado.");
            }}
            type="button"
          >
            Calming
          </button>
          <button
            className="rounded-full border border-(--line) bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-(--paper-strong)"
            onClick={() => {
              applyRecommendationPreset(
                "energizing",
                setRecommendationIntensityFilter,
                setRecommendationEmotionFilter,
                setRecommendationOrderBy,
              );
              toast.success("Preset energizing aplicado.");
            }}
            type="button"
          >
            Energizing
          </button>
          <button
            className="rounded-full border border-(--line) bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-(--paper-strong)"
            onClick={() => {
              applyRecommendationPreset(
                "short",
                setRecommendationIntensityFilter,
                setRecommendationEmotionFilter,
                setRecommendationOrderBy,
              );
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
            Ainda nao existem recomendacoes para mostrar. Gera a semana no API e
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
          {sortedRecommendations.map((recommendation) => (
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
                    void completeRecommendation(recommendation.id);
                  }}
                  type="button"
                >
                  {completingRecommendationId === recommendation.id
                    ? "A guardar..."
                    : recommendation.completedAt
                      ? "Concluida"
                      : "Marcar como feita"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={feedbackingRecommendationId === recommendation.id}
                  onClick={() => {
                    void submitRecommendationFeedback(
                      recommendation.id,
                      "positive",
                    );
                  }}
                  type="button"
                >
                  Positivo
                </button>
                <button
                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={feedbackingRecommendationId === recommendation.id}
                  onClick={() => {
                    void submitRecommendationFeedback(
                      recommendation.id,
                      "neutral",
                    );
                  }}
                  type="button"
                >
                  Neutro
                </button>
                <button
                  className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={feedbackingRecommendationId === recommendation.id}
                  onClick={() => {
                    void submitRecommendationFeedback(
                      recommendation.id,
                      "negative",
                    );
                  }}
                  type="button"
                >
                  Negativo
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
