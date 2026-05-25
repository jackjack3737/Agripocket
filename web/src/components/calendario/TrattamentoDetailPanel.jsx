import { useEffect, useState } from "react";
import { treatmentFromIntervento } from "./TreatmentCard.jsx";
import { interventoToSolum } from "../../lib/mapInterventoSolum.js";
import { formatDataIt, CATEGORIA_LABEL } from "../../lib/dashboard.js";
import { fetchScienzaTrattamento } from "../../lib/scienzaTrattamentoClient.js";
import PrescrizioneProdottoCard from "./solum/PrescrizioneProdottoCard.jsx";

function renderTestoScienza(testo) {
  const blocks = String(testo || "").split(/\n\n+/).filter(Boolean);
  return blocks.map((block, i) => {
    const parts = block.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="cal-dettaglio__testo cal-dettaglio__scienza-p">
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={j}>{part}</span>
          ),
        )}
      </p>
    );
  });
}

export default function TrattamentoDetailPanel({
  item,
  userMq,
  onClose,
  onComplete,
  onPin,
  completing = false,
}) {
  const [scienzaOpen, setScienzaOpen] = useState(false);
  const [scienzaLoading, setScienzaLoading] = useState(false);
  const [scienzaError, setScienzaError] = useState("");
  const [scienza, setScienza] = useState(null);

  useEffect(() => {
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

  const task = interventoToSolum(item);
  const treatment = treatmentFromIntervento(item);
  const prodotti = treatment?.prodotti_consigliati ?? task.prodotti ?? [];
  const checklist = treatment?.prescrizione_kb?.checklist_operativa ?? [];
  const done = item.stato === "completato";
  const dataLabel =
    item.isRitardo && item.data_originale
      ? `Era il ${formatDataIt(item.data_originale)}`
      : formatDataIt(item.data_prevista);

  async function handleGuardaScienza() {
    if (scienzaOpen && scienza) {
      setScienzaOpen(false);
      return;
    }
    if (scienza) {
      setScienzaOpen(true);
      return;
    }
    setScienzaLoading(true);
    setScienzaError("");
    try {
      const data = await fetchScienzaTrattamento(item);
      setScienza(data);
      setScienzaOpen(true);
    } catch (e) {
      setScienzaError(e.message || "Errore");
      setScienzaOpen(true);
    } finally {
      setScienzaLoading(false);
    }
  }

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

      <div className="cal-dettaglio__scroll">
        <section className="cal-dettaglio__sezione">
          <h3 className="cal-dettaglio__label">Cosa fare</h3>
          <p className="cal-dettaglio__testo">{task.descrizione_semplice}</p>
          <button
            type="button"
            className="cal-dettaglio__btn-scienza"
            onClick={handleGuardaScienza}
            disabled={scienzaLoading}
            aria-expanded={scienzaOpen}
          >
            {scienzaLoading
              ? "Interrogo la knowledge…"
              : scienzaOpen
                ? "Nascondi la scienza"
                : "Guarda la scienza"}
          </button>
        </section>

        {scienzaOpen ? (
          <section className="cal-dettaglio__sezione cal-dettaglio__scienza-kb" aria-live="polite">
            <h3 className="cal-dettaglio__label">La scienza dietro questo trattamento</h3>
            {scienzaError ? (
              <p className="cal-dettaglio__testo cal-dettaglio__muted">{scienzaError}</p>
            ) : scienza?.sintesi ? (
              <div className="cal-dettaglio__scienza-body">{renderTestoScienza(scienza.sintesi)}</div>
            ) : (
              <p className="cal-dettaglio__testo cal-dettaglio__muted">Nessun contenuto disponibile.</p>
            )}
            {scienza?.estratti?.length ? (
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
          </section>
        ) : null}

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

        {!scienzaOpen && (task.fabbisogno_fisiologico || task.titolo_tecnico) ? (
          <section className="cal-dettaglio__sezione cal-dettaglio__scienza cal-dettaglio__scienza--breve">
            <h3 className="cal-dettaglio__label">Sintesi rapida</h3>
            {task.titolo_tecnico ? (
              <p className="cal-dettaglio__testo font-medium">{task.titolo_tecnico}</p>
            ) : null}
            {task.fabbisogno_fisiologico ? (
              <p className="cal-dettaglio__testo whitespace-pre-line line-clamp-6">
                {task.fabbisogno_fisiologico}
              </p>
            ) : null}
            <p className="cal-dettaglio__hint-scienza">
              Per estratti da libri e Calendario Verde, usa «Guarda la scienza».
            </p>
          </section>
        ) : null}

        <section className="cal-dettaglio__sezione" aria-labelledby="prodotti-panel-title">
          <h3 id="prodotti-panel-title" className="cal-dettaglio__label">
            Prodotti · {userMq} m²
          </h3>
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
        </section>
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
