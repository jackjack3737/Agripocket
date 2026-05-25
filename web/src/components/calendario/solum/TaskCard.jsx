import { useId, useState } from "react";
import ScienzaPanel from "./ScienzaPanel.jsx";

export default function TaskCard({ task, onComplete, completingId }) {
  const [scienzaOpen, setScienzaOpen] = useState(false);
  const panelId = useId();
  const done = task.stato === "completato";
  const busy = completingId === task.id;
  const haScienza = !!(task.fabbisogno_fisiologico || task.titolo_tecnico);

  return (
    <article
      className={`rounded-3xl bg-white border border-gray-100 shadow-sm transition-shadow hover:shadow-md p-5 ${
        done ? "opacity-60" : ""
      }`}
    >
      <div className="flex gap-4 items-start">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-solum-green-light text-2xl"
          aria-hidden
        >
          {task.icona}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={`text-lg font-semibold text-gray-800 leading-tight ${done ? "line-through decoration-gray-300" : ""}`}
          >
            {task.titolo_semplice}
          </h3>
          <p className="mt-1 text-sm text-gray-500 leading-relaxed">{task.descrizione_semplice}</p>

          {task.prodotti?.length ? (
            <ul className="mt-3 space-y-2" aria-label="Prodotti consigliati">
              {task.prodotti.slice(0, 3).map((p, idx) => (
                <li
                  key={p.id ?? `${p.nome_commerciale}-${idx}`}
                  className="flex items-start gap-2 rounded-xl bg-solum-green-light/40 px-3 py-2 text-sm"
                >
                  <span className="shrink-0" aria-hidden>
                    🧴
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 leading-snug">{p.nome_commerciale}</p>
                    {p.marca ? <p className="text-xs text-gray-500">{p.marca}</p> : null}
                    {p.dose_totale_calcolata ? (
                      <p className="text-xs text-solum-green mt-0.5">{p.dose_totale_calcolata}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {haScienza ? (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-solum-green hover:text-solum-green/80 transition-colors rounded-lg px-0 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-solum-green/40"
              onClick={() => setScienzaOpen((v) => !v)}
              aria-expanded={scienzaOpen}
              aria-controls={panelId}
            >
              <span aria-hidden>💡</span>
              {scienzaOpen ? "Nascondi" : "Perché lo facciamo?"}
            </button>
          ) : null}

          <div id={panelId}>
            <ScienzaPanel
              titoloTecnico={task.titolo_tecnico}
              fabbisogno={task.fabbisogno_fisiologico}
              open={scienzaOpen}
            />
          </div>
        </div>
      </div>

      {!done && onComplete ? (
        <div className="mt-4 pt-4 border-t border-gray-50 flex justify-end">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-2xl bg-solum-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-solum-green/90 active:scale-[0.98] transition-all disabled:opacity-50"
            onClick={() => onComplete(task.id)}
            disabled={busy}
          >
            {busy ? "Salvo…" : "Fatto ✓"}
          </button>
        </div>
      ) : done ? (
        <p className="mt-3 text-xs font-medium text-solum-green-muted uppercase tracking-wide">Completato</p>
      ) : null}
    </article>
  );
}
