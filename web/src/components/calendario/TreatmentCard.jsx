import { useState } from "react";
import { AVVISO_FITOFARMACO } from "../../lib/sicurezzaClient";
import {
  NOTA_SCELTA_PRODOTTI,
  notaConfrontoBiostimolanti,
  spiegazioneProdottoPerUtente,
} from "../../lib/prodottiEducazione";
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

function ProdottoMicroCard({ prodotto, index }) {
  const [openIstruzioni, setOpenIstruzioni] = useState(false);
  const idIstruzioni = `istruzioni-${prodotto.id ?? index}-${prodotto.nome_commerciale?.replace(/\s/g, "-")}`;
  const spiegazione = spiegazioneProdottoPerUtente(prodotto);
  const edu = prodotto.a_cosa_serve || spiegazione?.a_cosa_serve || null;
  const istruzioni =
    prodotto.istruzioni_uso?.trim() || spiegazione?.come_si_usa || null;

  return (
    <article className="treatment-card__prodotto">
      <p className="treatment-card__prodotto-alt">Opzione {index + 1}</p>
      <h4 className="treatment-card__prodotto-nome">{prodotto.nome_commerciale}</h4>
      {prodotto.marca ? <p className="treatment-card__prodotto-marca">{prodotto.marca}</p> : null}
      {edu ? (
        <p className="treatment-card__prodotto-perche">
          <span className="treatment-card__prodotto-perche-label">A cosa serve: </span>
          {edu}
        </p>
      ) : null}
      {prodotto.dose_totale_calcolata ? (
        <p className="treatment-card__dose-badge" role="status">
          <span className="treatment-card__dose-label">Dose per il tuo prato</span>
          <span className="treatment-card__dose-value">{prodotto.dose_totale_calcolata}</span>
        </p>
      ) : null}
      {istruzioni ? (
        <div className="treatment-card__istruzioni-wrap">
          <button
            type="button"
            className="treatment-card__istruzioni-toggle"
            onClick={() => setOpenIstruzioni((v) => !v)}
            aria-expanded={openIstruzioni}
            aria-controls={idIstruzioni}
          >
            {openIstruzioni ? "Nascondi come applicarlo" : "Come applicarlo"}
          </button>
          {openIstruzioni ? (
            <p id={idIstruzioni} className="treatment-card__istruzioni">
              {istruzioni}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function AdattamentoDinamicoBadge({ adattamento, sospeso }) {
  if (sospeso) {
    return (
      <aside className="treatment-card__adattamento treatment-card__adattamento--stop" role="note">
        <span aria-hidden>🛑</span>
        <div>
          <p className="treatment-card__adattamento-title">Sospeso</p>
          <p className="treatment-card__adattamento-testo">
            {adattamento?.motivo ||
              "Sospeso: l'azoto o il concime rischierebbero di aggravare il problema fungino rilevato nell'ultima foto."}
          </p>
        </div>
      </aside>
    );
  }
  if (!adattamento?.tipo) return null;

  const isMeteo = adattamento.tipo.includes("meteo");
  return (
    <aside
      className={`treatment-card__adattamento${isMeteo ? " treatment-card__adattamento--meteo" : ""}`}
      role="note"
    >
      <span aria-hidden>{isMeteo ? "⚠️" : "ℹ️"}</span>
      <div>
        <p className="treatment-card__adattamento-title">
          {isMeteo ? "Modificato in base al meteo" : "Adattato dall'IA"}
        </p>
        <p className="treatment-card__adattamento-testo">
          {adattamento.motivo}
          {adattamento.data_originale && adattamento.data_originale !== adattamento.data_nuova
            ? ` (data originale: ${adattamento.data_originale})`
            : ""}
        </p>
      </div>
    </aside>
  );
}

function MeteoCalcoloBadge({ contestoMeteo }) {
  const nota =
    contestoMeteo?.nota_utente ||
    (contestoMeteo?.utilizzato_nel_calcolo || contestoMeteo?.et0_mm != null
      ? "Questo consiglio tiene conto del meteo della tua località (evaporazione, umidità, temperatura suolo)."
      : null);

  if (!nota) return null;

  return (
    <aside className="treatment-card__meteo" role="note" aria-label="Meteo usato nel consiglio">
      <span className="treatment-card__meteo-icon" aria-hidden>
        ☁
      </span>
      <div>
        <p className="treatment-card__meteo-title">Meteo nel calcolo</p>
        <p className="treatment-card__meteo-testo">{nota}</p>
      </div>
    </aside>
  );
}

function SpiegazioneBlocchi({ testo }) {
  if (!testo?.trim()) return null;
  const paragrafi = testo.split(/\n\n+/).filter(Boolean);
  return (
    <div className="treatment-card__spiegazione-blocchi">
      {paragrafi.map((p, i) => (
        <p key={i} className="treatment-card__spiegazione">
          {p.trim()}
        </p>
      ))}
    </div>
  );
}

/**
 * Card trattamento: sezione educativa (perché) + soluzione pratica (prodotti/dose).
 */
export function TreatmentCard({
  treatment,
  superficieMq,
  onComplete,
  completing = false,
  done = false,
  showFitofarmacoAvviso = false,
  sospeso = false,
}) {
  if (
    !treatment?.tipo_intervento &&
    !treatment?.spiegazione_semplice &&
    !(treatment?.esigenze_molecolari?.length > 0)
  ) {
    return null;
  }

  const adattamento = treatment.adattamento_dinamico;
  const isSospeso = sospeso || treatment.stato === "sospeso" || adattamento?.tipo === "sospeso_fungo";

  const prodotti = treatment.prodotti_consigliati ?? [];
  const esigenze = treatment.esigenze_molecolari ?? [];
  const n = prodotti.length;
  const nEsigenze = esigenze.length;
  const mqLabel = superficieMq ? ` (${superficieMq} m²)` : "";
  const notaScelta =
    treatment.nota_scelta_prodotti ||
    notaConfrontoBiostimolanti(prodotti) ||
    (n > 1 ? NOTA_SCELTA_PRODOTTI : null);

  return (
    <article
      className={`treatment-card${done ? " treatment-card--done" : ""}${isSospeso ? " treatment-card--sospeso" : ""}`}
    >
      <AdattamentoDinamicoBadge adattamento={adattamento} sospeso={isSospeso} />
      <section className="treatment-card__edu" aria-labelledby="treatment-edu-title">
        <div className="treatment-card__edu-icon-wrap">
          <IconLeaf />
        </div>
        <p className="treatment-card__edu-kicker">Referto agronomico</p>
        <h3 id="treatment-edu-title" className="treatment-card__tipo">
          {treatment.tipo_intervento}
        </h3>
        <MeteoCalcoloBadge contestoMeteo={treatment.contesto_meteo} />
        <SpiegazioneBlocchi testo={treatment.spiegazione_semplice} />
      </section>

      {nEsigenze > 0 ? (
        <section className="treatment-card__soluzione" aria-label="Esigenze molecolari">
          <h4 className="treatment-card__soluzione-title">Necessità fisiologiche (Solum)</h4>
          <ul className="treatment-card__esigenze">
            {esigenze.map((e, idx) => (
              <li key={idx} className="treatment-card__esigenza-item">
                {e}
              </li>
            ))}
          </ul>
          <p className="treatment-card__nota-scelta" role="note">
            Diagnostica predittiva: molecole e principi attivi generici — senza raccomandazione commerciale.
          </p>
        </section>
      ) : null}

      {n > 0 ? (
        <section className="treatment-card__soluzione" aria-label="Prodotti suggeriti">
          <h4 className="treatment-card__soluzione-title">
            Prodotti idonei dalla vetrina{mqLabel}
          </h4>
          {notaScelta ? (
            <p className="treatment-card__nota-scelta" role="note">
              {notaScelta}
            </p>
          ) : null}
          <div className="treatment-card__prodotti">
            {prodotti.map((p, idx) => (
              <ProdottoMicroCard key={p.id ?? `${p.nome_commerciale}-${idx}`} prodotto={p} index={idx} />
            ))}
          </div>
          {showFitofarmacoAvviso ? (
            <p className="treatment-card__avviso-fito" role="note">
              {AVVISO_FITOFARMACO}
            </p>
          ) : null}
        </section>
      ) : null}

      {onComplete && !done && !isSospeso ? (
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
  const adattamento =
    det?.adattamento_dinamico ||
    (typeof det === "object" && det?.adattamento_dinamico) ||
    null;

  if (det?.tipo_intervento || det?.spiegazione_semplice) {
    return {
      tipo_intervento: det.tipo_intervento || item.titolo,
      spiegazione_semplice: det.spiegazione_semplice || item.spiegazione_semplice || item.messaggio_ux,
      fabbisogno_fisiologico: det.fabbisogno_fisiologico || item.fabbisogno_fisiologico,
      esigenze_molecolari: det.esigenze_molecolari ?? item.esigenze_molecolari ?? [],
      nota_scelta_prodotti: det.nota_scelta_prodotti ?? null,
      prodotti_consigliati: det.prodotti_consigliati ?? [],
      contesto_meteo: det.contesto_meteo ?? null,
      adattamento_dinamico: adattamento,
      stato: item.stato,
    };
  }
  if (item?.spiegazione_semplice || item?.messaggio_ux) {
    return {
      tipo_intervento: item.titolo,
      spiegazione_semplice: item.spiegazione_semplice || item.messaggio_ux,
      fabbisogno_fisiologico: item.fabbisogno_fisiologico,
      esigenze_molecolari: item.esigenze_molecolari ?? [],
      nota_scelta_prodotti: null,
      prodotti_consigliati: [],
    };
  }
  return null;
}
