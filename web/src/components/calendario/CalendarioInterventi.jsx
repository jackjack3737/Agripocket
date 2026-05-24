import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CATEGORIA_LABEL,
  PRIORITA_LABEL,
  PRIORITY_LEVEL,
  formatDataIt,
  CALENDARIO_AMBITI,
  CALENDARIO_TIPO_FILTRI,
} from "../../lib/dashboard";
import { AVVISO_FITOFARMACO, isInterventoFitofarmaco } from "../../lib/sicurezzaClient";
import { TreatmentCard, treatmentFromIntervento } from "./TreatmentCard";

function formattaDoseIntervento(totale, unita, perMq) {
  const u = (unita || "g").toLowerCase();
  let val = Number(totale);
  let label = u;
  if (u === "ml" && val >= 1000) {
    val = val / 1000;
    label = "L";
  } else if (u === "g" && val >= 1000) {
    val = val / 1000;
    label = "kg";
  }
  const tot = `${val >= 10 ? Math.round(val) : val.toFixed(1)} ${label}`;
  if (perMq != null) {
    const pm = Number(perMq);
    return `${tot} totali (${pm} ${u}/m²)`;
  }
  return tot;
}

function ImportanzaIndicatore({ priorita }) {
  const level = PRIORITY_LEVEL[priorita] ?? 2;
  const label = PRIORITA_LABEL[priorita] || "Media";
  return (
    <span
      className={`importanza importanza--${priorita || "media"}`}
      title={`Importanza: ${label}`}
      aria-label={`Importanza ${label}`}
    >
      <span className="importanza__label">Importanza</span>
      <span className="importanza__bar" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`importanza__seg${i <= level ? " importanza__seg--on" : ""}`} />
        ))}
      </span>
      <span className="importanza__testo">{label}</span>
    </span>
  );
}

