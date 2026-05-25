import { treatmentFromIntervento } from "../components/calendario/TreatmentCard.jsx";
import { formatDataIt } from "./dashboard.js";
import { MAX_MESSAGGIO_OPERATIVO_UI, messaggioOperativoPerUi } from "./messaggioOperativo.js";

const ICONA_CATEGORIA = {
  irrigazione: "💧",
  concime: "🌱",
  concimazione: "🌱",
  trattamento: "🧪",
  fitofarmaco: "🧪",
  diserbo: "🌿",
  biostimolante: "✨",
  rinnovo: "🌾",
  sementi: "🌾",
  taglio: "✂️",
  controllo: "📷",
  giardino: "🪴",
  altro: "📋",
};

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function giorniTra(a, b) {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((db - da) / 86400000);
}

function parseDettaglio(item) {
  const raw = item?.dettaglio_trattamento;
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function titoloTecnicoFallback(item, treatment, det) {
  if (det?.titolo_tecnico) return det.titolo_tecnico;
  if (treatment?.titolo_tecnico) return treatment.titolo_tecnico;
  if (treatment?.esigenze_molecolari?.length) {
    const prima = treatment.esigenze_molecolari[0];
    if (typeof prima === "string") return prima;
    if (prima?.nome || prima?.molecola) {
      return [prima.nome, prima.molecola].filter(Boolean).join(" · ");
    }
  }
  return item?.titolo_tecnico_solum || item?.titolo || "Dettaglio agronomico";
}

function fabbisognoAccademico(item, treatment, det) {
  const accademico =
    det?.fabbisogno_fisiologico ||
    treatment?.fabbisogno_fisiologico ||
    item?.fabbisogno_fisiologico;
  if (accademico) return String(accademico).trim();
  if (treatment?.esigenze_molecolari?.length) {
    return treatment.esigenze_molecolari
      .map((e) => {
        if (typeof e === "string") return `• ${e}`;
        const nome = e.nome || e.molecola || "Esigenza";
        const perché = e.perche || e.motivo || e.ruolo || "";
        return perché ? `• ${nome}: ${perché}` : `• ${nome}`;
      })
      .join("\n");
  }
  return "";
}

/** Mappa riga `prato_interventi` → modello UI Solum (progressive disclosure). */
export function interventoToSolum(item) {
  const treatment = treatmentFromIntervento(item);
  const det = parseDettaglio(item);

  const titoloSemplice =
    det?.titolo_semplice_azione ||
    treatment?.titolo_semplice_azione ||
    treatment?.tipo_intervento ||
    item?.titolo_semplice_azione ||
    item?.titolo ||
    "Lavoro in programma";

  const descrizioneSemplice = messaggioOperativoPerUi(item, det, treatment);

  const cat = (item?.categoria || "altro").toLowerCase();
  const icona = ICONA_CATEGORIA[cat] || ICONA_CATEGORIA.altro;
  const completato = item?.stato === "completato";
  const fabbisogno = fabbisognoAccademico(item, treatment, det);

  return {
    id: item.id,
    titolo_semplice: titoloSemplice,
    titolo_tecnico: titoloTecnicoFallback(item, treatment, det),
    descrizione_semplice: descrizioneSemplice.slice(0, MAX_MESSAGGIO_OPERATIVO_UI),
    fabbisogno_fisiologico: fabbisogno || descrizioneSemplice,
    data_prevista: item.data_prevista,
    stato: completato ? "completato" : "da fare",
    icona,
    categoria: cat,
    priorita: item.priorita,
    prodotti: treatment?.prodotti_consigliati ?? [],
    _raw: item,
  };
}

function sortPianificati(interventi) {
  return [...interventi]
    .filter((i) => i.stato === "pianificato" && i.data_prevista)
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista));
}

