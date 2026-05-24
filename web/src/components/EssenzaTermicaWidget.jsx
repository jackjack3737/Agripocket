import { useMemo, useState } from "react";
import { TIPOLOGIE_PRATO } from "../data/speciePratoItalia.js";
import {
  SCALA_TERMICA,
  STATI_SPECIE,
  riepilogoStati,
  specieInEvidenza,
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

function LegendaStati() {
  return (
    <ul className="essenza-termica__legenda" aria-label="Significato stati">
      {ORDINE_STATO.map((id) => {
        const s = STATI_SPECIE[id];
        return (
          <li key={id} className={`essenza-termica__leg-item essenza-termica__leg-item--${s.colorClass}`}>
            <span className="essenza-termica__leg-dot" aria-hidden />
            {s.label}
          </li>
        );
      })}
    </ul>
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

function SezioneTipologia({ tipologia, specieCalcolate, soloEvidenza, defaultOpen }) {
  const lista = specieCalcolate.filter((s) => s.tipologia === tipologia.id);
  if (!lista.length) return null;

  const visibili = soloEvidenza ? lista.filter(specieInEvidenza) : lista;
  const ordinati = [...visibili].sort((a, b) => {
    if (a.in_profilo !== b.in_profilo) return a.in_profilo ? -1 : 1;
    return statoPrincipaleSpecie(b).pct - statoPrincipaleSpecie(a).pct;
  });

  const isInfestante = tipologia.id.startsWith("infestante");
  const nascoste = lista.length - visibili.length;

  return (
    <details className={`essenza-termica__acc${isInfestante ? " essenza-termica__acc--infest" : ""}`} open={defaultOpen}>
      <summary className="essenza-termica__acc-sum">
        <span className="essenza-termica__acc-tit">{tipologia.label}</span>
        <span className="essenza-termica__acc-meta">
          {visibili.length}
          {soloEvidenza && nascoste > 0 ? ` / ${lista.length}` : ""} specie
        </span>
      </summary>
      {tipologia.desc ? <p className="essenza-termica__tipo-desc">{tipologia.desc}</p> : null}
      {ordinati.length === 0 ? (
        <p className="essenza-termica__vuoto">
          Nessuna specie in evidenza a questa temperatura. Attiva «Mostra tutte» per l&apos;elenco completo.
        </p>
      ) : (
        <ul className="essenza-termica__lista">
          {ordinati.map((s) => (
            <RigaSpecie key={s.id} spec={s} />
          ))}
        </ul>
      )}
    </details>
  );
}

export default function EssenzaTermicaWidget({ bundle, profile }) {
  const [soloEvidenza, setSoloEvidenza] = useState(true);

  const stato = useMemo(() => (bundle ? statoDaMeteo(bundle, profile) : null), [bundle, profile]);

  if (!bundle) return null;

  const { messaggio, temperatura_suolo, posizione_scala_pct, tAria, fonteTemperatura, specie } = stato || {};

  if (temperatura_suolo == null) {
    return (
      <section className="essenza-termica essenza-termica--empty" aria-labelledby="essenza-termica-title">
        <h2 id="essenza-termica-title" className="essenza-termica__title">
          Specie e temperatura suolo
        </h2>
        <p className="essenza-termica__sub">Dati suolo non disponibili per questa località.</p>
      </section>
    );
  }

  const riepilogo = riepilogoStati(specie || []);

  return (
    <section className="essenza-termica" aria-labelledby="essenza-termica-title">
      <h2 id="essenza-termica-title" className="essenza-termica__title">
        Specie e temperatura suolo
      </h2>
      <p className="essenza-termica__sub">
        {tAria != null ? `Aria ${tAria}°C · ` : ""}
        {fonteTemperatura === "aria_proxy" ? "suolo stimato dall’aria · " : ""}
        una riga = una specie, un solo stato oggi
      </p>

      <ScalaTermica t={temperatura_suolo} posPct={posizione_scala_pct} />

      {messaggio ? <p className="essenza-termica__msg">{messaggio}</p> : null}

      <div className="essenza-termica__chips" aria-label="Riepilogo stati">
        {ORDINE_STATO.map((id) => (
          <span key={id} className={`essenza-termica__chip essenza-termica__chip--${STATI_SPECIE[id].colorClass}`}>
            <strong>{riepilogo[id]}</strong> {STATI_SPECIE[id].label}
          </span>
        ))}
      </div>

      <LegendaStati />

      <label className="essenza-termica__toggle">
        <input type="checkbox" checked={!soloEvidenza} onChange={(e) => setSoloEvidenza(!e.target.checked)} />
        Mostra tutte le specie ({specie?.length ?? 0})
      </label>

      <div className="essenza-termica__tipi">
        {TIPOLOGIE_PRATO.map((tip, i) => (
          <SezioneTipologia
            key={tip.id}
            tipologia={tip}
            specieCalcolate={specie || []}
            soloEvidenza={soloEvidenza}
            defaultOpen={i === 0}
          />
        ))}
      </div>

      <p className="essenza-termica__foot">
        Percentuale = efficacia stimata di crescita o germinazione a {temperatura_suolo}°C suolo. Infestanti con
        «Germina» alto → valuta pre-emergenza.
      </p>
    </section>
  );
}