export function InterventoRow({ item, onToggle, onPin, superficieMq }) {
  const done = item.stato === "completato";
  const sospeso = item.stato === "sospeso";
  const fito = isInterventoFitofarmaco(item);
  const treatment = treatmentFromIntervento(item);
  const mostraTreatmentCard = !!treatment;
  const titolo = treatment?.tipo_intervento || item.titolo;
  const mostraDose =
    !fito && !mostraTreatmentCard && item.dose_totale != null && item.dose_unita;
  const controlloMensile = item.fonte === "controllo_mensile";
  const inRitardo = !!item.isRitardo;
  return (
    <li
      className={`intervento-row intervento-row--${item.priorita}${done ? " intervento-row--done" : ""}${sospeso ? " intervento-row--sospeso" : ""}${item.manual_override ? " intervento-row--pinned" : ""}${controlloMensile ? " intervento-row--controllo" : ""}${inRitardo ? " intervento-row--ritardo" : ""}`}
    >
      <label className="intervento-row__check">
        <input
          type="checkbox"
          checked={done}
          disabled={sospeso}
          onChange={(e) => onToggle(item.id, e.target.checked)}
        />
        <span className="intervento-row__box" aria-hidden />
      </label>
      <div className="intervento-row__body">
        <div className="intervento-row__top">
          <time
            className="intervento-row__date"
            dateTime={item.data_originale || item.data_prevista || undefined}
          >
            {inRitardo && item.data_originale
              ? `Era ${formatDataIt(item.data_originale)}`
              : formatDataIt(item.data_prevista)}
          </time>
          <span className="intervento-pill intervento-pill--cat">{CATEGORIA_LABEL[item.categoria] || "Altro"}</span>
          {inRitardo ? (
            <span className="intervento-pill intervento-pill--ritardo" title={`Scaduto il ${formatDataIt(item.data_originale)}`}>
              In ritardo
            </span>
          ) : null}
          <ImportanzaIndicatore priorita={item.priorita} />
          {item.manual_override ? (
            <span className="intervento-pill intervento-pill--pin" title="Non viene rimosso alla rigenerazione del piano">
              Fissato
            </span>
          ) : null}
        </div>
        {!mostraTreatmentCard ? <p className="intervento-row__title">{titolo}</p> : null}
        {mostraTreatmentCard ? (
          <TreatmentCard
            treatment={treatment}
            superficieMq={superficieMq}
            done={done}
            sospeso={sospeso}
            showFitofarmacoAvviso={fito}
            onComplete={!done && !sospeso && onToggle ? () => onToggle(item.id, true) : undefined}
          />
        ) : (
          <>
            {fito ? (
              <p className="intervento-row__avviso intervento-row__avviso--fito" role="note">
                {AVVISO_FITOFARMACO}
              </p>
            ) : null}
            {item.prodotto_nome ? (
              <p className="intervento-row__prodotto">
                <span className="intervento-row__prodotto-nome">
                  {fito ? "Riferimento catalogo: " : ""}
                  {item.prodotto_nome !== titolo ? "Principale: " : ""}
                  {item.prodotto_nome}
                </span>
                {mostraDose || item.dosaggio_calcolato ? (
                  <span className="intervento-row__dose">
                    {item.dosaggio_calcolato ||
                      formattaDoseIntervento(item.dose_totale, item.dose_unita, item.dose_per_mq)}
                  </span>
                ) : null}
              </p>
            ) : null}
          </>
        )}
        {item.razionale_scientifico ? (
          <p className="intervento-row__razionale">
            <span className="intervento-row__razionale-label">La scienza: </span>
            {item.razionale_scientifico}
          </p>
        ) : null}
        {item.descrizione && item.descrizione !== item.razionale_scientifico ? (
          <p className="intervento-row__desc">
            {item.descrizione.includes("Alternative catalogo")
              ? item.descrizione.split(/(?=Alternative catalogo)/).map((chunk, i) => (
                  <span key={i} className={i > 0 ? "intervento-row__alt" : undefined}>
                    {chunk}
                  </span>
                ))
              : item.descrizione}
          </p>
        ) : null}
        {controlloMensile && !done ? (
          <Link
            className="btn btn-primary btn-sm intervento-row__foto-cta"
            to={`/chat?controllo=${item.id}`}
          >
            Carica foto controllo mensile
          </Link>
        ) : null}
        {onPin && item.fonte === "calendario_stagionale" ? (
          <button
            type="button"
            className={`intervento-row__pin${item.manual_override ? " intervento-row__pin--on" : ""}`}
            onClick={() => onPin(item.id, !item.manual_override)}
            title="Mantieni questo lavoro quando rigeneri il piano annuale"
          >
            {item.manual_override ? "✓ Mantieni al rigenera" : "Mantieni al rigenera"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function MeseAccordion({ mese, open, onToggle, onToggleIntervento, onPinIntervento, superficieMq }) {
  return (
    <section className={`dash-month${open ? " dash-month--open" : ""}`}>
      <button
        type="button"
        className="dash-month__head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="dash-month__label">{mese.label}</span>
        <span className="dash-month__meta">
          {mese.total} lavori · {mese.giorni.length} {mese.giorni.length === 1 ? "giorno" : "giorni"}
        </span>
        <span className="dash-month__chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="dash-month__body">
          {mese.giorni.map(({ data, items }) => {
            const scaduti = items.filter((i) => i.isRitardo).length;
            return (
              <section key={data} className={`dash-day${scaduti ? " dash-day--ritardo" : ""}`}>
                <h4 className="dash-day__date">
                  <time dateTime={data}>{formatDataIt(data)}</time>
                  {scaduti ? (
                    <span className="dash-day__ritardo">{scaduti} in ritardo</span>
                  ) : null}
                  <span className="dash-day__count">{items.length} lavori</span>
                </h4>
                <ul className="intervento-list">
                  {items.map((item) => (
                    <InterventoRow
                      key={item.id}
                      item={item}
                      superficieMq={superficieMq}
                      onToggle={onToggleIntervento}
                      onPin={onPinIntervento}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function TimelineBisogni({ timeline }) {
  if (!timeline) return null;
  const finestre = timeline.finestre_stagionali ?? [];
  return (
    <section className="dash-timeline-bisogni" aria-label="Timeline predittiva dei bisogni">
      <h3 className="dash-timeline-bisogni__title">Timeline dei bisogni</h3>
      <p className="dash-timeline-bisogni__lead">
        Piano predittivo Solum: emergenze, prossimo mese e finestre stagionali (solo agronomia pura).
      </p>
      <div className="dash-timeline-bisogni__grid">
        <article className="dash-timeline-bisogni__card dash-timeline-bisogni__card--oggi">
          <p className="dash-timeline-bisogni__label">{timeline.oggi_label || "OGGI"}</p>
          <p className="dash-timeline-bisogni__testo">{timeline.oggi}</p>
        </article>
        <article className="dash-timeline-bisogni__card">
          <p className="dash-timeline-bisogni__label">{timeline.prossimo_mese_label || "PROSSIMO MESE"}</p>
          <p className="dash-timeline-bisogni__testo">{timeline.prossimo_mese}</p>
        </article>
      </div>
      {finestre.length ? (
        <ul className="dash-timeline-bisogni__finestre">
          {finestre.map((f) => (
            <li key={f.periodo} className="dash-timeline-bisogni__finestra">
              <span className="dash-timeline-bisogni__periodo">{f.periodo}</span>
              <span className="dash-timeline-bisogni__esigenza">{f.esigenza}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function CalendarioFiltri({ tipo, ambito, meseLabel, conteggi, onTipo, onAmbito }) {
  return (
    <div className="dash-cal-filters">
      <div className="dash-cal-filters__row">
        <span className="dash-cal-filters__label">Tipo</span>
        <div className="dash-cal-filters__chips" role="group" aria-label="Filtra per tipo">
          {Object.entries(CALENDARIO_TIPO_FILTRI).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              className={`dash-cal-filters__chip${tipo === key ? " dash-cal-filters__chip--on" : ""}`}
              onClick={() => onTipo(key)}
            >
              {cfg.label}
              {conteggi?.[key] != null ? ` (${conteggi[key]})` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="dash-cal-filters__row">
        <span className="dash-cal-filters__label">Periodo</span>
        <div className="dash-cal-filters__chips" role="group" aria-label="Filtra per periodo">
          {Object.entries(CALENDARIO_AMBITI).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              className={`dash-cal-filters__chip${ambito === key ? " dash-cal-filters__chip--on" : ""}`}
              onClick={() => onAmbito(key)}
            >
              {key === "mese" ? `${cfg.label} (${meseLabel})` : cfg.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InterventoSection({ title, hint, items, onToggle, onPin, empty, superficieMq }) {
  if (!items.length && !empty) return null;
  return (
    <section className="dash-calendar-section">
      <h3 className="dash-calendar-section__title">{title}</h3>
      {hint ? <p className="dash-calendar-section__hint">{hint}</p> : null}
      {items.length ? (
        <ul className="intervento-list">
          {items.map((item) => (
            <InterventoRow
              key={item.id}
              item={item}
              superficieMq={superficieMq}
              onToggle={onToggle}
              onPin={onPin}
            />
          ))}
        </ul>
      ) : (
        <p className="dash-calendar-section__empty">{empty}</p>
      )}
    </section>
  );
}
