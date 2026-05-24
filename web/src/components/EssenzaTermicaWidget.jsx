import { useMemo, useState } from "react";
import { TIPOLOGIE_PRATO } from "../data/speciePratoItalia.js";
import {
  GRUPPI_ESSENZA,
  SCALA_TERMICA,
  STATI_SPECIE,
  riepilogoStati,
  specieConStato,
  speciePerGruppoEssenza,
  statoDaMeteo,
  statoPrincipaleSpecie,
  zonaTermicaLabel,
} from "../lib/essenzaTermica";
import "../styles-essenza-termica.css";

const ZONE_SCALA = [
  { da: 0, a: 8, cls: "freddo", label: "Freddo" },
  { da: 8, a: 18, cls: "germ", label: "Germina" },
  { da: 18, a: 26, cls: "crescita", label: "Cresce" },
  { da: 26, a: 36, cls: "caldo", label: "Caldo" },
];

const ORDINE_STATO = ["crescita", "germina", "stallo", "no_germ"];

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
  const stato = statoPrincipaleSpecie(spec);
  return (
    <li
      className={`essenza-termica__row essenza-termica__row--${stato.colorClass}${
        spec.in_profilo ? " essenza-termica__row--highlight" : ""
      }`}
    >
      <span className="essenza-termica__nome">
        <em>{spec.nome}</em>
        {spec.citotipo ? <span className="essenza-termica__cyto">{spec.citotipo}</span> : null}
        {spec.in_profilo ? <span className="essenza-termica__badge">tuo prato</span> : null}
      </span>
      <span className={`essenza-termica__stato essenza-termica__stato--${stato.colorClass}`}>{stato.label}</span>
      <div className="essenza-termica__bar-track" aria-hidden>
        <div className="essenza-termica__bar-fill" style={{ width: `${stato.pct}%` }} />
      </div>
      <span className="essenza-termica__pct">{stato.pct}%</span>
    </li>
  );
}

function ListaFiltrata({ specie, statoId, onChiudi }) {
  const meta = STATI_SPECIE[statoId];
  const perTipologia = useMemo(() => {
    const ordinati = [...specieConStato(specie, statoId)].sort((a, b) => {
      if (a.in_profilo !== b.in_profilo) return a.in_profilo ? -1 : 1;
      return statoPrincipaleSpecie(b).pct - statoPrincipaleSpecie(a).pct;
    });
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
        <h4 className="essenza-termica__panel-tit">
          {perTipologia.totale} {meta.label}
        </h4>
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

function EssenzaTermicaBlocco({ gruppo, specie, temperaturaSuolo }) {
  const [filtroStato, setFiltroStato] = useState(null);
  const riepilogo = useMemo(() => riepilogoStati(specie), [specie]);
  const isInfest = gruppo.id === "infestanti";

  const toggleStato = (id) => {
    setFiltroStato((prev) => (prev === id ? null : id));
  };

  return (
    <section
      className={`essenza-termica__blocco${isInfest ? " essenza-termica__blocco--infest" : ""}`}
      aria-labelledby={`essenza-blocco-${gruppo.id}`}
    >
      <header className="essenza-termica__blocco-head">
        <h3 id={`essenza-blocco-${gruppo.id}`} className="essenza-termica__blocco-tit">
          {gruppo.label}
        </h3>
        <span className="essenza-termica__blocco-n">{specie.length} specie</span>
      </header>
      <p className="essenza-termica__blocco-hint">{gruppo.hint}</p>

      <div className="essenza-termica__chips" role="group" aria-label={`Riepilogo ${gruppo.label}`}>
        {ORDINE_STATO.map((id) => {
          const n = riepilogo[id];
          const attivo = filtroStato === id;
          return (
            <button
              key={id}
              type="button"
              className={`essenza-termica__chip essenza-termica__chip--${STATI_SPECIE[id].colorClass}${
                attivo ? " essenza-termica__chip--active" : ""
              }`}
              disabled={n === 0}
              aria-pressed={attivo}
              onClick={() => toggleStato(id)}
            >
              <strong>{n}</strong> {STATI_SPECIE[id].label}
            </button>
          );
        })}
      </div>

      {filtroStato ? (
        <ListaFiltrata specie={specie} statoId={filtroStato} onChiudi={() => setFiltroStato(null)} />
      ) : (
        <p className="essenza-termica__hint-tap">Tocca un numero (es. «{riepilogo.crescita} Cresce») per vedere l&apos;elenco</p>
      )}

      <p className="essenza-termica__blocco-foot">
        {isInfest
          ? `A ${temperaturaSuolo}°C suolo — «Germina» alto → valuta pre-emergenza.`
          : `A ${temperaturaSuolo}°C suolo — semina e crescita del miscuglio.`}
      </p>
    </section>
  );
}

export default function EssenzaTermicaWidget({ bundle, profile }) {
  const stato = useMemo(() => (bundle ? statoDaMeteo(bundle, profile) : null), [bundle, profile]);

  if (!bundle) return null;

  const { messaggio, temperatura_suolo, posizione_scala_pct, tAria, fonteTemperatura, specie } = stato || {};

  if (temperatura_suolo == null) {
    return (
      <section className="essenza-termica essenza-termica--empty" aria-labelledby="essenza-termica-title">
        <h2 id="essenza-termica-title" className="essenza-termica__title">
          Temperatura suolo
        </h2>
        <p className="essenza-termica__sub">Dati suolo non disponibili per questa località.</p>
      </section>
    );
  }

  const speciePrato = speciePerGruppoEssenza(specie || [], "prato");
  const specieInfest = speciePerGruppoEssenza(specie || [], "infestanti");

  return (
    <div className="essenza-termica-wrap">
      <section className="essenza-termica essenza-termica--scala" aria-labelledby="essenza-termica-title">
        <h2 id="essenza-termica-title" className="essenza-termica__title">
          Temperatura suolo
        </h2>
        <p className="essenza-termica__sub">
          {tAria != null ? `Aria ${tAria}°C · ` : ""}
          {fonteTemperatura === "aria_proxy" ? "suolo stimato dall’aria" : "suolo rilevato"}
        </p>
        <ScalaTermica t={temperatura_suolo} posPct={posizione_scala_pct} />
        {messaggio ? <p className="essenza-termica__msg">{messaggio}</p> : null}
      </section>

      <EssenzaTermicaBlocco gruppo={GRUPPI_ESSENZA.prato} specie={speciePrato} temperaturaSuolo={temperatura_suolo} />
      <EssenzaTermicaBlocco
        gruppo={GRUPPI_ESSENZA.infestanti}
        specie={specieInfest}
        temperaturaSuolo={temperatura_suolo}
      />
    </div>
  );
}
