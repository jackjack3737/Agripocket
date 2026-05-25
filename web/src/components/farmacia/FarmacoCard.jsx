import { ExternalLink, ShoppingBag } from "lucide-react";
import { calcolaDoseFarmacia } from "./calcolaDoseFarmacia.js";

function TimingBadge({ timing }) {
  if (timing === "ora") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 text-green-800 border border-green-100 px-3 py-1 text-xs font-semibold">
        <span aria-hidden>🟢</span>
        Ideale per questo mese
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-100 px-3 py-1 text-xs font-semibold">
      <span aria-hidden>🟡</span>
      Consigliato tra 1 mese
    </span>
  );
}

export default function FarmacoCard({ prodotto, userMq }) {
  const dose = calcolaDoseFarmacia(prodotto, userMq);

  return (
    <article className="flex flex-col rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-6 gap-5 h-full">
      <div className="flex justify-between items-start gap-3">
        <TimingBadge timing={prodotto.timing_tag} />
        <span className="text-xs text-gray-400 font-medium">{prodotto.obiettivo}</span>
      </div>

      <div className="flex gap-4 items-center">
        <div className="shrink-0 w-20 h-20 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center p-2">
          <img
            src={prodotto.immagine}
            alt=""
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-800 leading-snug">
            {prodotto.nome_commerciale}
          </h3>
          <p className="text-sm text-gray-400 mt-0.5">{prodotto.marca}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {prodotto.tag_tecnici?.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-medium text-green-800/80 bg-green-50/80 rounded-md px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3.5 text-sm text-gray-700 leading-relaxed">
        <p className="font-medium text-gray-800 mb-1 flex items-center gap-1.5">
          <span aria-hidden>📐</span>
          Dose per il tuo prato
        </p>
        <p>{dose.testoRiga}</p>
        <p className="text-xs text-gray-500 mt-2">
          Chiave: <span className="text-green-800 font-medium">{prodotto.molecola_chiave}</span>
          {" · "}
          {prodotto.dose_mq} {prodotto.unita_misura}/m²
        </p>
      </div>

      <a
        href={prodotto.link_partner}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 text-white text-sm font-semibold px-5 py-3 hover:bg-green-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-800 focus-visible:ring-offset-2"
      >
        <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden />
        Acquista dal Partner
        <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden />
      </a>
    </article>
  );
}
