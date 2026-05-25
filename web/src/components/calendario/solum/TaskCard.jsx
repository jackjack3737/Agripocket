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
      className={`py-5 border-b border-gray-100 last:border-0 ${done ? "opacity-50" : ""}`}
    >
      <div className="flex gap-4 items-start">
        <span className="text-2xl shrink-0 mt-0.5" aria-hidden>
          {task.icona}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={`text-base font-semibold text-gray-800 leading-snug ${done ? "line-through decoration-gray-300" : ""}`}
          >
            {task.titolo_semplice}
          </h3>
          <p className="mt-1.5 text-sm text-gray-500 leading-relaxed line-clamp-2">
            {task.descrizione_semplice}
          </p>

          {task.prodotti?.length ? (
            <ul className="mt-4 space-y-2" aria-label="Prodotti consigliati">
              {task.prodotti.slice(0, 3).map((p, idx) => (
                <li
                  key={p.id ?? `${p.nome_commerciale}-${idx}`}
                  className="text-sm text-gray-600 flex gap-2"
                >
                  <span className="shrink-0 text-gray-400" aria-hidden>
                    ·
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-gray-800">{p.nome_commerciale}</span>
                    {p.marca ? <span className="text-gray-400"> — {p.marca}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {haScienza ? (
            <button
              type="button"
              className="mt-3 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              onClick={() => setScienzaOpen((v) => !v)}
              aria-expanded={scienzaOpen}
              aria-controls={panelId}
            >
              {scienzaOpen ? "Nascondi perché" : "Perché lo facciamo?"}
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
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-40"
            onClick={() => onComplete(task.id)}
            disabled={busy}
          >
            {busy ? "Salvo…" : "Segna fatto"}
          </button>
        </div>
      ) : done ? (
        <p className="mt-3 text-xs text-gray-400">Completato</p>
      ) : null}
    </article>
  );
}
