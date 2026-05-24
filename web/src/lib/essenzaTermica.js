/**
 * Stato fisiologico essenze prato vs temperatura suolo/aria.
 * Elenco specie: src/data/speciePratoItalia.js
 */

import { SPECIE_PRATO_ITALIA } from "../data/speciePratoItalia.js";

export {
  SPECIE_PRATO_ITALIA,
  ELENCO_LATINO_ITALIA,
  TIPOLOGIE_PRATO,
  speciePerTipologia,
} from "../data/speciePratoItalia.js";

/** @deprecated alias */
export const SPECIE_PRATO = SPECIE_PRATO_ITALIA;

export const SCALA_TERMICA = { min: 0, max: 36 };

/** Rampa 0→100 tra a e b. */
function ramp(t, a, b) {
  if (t <= a) return 0;
  if (t >= b) return 100;
  return Math.round(((t - a) / (b - a)) * 100);
}

/** Curva a campana (0 ai bordi, 100 in fascia ottimale). */
function campana(t, min, optLo, optHi, max) {
  if (t < min || t > max) return 0;
  if (t >= optLo && t <= optHi) return 100;
  if (t < optLo) return ramp(t, min, optLo);
  return ramp(max - t, 0, max - optHi);
}

/**
 * @param {number} t - °C suolo (o proxy aria)
 * @param {SpeciePrato} spec
 */
export function pctGerminazione(t, spec) {
  if (!Number.isFinite(t)) return 0;
  if (t < spec.germMin) return Math.round(ramp(t, spec.germMin - 4, spec.germMin) * 0.25);
  if (t > spec.germMax) {
    const calo = ramp(spec.germMax + 8 - t, 0, 8);
    return Math.max(0, Math.round(100 - calo * 1.2));
  }
  return campana(t, spec.germMin, spec.germOptMin, spec.germOptMax, spec.germMax);
}

/** @param {object} s @param {string} blob */
function matchSpecieProfilo(s, blob) {
  const b = blob.toLowerCase();
  const nome = s.nome.toLowerCase();
  if (b.includes(nome)) return true;
  if (b.includes(s.id.replace(/_/g, " "))) return true;

  const genus = nome.split(" ")[0];
  const epithet = nome.split(" ").slice(1).join(" ");
  if (epithet && b.includes(`${genus} ${epithet.split(" ")[0]}`)) return true;

  if (s.id === "lolium_perenne_4n" && /tetraploid|tetraploide|4n|4x|2n=4x/.test(b)) return true;
  if (s.id === "lolium_perenne" && /lolium perenne|loietto/.test(b) && !/tetraploid|multiflorum|hybridum|rigidum/.test(b))
    return true;
  if (s.id === "lolium_multiflorum" && /multiflorum|italico|westerwold/.test(b)) return true;
  if (s.id === "lolium_hybridum" && /hybridum|ibrido/.test(b)) return true;
  if (s.id === "festuca_rubra_commutata") return /commutata|chewings/.test(b);
  if (s.id === "festuca_rubra_trichophylla") return /trichophylla/.test(b);
  if (s.id === "festuca_rubra") return /festuca rubra/.test(b) && !/commutata|trichophylla/.test(b);
  if (s.id === "festuca_arundinacea") return /arundinacea|schedonorus/.test(b);
  if (s.id === "cynodon_dactylon" && /cynodon|dactylon|bermuda|gramigna/.test(b)) return true;
  if (s.id.startsWith("zoysia") && /zoysia/.test(b)) return true;
  if (s.id === "paspalum_vaginatum" && /paspalum/.test(b)) return true;
  if (s.id === "dactylis_glomerata" && /dactylis|gherbo/.test(b)) return true;
  if (s.id === "poa_supina" && /poa supina|supina/.test(b)) return true;
  if (s.id === "poa_trivialis" && /trivialis/.test(b)) return true;
  if (s.id === "digitaria_sanguinalis" && /digitaria sanguinalis|sanguinalis/.test(b)) return true;
  if (s.id === "digitaria_ischaemum" && /ischaemum|digitaria ischaemum/.test(b)) return true;
  if (s.id === "digitaria_horizontalis" && /horizontalis/.test(b)) return true;
  if (s.id.startsWith("setaria") && /setaria|panico|panicum/.test(b)) return true;
  if (s.id === "echinochloa_crus_galli" && /echinochloa|giavena|crus-galli/.test(b)) return true;
  if (s.id === "panicum_dichotomiflorum" && /dichotomiflorum/.test(b)) return true;
  if (s.id === "sorghum_halepense" && /sorghum|sorgo/.test(b)) return true;
  if (s.id.startsWith("cyperus") && /cyperus|cipero|zipero/.test(b)) return true;
  if (s.id === "alopecurus_myosuroides" && /alopecurus|spica venti/.test(b)) return true;

  return false;
}

