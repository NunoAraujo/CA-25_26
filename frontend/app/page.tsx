"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UploadState = {
  journalId: string;
  status: string;
  createdAt: string;
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

export default function HomePage() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

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

  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api",
    [],
  );
  const recordingStateLabel = getRecordingStateLabel(
    isRecording,
    Boolean(audioBlob),
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

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

  async function startRecording() {
    setErrorMessage(null);
    setUploadState(null);

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
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Falha no envio do audio.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-12">
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

        <div className="rounded-4xl border border-(--line) bg-(--paper-strong) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]">
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
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
