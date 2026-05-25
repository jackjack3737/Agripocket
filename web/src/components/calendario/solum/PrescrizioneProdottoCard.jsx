import { ExternalLink } from "lucide-react";
import { linkAcquistoProdotto, prescrizioneDoseUI } from "../../../lib/calcolaDosePrescrizione.js";

/**
 * Card prescrizione contestuale (design FarmacoCard → Calendario).
 * @param {{ prodotto: object, perIntervento?: string, userMq: number, compact?: boolean }}
 */
export default function PrescrizioneProdottoCard({
  prodotto,
  perIntervento,
  userMq,
  compact = false,
}) {
  const nome = prodotto?.nome_commerciale || prodotto?.nome || "Prodotto";
  const marca = prodotto?.marca?.trim();
  const dose = prescrizioneDoseUI(prodotto, userMq);
  const link = dose.link || linkAcquistoProdotto(prodotto);

  return (
    <article
      className={[
        "rounded-2xl bg-slate-50/80",
        compact ? "p-4" : "p-5 sm:p-6",
        "shadow-[0_8px_30px_rgb(0,0,0,0.02)]",
      ].join(" ")}
    >
      <div className="min-w-0">
        <h4
          className={`font-semibold text-slate-900 tracking-tight break-words ${
            compact ? "text-sm" : "text-base"
          }`}
        >
          {nome}
        </h4>
        {marca ? (
          <p className="text-[11px] text-slate-400 mt-0.5 tracking-wide">{marca}</p>
        ) : null}
        {perIntervento ? (
          <p className="mt-2 text-[11px] text-slate-500">
            <span className="text-slate-400">Serve per:</span>{" "}
            <span className="font-medium text-slate-700">{perIntervento}</span>
          </p>
        ) : null}
      </div>

      <div
        className={`mt-4 rounded-xl bg-white/90 px-4 py-3.5 text-sm text-slate-600 leading-relaxed ${
          compact ? "text-[13px]" : ""
        }`}
      >
        <p className="break-words">{dose.testo}</p>
      </div>

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full",
            "border border-slate-200/90 bg-white text-slate-800 font-medium",
            "hover:border-slate-300 hover:text-slate-900 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2",
            compact ? "py-2.5 text-xs" : "py-3 text-sm",
          ].join(" ")}
        >
          Acquista il trattamento
          <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-50" aria-hidden />
        </a>
      ) : (
        <p className="mt-3 text-[11px] text-slate-400 text-center">
          Link acquisto in arrivo — chiedi in garden center citando il nome sopra.
        </p>
      )}
    </article>
  );
}
