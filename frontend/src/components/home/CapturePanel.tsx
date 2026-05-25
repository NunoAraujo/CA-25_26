import { formatClock, getJournalStatusLabel } from "../../lib/homeUtils";
import { JournalStatusState, UploadState } from "../../types/home";

type CapturePanelProps = {
  isRecording: boolean;
  isUploading: boolean;
  audioBlob: Blob | null;
  audioUrl: string | null;
  elapsedSeconds: number;
  recordingStateLabel: string;
  errorMessage: string | null;
  uploadState: UploadState | null;
  journalStatus: JournalStatusState | null;
  journalStatusError: string | null;
  isPollingJournalStatus: boolean;
  statusPollAttempt: number;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => void;
  onUploadRecording: () => Promise<void>;
  onPollStatus: (journalId: string) => Promise<void>;
};

export function CapturePanel({
  isRecording,
  isUploading,
  audioBlob,
  audioUrl,
  elapsedSeconds,
  errorMessage,
  uploadState,
  journalStatus,
  journalStatusError,
  isPollingJournalStatus,
  onStartRecording,
  onStopRecording,
  onUploadRecording,
  onPollStatus,
}: Readonly<CapturePanelProps>) {
  const currentStatus = journalStatus?.status ?? uploadState?.status ?? null;
  const isAnalysisRunning =
    isPollingJournalStatus &&
    currentStatus !== "complete" &&
    currentStatus !== "failed";
  const isComplete = currentStatus === "complete";
  const isFailed = currentStatus === "failed";

  return (
    <section className="mx-auto mb-6 max-w-6xl" id="capture">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Hero text */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-light)]">
            🎙 Diário Emocional em Áudio
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-[var(--text)] lg:text-5xl">
            Regista o teu dia
            <br />
            <span className="text-[var(--accent-light)]">em voz alta.</span>
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
            Fala livremente sobre o teu dia. O sistema transcreve, analisa as
            tuas emoções e gera tendências ao longo do tempo.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--line-muted)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-subtle)]">
                Duração
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">
                {formatClock(elapsedSeconds)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line-muted)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-subtle)]">
                Idioma
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--text)]">PT</p>
            </div>
            <div className="rounded-xl border border-[var(--line-muted)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-subtle)]">
                Estado
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                {isRecording ? (
                  <span className="text-[var(--danger-text)]">● Gravando</span>
                ) : isUploading ? (
                  <span className="text-[var(--warning-text)]">
                    A enviar...
                  </span>
                ) : isAnalysisRunning ? (
                  <span className="text-[var(--accent-light)]">
                    A analisar...
                  </span>
                ) : isComplete ? (
                  <span className="text-[var(--success-text)]">Concluído</span>
                ) : isFailed ? (
                  <span className="text-[var(--danger-text)]">Erro</span>
                ) : (
                  <span className="text-[var(--text-subtle)]">Pronto</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8">
          {/* Recording timer */}
          <div
            className={[
              "flex flex-1 flex-col items-center justify-center rounded-xl border p-6 transition-colors",
              isRecording
                ? "border-[var(--danger-text)]/30 bg-[var(--danger-soft)]"
                : "border-[var(--line-muted)] bg-[var(--surface-2)]",
            ].join(" ")}
          >
            {isRecording && (
              <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--danger-text)]">
                <span className="size-2 animate-pulse rounded-full bg-[var(--danger-text)]" />
                Gravando
              </span>
            )}
            <p className="text-6xl font-bold tabular-nums tracking-tight text-[var(--text)]">
              {formatClock(elapsedSeconds)}
            </p>
            {!isRecording && !audioBlob && (
              <p className="mt-3 text-sm text-[var(--text-subtle)]">
                Clica em Iniciar para começar
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isRecording || isUploading}
              onClick={() => {
                void onStartRecording();
              }}
              type="button"
            >
              Iniciar
            </button>
            <button
              className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-3)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!isRecording}
              onClick={onStopRecording}
              type="button"
            >
              Parar
            </button>
            <button
              className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-light)] transition hover:bg-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!audioBlob || isRecording || isUploading}
              onClick={() => {
                void onUploadRecording();
              }}
              type="button"
            >
              {isUploading ? "A enviar..." : "Enviar"}
            </button>
          </div>

          {/* Audio preview */}
          {audioUrl ? (
            <div className="rounded-xl border border-[var(--line-muted)] bg-[var(--surface-2)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--text-subtle)]">
                Pré-escuta
              </p>
              <audio className="w-full" controls src={audioUrl}>
                <track
                  kind="captions"
                  label="Sem legendas"
                  src="data:text/vtt,WEBVTT"
                  srcLang="pt"
                />
              </audio>
            </div>
          ) : null}

          {/* Analysis status */}
          {uploadState && currentStatus ? (
            <div
              className={[
                "rounded-xl border px-4 py-3",
                isComplete
                  ? "border-[var(--success-soft)] bg-[var(--success-soft)]"
                  : isFailed
                    ? "border-[var(--danger-soft)] bg-[var(--danger-soft)]"
                    : "border-[var(--accent-soft)] bg-[var(--accent-soft)]",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className={[
                    "text-sm font-semibold",
                    isComplete
                      ? "text-[var(--success-text)]"
                      : isFailed
                        ? "text-[var(--danger-text)]"
                        : "text-[var(--accent-light)]",
                  ].join(" ")}
                >
                  {isAnalysisRunning && (
                    <span className="mr-2 inline-block animate-spin">⟳</span>
                  )}
                  {getJournalStatusLabel(currentStatus)}
                </p>
                {!isComplete && !isFailed && (
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-50"
                    disabled={isPollingJournalStatus}
                    onClick={() => {
                      void onPollStatus(uploadState.journalId);
                    }}
                    type="button"
                  >
                    {isPollingJournalStatus ? "A verificar..." : "Verificar"}
                  </button>
                )}
              </div>
              {journalStatus?.errorMessage ? (
                <p className="mt-2 text-xs text-[var(--danger-text)]">
                  {journalStatus.errorMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Error */}
          {errorMessage ? (
            <div className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">
              {errorMessage}
            </div>
          ) : null}

          {journalStatusError ? (
            <div className="rounded-xl border border-[var(--warning-soft)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning-text)]">
              {journalStatusError}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
