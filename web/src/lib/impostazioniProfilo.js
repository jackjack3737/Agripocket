/** Frasi brevi (2–3 parole) per il rotatore impostazioni in header. */

const FALLBACK = [
  "Taglio · settimanale",
  "Irrigazione · manuale",
  "Esposizione · sole",
];

const TAGLIO = {
  settimanale: "settimanale",
  robot: "robot",
  quindicinale: "10–14 gg",
  raro: "raro",
};

const ALTEZZA = {
  "2_3": "2–3 cm",
  "4_5": "4–5 cm",
  "6_plus": "alto",
};

const IRRIGAZIONE = {
  automatica: "automatica",
  manuale: "manuale",
  pioggia: "meteorica",
};

const ESPOSIZIONE = {
  sole_pieno: "pieno sole",
  mezzombra: "mezz'ombra",
  ombra: "ombra",
};

const TERRENO = {
  sabbioso: "sabbioso",
  medio: "medio",
  argilloso: "argilloso",
};

const ETA = {
  nuovo: "nuovo",
  "1_3_anni": "1–3 anni",
  maturo: "maturo",
};

const OBIETTIVO = {
  estetico: "estetico",
  resistente: "resistente",
  bassa_manutenzione: "bassa cura",
};

const IMPEGNO = {
  base: "base",
  pro: "pro",
  greenkeeper: "greenkeeper",
};

const ANIMALI = {
  nessuno: "nessuno",
  cane: "con cane",
  altro: "con animali",
};

function push(frasi, categoria, valore) {
  if (!valore || valore === "—" || valore === "non_so") return;
  frasi.push(`${categoria} · ${valore}`);
}

export function frasiImpostazioniRotanti(profile) {
  if (!profile) return FALLBACK;

  const frasi = [];

  push(frasi, "Taglio", TAGLIO[profile.frequenza_taglio]);
  push(frasi, "Altezza", ALTEZZA[profile.altezza_taglio_cm]);
  push(frasi, "Irrigazione", IRRIGAZIONE[profile.irrigazione]);
  push(frasi, "Esposizione", ESPOSIZIONE[profile.esposizione]);
  push(frasi, "Terreno", TERRENO[profile.tipo_terreno]);
  push(frasi, "Età prato", ETA[profile.eta_prato]);
  push(frasi, "Obiettivo", OBIETTIVO[profile.obiettivo]);
  push(frasi, "Impegno", IMPEGNO[profile.livello_impegno]);
  push(frasi, "Animali", ANIMALI[profile.animali]);

  if (profile.localita?.trim()) {
    const loc = profile.localita.trim();
    const short = loc.length > 22 ? `${loc.slice(0, 20)}…` : loc;
    push(frasi, "Zona", short);
  }

  return frasi.length ? frasi : FALLBACK;
}
