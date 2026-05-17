/** Etichette e testo profilo per prompt IA (livello A + C). */

import { formatIrrigationForPrompt, formatZonesForPrompt } from "./pratoZone.mjs";

const ETA = {
  nuovo: "Nuovo (< 1 anno da semina/posa)",
  "1_3_anni": "1–3 anni",
  maturo: "Maturo (> 3 anni)",
  non_so: "Età non indicata",
};
const OBIETTIVO = {
  estetico: "Estetico (bello da vedere)",
  resistente: "Resistente al calpestio/usura",
  bassa_manutenzione: "Bassa manutenzione",
  non_so: "Obiettivo non indicato",
};
const FREQ_TAGLIO = {
  settimanale: "Taglio settimanale",
  quindicinale: "Taglio ogni 10–14 giorni",
  raro: "Taglio raro",
  non_so: "Frequenza taglio non indicata",
};
const ALT_TAGLIO = {
  "2_3": "Altezza taglio 2–3 cm",
  "4_5": "Altezza taglio 4–5 cm",
  "6_plus": "Altezza taglio oltre 6 cm",
  non_so: "Altezza taglio non indicata",
};
const ANIMALI = {
  nessuno: "Nessun animale sul prato",
  cane: "Cane (calpestio/urine)",
  altro: "Altri animali (gatti, conigli, pollame…)",
  non_so: "Presenza animali non indicata",
};
const TRATT_TIPO = {
  concime: "Ultimo: concime",
  diserbo: "Ultimo: diserbo",
  fungicida: "Ultimo: fungicida",
  biostimolante: "Ultimo: biostimolante",
  insetticida: "Ultimo: insetticida",
  nessuno: "Nessun trattamento recente dichiarato",
  non_so: "Ultimo trattamento non indicato",
};
const TRATT_QUANDO = {
  settimana: "nell'ultima settimana",
  mese: "nell'ultimo mese",
  stagione: "in questa stagione",
  oltre_anno: "oltre un anno fa",
  non_so: "tempo non indicato",
};
const PROBLEMI = {
  feltro_thatch: "Feltro/thatch",
  muschio: "Muschio",
  calve_diradamenti: "Calve o diradamenti",
  ingiallimento: "Ingiallimenti / clorosi",
  erbacce: "Erbacce infestanti",
  larve_parassiti: "Larve o parassiti",
  funghi: "Sospetto funghi",
  ristagni_acqua: "Ristagni d'acqua",
};
const PENDENZA = {
  piana: "Terreno pianeggiante",
  leggera: "Leggera pendenza",
  marcata: "Pendenza marcata",
  non_so: "Pendenza non indicata",
};
const RISTAGNO = {
  mai: "Mai ristagni",
  dopo_pioggia: "Ristagni solo dopo pioggia forte",
  spesso: "Ristagni frequenti",
  non_so: "Ristagni non indicati",
};
const OMBRA_ZONE = {
  "0_25": "Ombra su 0–25% della superficie",
  "25_50": "Ombra su 25–50%",
  "50_75": "Ombra su 50–75%",
  "75_100": "Ombra su oltre 75%",
  non_so: "Distribuzione ombra non indicata",
};
const PH = {
  acido: "pH tendenzialmente acido",
  neutro: "pH neutro (circa 6–7)",
  alcalino: "pH tendenzialmente alcalino",
  non_so: "pH non indicato",
};

export function formatProblemiNoti(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const labels = arr.map((k) => PROBLEMI[k] || k).filter(Boolean);
  return labels.length ? labels.join(", ") : null;
}

export function formatProfileForPrompt(p) {
  if (!p) return "Profilo prato: non compilato.";

  const base = [
    p.uso && `Uso: ${p.uso}`,
    p.marca_seme && `Miscuglio dichiarato: ${p.marca_seme}`,
    p.esposizione && `Esposizione: ${p.esposizione}`,
    p.tipo_terreno && `Terreno: ${p.tipo_terreno}`,
    p.irrigazione && `Irrigazione: ${p.irrigazione}`,
    p.superficie_mq && `Superficie: ${p.superficie_mq} m²`,
    p.localita && `Località: ${p.localita}`,
    p.eta_prato && ETA[p.eta_prato] && `Età prato: ${ETA[p.eta_prato]}`,
    p.obiettivo && OBIETTIVO[p.obiettivo] && `Obiettivo: ${OBIETTIVO[p.obiettivo]}`,
    p.frequenza_taglio && FREQ_TAGLIO[p.frequenza_taglio] && `Taglio: ${FREQ_TAGLIO[p.frequenza_taglio]}`,
    p.altezza_taglio_cm && ALT_TAGLIO[p.altezza_taglio_cm],
    p.animali && ANIMALI[p.animali] && `Animali: ${ANIMALI[p.animali]}`,
    p.ultimo_trattamento_tipo &&
      TRATT_TIPO[p.ultimo_trattamento_tipo] &&
      `Trattamenti: ${TRATT_TIPO[p.ultimo_trattamento_tipo]}${
        p.ultimo_trattamento_quando && TRATT_QUANDO[p.ultimo_trattamento_quando]
          ? ` ${TRATT_QUANDO[p.ultimo_trattamento_quando]}`
          : ""
      }`,
    formatProblemiNoti(p.problemi_noti) && `Problemi noti dal cliente: ${formatProblemiNoti(p.problemi_noti)}`,
    p.note && `Note/specie: ${p.note}`,
  ].filter(Boolean);

  const avanzato = [
    p.pendenza && PENDENZA[p.pendenza] && `Pendenza: ${PENDENZA[p.pendenza]}`,
    p.ristagno_acqua && RISTAGNO[p.ristagno_acqua] && `Drenaggio: ${RISTAGNO[p.ristagno_acqua]}`,
    p.ombra_zone_pct && OMBRA_ZONE[p.ombra_zone_pct],
    p.ph_terreno && PH[p.ph_terreno] && `pH: ${PH[p.ph_terreno]}`,
    p.ph_valore != null && `pH misurato: ${p.ph_valore}`,
    p.analisi_terreno_fatta && "Analisi di laboratorio del terreno: sì",
    p.note_terreno?.trim() && `Dettaglio analisi terreno: ${p.note_terreno.trim()}`,
  ].filter(Boolean);

  if (avanzato.length) base.push(`Contesto avanzato:\n${avanzato.join("\n")}`);

  const mappa = formatZonesForPrompt(p.prato_zone);
  if (mappa) base.push(`Mappa zone prato:\n${mappa}`);
  const irrig = formatIrrigationForPrompt(p.prato_zone, p);
  if (irrig) base.push(`Programma irrigazione suggerito (da mappa):\n${irrig}`);

  return base.length ? base.join("\n") : "Profilo prato: minimo.";
}
