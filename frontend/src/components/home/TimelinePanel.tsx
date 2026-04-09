import { statusBadgeClasses } from "../../lib/homeUtils";
import { JournalDetail, JournalTimelineItem } from "../../types/home";

type TimelinePanelProps = {
  journals: JournalTimelineItem[];
  isLoadingJournals: boolean;
  journalsError: string | null;
  journalDetailError: string | null;
  expandedJournalId: string | null;
  journalDetailsById: Record<string, JournalDetail>;
  loadingJournalDetailId: string | null;
  onRefresh: () => Promise<void>;
  onToggleDetail: (journalId: string) => Promise<void>;
};

export function TimelinePanel({
  journals,
  isLoadingJournals,
  journalsError,
  journalDetailError,
  expandedJournalId,
  journalDetailsById,
  loadingJournalDetailId,
  onRefresh,
  onToggleDetail,
}: Readonly<TimelinePanelProps>) {
  const visibleJournals = journals.slice(0, 8);

  return (
    <section
      className="mx-auto mt-6 max-w-6xl rounded-4xl border border-(--line) bg-(--paper) p-8 shadow-[0_24px_80px_rgba(82,55,31,0.08)]"
      id="timeline"
    >
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
            void onRefresh();
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

      {!isLoadingJournals && visibleJournals.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-(--line) bg-(--paper-strong) p-5 text-(--ink-soft)">
          Ainda nao existem entradas para mostrar.
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {visibleJournals.map((journal) => {
          let detailButtonText = "Ver detalhes";
          if (loadingJournalDetailId === journal.id) {
            detailButtonText = "A carregar...";
          } else if (expandedJournalId === journal.id) {
            detailButtonText = "Ocultar detalhes";
          }

          return (
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
                    void onToggleDetail(journal.id);
                  }}
                  type="button"
                >
                  {detailButtonText}
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
          );
        })}
      </div>
    </section>
  );
}
