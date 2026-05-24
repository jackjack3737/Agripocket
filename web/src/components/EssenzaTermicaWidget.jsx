import { useMemo, useState } from "react";
import { ESPOSIZIONE_LUCE, TIPOLOGIE_PRATO } from "../data/speciePratoItalia.js";
import {
  GRUPPI_ESSENZA,
  STATI_SPECIE,
  ordinaSpeciePerFiltro,
  riepilogoStati,
  specieConStato,
  speciePerGruppoEssenza,
  soddisfaFiltroStato,
  statoDaMeteo,
} from "../lib/essenzaTermica";
import "../styles-essenza-termica.css";

const ORDINE_CHIP_PRATO = ["crescita", "germina", "attiva", "stallo", "no_germ"];
const ORDINE_CHIP_INFEST = ["crescita", "germina", "stallo", "no_germ"];

const TIPO_LABEL = Object.fromEntries(TIPOLOGIE_PRATO.map((t) => [t.id, t.label]));

function IconEsposizione({ spec }) {
  const exp = spec.esposizione && ESPOSIZIONE_LUCE[spec.esposizione];
  if (!exp) return null;
  return (
    <span className={`essenza-termica__luce essenza-termica__luce--${spec.esposizione}`} title={exp.label} aria-label={exp.label}>
      {exp.icon}
    </span>
  );
}

function LegendaLuce() {
  return (
    <p className="essenza-termica__leg-luce" aria-label="Legenda esposizione">
      {Object.entries(ESPOSIZIONE_LUCE).map(([id, e]) => (
        <span key={id} className="essenza-termica__leg-luce-item" title={e.label}>
          {e.icon} {e.label}
        </span>
      ))}
    </p>
  );
}

function RigaSpecie({ spec, mostraLuce = false }) {
  const g = spec.germinazione_pct;
  const c = spec.crescita_pct;
  const germOn = soddisfaFiltroStato(spec, "germina");
  const crescOn = soddisfaFiltroStato(spec, "crescita");

  return (
    <li className={`essenza-termica__row${spec.in_profilo ? " essenza-termica__row--highlight" : ""}`}>
      <span className="essenza-termica__nome">
        {mostraLuce ? <IconEsposizione spec={spec} /> : null}
        <em>{spec.nome}</em>
        {spec.citotipo ? <span className="essenza-termica__cyto">{spec.citotipo}</span> : null}
        {spec.in_profilo ? <span className="essenza-termica__badge">tuo prato</span> : null}
      </span>
      <div className="essenza-termica__metriche">
        <span
          className={`essenza-termica__metric essenza-termica__metric--germ${germOn ? " essenza-termica__metric--on" : ""}`}
          title="Germinazione seme"
        >
          Germ {g}%
        </span>
        <span
          className={`essenza-termica__metric essenza-termica__metric--grow${crescOn ? " essenza-termica__metric--on" : ""}`}
          title="Crescita vegetativa"
        >
          Cresc {c}%
        </span>
      </div>
      <div className="essenza-termica__bars" aria-hidden>
        <div className="essenza-termica__bar-line">
          <div className="essenza-termica__bar-fill essenza-termica__bar-fill--germ" style={{ width: `${g}%` }} />
        </div>
        <div className="essenza-termica__bar-line">
          <div className="essenza-termica__bar-fill essenza-termica__bar-fill--grow" style={{ width: `${c}%` }} />
        </div>
      </div>
    </li>
  );
}

