/** Controllo mensile foto — una voce per mese nel calendario. */

function addMonths(yyyyMm, n) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildControlliMensili(oggi, mesi = 12) {
  const startMonth = oggi.slice(0, 7);
  const rows = [];

  for (let i = 0; i < mesi; i++) {
    const monthKey = addMonths(startMonth, i);
    const data = `${monthKey}-12`;
    if (data < oggi) continue;

    rows.push({
      titolo: "Controllo mensile — foto del prato",
      descrizione:
        "Scatta e carica una foto aggiornata del prato per verificare stato, nutrizione e parassiti. Usa «Analisi foto» dal link in calendario.",
      priorita: "media",
      categoria: "altro",
      stato: "pianificato",
      data_prevista: data,
      ordine: 50,
      fonte: "controllo_mensile",
    });
  }

  return rows;
}

export function mergeControlliMensili(interventi, oggi) {
  const esistenti = new Set(
    interventi
      .filter((i) => i.fonte === "controllo_mensile")
      .map((i) => (i.data_prevista || "").slice(0, 7)),
  );

  const extra = buildControlliMensili(oggi).filter((r) => !esistenti.has(r.data_prevista.slice(0, 7)));

  return [...interventi, ...extra].sort(
    (a, b) =>
      String(a.data_prevista || "").localeCompare(String(b.data_prevista || "")) ||
      (a.ordine ?? 0) - (b.ordine ?? 0),
  );
}
