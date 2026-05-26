import { useId, useState } from "react";
import ScienzaPanel from "./ScienzaPanel.jsx";
import PrescrizioneProdottoCard from "./PrescrizioneProdottoCard.jsx";
import { mqUtente } from "../../../lib/calcolaDosePrescrizione.js";

const RING_BY_CATEGORIA = {
  irrigazione: "bg-sky-50 text-sky-700",
  concime: "bg-green-50 text-green-700",
  concimazione: "bg-green-50 text-green-700",
  trattamento: "bg-violet-50 text-violet-700",
  fitofarmaco: "bg-violet-50 text-violet-700",
  diserbo: "bg-amber-50 text-amber-800",
  biostimolante: "bg-emerald-50 text-emerald-700",
  rinnovo: "bg-lime-50 text-lime-800",
  sementi: "bg-lime-50 text-lime-800",
  taglio: "bg-slate-100 text-slate-700",
  controllo: "bg-blue-50 text-blue-700",
  giardino: "bg-rose-50 text-rose-700",
  altro: "bg-slate-50 text-slate-600",
};

function ringClass(categoria) {
  const key = String(categoria || "altro").toLowerCase();
  return RING_BY_CATEGORIA[key] || RING_BY_CATEGORIA.altro;
}

export default function TaskCard({ task, onComplete, completingId, userMq = 150 }) {
  const [scienzaOpen, setScienzaOpen] = useState(false);
  const [farmaciaOpen, setFarmaciaOpen] = useState(false);
  const panelId = useId();
  const farmaciaId = useId();
  const done = task.stato === "completato";
  const busy = completingId === task.id;
  const haScienza = !!(task.fabbisogno_fisiologico || task.titolo_tecnico);
  const prodotti = task.prodotti?.length ? task.prodotti.slice(0, 3) : [];
  const haProdotti = prodotti.length > 0;
  const mq = Math.max(1, mqUtente(userMq) ?? 150);
  const ring = ringClass(task.categoria);

  return (
    <article
      className={[
        "rounded-3xl bg-white p-5",
        "shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
        "transition-opacity duration-300",
        done ? "opacity-55" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-4">
        <span
          className={[
            "w-12 h-12 shrink-0 flex items-center justify-center rounded-full text-xl select-none",
            ring,
          ].join(" ")}
          aria-hidden
        >
          {task.icona}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={[
              "font-bold text-slate-800 text-lg leading-snug tracking-tight break-words",
              done ? "line-through decoration-slate-300" : "",
            ].join(" ")}
          >
            {task.titolo_semplice}
          </h3>
          <p className="mt-1 text-sm text-slate-500 line-clamp-1 break-words">
            {task.descrizione_semplice}
          </p>
        </div>
      </div>

      {!done ? (
        <div className="mt-5 flex flex-col gap-2">
          {onComplete ? (
            <button
              type="button"
              className="w-full bg-[#2d6a4f] hover:bg-[#1b4332] text-white rounded-full py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
              onClick={() => onComplete(task.id)}
              disabled={busy}
            >
              {busy ? "Salvo…" : "Segna come fatto"}
            </button>
          ) : null}

          {haScienza ? (
            <button
              type="button"
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full py-2.5 text-sm font-medium transition-colors"
              onClick={() => setScienzaOpen((v) => !v)}
              aria-expanded={scienzaOpen}
              aria-controls={panelId}
            >
              {scienzaOpen ? "Nascondi spiegazione" : "Vedi spiegazione"}
            </button>
          ) : null}

          {haProdotti ? (
            <>
              {!farmaciaOpen ? (
                <p className="text-[11px] text-center text-slate-400 -mt-0.5">
                  Su <span className="font-medium text-slate-600">{mq} m²</span> di prato
                </p>
              ) : null}
              <button
                type="button"
                className={[
                  "w-full rounded-full py-2.5 text-sm font-medium transition-colors",
                  "bg-green-50 text-green-700 border border-green-200",
                  "hover:bg-green-100 hover:border-green-300",
                  farmaciaOpen ? "mt-0" : "mt-0.5",
                ].join(" ")}
                onClick={() => setFarmaciaOpen((v) => !v)}
                aria-expanded={farmaciaOpen}
                aria-controls={farmaciaId}
              >
                {farmaciaOpen ? "Chiudi trattamento" : "Ordina il trattamento"}
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-center text-xs font-medium text-slate-400 tracking-wide">
          Completato
        </p>
      )}

      {haScienza && scienzaOpen ? (
        <div id={panelId} className="mt-4 -mx-0.5">
          <ScienzaPanel
            titoloTecnico={task.titolo_tecnico}
            fabbisogno={task.fabbisogno_fisiologico}
            open
          />
        </div>
      ) : null}

      {farmaciaOpen && haProdotti ? (
        <div
          id={farmaciaId}
          className="mt-4 space-y-3"
          aria-label="Prescrizione prodotti"
        >
          <p className="text-xs text-slate-500 text-center">
            Dosi calcolate su <strong className="text-slate-700">{mq} m²</strong> di prato
          </p>
          {prodotti.map((p, idx) => (
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
    </article>
  );
}
