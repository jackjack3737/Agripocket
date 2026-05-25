import { formatGiornoCompatto } from "../../../lib/mapInterventoSolum.js";

export default function PianoFuturoPanel({ mesi, open, onClose }) {
  if (!open) return null;

  const totale = mesi.reduce((n, m) => n + m.tasks.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="piano-futuro-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]"
        aria-label="Chiudi"
        onClick={onClose}
      />
      <div className="relative max-h-[85vh] w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_24px_80px_rgb(0,0,0,0.08)] flex flex-col overflow-hidden">
        <header className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="piano-futuro-title" className="text-lg font-semibold text-slate-900 tracking-tight">
                Il tuo piano fino a fine anno
              </h2>
              <p className="text-xs text-slate-400 mt-1 tracking-wide">
                {totale} {totale === 1 ? "lavoro" : "lavori"} in programma
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
              onClick={onClose}
              aria-label="Chiudi elenco"
            >
              ✕
            </button>
          </div>
        </header>
        <div className="overflow-y-auto px-6 pb-8 flex-1">
          {!totale ? (
            <p className="text-sm text-slate-400 text-center py-12">Nessun intervento futuro in agenda.</p>
          ) : (
            <div className="space-y-8">
              {mesi.map((mese) => (
                <section key={mese.meseKey}>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    {mese.meseLabel}
                  </h3>
                  <ul className="space-y-1">
                    {mese.tasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-3 text-sm text-slate-600 py-2.5"
                      >
                        <span className="shrink-0 text-slate-400 tabular-nums text-xs w-[4.5rem]">
                          {formatGiornoCompatto(task.data_prevista)}
                        </span>
                        <span className="shrink-0 select-none" aria-hidden>
                          {task.icona}
                        </span>
                        <span className="font-medium text-slate-800 truncate">{task.titolo_semplice}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