export function pctCrescita(t, spec) {
  if (!Number.isFinite(t)) return 0;
  if (t < spec.growMin) return Math.round(ramp(t, spec.growMin - 3, spec.growMin) * 0.2);
  if (t > spec.growMax) return Math.max(0, Math.round(100 - ramp(t, spec.growMax, spec.growMax + 6)));
  return campana(t, spec.growMin, spec.growOptMin, spec.growOptMax, spec.growMax);
}

/**
 * @param {object|null} weatherBundle - output /api/meteo
 * @returns {{ tSuolo: number|null, tAria: number|null, fonte: string }}
 */
export function temperaturaDaMeteo(bundle) {
  const ag = bundle?.agronomic;
  const tSuolo = ag?.soil_temperature_10cm_c ?? ag?.soil_temperature_6cm_c ?? null;
  const tAria = bundle?.current?.main?.temp ?? bundle?.current?.temp ?? null;
  const suolo = Number(tSuolo);
  const aria = Number(tAria);
  if (Number.isFinite(suolo)) {
    return { tSuolo: Math.round(suolo * 10) / 10, tAria: Number.isFinite(aria) ? Math.round(aria) : null, fonte: "suolo" };
  }
  if (Number.isFinite(aria)) {
    return { tSuolo: Math.round((aria - 2) * 10) / 10, tAria: Math.round(aria), fonte: "aria_proxy" };
  }
  return { tSuolo: null, tAria: null, fonte: "mancante" };
}

/**
 * @param {number|null} tSuolo
 * @param {{ specieBotanica?: string }} [opts]
 */
export function calcolaStatoEssenze(tSuolo, opts = {}) {
  const t = tSuolo;
  const specieBotanica = String(opts.specieBotanica || "").toLowerCase();

  const specie = SPECIE_PRATO_ITALIA.map((s) => {
    const germ = pctGerminazione(t, s);
    const crescita = pctCrescita(t, s);
    const inProfilo = specieBotanica ? matchSpecieProfilo(s, specieBotanica) : false;

    return {
      ...s,
      germinazione_pct: germ,
      crescita_pct: crescita,
      in_profilo: inProfilo,
    };
  });

  const crescita = specie
    .filter((s) => s.crescita_pct >= 45)
    .sort((a, b) => b.crescita_pct - a.crescita_pct);
  const stallo = specie
    .filter((s) => s.crescita_pct < 30)
    .sort((a, b) => a.crescita_pct - b.crescita_pct);
  const germina = specie
    .filter((s) => s.germinazione_pct >= 50)
    .sort((a, b) => b.germinazione_pct - a.germinazione_pct);
  const noGermina = specie
    .filter((s) => s.germinazione_pct < 25)
    .sort((a, b) => a.germinazione_pct - b.germinazione_pct);

  const posScala =
    t != null && Number.isFinite(t)
      ? Math.min(100, Math.max(0, ((t - SCALA_TERMICA.min) / (SCALA_TERMICA.max - SCALA_TERMICA.min)) * 100))
      : null;

  let messaggio = "";
  if (t == null) {
    messaggio = "Temperatura suolo non disponibile: attiva la località nel profilo.";
  } else if (t < 8) {
    messaggio =
      "Suolo freddo: le graminacee da prato temperato sono in stallo; la semina è sconsigliata sotto ~8°C (rischio marciumi).";
  } else if (t < 12) {
    messaggio = "Finestra ideale per germinazione di Lolium perenne; Festuca e Poa ancora lente.";
  } else if (t <= 18) {
    messaggio = "Temperatura ottimale per crescita delle specie a stagione fredda e semina festuche.";
  } else if (t < 26) {
    messaggio = "Caldo: le specie da prato temperato rallentano; bermuda e zoysia entrano in zona attiva.";
  } else {
    messaggio = "Caldo intenso: stress termico sulle specie fresche; macroterme in crescita se irrigate.";
  }

  return {
    temperatura_suolo: t,
    posizione_scala_pct: posScala,
    messaggio,
    gruppi: { crescita, stallo, germina, noGermina },
    specie,
  };
}

export function statoDaMeteo(bundle, profile) {
  const { tSuolo, tAria, fonte } = temperaturaDaMeteo(bundle);
  const stato = calcolaStatoEssenze(tSuolo, {
    specieBotanica: profile?.specie_botanica || profile?.specie_rilevata,
  });
  return { ...stato, tAria, fonteTemperatura: fonte };
}
