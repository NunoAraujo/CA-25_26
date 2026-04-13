import { useState } from "react";
import { toast } from "sonner";
import { JournalDetail, JournalTimelineItem } from "../types/home";

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function fearValue(source: Record<string, unknown>) {
  return numberOrNull(source.fearScore) ?? numberOrNull(source.anxietyScore);
}

function disgustValue(source: Record<string, unknown>) {
  return numberOrNull(source.disgustScore) ?? numberOrNull(source.calmScore);
}

function surpriseValue(source: Record<string, unknown>) {
  return numberOrNull(source.surpriseScore) ?? numberOrNull(source.energyScore);
}

export function useJournalTimeline(apiBaseUrl: string) {
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
            recordedAt:
              typeof item.recordedAt === "string" ? item.recordedAt : null,
            durationSeconds:
              typeof item.durationSeconds === "number"
                ? item.durationSeconds
                : null,
            transcription:
              typeof item.transcription === "string"
                ? item.transcription
                : null,
            joyScore: numberOrNull(item.joyScore),
            sadnessScore: numberOrNull(item.sadnessScore),
            angerScore: numberOrNull(item.angerScore),
            fearScore: fearValue(item),
            disgustScore: disgustValue(item),
            surpriseScore: surpriseValue(item),
          }))
        : [];

      setJournals(timeline);
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
        joyScore: numberOrNull(payload.joyScore),
        sadnessScore: numberOrNull(payload.sadnessScore),
        angerScore: numberOrNull(payload.angerScore),
        fearScore: fearValue(payload),
        disgustScore: disgustValue(payload),
        surpriseScore: surpriseValue(payload),
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

  return {
    journals,
    isLoadingJournals,
    journalsError,
    expandedJournalId,
    journalDetailsById,
    loadingJournalDetailId,
    journalDetailError,
    loadJournals,
    toggleJournalDetail,
  };
}
