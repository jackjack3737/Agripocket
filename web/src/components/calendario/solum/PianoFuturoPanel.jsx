import { formatGiornoCompatto } from "../../../lib/mapInterventoSolum.js";

export default function PianoFuturoPanel({ mesi, open, onClose }) {
  if (!open) return null;

  const totale = mesi.reduce((n, m) => n + m.tasks.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="piano-futuro-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
        aria-label="Chiudi"
        onClick={onClose}
      />
      <div className="relative max-h-[85vh] w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden">
        <header className="px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="piano-futuro-title" className="text-lg font-semibold text-gray-800">
                Il tuo piano fino a fine anno
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {totale} {totale === 1 ? "lavoro" : "lavori"} in programma — solo titoli, niente testi lunghi
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100"
              onClick={onClose}
              aria-label="Chiudi elenco"
            >
              ✕
            </button>
          </div>
        </header>
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {!totale ? (
            <p className="text-sm text-gray-500 text-center py-8">Nessun intervento futuro in agenda.</p>
          ) : (
            <div className="space-y-6">
              {mesi.map((mese) => (
                <section key={mese.meseKey}>
                  <h3 className="text-sm font-bold text-solum-green mb-2">{mese.meseLabel}</h3>
                  <ul className="space-y-2">
                    {mese.tasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-2 text-sm text-gray-700 py-1 border-b border-gray-50 last:border-0"
                      >
                        <span className="shrink-0 text-gray-400 tabular-nums w-[4.5rem]">
                          {formatGiornoCompatto(task.data_prevista)}
                        </span>
                        <span className="shrink-0" aria-hidden>
                          {task.icona}
                        </span>
                        <span className="font-medium text-gray-800 truncate">{task.titolo_semplice}</span>
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
