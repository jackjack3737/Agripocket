import { useEffect, useState } from "react";
import { treatmentFromIntervento } from "./TreatmentCard.jsx";
import { interventoToSolum } from "../../lib/mapInterventoSolum.js";
import { formatDataIt, CATEGORIA_LABEL } from "../../lib/dashboard.js";
import { fetchScienzaTrattamento } from "../../lib/scienzaTrattamentoClient.js";
import { messaggioOperativoPerUi } from "../../lib/messaggioOperativo.js";
import PrescrizioneProdottoCard from "./solum/PrescrizioneProdottoCard.jsx";

function renderInlineBold(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, j) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={j}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={j}>{part}</span>
    ),
  );
}

function renderTestoScienza(testo) {
  const raw = String(testo || "").trim();
  if (!raw) return null;
  const lines = raw.split(/\n+/).filter((l) => l.trim());
  if (lines.length <= 1) {
    return <p className="cal-dettaglio__testo cal-dettaglio__scienza-p">{renderInlineBold(raw)}</p>;
  }
  return lines.map((line, i) => (
    <p key={i} className="cal-dettaglio__testo cal-dettaglio__scienza-p">
      {renderInlineBold(line.trim())}
    </p>
  ));
}

function AccordionToggle({ id, title, badge, open, onToggle, disabled, children }) {
  return (
    <div className={`cal-acc${open ? " cal-acc--open" : ""}`}>
      <button
        type="button"
        id={`${id}-trigger`}
        className="cal-acc__trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        disabled={disabled}
      >
        <span className="cal-acc__title">{title}</span>
        {badge != null ? <span className="cal-acc__badge">{badge}</span> : null}
        <span className="cal-acc__chev" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <div
        id={id}
        className="cal-acc__panel"
        role="region"
        aria-labelledby={`${id}-trigger`}
        hidden={!open}
      >
        {open ? children : null}
      </div>
    </div>
  );
}

