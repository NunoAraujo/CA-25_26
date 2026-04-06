import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { JournalStatusState, UploadState } from "../types/home";
import { getRecordingStateLabel } from "../lib/homeUtils";

function isTerminalJournalStatus(status: string) {
  return status === "complete" || status === "failed";
}

export function useAudioCapture(apiBaseUrl: string) {
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

  const recordingStateLabel = useMemo(
    () => getRecordingStateLabel(isRecording, Boolean(audioBlob)),
    [audioBlob, isRecording],
  );

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
  }, [audioBlob, audioUrl]);

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

  return {
    isRecording,
    elapsedSeconds,
    audioBlob,
    audioUrl,
    isUploading,
    errorMessage,
    uploadState,
    journalStatus,
    journalStatusError,
    isPollingJournalStatus,
    statusPollAttempt,
    recordingStateLabel,
    startRecording,
    stopRecording,
    uploadRecording,
    pollJournalStatus,
  };
}
