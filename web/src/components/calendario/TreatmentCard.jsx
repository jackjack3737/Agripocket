import { useState } from "react";
import { AVVISO_FITOFARMACO } from "../../lib/sicurezzaClient";
import "../../styles-treatment-card.css";

function IconLeaf() {
  return (
    <svg className="treatment-card__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22c4-6 8-10 8-14a8 8 0 1 0-16 0c0 4 4 8 8 14Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 22V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconBeaker() {
  return (
    <svg className="treatment-card__icon treatment-card__icon--sm" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3h6v7l5 9a2 2 0 0 1-1.7 3H5.7a2 2 0 0 1-1.7-3l5-9V3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 10h6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ProdottoMicroCard({ prodotto, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const idIstruzioni = `istruzioni-${prodotto.nome_commerciale?.replace(/\s/g, "-")}`;

  return (
    <article className="treatment-card__prodotto">
      <div className="treatment-card__prodotto-head">
        <div>
          <h4 className="treatment-card__prodotto-nome">{prodotto.nome_commerciale}</h4>
          {prodotto.marca ? <p className="treatment-card__prodotto-marca">{prodotto.marca}</p> : null}
        </div>
      </div>
      {prodotto.dose_totale_calcolata ? (
        <p className="treatment-card__dose-badge" role="status">
          <span className="treatment-card__dose-label">Dose per il tuo prato</span>
          {prodotto.dose_totale_calcolata}
        </p>
      ) : null}
      {prodotto.istruzioni_uso ? (
        <div className="treatment-card__istruzioni-wrap">
          <button
            type="button"
            className="treatment-card__istruzioni-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={idIstruzioni}
          >
            {open ? "Nascondi istruzioni" : "Come applicarlo"}
          </button>
          {open ? (
            <p id={idIstruzioni} className="treatment-card__istruzioni">
              {prodotto.istruzioni_uso}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Card trattamento: Educazione (perché) + Soluzione (prodotti e dose).
 * @param {{ treatment: { tipo_intervento: string, spiegazione_semplice: string, prodotti_consigliati?: object[] }, onComplete?: () => void, completing?: boolean, done?: boolean, showFitofarmacoAvviso?: boolean }} props
 */
export function TreatmentCard({
  treatment,
  onComplete,
  completing = false,
  done = false,
  showFitofarmacoAvviso = false,
}) {
  if (!treatment?.tipo_intervento && !treatment?.spiegazione_semplice) return null;

  const prodotti = treatment.prodotti_consigliati ?? [];

  return (
    <article className={`treatment-card${done ? " treatment-card--done" : ""}`}>
      <section className="treatment-card__edu" aria-labelledby="treatment-edu-title">
        <div className="treatment-card__edu-icon-wrap">
          <IconLeaf />
        </div>
        <h3 id="treatment-edu-title" className="treatment-card__tipo">
          {treatment.tipo_intervento}
        </h3>
        {treatment.spiegazione_semplice ? (
          <p className="treatment-card__spiegazione">{treatment.spiegazione_semplice}</p>
        ) : null}
      </section>

      {prodotti.length > 0 ? (
        <>
          <div className="treatment-card__divider" role="separator" />
          <section className="treatment-card__soluzione" aria-labelledby="treatment-sol-title">
            <div className="treatment-card__soluzione-head">
              <IconBeaker />
              <h4 id="treatment-sol-title" className="treatment-card__soluzione-title">
                Prodotti consigliati per le tue misurazioni
              </h4>
            </div>
            <div className="treatment-card__prodotti">
              {prodotti.map((p, idx) => (
                <ProdottoMicroCard key={p.id ?? `${p.nome_commerciale}-${idx}`} prodotto={p} defaultOpen={idx === 0} />
              ))}
            </div>
            {showFitofarmacoAvviso ? (
              <p className="treatment-card__avviso-fito" role="note">
                {AVVISO_FITOFARMACO}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {onComplete && !done ? (
        <button
          type="button"
          className="treatment-card__cta btn btn-primary"
          onClick={onComplete}
          disabled={completing}
        >
          {completing ? "Salvataggio…" : "Segna intervento come completato"}
        </button>
      ) : null}
    </article>
  );
}

/** Normalizza riga DB / dettaglio_trattamento in props TreatmentCard. */
export function treatmentFromIntervento(item) {
  const raw = item?.dettaglio_trattamento;
  let det = raw;
  if (typeof raw === "string") {
    try {
      det = JSON.parse(raw);
    } catch {
      det = null;
    }
  }
  if (det?.tipo_intervento || det?.spiegazione_semplice) {
    return {
      tipo_intervento: det.tipo_intervento || item.titolo,
      spiegazione_semplice: det.spiegazione_semplice || item.spiegazione_semplice || item.messaggio_ux,
      prodotti_consigliati: det.prodotti_consigliati ?? [],
    };
  }
  if (item?.spiegazione_semplice || item?.messaggio_ux) {
    return {
      tipo_intervento: item.titolo,
      spiegazione_semplice: item.spiegazione_semplice || item.messaggio_ux,
      prodotti_consigliati: [],
    };
  }
  return null;
}
