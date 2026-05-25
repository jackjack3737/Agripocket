import { treatmentFromIntervento } from "./TreatmentCard.jsx";
import { interventoToSolum } from "../../lib/mapInterventoSolum.js";
import { formatDataIt, CATEGORIA_LABEL } from "../../lib/dashboard.js";
import PrescrizioneProdottoCard from "./solum/PrescrizioneProdottoCard.jsx";

export default function TrattamentoDetailSheet({
  item,
  open,
  onClose,
  userMq,
  onComplete,
  onPin,
  completing = false,
}) {
  if (!open || !item) return null;

  const task = interventoToSolum(item);
  const treatment = treatmentFromIntervento(item);
  const prodotti = treatment?.prodotti_consigliati ?? task.prodotti ?? [];
  const done = item.stato === "completato";
  const dataLabel =
    item.isRitardo && item.data_originale
      ? `Era il ${formatDataIt(item.data_originale)}`
      : formatDataIt(item.data_prevista);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trattamento-sheet-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
        aria-label="Chiudi"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <header className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {CATEGORIA_LABEL[item.categoria] || "Lavoro"} · {dataLabel}
              </p>
              <h2
                id="trattamento-sheet-title"
                className="text-lg font-semibold text-slate-900 mt-1 leading-snug"
              >
                {task.titolo_semplice}
              </h2>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-50"
              onClick={onClose}
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="overflow-y-auto px-5 py-5 flex-1 space-y-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Cosa fare
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">{task.descrizione_semplice}</p>
          </section>

          {task.fabbisogno_fisiologico || task.titolo_tecnico ? (
            <section className="rounded-xl bg-slate-50 px-4 py-3">
              {task.titolo_tecnico ? (
                <p className="text-sm font-medium text-slate-800">{task.titolo_tecnico}</p>
              ) : null}
              {task.fabbisogno_fisiologico ? (
                <p
                  className={`text-sm text-slate-600 leading-relaxed whitespace-pre-line ${
                    task.titolo_tecnico ? "mt-2" : ""
                  }`}
                >
                  {task.fabbisogno_fisiologico}
                </p>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="prodotti-consigliati-title">
            <h3
              id="prodotti-consigliati-title"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3"
            >
              Prodotti consigliati per i tuoi {userMq} m²
            </h3>
            {prodotti.length ? (
              <ul className="space-y-3">
                {prodotti.map((p, idx) => (
                  <li key={p.id ?? `${p.nome_commerciale}-${idx}`}>
                    <PrescrizioneProdottoCard
                      prodotto={p}
                      userMq={userMq}
                      perIntervento={task.titolo_semplice}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                Nessun prodotto collegato in vetrina. Sincronizza il piano o chiedi in garden center.
              </p>
            )}
            {treatment?.nota_scelta_prodotti ? (
              <p className="mt-3 text-xs text-slate-500 leading-relaxed" role="note">
                {treatment.nota_scelta_prodotti}
              </p>
            ) : null}
          </section>
        </div>

        <footer className="px-5 py-4 border-t border-gray-100 shrink-0 flex flex-col gap-2">
          {!done && onComplete ? (
            <button
              type="button"
              className="w-full btn btn-primary py-3 text-sm disabled:opacity-50"
              onClick={() => onComplete(item.id)}
              disabled={completing}
            >
              {completing ? "Salvo…" : "Segna come completato"}
            </button>
          ) : null}
          {onPin && item.fonte === "calendario_stagionale" ? (
            <button
              type="button"
              className="w-full text-sm text-slate-600 py-2 hover:text-slate-900"
              onClick={() => onPin(item.id, !item.manual_override)}
            >
              {item.manual_override ? "✓ Mantieni al rigenera piano" : "Mantieni al rigenera piano"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