export default function TrattamentoDetailPanel({
  item,
  userMq,
  onClose,
  onComplete,
  onPin,
  completing = false,
}) {
  const [prodottiOpen, setProdottiOpen] = useState(false);
  const [scienzaOpen, setScienzaOpen] = useState(false);
  const [scienzaLoading, setScienzaLoading] = useState(false);
  const [scienzaError, setScienzaError] = useState("");
  const [scienza, setScienza] = useState(null);

  useEffect(() => {
    setProdottiOpen(false);
    setScienzaOpen(false);
    setScienza(null);
    setScienzaError("");
    setScienzaLoading(false);
  }, [item?.id]);

  if (!item) {
    return (
      <div className="cal-dettaglio cal-dettaglio--vuoto">
        <p className="cal-dettaglio__vuoto-titolo">Dettaglio trattamento</p>
        <p className="cal-dettaglio__vuoto-testo">
          Seleziona un lavoro dalla lista per vedere cosa fare e i prodotti consigliati con dose sui
          tuoi m².
        </p>
      </div>
    );
  }

  const treatment = treatmentFromIntervento(item);
  let det = item?.dettaglio_trattamento;
  if (typeof det === "string") {
    try {
      det = JSON.parse(det);
    } catch {
      det = null;
    }
  }
  const task = interventoToSolum(item);
  const cosaFare =
    messaggioOperativoPerUi(item, det, treatment) || task.descrizione_semplice;
  const prodotti = treatment?.prodotti_consigliati ?? task.prodotti ?? [];
  const checklist = treatment?.prescrizione_kb?.checklist_operativa ?? [];
  const haScienzaBreve = !!(task.fabbisogno_fisiologico || task.titolo_tecnico);
  const done = item.stato === "completato";
  const dataLabel =
    item.isRitardo && item.data_originale
      ? `Era il ${formatDataIt(item.data_originale)}`
      : formatDataIt(item.data_prevista);

  async function toggleScienza() {
    if (scienzaOpen) {
      setScienzaOpen(false);
      return;
    }
    setScienzaOpen(true);
    if (scienza) return;

    setScienzaLoading(true);
    setScienzaError("");
    try {
      const data = await fetchScienzaTrattamento(item);
      setScienza(data);
    } catch (e) {
      setScienzaError(e.message || "Errore");
    } finally {
      setScienzaLoading(false);
    }
  }

  const prodottiBadge = prodotti.length
    ? `${prodotti.length} ${prodotti.length === 1 ? "prodotto" : "prodotti"}`
    : "—";

  return (
    <aside className="cal-dettaglio" aria-labelledby="trattamento-panel-title">
      <header className="cal-dettaglio__head">
        <div className="min-w-0 flex-1">
          <p className="cal-dettaglio__kicker">
            {CATEGORIA_LABEL[item.categoria] || "Lavoro"} · {dataLabel}
            {item.duplicati_uniti > 1 ? (
              <span className="cal-dettaglio__dup"> · {item.duplicati_uniti} uniti in agenda</span>
            ) : null}
          </p>
          <h2 id="trattamento-panel-title" className="cal-dettaglio__titolo">
            {task.titolo_semplice}
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            className="cal-dettaglio__chiudi"
            onClick={onClose}
            aria-label="Deseleziona"
          >
            ✕
          </button>
        ) : null}
      </header>

      <div className="cal-dettaglio__accordions">
        <AccordionToggle
          id="acc-prodotti"
          title={`Prodotti consigliati · ${userMq} m²`}
          badge={prodottiBadge}
          open={prodottiOpen}
          onToggle={() => setProdottiOpen((v) => !v)}
        >
          {prodotti.length ? (
            <ul className="cal-dettaglio__prodotti">
              {prodotti.map((p, idx) => (
                <li key={p.id ?? `${p.nome_commerciale}-${idx}`}>
                  <PrescrizioneProdottoCard prodotto={p} userMq={userMq} compact />
                </li>
              ))}
            </ul>
          ) : (
            <p className="cal-dettaglio__testo cal-dettaglio__muted">
              Nessun prodotto in vetrina. Sincronizza il piano.
            </p>
          )}
          {treatment?.nota_scelta_prodotti ? (
            <p className="cal-dettaglio__nota" role="note">
              {treatment.nota_scelta_prodotti}
            </p>
          ) : null}
        </AccordionToggle>

        <AccordionToggle
          id="acc-scienza"
          title="Guarda la scienza"
          badge={scienza?.chunk_count ? `${scienza.chunk_count} fonti` : null}
          open={scienzaOpen}
          onToggle={toggleScienza}
          disabled={scienzaLoading}
        >
          {scienzaLoading ? (
            <p className="cal-dettaglio__testo cal-dettaglio__muted">Interrogo la knowledge…</p>
          ) : null}
          {scienzaError ? (
            <p className="cal-dettaglio__testo cal-dettaglio__muted">{scienzaError}</p>
          ) : null}
          {!scienzaLoading && !scienza?.sintesi && haScienzaBreve ? (
            <div className="cal-dettaglio__scienza cal-dettaglio__scienza--breve">
              {task.titolo_tecnico ? (
                <p className="cal-dettaglio__testo font-medium">{task.titolo_tecnico}</p>
              ) : null}
              {task.fabbisogno_fisiologico ? (
                <p className="cal-dettaglio__testo whitespace-pre-line">{task.fabbisogno_fisiologico}</p>
              ) : null}
            </div>
          ) : null}
          {scienza?.sintesi ? (
            <div className="cal-dettaglio__scienza-kb">
              <div className="cal-dettaglio__scienza-body">{renderTestoScienza(scienza.sintesi)}</div>
              {scienza.estratti?.length ? (
                <details className="cal-dettaglio__fonti">
                  <summary>Fonti dalla knowledge ({scienza.chunk_count})</summary>
                  <ul className="cal-dettaglio__fonti-list">
                    {scienza.estratti.map((e) => (
                      <li key={e.indice} className="cal-dettaglio__fonte-item">
                        <span className="cal-dettaglio__fonte-badge">
                          {e.fonte}
                          {e.somiglianza != null ? ` · ${e.somiglianza}%` : ""}
                        </span>
                        {e.titolo ? <p className="cal-dettaglio__fonte-titolo">{e.titolo}</p> : null}
                        <p className="cal-dettaglio__fonte-testo">{e.testo}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          {!scienzaLoading && !scienza?.sintesi && !haScienzaBreve && !scienzaError ? (
            <p className="cal-dettaglio__testo cal-dettaglio__muted">Nessun contenuto disponibile.</p>
          ) : null}
        </AccordionToggle>
      </div>

      <div className="cal-dettaglio__scroll">
        <section className="cal-dettaglio__sezione">
          <h3 className="cal-dettaglio__label">Cosa fare</h3>
          <p className="cal-dettaglio__testo cal-dettaglio__cosa-fare">{cosaFare}</p>
        </section>

        {checklist.length ? (
          <section className="cal-dettaglio__sezione" aria-labelledby="checklist-panel-title">
            <h3 id="checklist-panel-title" className="cal-dettaglio__label">
              Checklist greenkeeper
            </h3>
            <ul className="cal-dettaglio__checklist">
              {checklist.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="cal-dettaglio__foot">
        {!done && onComplete ? (
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => onComplete(item)}
            disabled={completing}
          >
            {completing
              ? "Salvo…"
              : item.duplicati_uniti > 1
                ? `Segna ${item.duplicati_uniti} come completati`
                : "Segna come completato"}
          </button>
        ) : null}
        {onPin && item.fonte === "calendario_stagionale" ? (
          <button
            type="button"
            className="cal-dettaglio__link"
            onClick={() => onPin(item.id, !item.manual_override)}
          >
            {item.manual_override ? "✓ Mantieni al rigenera piano" : "Mantieni al rigenera piano"}
          </button>
        ) : null}
      </footer>
    </aside>
  );
}
