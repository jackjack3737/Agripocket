import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { linkAcquistoProdotto, prescrizioneDoseUI } from "../../../lib/calcolaDosePrescrizione.js";
import { spiegazioneProdottoPerUtente } from "../../../lib/prodottiEducazione.js";

function composizioneTesto(prodotto) {
  const diretta = prodotto?.composizione?.trim();
  if (diretta) return diretta;
  const arr = prodotto?.composizione_molecolare;
  if (Array.isArray(arr) && arr.length) {
    return arr.map((x) => String(x).trim()).filter(Boolean).join("; ");
  }
  return "";
}

function righeSchedaProdotto(prodotto) {
  const edu = spiegazioneProdottoPerUtente(prodotto);
  const righe = [];

  const comp = composizioneTesto(prodotto);
  if (comp) righe.push({ label: "Composizione", value: comp });

  const pa = prodotto?.principio_attivo?.trim();
  if (pa && pa !== comp) righe.push({ label: "Principio attivo", value: pa });

  const macro = prodotto?.macro_categoria?.trim();
  if (macro) righe.push({ label: "Categoria", value: macro });

  const target = Array.isArray(prodotto?.target_fisiologico)
    ? prodotto.target_fisiologico.filter(Boolean).join(" · ")
    : prodotto?.target_fisiologico?.trim?.() || "";
  if (target) righe.push({ label: "Target fisiologico", value: target });

  const serve = prodotto?.a_cosa_serve?.trim() || edu?.a_cosa_serve;
  if (serve) righe.push({ label: "A cosa serve", value: serve });

  const uso = prodotto?.istruzioni_uso?.trim() || edu?.come_si_usa;
  if (uso) righe.push({ label: "Come si usa", value: uso });

  if (prodotto?.periodo_ideale?.trim()) {
    righe.push({ label: "Periodo ideale", value: prodotto.periodo_ideale.trim() });
  }

  if (prodotto?.dose_per_mq) {
    righe.push({ label: "Dosaggio indicativo", value: String(prodotto.dose_per_mq) });
  }

  if (prodotto?.motivo_suggerimento?.trim()) {
    righe.push({ label: "Perché in agenda", value: prodotto.motivo_suggerimento.trim() });
  }

  if (prodotto?.is_bio) righe.push({ label: "Biologico", value: "Sì" });

  if (prodotto?.avviso_fitofarmaco) {
    righe.push({
      label: "Nota",
      value: "Fitofarmaco: verifica etichetta, tempi di rientro e normativa PFNPO.",
    });
  }

  return righe;
}

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
  const [schedaOpen, setSchedaOpen] = useState(false);
  const panelId = useId();
  const nome = prodotto?.nome_commerciale || prodotto?.nome || "Prodotto";
  const marca = prodotto?.marca?.trim();
  const dose = prescrizioneDoseUI(prodotto, userMq);
  const link = dose.link || linkAcquistoProdotto(prodotto);
  const righe = righeSchedaProdotto(prodotto);
  const haScheda = righe.length > 0 || perIntervento;

  return (
    <article
      className={[
        "cal-prod rounded-2xl bg-slate-50/80",
        compact ? "p-3.5" : "p-5 sm:p-6",
        "shadow-[0_8px_30px_rgb(0,0,0,0.02)]",
      ].join(" ")}
    >
      <div className="cal-prod__head">
        <button
          type="button"
          id={`${panelId}-trigger`}
          className={[
            "cal-prod__nome-btn w-full text-left min-w-0",
            haScheda ? "cursor-pointer" : "cursor-default",
          ].join(" ")}
          onClick={() => haScheda && setSchedaOpen((v) => !v)}
          aria-expanded={haScheda ? schedaOpen : undefined}
          aria-controls={haScheda ? panelId : undefined}
          disabled={!haScheda}
        >
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span
                className={[
                  "block font-semibold text-slate-900 tracking-tight break-words",
                  compact ? "text-sm" : "text-base",
                  haScheda ? "hover:text-[#2d6a4f] transition-colors" : "",
                ].join(" ")}
              >
                {nome}
              </span>
              {marca ? (
                <span className="block text-[11px] text-slate-400 mt-0.5 tracking-wide">{marca}</span>
              ) : null}
            </span>
            {haScheda ? (
              <span className="cal-prod__chev shrink-0 mt-0.5" aria-hidden>
                {schedaOpen ? "−" : "+"}
              </span>
            ) : null}
          </span>
        </button>
      </div>

      {schedaOpen && haScheda ? (
        <div
          id={panelId}
          className="cal-prod__scheda"
          role="region"
          aria-labelledby={`${panelId}-trigger`}
        >
          {perIntervento ? (
            <p className="cal-prod__scheda-riga">
              <span className="cal-prod__scheda-label">Serve per</span>
              <span className="cal-prod__scheda-value">{perIntervento}</span>
            </p>
          ) : null}
          {righe.map(({ label, value }) => (
            <p key={label} className="cal-prod__scheda-riga">
              <span className="cal-prod__scheda-label">{label}</span>
              <span className="cal-prod__scheda-value">{value}</span>
            </p>
          ))}
          {!righe.length && !perIntervento ? (
            <p className="cal-prod__scheda-muted">Scheda tecnica non disponibile in vetrina.</p>
          ) : null}
        </div>
      ) : null}

      <div
        className={[
          "rounded-xl bg-white/90 px-4 py-3.5 text-sm text-slate-600 leading-relaxed",
          schedaOpen ? "mt-3" : "mt-4",
          compact ? "text-[13px]" : "",
        ].join(" ")}
      >
        <p className="break-words">{dose.testo}</p>
      </div>

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full",
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