function ListaFiltrata({ specie, statoId, onChiudi, mostraLuce = false }) {
  const meta = STATI_SPECIE[statoId];
  const perTipologia = useMemo(() => {
    const ordinati = ordinaSpeciePerFiltro(specieConStato(specie, statoId), statoId);
    const map = new Map();
    for (const s of ordinati) {
      if (!map.has(s.tipologia)) map.set(s.tipologia, []);
      map.get(s.tipologia).push(s);
    }
    return { totale: ordinati.length, gruppi: map };
  }, [specie, statoId]);

  return (
    <div className="essenza-termica__panel" role="region" aria-label={`Elenco ${meta.label}`}>
      <header className="essenza-termica__panel-head">
        <div>
          <h4 className="essenza-termica__panel-tit">
            {perTipologia.totale} {meta.label}
          </h4>
          {meta.hint ? <p className="essenza-termica__panel-hint">{meta.hint}</p> : null}
        </div>
        <button type="button" className="essenza-termica__panel-close" onClick={onChiudi}>
          Chiudi
        </button>
      </header>
      <ul className="essenza-termica__lista essenza-termica__lista--panel">
        {[...perTipologia.gruppi.entries()].map(([tipo, specs]) => (
          <li key={tipo} className="essenza-termica__panel-block">
            <div className="essenza-termica__panel-gruppo">{TIPO_LABEL[tipo]}</div>
            <ul className="essenza-termica__lista essenza-termica__lista--nested">
              {specs.map((s) => (
                <RigaSpecie key={s.id} spec={s} mostraLuce={mostraLuce} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EssenzaTermicaBody({ gruppoId, specie, temperaturaSuolo }) {
  const gruppo = GRUPPI_ESSENZA[gruppoId];
  const [filtroStato, setFiltroStato] = useState(null);
  const riepilogo = useMemo(() => riepilogoStati(specie), [specie]);
  const isInfest = gruppoId === "infestanti";
  const isPrato = gruppoId === "prato";
  const chips = isInfest ? ORDINE_CHIP_INFEST : ORDINE_CHIP_PRATO;

  return (
    <div className={`essenza-widget__body${isInfest ? " essenza-widget__body--infest" : ""}`}>
      {isPrato ? <LegendaLuce /> : null}
      <p className="essenza-widget__hint">
        {gruppo.hint}. Tocca i numeri per l&apos;elenco · Germ e Cresc sono <strong>separati</strong>.
      </p>

      <div className="essenza-termica__chips" role="group" aria-label={`Riepilogo ${gruppo.label}`}>
        {chips.map((id) => {
          const n = riepilogo[id];
          const attivo = filtroStato === id;
          const meta = STATI_SPECIE[id];
          return (
            <button
              key={id}
              type="button"
              className={`essenza-termica__chip essenza-termica__chip--${meta.colorClass}${
                attivo ? " essenza-termica__chip--active" : ""
              }`}
              disabled={n === 0}
              aria-pressed={attivo}
              title={meta.hint}
              onClick={() => setFiltroStato((prev) => (prev === id ? null : id))}
            >
              <strong>{n}</strong> {meta.label}
            </button>
          );
        })}
      </div>

      {filtroStato ? (
        <ListaFiltrata
          specie={specie}
          statoId={filtroStato}
          mostraLuce={isPrato}
          onChiudi={() => setFiltroStato(null)}
        />
      ) : (
        <p className="essenza-termica__hint-tap">Tocca un riepilogo per l&apos;elenco (i conteggi possono sovrapporsi)</p>
      )}

      <p className="essenza-widget__foot">
        {isInfest
          ? `A ${temperaturaSuolo}°C — «Germina» = banco semi; «Cresce» = accrescimento erba concorrente.`
          : `A ${temperaturaSuolo}°C — «Semina attiva» = germina e cresce insieme (overseeding).`}
      </p>
    </div>
  );
}

function EssenzaWidgetShell({ gruppoId, stato }) {
  const gruppo = GRUPPI_ESSENZA[gruppoId];
  const { temperatura_suolo, specie } = stato || {};

  if (temperatura_suolo == null) {
    return (
      <section className={`essenza-widget essenza-widget--${gruppoId}`}>
        <h2 className="essenza-widget__title">{gruppo.label}</h2>
        <p className="essenza-widget__sub">Dati suolo non disponibili.</p>
      </section>
    );
  }

  const specieGruppo = speciePerGruppoEssenza(specie || [], gruppoId);

  return (
    <section className={`essenza-widget essenza-widget--${gruppoId}`} aria-labelledby={`essenza-title-${gruppoId}`}>
      <h2 id={`essenza-title-${gruppoId}`} className="essenza-widget__title">
        {gruppo.label}
      </h2>
      <p className="essenza-widget__meta">{specieGruppo.length} specie monitorate</p>
      <EssenzaTermicaBody gruppoId={gruppoId} specie={specieGruppo} temperaturaSuolo={temperatura_suolo} />
    </section>
  );
}

/** Coppia prato + infestanti affiancata; temperatura condivisa sopra (niente barra duplicata). */
export function EssenzaTermicaPair({ bundle, profile }) {
  const stato = useMemo(() => (bundle ? statoDaMeteo(bundle, profile) : null), [bundle, profile]);

  if (!bundle || !stato) return null;

  const { messaggio, temperatura_suolo, tAria, fonteTemperatura } = stato;

  if (temperatura_suolo == null) {
    return (
      <div className="dash-essenza-pair dash-grid__span">
        <p className="dash-essenza-pair__lead">Temperatura suolo non disponibile per questa località.</p>
      </div>
    );
  }

  const leadExtra =
    tAria != null
      ? ` · aria ${tAria}°C${fonteTemperatura === "aria_proxy" ? " (suolo stimato)" : ""}`
      : fonteTemperatura === "aria_proxy"
        ? " · suolo stimato dall’aria"
        : "";

  return (
    <div className="dash-essenza-pair dash-grid__span">
      <p className="dash-essenza-pair__lead">
        <strong>Suolo {temperatura_suolo}°C</strong>
        {leadExtra}
        {messaggio ? ` — ${messaggio}` : null}
      </p>
      <div className="dash-essenza-pair__cols">
        <section className="dash-card dash-card--essenza-half">
          <EssenzaWidgetShell gruppoId="prato" stato={stato} />
        </section>
        <section className="dash-card dash-card--essenza-half">
          <EssenzaWidgetShell gruppoId="infestanti" stato={stato} />
        </section>
      </div>
    </div>
  );
}

/** @deprecated Usare EssenzaTermicaPair in dashboard. */
export default function EssenzaTermicaWidget({ bundle, profile }) {
  return <EssenzaTermicaPair bundle={bundle} profile={profile} />;
}
