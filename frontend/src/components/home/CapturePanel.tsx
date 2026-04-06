import { formatClock } from "../../lib/homeUtils";
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
  recordingStateLabel,
  errorMessage,
  uploadState,
  journalStatus,
  journalStatusError,
  isPollingJournalStatus,
  statusPollAttempt,
  onStartRecording,
  onStopRecording,
  onUploadRecording,
  onPollStatus,
}: Readonly<CapturePanelProps>) {
  return (
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
          asincrona e prepara a base para tendencias diarias e sugestoes de
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
            <p className="mt-3 text-3xl font-semibold">{recordingStateLabel}</p>
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

      <div
        className="rounded-4xl border border-(--line) bg-(--paper-strong) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]"
        id="capture"
      >
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
            onClick={() => {
              void onStartRecording();
            }}
            type="button"
          >
            Iniciar gravacao
          </button>
          <button
            className="rounded-full border border-(--line) px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!isRecording}
            onClick={onStopRecording}
            type="button"
          >
            Parar
          </button>
          <button
            className="rounded-full border border-(--accent) px-6 py-3 text-sm font-semibold text-(--accent-deep) transition hover:bg-(--accent-soft) disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!audioBlob || isRecording || isUploading}
            onClick={() => {
              void onUploadRecording();
            }}
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
                    void onPollStatus(uploadState.journalId);
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
  );
}