/** Prossimi 7 giorni (incluso oggi), raggruppati per data. */
export function gruppiSettimanaCorrente(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  const fine = addDays(oggiIso, 6);
  const pianificati = sortPianificati(interventi)
    .filter((i) => i.data_prevista >= oggiIso && i.data_prevista <= fine)
    .map(interventoToSolum);

  const perData = new Map();
  for (let d = 0; d < 7; d += 1) {
    perData.set(addDays(oggiIso, d), []);
  }
  for (const task of pianificati) {
    const list = perData.get(task.data_prevista);
    if (list) list.push(task);
  }

  const giorni = [];
  for (let d = 0; d < 7; d += 1) {
    const key = addDays(oggiIso, d);
    const tasks = perData.get(key) || [];
    let etichetta = formatDataIt(key);
    const offset = giorniTra(oggiIso, key);
    if (offset === 0) etichetta = "Oggi";
    else if (offset === 1) etichetta = "Domani";
    giorni.push({ data: key, etichetta, tasks });
  }
  return giorni;
}

/** Primo intervento pianificato dopo i prossimi 7 giorni. */
export function prossimoInterventoSolum(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  const dopoSettimana = addDays(oggiIso, 7);
  const next = sortPianificati(interventi).find((i) => i.data_prevista >= dopoSettimana);
  return next ? interventoToSolum(next) : null;
}

/** Timeline compatta: tutti i pianificati da oggi a fine anno, raggruppati per mese. */
export function timelineFuturoSolum(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  const fineAnno = `${oggiIso.slice(0, 4)}-12-31`;
  const futuri = sortPianificati(interventi)
    .filter((i) => i.data_prevista >= oggiIso && i.data_prevista <= fineAnno)
    .map(interventoToSolum);

  const perMese = new Map();
  for (const task of futuri) {
    const meseKey = task.data_prevista.slice(0, 7);
    if (!perMese.has(meseKey)) perMese.set(meseKey, []);
    perMese.get(meseKey).push(task);
  }

  return [...perMese.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([meseKey, tasks]) => ({
      meseKey,
      meseLabel: formatMeseLabel(meseKey),
      tasks,
    }));
}

function formatMeseLabel(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Etichetta data compatta per timeline (es. «15 Giu»). */
export function formatGiornoCompatto(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  const giorno = d.getDate();
  const mese = d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
  return `${giorno} ${mese.charAt(0).toUpperCase()}${mese.slice(1)}`;
}

/** Lista spesa predittiva: interventi dal giorno 8 al +30 giorni, prodotti per mese. */
export function dispensaPerMese(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  const da = addDays(oggiIso, 8);
  const a = addDays(oggiIso, 30);
  const futuri = sortPianificati(interventi)
    .filter((i) => i.data_prevista >= da && i.data_prevista <= a)
    .map(interventoToSolum);

  const perMese = new Map();
  for (const task of futuri) {
    const meseKey = task.data_prevista.slice(0, 7);
    if (!perMese.has(meseKey)) perMese.set(meseKey, { meseKey, prodotti: new Map(), interventi: 0 });
    const bucket = perMese.get(meseKey);
    bucket.interventi += 1;
    for (const p of task.prodotti) {
      const nome = p?.nome_commerciale?.trim();
      if (!nome) continue;
      const key = `${p.marca || ""}|${nome}`.toLowerCase();
      if (!bucket.prodotti.has(key)) {
        bucket.prodotti.set(key, {
          key,
          prodotto: p,
          nome,
          marca: p.marca || null,
          perIntervento: task.titolo_semplice,
          dataPrimo: task.data_prevista,
        });
      }
    }
  }

  return [...perMese.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([meseKey, v]) => ({
      meseKey,
      meseLabel: formatMeseDispensa(meseKey),
      interventi: v.interventi,
      prodotti: [...v.prodotti.values()].sort((a, b) =>
        (a.nome || "").localeCompare(b.nome || "", "it"),
      ),
    }));
}

function formatMeseDispensa(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Interventi pianificati con data passata (prima di oggi). */
export function interventiInRitardoSolum(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  return sortPianificati(interventi)
    .filter((i) => i.data_prevista < oggiIso)
    .map(interventoToSolum);
}
