import { useMemo, useState } from "react";
import { TIPOLOGIE_PRATO } from "../data/speciePratoItalia.js";
import {
  GRUPPI_ESSENZA,
  SCALA_TERMICA,
  STATI_SPECIE,
  ordinaSpeciePerFiltro,
  riepilogoStati,
  specieConStato,
  speciePerGruppoEssenza,
  soddisfaFiltroStato,
  statoDaMeteo,
  zonaTermicaLabel,
} from "../lib/essenzaTermica";
import "../styles-essenza-termica.css";

const ZONE_SCALA = [
  { da: 0, a: 8, cls: "freddo", label: "Freddo" },
  { da: 8, a: 18, cls: "germ", label: "Germina" },
  { da: 18, a: 26, cls: "crescita", label: "Cresce" },
  { da: 26, a: 36, cls: "caldo", label: "Caldo" },
];

const ORDINE_CHIP_PRATO = ["crescita", "germina", "attiva", "stallo", "no_germ"];
const ORDINE_CHIP_INFEST = ["crescita", "germina", "stallo", "no_germ"];

const TIPO_LABEL = Object.fromEntries(TIPOLOGIE_PRATO.map((t) => [t.id, t.label]));

function ScalaTermica({ t, posPct }) {
  const zona = zonaTermicaLabel(t);

  return (
    <div className="essenza-termica__scala" role="img" aria-label={`Temperatura suolo ${t}°C, ${zona.label}`}>
      <div className="essenza-termica__scala-head">
        <span className="essenza-termica__scala-temp">{t}°C</span>
        <span className="essenza-termica__scala-zona">suolo · {zona.label}</span>
      </div>
      <div className="essenza-termica__scala-track">
        {ZONE_SCALA.map((z) => {
          const w = ((z.a - z.da) / (SCALA_TERMICA.max - SCALA_TERMICA.min)) * 100;
          return (
            <span
              key={z.cls}
              className={`essenza-termica__scala-zone essenza-termica__scala-zone--${z.cls}${
                zona.id === z.cls ? " essenza-termica__scala-zone--active" : ""
              }`}
              style={{ width: `${w}%` }}
            />
          );
        })}
        {posPct != null ? (
          <span className="essenza-termica__scala-marker" style={{ left: `${posPct}%` }} aria-hidden />
        ) : null}
      </div>
      <div className="essenza-termica__scala-legend">
        {ZONE_SCALA.map((z) => (
          <span key={z.cls} className={`essenza-termica__scala-leg essenza-termica__scala-leg--${z.cls}`}>
            {z.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RigaSpecie({ spec }) {
  const g = spec.germinazione_pct;
  const c = spec.crescita_pct;
  const germOn = soddisfaFiltroStato(spec, "germina");
  const crescOn = soddisfaFiltroStato(spec, "crescita");

  return (
    <li className={`essenza-termica__row${spec.in_profilo ? " essenza-termica__row--highlight" : ""}`}>
      <span className="essenza-termica__nome">
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

function ListaFiltrata({ specie, statoId, onChiudi }) {
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
                <RigaSpecie key={s.id} spec={s} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EssenzaTermicaBody({ gruppoId, specie, temperaturaSuolo, messaggio, posizioneScala, tAria, fonteTemperatura }) {
  const gruppo = GRUPPI_ESSENZA[gruppoId];
  const [filtroStato, setFiltroStato] = useState(null);
  const riepilogo = useMemo(() => riepilogoStati(specie), [specie]);
  const isInfest = gruppoId === "infestanti";
  const chips = isInfest ? ORDINE_CHIP_INFEST : ORDINE_CHIP_PRATO;

  const subAria =
    tAria != null
      ? `Aria ${tAria}°C · ${fonteTemperatura === "aria_proxy" ? "suolo stimato dall’aria" : "suolo rilevato"}`
      : fonteTemperatura === "aria_proxy"
        ? "Suolo stimato dall’aria"
        : "Suolo rilevato";

  return (
    <div className={`essenza-widget__body${isInfest ? " essenza-widget__body--infest" : ""}`}>
      <p className="essenza-widget__sub">{subAria}</p>
      <ScalaTermica t={temperaturaSuolo} posPct={posizioneScala} />
      {messaggio ? <p className="essenza-termica__msg">{messaggio}</p> : null}

      <p className="essenza-widget__hint">
        {gruppo.hint}. Germinazione (seme) e crescita (pianta) sono <strong>separate</strong>.
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
        <ListaFiltrata specie={specie} statoId={filtroStato} onChiudi={() => setFiltroStato(null)} />
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

function EssenzaWidgetShell({ gruppoId, bundle, profile }) {
  const stato = useMemo(() => (bundle ? statoDaMeteo(bundle, profile) : null), [bundle, profile]);
  const gruppo = GRUPPI_ESSENZA[gruppoId];

  if (!bundle) return null;

  const { messaggio, temperatura_suolo, posizione_scala_pct, tAria, fonteTemperatura, specie } = stato || {};

  if (temperatura_suolo == null) {
    return (
      <section className={`essenza-widget essenza-widget--${gruppoId}`}>
        <h2 className="essenza-widget__title">{gruppo.label}</h2>
        <p className="essenza-widget__sub">Dati suolo non disponibili per questa località.</p>
      </section>
    );
  }

  const specieGruppo = speciePerGruppoEssenza(specie || [], gruppoId);

  return (
    <section className={`essenza-widget essenza-widget--${gruppoId}`} aria-labelledby={`essenza-title-${gruppoId}`}>
      <h2 id={`essenza-title-${gruppoId}`} className="essenza-widget__title">
        {gruppo.label}
      </h2>
      <p className="essenza-widget__meta">
        {specieGruppo.length} specie · suolo {temperatura_suolo}°C
      </p>
      <EssenzaTermicaBody
        gruppoId={gruppoId}
        specie={specieGruppo}
        temperaturaSuolo={temperatura_suolo}
        messaggio={messaggio}
        posizioneScala={posizione_scala_pct}
        tAria={tAria}
        fonteTemperatura={fonteTemperatura}
      />
    </section>
  );
}

/** Widget full-width: sementi e graminacee da prato. */
export function EssenzaPratoWidget(props) {
  return <EssenzaWidgetShell gruppoId="prato" {...props} />;
}

/** Widget full-width: infestanti e ciperacee. */
export function EssenzaInfestantiWidget(props) {
  return <EssenzaWidgetShell gruppoId="infestanti" {...props} />;
}

/** @deprecated Usare EssenzaPratoWidget + EssenzaInfestantiWidget in dashboard. */
export default function EssenzaTermicaWidget({ bundle, profile }) {
  if (!bundle) return null;
  return (
    <>
      <EssenzaPratoWidget bundle={bundle} profile={profile} />
      <EssenzaInfestantiWidget bundle={bundle} profile={profile} />
    </>
  );
}
