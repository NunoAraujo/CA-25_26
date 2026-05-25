import { useCallback, useEffect, useRef, useState } from "react";
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

function isTerminalJournalStatus(status: string) {
  return status === "complete" || status === "failed";
}

const TIMELINE_POLL_INTERVAL_MS = 3000;

export function useJournalTimeline(apiBaseUrl: string) {
  const timelinePollTimerRef = useRef<number | null>(null);
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

  const stopTimelinePolling = useCallback(() => {
    if (timelinePollTimerRef.current) {
      window.clearInterval(timelinePollTimerRef.current);
      timelinePollTimerRef.current = null;
    }
  }, []);

  const loadJournals = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (!silent) {
        setIsLoadingJournals(true);
      }

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
              errorMessage:
                typeof item.errorMessage === "string"
                  ? item.errorMessage
                  : null,
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
              neutralScore: numberOrNull(item.neutralScore),
              finalEmotion:
                typeof item.finalEmotion === "string"
                  ? item.finalEmotion
                  : null,
              finalConfidence: numberOrNull(item.finalConfidence),
            }))
          : [];

        setJournals(timeline);
        if (!silent && timeline.length > 0) {
          toast.success("Timeline atualizada.");
        }
      } catch (error) {
        setJournalsError(
          error instanceof Error
            ? error.message
            : "Falha ao carregar journals.",
        );
        if (!silent) {
          toast.error("Falha ao carregar journals.");
        }
      } finally {
        if (!silent) {
          setIsLoadingJournals(false);
        }
      }
    },
    [apiBaseUrl],
  );

  const startTimelinePolling = useCallback(() => {
    if (timelinePollTimerRef.current) {
      return;
    }

    timelinePollTimerRef.current = window.setInterval(() => {
      void loadJournals({ silent: true });
    }, TIMELINE_POLL_INTERVAL_MS);
  }, [loadJournals]);

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
        neutralScore: numberOrNull(payload.neutralScore),
        finalEmotion:
          typeof payload.finalEmotion === "string"
            ? payload.finalEmotion
            : null,
        finalConfidence: numberOrNull(payload.finalConfidence),
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

  useEffect(() => {
    const hasPendingJournals = journals.some(
      (journal) => !isTerminalJournalStatus(journal.status),
    );

    if (hasPendingJournals) {
      startTimelinePolling();
      return;
    }

    stopTimelinePolling();
  }, [journals, startTimelinePolling, stopTimelinePolling]);

  useEffect(() => {
    return () => {
      stopTimelinePolling();
    };
  }, [stopTimelinePolling]);

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
