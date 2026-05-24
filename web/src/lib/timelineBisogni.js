const STORAGE_KEY = "agripocket_timeline_bisogni";

export function saveTimelineBisogni(userId, timeline) {
  if (!userId || !timeline) return;
  try {
    sessionStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(timeline));
  } catch {
    /* quota */
  }
}

export function loadTimelineBisogni(userId) {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const MESI_IT = [
  "GENNAIO",
  "FEBBRAIO",
  "MARZO",
  "APRILE",
  "MAGGIO",
  "GIUGNO",
  "LUGLIO",
  "AGOSTO",
  "SETTEMBRE",
  "OTTOBRE",
  "NOVEMBRE",
  "DICEMBRE",
];

/** Fallback client se la timeline non è in sessione (es. refresh pagina). */
export function timelineDaInterventi(interventi, oggi) {
  const oggiDate = oggi || new Date().toISOString().slice(0, 10);
  const futuri = (interventi || [])
    .filter((i) => i.stato !== "completato" && i.data_prevista >= oggiDate)
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));

  const oggiList = futuri.filter((i) => i.data_prevista === oggiDate || i.priorita === "alta").slice(0, 3);
  const tra30 = futuri.filter((i) => {
    const diff =
      (new Date(`${i.data_prevista}T12:00:00`) - new Date(`${oggiDate}T12:00:00`)) / 86400000;
    return diff > 0 && diff <= 31;
  });

  const label = (i) => {
    const det = typeof i.dettaglio_trattamento === "string" ? null : i.dettaglio_trattamento;
    const esigenze = det?.esigenze_molecolari || i.esigenze_molecolari;
    return esigenze?.[0] || i.titolo;
  };

  const byMonth = new Map();
  for (const i of futuri) {
    const m = MESI_IT[new Date(`${i.data_prevista}T12:00:00`).getMonth()];
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(i);
  }

  const oggiM = new Date(`${oggiDate}T12:00:00`).getMonth();
  const finestre = [...byMonth.keys()]
    .sort((a, b) => {
      const ia = MESI_IT.indexOf(a);
      const ib = MESI_IT.indexOf(b);
      const da = ia >= oggiM ? ia - oggiM : ia + 12 - oggiM;
      const db = ib >= oggiM ? ib - oggiM : ib + 12 - oggiM;
      return da - db;
    })
    .slice(0, 6)
    .map((periodo) => ({
      periodo,
      esigenza: (byMonth.get(periodo) || [])
        .slice(0, 3)
        .map(label)
        .filter(Boolean)
        .join("; "),
    }));

  return {
    oggi:
      oggiList.length > 0
        ? oggiList.map(label).join("; ")
        : "Monitoraggio ET0 e umidità suolo — nessun intervento urgente in agenda.",
    prossimo_mese:
      tra30.length > 0
        ? tra30
            .slice(0, 4)
            .map(label)
            .join("; ")
        : "Equilibrio idrico; valutare NPK in base a ripresa vegetativa.",
    finestre_stagionali: finestre,
  };
}
