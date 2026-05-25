import { useId, useState } from "react";
import ScienzaPanel from "./ScienzaPanel.jsx";
import PrescrizioneProdottoCard from "./PrescrizioneProdottoCard.jsx";

const cardShadow = "shadow-[0_8px_30px_rgb(0,0,0,0.02)]";

export default function TaskCard({ task, onComplete, completingId, userMq = 150 }) {
  const [scienzaOpen, setScienzaOpen] = useState(false);
  const panelId = useId();
  const done = task.stato === "completato";
  const busy = completingId === task.id;
  const haScienza = !!(task.fabbisogno_fisiologico || task.titolo_tecnico);
  const mq = Math.max(1, Number(userMq) || 150);

  return (
    <article
      className={[
        "rounded-3xl bg-white p-6 sm:p-7",
        cardShadow,
        "transition-opacity duration-300",
        done ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex gap-4 items-start">
        <span className="text-2xl shrink-0 mt-0.5 select-none" aria-hidden>
          {task.icona}
        </span>
        <div className="min-w-0 flex-1 grid grid-cols-1">
          <h3
            className={`text-base font-semibold text-slate-900 leading-snug tracking-tight break-words ${
              done ? "line-through decoration-slate-300" : ""
            }`}
          >
            {task.titolo_semplice}
          </h3>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed break-words line-clamp-2">
            {task.descrizione_semplice}
          </p>

          {haScienza ? (
            <button
              type="button"
              className="mt-4 text-sm text-slate-400 hover:text-slate-700 transition-colors text-left w-fit"
              onClick={() => setScienzaOpen((v) => !v)}
              aria-expanded={scienzaOpen}
              aria-controls={panelId}
            >
              {scienzaOpen ? "Nascondi perché" : "Perché lo facciamo?"}
            </button>
          ) : null}

          <div id={panelId} className="col-span-full">
            <ScienzaPanel
              titoloTecnico={task.titolo_tecnico}
              fabbisogno={task.fabbisogno_fisiologico}
              open={scienzaOpen}
            />
          </div>
        </div>
      </div>

      {task.prodotti?.length ? (
        <div className="mt-6 space-y-3" aria-label="Prescrizione prodotti">
          {task.prodotti.slice(0, 3).map((p, idx) => (
            <PrescrizioneProdottoCard
              key={p.id ?? `${p.nome_commerciale}-${idx}`}
              prodotto={p}
              perIntervento={task.titolo_semplice}
              userMq={mq}
              compact
            />
          ))}
        </div>
      ) : null}

      {!done && onComplete ? (
        <div className="mt-6 pt-5 border-t border-slate-100/60 flex justify-end">
          <button
            type="button"
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-40"
            onClick={() => onComplete(task.id)}
            disabled={busy}
          >
            {busy ? "Salvo…" : "Segna fatto"}
          </button>
        </div>
      ) : done ? (
        <p className="mt-5 text-xs text-slate-400 tracking-wide">Completato</p>
      ) : null}
    </article>
  );
}
