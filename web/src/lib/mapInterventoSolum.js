import { treatmentFromIntervento } from "../components/calendario/TreatmentCard.jsx";
import { formatDataIt } from "./dashboard.js";

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

function primaFrase(testo) {
  if (!testo || typeof testo !== "string") return "";
  const t = testo.trim();
  const cut = t.match(/^[^.!?]+[.!?]?/);
  return (cut ? cut[0] : t).slice(0, 160);
}

function titoloTecnicoDa(item, treatment) {
  if (treatment?.esigenze_molecolari?.length) {
    const prima = treatment.esigenze_molecolari[0];
    if (typeof prima === "string") return prima;
    if (prima?.nome || prima?.molecola) {
      return [prima.nome, prima.molecola].filter(Boolean).join(" · ");
    }
  }
  const raw = item?.titolo?.trim();
  if (raw && raw.length > 8) return raw;
  return treatment?.tipo_intervento || item?.titolo || "Dettaglio agronomico";
}

function fabbisognoTesto(item, treatment) {
  const parts = [];
  if (treatment?.fabbisogno_fisiologico) parts.push(treatment.fabbisogno_fisiologico);
  if (treatment?.spiegazione_semplice && treatment.spiegazione_semplice !== treatment.fabbisogno_fisiologico) {
    parts.push(treatment.spiegazione_semplice);
  }
  if (treatment?.esigenze_molecolari?.length) {
    const righe = treatment.esigenze_molecolari.map((e) => {
      if (typeof e === "string") return `• ${e}`;
      const nome = e.nome || e.molecola || "Esigenza";
      const perché = e.perche || e.motivo || e.ruolo || "";
      return perché ? `• ${nome}: ${perché}` : `• ${nome}`;
    });
    parts.push(righe.join("\n"));
  }
  if (!parts.length && item?.messaggio_ux) parts.push(item.messaggio_ux);
  return parts.join("\n\n").trim();
}

/** Mappa riga `prato_interventi` → modello UI Solum. */
export function interventoToSolum(item) {
  const treatment = treatmentFromIntervento(item);
  const titoloSemplice = treatment?.tipo_intervento || item?.titolo || "Lavoro in programma";
  const descrizioneSemplice =
    primaFrase(treatment?.spiegazione_semplice) ||
    primaFrase(item?.messaggio_ux) ||
    "Un passo semplice per tenere il prato in forma.";
  const cat = (item?.categoria || "altro").toLowerCase();
  const icona = ICONA_CATEGORIA[cat] || ICONA_CATEGORIA.altro;
  const completato = item?.stato === "completato";

  return {
    id: item.id,
    titolo_semplice: titoloSemplice,
    titolo_tecnico: titoloTecnicoDa(item, treatment),
    descrizione_semplice: descrizioneSemplice,
    fabbisogno_fisiologico: fabbisognoTesto(item, treatment) || descrizioneSemplice,
    data_prevista: item.data_prevista,
    stato: completato ? "completato" : "da fare",
    icona,
    categoria: cat,
    priorita: item.priorita,
    prodotti: treatment?.prodotti_consigliati ?? [],
    _raw: item,
  };
}

/** Prossimi 7 giorni (incluso oggi), raggruppati per data. */
export function gruppiSettimanaCorrente(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  const fine = addDays(oggiIso, 6);
  const pianificati = interventi
    .filter((i) => i.stato === "pianificato" && i.data_prevista)
    .filter((i) => i.data_prevista >= oggiIso && i.data_prevista <= fine)
    .map(interventoToSolum);

  const perData = new Map();
  for (let d = 0; d < 7; d += 1) {
    const key = addDays(oggiIso, d);
    perData.set(key, []);
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

/** Lista spesa predittiva: interventi dal giorno 8 al +30 giorni, prodotti per mese. */
export function dispensaPerMese(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  const da = addDays(oggiIso, 8);
  const a = addDays(oggiIso, 30);
  const futuri = interventi
    .filter((i) => i.stato === "pianificato" && i.data_prevista >= da && i.data_prevista <= a)
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
      prodotti: [...v.prodotti.values()].sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    }));
}

/** Interventi pianificati con data passata (prima di oggi). */
export function interventiInRitardoSolum(interventi, oggiIso = new Date().toISOString().slice(0, 10)) {
  return interventi
    .filter((i) => i.stato === "pianificato" && i.data_prevista && i.data_prevista < oggiIso)
    .map(interventoToSolum);
}

function formatMeseDispensa(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
