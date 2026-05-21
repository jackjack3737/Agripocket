/**
 * FASE 3 — Tracciamento anonimo focolai epidemici per comune.
 */

import { parseLocalitaQuery, fetchWeatherBundle } from "./weatherCore.mjs";

const SOGLIA_FOCOLAIO = 5;
const GIORNI_FINESTRA = 14;

/** Comune normalizzato da profilo.localita (città o CAP). */
export async function comuneDaLocalita(localita) {
  const raw = localita?.trim();
  if (!raw) return null;

  const parsed = parseLocalitaQuery(raw);
  if (parsed.kind === "city" || parsed.kind === "city_cap") {
    return parsed.city?.trim() || null;
  }
  if (parsed.kind === "cap") {
    try {
      const bundle = await fetchWeatherBundle(parsed.cap);
      return bundle?.geo?.comune || bundle?.geo?.name || null;
    } catch {
      return null;
    }
  }
  return raw.split(",")[0]?.trim() || null;
}

function normalizzaPatologia(nome) {
  const s = String(nome || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Patologie da segnalare anonimamente (alta confidenza / gravità alta). */
export function patologieDaRegistrare(vision) {
  if (!vision || typeof vision !== "object") return [];

  const out = new Set();

  const confermata = vision.patologia_confermata;
  if (confermata?.nome && String(confermata.confidenza || "").toLowerCase() === "alta") {
    const n = normalizzaPatologia(confermata.nome);
    if (n) out.add(n);
  }

  for (const m of vision.malattie_sospette || []) {
    const nome = typeof m === "string" ? m : m?.nome;
    const grav = String(typeof m === "object" ? m?.gravita : "").toLowerCase();
    if (nome && grav === "alta") {
      const n = normalizzaPatologia(nome);
      if (n) out.add(n);
    }
  }

  for (const p of vision.problemi_rilevati || []) {
    if (String(p?.gravita || "").toLowerCase() !== "alta") continue;
    const testo = `${p?.problema || ""} ${p?.dettaglio || ""}`.toLowerCase();
    if (/sclerotin|fusari|rizocton|dollar|pythium|oidio|ferrug|septoria|fusarium/i.test(testo)) {
      const n = normalizzaPatologia(p.problema);
      if (n) out.add(n);
    }
  }

  return [...out];
}

/**
 * Conta segnalazioni per comune+patologia negli ultimi N giorni.
 */
export async function contaFocolai(admin, comune, patologia, giorni = GIORNI_FINESTRA) {
  if (!admin || !comune?.trim() || !patologia?.trim()) return 0;

  const since = new Date();
  since.setDate(since.getDate() - giorni);

  const { count, error } = await admin
    .from("focolai_regionali")
    .select("id", { count: "exact", head: true })
    .ilike("comune", comune.trim())
    .ilike("patologia", patologia.trim())
    .gte("data_rilevamento", since.toISOString());

  if (error) {
    console.warn("[focolai] count:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Elenco patologie con focolaio attivo (>= soglia) nel comune. */
export async function focolaiAttiviNelComune(admin, comune) {
  if (!admin || !comune?.trim()) return [];

  const since = new Date();
  since.setDate(since.getDate() - GIORNI_FINESTRA);

  const { data, error } = await admin
    .from("focolai_regionali")
    .select("patologia")
    .ilike("comune", comune.trim())
    .gte("data_rilevamento", since.toISOString());

  if (error) {
    console.warn("[focolai] list:", error.message);
    return [];
  }

  const counts = new Map();
  for (const row of data || []) {
    const p = normalizzaPatologia(row.patologia);
    if (!p) continue;
    counts.set(p, (counts.get(p) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= SOGLIA_FOCOLAIO)
    .map(([patologia, count]) => ({ patologia, count }));
}

/** Blocco prompt per Gemini (piano stagionale / analisi). */
export async function buildFocolaiPromptBlock(admin, profilo) {
  const comune = await comuneDaLocalita(profilo?.localita);
  if (!comune) return "";

  const attivi = await focolaiAttiviNelComune(admin, comune);
  if (!attivi.length) return "";

  const lines = attivi.map(
    (f) =>
      `ATTENZIONE: Rilevato focolaio di ${f.patologia} nel comune dell'utente (${comune}: ${f.count} segnalazioni negli ultimi ${GIORNI_FINESTRA} giorni). Adatta il piano stagionale con protocolli preventivi presi dalla Knowledge Base.`,
  );
  return `\n## Sicurezza collettiva — focolai regionali\n${lines.join("\n")}\n`;
}

/** INSERT anonimo (service role). */
export async function registraFocolaiDaVision(admin, profilo, vision) {
  const comune = await comuneDaLocalita(profilo?.localita);
  if (!comune) return { registrati: [] };

  const patologie = patologieDaRegistrare(vision);
  const registrati = [];

  for (const patologia of patologie) {
    const { error } = await admin.from("focolai_regionali").insert({
      comune: comune.slice(0, 120),
      patologia: patologia.slice(0, 120),
    });
    if (!error) registrati.push(patologia);
    else console.warn("[focolai] insert:", error.message);
  }

  return { registrati, comune };
}
