/** Routine taglio/irrigazione — fuori dal calendario DB, solo UI Dashboard. */

const FREQ_TAGLIO = {
  settimanale: { label: "Taglio settimanale", hint: "Circa 1 volta a settimana in stagione attiva." },
  robot: {
    label: "Robot tagliaerba",
    hint: "Micro-tagli frequenti; mantieni lame affilate e altezza costante.",
  },
  quindicinale: { label: "Taglio ogni 10–14 giorni", hint: "Due passate al mese circa." },
  raro: { label: "Taglio raro", hint: "Non tagliare più del 1/3 della foglia per volta." },
};

const ALT_TAGLIO = {
  "2_3": "Altezza residua 2–3 cm",
  "4_5": "Altezza residua 4–5 cm",
  "6_plus": "Altezza residua oltre 6 cm",
};

const IRRIGAZIONE = {
  automatica: "Irrigazione automatica programmata",
  manuale: "Irrigazione manuale a bisogno",
  pioggia: "Solo pioggia naturale",
};

export function abitudiniDaProfilo(profile) {
  if (!profile) return [];
  const out = [];

  const freq = profile.frequenza_taglio;
  if (freq && FREQ_TAGLIO[freq]) {
    const alt = profile.altezza_taglio_cm && ALT_TAGLIO[profile.altezza_taglio_cm];
    out.push({
      id: "taglio",
      icon: freq === "robot" ? "🤖" : "✂️",
      titolo: FREQ_TAGLIO[freq].label,
      descrizione: [FREQ_TAGLIO[freq].hint, alt].filter(Boolean).join(" · "),
    });
  }

  const irr = profile.irrigazione;
  if (irr && IRRIGAZIONE[irr]) {
    out.push({
      id: "irrigazione",
      icon: "💧",
      titolo: IRRIGAZIONE[irr],
      descrizione:
        irr === "automatica"
          ? "Controlla ugelli e pressione; in estate irriga al mattino presto."
          : irr === "manuale"
            ? "Preferisci irrigazioni profonde e meno frequenti."
            : "In siccità prolungata valuta integrazioni mirate.",
    });
  }

  return out;
}

/** Esclude routine dal calendario lavori in UI. */
export function isRoutineIntervento(item) {
  const cat = String(item?.categoria || "").toLowerCase();
  return cat === "taglio" || cat === "irrigazione";
}

export function filtraCalendarioStrategico(list) {
  return (list || []).filter((i) => !isRoutineIntervento(i));
}
