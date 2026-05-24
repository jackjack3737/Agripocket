import { useMemo } from "react";
import { TIPOLOGIE_PRATO } from "../data/speciePratoItalia.js";
import { SCALA_TERMICA, statoDaMeteo } from "../lib/essenzaTermica";
import "../styles-essenza-termica.css";

function BarraSpecie({ spec, valore, tipo }) {
  const col =
    tipo === "crescita"
      ? "grow"
      : tipo === "stallo"
        ? "stall"
        : tipo === "germ"
          ? "germ"
          : "nogerm";
  return (
    <li className={`essenza-termica__row essenza-termica__row--${col}${spec.in_profilo ? " essenza-termica__row--highlight" : ""}`}>
      <span className="essenza-termica__nome">
        <em>{spec.nome}</em>
        {spec.citotipo ? <span className="essenza-termica__cyto">{spec.citotipo}</span> : null}
        {spec.in_profilo ? <span className="essenza-termica__badge">tuo prato</span> : null}
      </span>
      <div className="essenza-termica__bar-track" aria-hidden>
        <div className="essenza-termica__bar-fill" style={{ width: `${valore}%` }} />
      </div>
      <span className="essenza-termica__pct">{valore}%</span>
    </li>
  );
}

function MiniGruppo({ titolo, specie, campo, tipo }) {
  if (!specie.length) return null;
  return (
    <div className="essenza-termica__mini">
      <h4 className="essenza-termica__mini-tit">{titolo}</h4>
      <ul className="essenza-termica__lista">
        {specie.map((s) => (
          <BarraSpecie key={s.id} spec={s} valore={s[campo]} tipo={tipo} />
        ))}
      </ul>
    </div>
  );
}

function SezioneTipologia({ tipologia, specieCalcolate }) {
  const lista = specieCalcolate.filter((s) => s.tipologia === tipologia.id);
  if (!lista.length) return null;

  const crescita = lista.filter((s) => s.crescita_pct >= 45).sort((a, b) => b.crescita_pct - a.crescita_pct);
  const stallo = lista.filter((s) => s.crescita_pct < 30).sort((a, b) => a.crescita_pct - b.crescita_pct);
  const germina = lista.filter((s) => s.germinazione_pct >= 50).sort((a, b) => b.germinazione_pct - a.germinazione_pct);
  const noGermina = lista.filter((s) => s.germinazione_pct < 25).sort((a, b) => a.germinazione_pct - b.germinazione_pct);

  const isInfestante = tipologia.id.startsWith("infestante");

  return (
    <section className={`essenza-termica__tipo${isInfestante ? " essenza-termica__tipo--infest" : ""}`}>
      <header className="essenza-termica__tipo-head">
        <h3 className="essenza-termica__tipo-tit">{tipologia.label}</h3>
        <span className="essenza-termica__tipo-n">{lista.length} taxa</span>
      </header>
      {tipologia.desc ? <p className="essenza-termica__tipo-desc">{tipologia.desc}</p> : null}
      <div className="essenza-termica__tipo-grid">
        <MiniGruppo titolo="Crescita" specie={crescita} campo="crescita_pct" tipo="crescita" />
        <MiniGruppo titolo="Stallo" specie={stallo} campo="crescita_pct" tipo="stallo" />
        <MiniGruppo titolo="Germina" specie={germina} campo="germinazione_pct" tipo="germ" />
        <MiniGruppo titolo="No germ." specie={noGermina} campo="germinazione_pct" tipo="nogerm" />
      </div>
    </section>
  );
}

function ScalaTermica({ t, posPct }) {
  const zone = [
    { da: 0, a: 8, cls: "freddo", label: "<8°" },
    { da: 8, a: 18, cls: "germ", label: "8–18°" },
    { da: 18, a: 26, cls: "crescita", label: "18–26°" },
    { da: 26, a: 36, cls: "caldo", label: ">26°" },
  ];

  return (
    <div className="essenza-termica__scala" role="img" aria-label={`Temperatura suolo ${t}°C`}>
      <div className="essenza-termica__scala-track">
        {zone.map((z) => {
          const w = ((z.a - z.da) / (SCALA_TERMICA.max - SCALA_TERMICA.min)) * 100;
          return (
            <span
              key={z.cls}
              className={`essenza-termica__scala-zone essenza-termica__scala-zone--${z.cls}`}
              style={{ width: `${w}%` }}
              title={z.label}
            />
          );
        })}
        {posPct != null ? (
          <span className="essenza-termica__scala-marker" style={{ left: `${posPct}%` }} aria-hidden />
        ) : null}
      </div>
      <div className="essenza-termica__scala-labels">
        <span>0°C</span>
        <span>suolo</span>
        <span>36°C</span>
      </div>
      {posPct != null ? (
        <p className="essenza-termica__scala-val">
          <strong>{t}°C</strong> nel suolo (indicatore sulla barra)
        </p>
      ) : null}
    </div>
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
          Essenze, infestanti e temperatura
        </h2>
        <p className="essenza-termica__sub">Dati suolo non disponibili per questa località.</p>
      </section>
    );
  }

  const nSpecie = specie?.length ?? 0;

  return (
    <section className="essenza-termica" aria-labelledby="essenza-termica-title">
      <h2 id="essenza-termica-title" className="essenza-termica__title">
        Essenze, infestanti e temperatura
      </h2>
      <p className="essenza-termica__sub">
        Suolo <strong>{temperatura_suolo}°C</strong>
        {tAria != null ? ` · aria ${tAria}°C` : ""}
        {fonteTemperatura === "aria_proxy" ? " (stima da aria)" : ""}
        {" · "}
        {nSpecie} taxa in {TIPOLOGIE_PRATO.length} tipologie
      </p>

      <ScalaTermica t={temperatura_suolo} posPct={posizione_scala_pct} />

      {messaggio ? <p className="essenza-termica__msg">{messaggio}</p> : null}

      <div className="essenza-termica__tipi">
        {TIPOLOGIE_PRATO.map((tip) => (
          <SezioneTipologia key={tip.id} tipologia={tip} specieCalcolate={specie || []} />
        ))}
      </div>

      <p className="essenza-termica__foot">
        Crescita / stallo / germinazione stimati da temperatura suolo. Le infestanti C4 (Digitaria, Setaria…)
        indicano rischio pre-emergenza quando «Germina» è alto.
      </p>
    </section>
  );
}
