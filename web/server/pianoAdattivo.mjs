/**
 * Piano dinamico adattivo: override meteo suolo + inibizione azoto con fungo attivo.
 */

import { macroDaIntervento } from "./agronomicGuardrails.mjs";
import { loadProdotti } from "./prodottiCatalogo.mjs";
import { getTemperaturaSuoloMedia } from "./raccomandazioneSementi.mjs";
import { valutaPreEmergenzaAnnuali } from "./preEmergenzaAnnuali.mjs";

const FUNGHI_PATTERN =
  /rhizoctonia|pythium|oidio|fusarium|fairy\s*ring|marciume|fungo|fungin|patogeno\s*fung|micelio|muffa|dollar\s*spot|red\s*thread|rizoctonia/i;

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function oggiIso() {
  return new Date().toISOString().slice(0, 10);
}

function centroidPrato(profilo) {
  const raw = profilo?.prato_zone;
  const pts = Array.isArray(raw?.poligono) ? raw.poligono : Array.isArray(raw) ? raw : null;
  if (!pts?.length) return null;
  let lat = 0;
  let lon = 0;
  for (const p of pts) {
    lat += Number(p.lat);
    lon += Number(p.lng ?? p.lon);
  }
  return { lat: lat / pts.length, lon: lon / pts.length };
}

export function rilevaPatogenoFungino(vision) {
  const blob = [
    vision?.diagnosi_avanzata,
    vision?.sintesi_visiva,
    ...(vision?.problemi_rilevati || []).map((p) => `${p.problema} ${p.dettaglio}`),
  ]
    .filter(Boolean)
    .join(" ");
  return FUNGHI_PATTERN.test(blob);
}

function mergeDettaglioAdattamento(row, patch) {
  let det = row.dettaglio_trattamento;
  if (typeof det === "string") {
    try {
      det = JSON.parse(det);
    } catch {
      det = {};
    }
  }
  if (!det || typeof det !== "object") det = {};
  return {
    ...det,
    adattamento_dinamico: {
      ...(det.adattamento_dinamico || {}),
      ...patch,
      aggiornato_il: new Date().toISOString(),
    },
  };
}

/**
 * Scansiona 21 giorni: concimi azotati → sospesi (non cancellati).
 */
export async function applicaSospensioneAzotoPerFungo(admin, userId, vision, prodottiById) {
  if (!admin || !userId || !rilevaPatogenoFungino(vision)) {
    return { sospesi: 0, ids: [] };
  }

  const oggi = oggiIso();
  const fine = addDays(oggi, 21);
  const motivo =
    "L'azoto in questo periodo rischierebbe di aggravare il fungo rilevato nell'ultima foto. Riprendi quando il prato è guarito e l'umidità si normalizza.";

  const { data: rows, error } = await admin
    .from("prato_interventi")
    .select("*")
    .eq("user_id", userId)
    .eq("stato", "pianificato")
    .gte("data_prevista", oggi)
    .lte("data_prevista", fine)
    .in("categoria", ["concime", "biostimolante"]);

  if (error || !rows?.length) return { sospesi: 0, ids: [] };

  const ids = [];
  for (const row of rows) {
    const macro = macroDaIntervento(row, prodottiById);
    if (macro !== "N") continue;

    const det = mergeDettaglioAdattamento(row, {
      tipo: "sospeso_fungo",
      motivo,
      data_originale: row.data_prevista,
      patogeno_rilevato: true,
    });

    const desc = `[SOSPESO — fungo in foto] ${motivo} ${(row.descrizione || "").replace(/^\[SOSPESO[^\]]*\]\s*/i, "")}`.slice(
      0,
      900,
    );
    let { error: upErr } = await admin
      .from("prato_interventi")
      .update({ stato: "sospeso", descrizione: desc, dettaglio_trattamento: det })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (upErr && /stato|check/i.test(upErr.message || "")) {
      ({ error: upErr } = await admin
        .from("prato_interventi")
        .update({ descrizione: desc, dettaglio_trattamento: det })
        .eq("id", row.id)
        .eq("user_id", userId));
    }

    if (!upErr) ids.push(row.id);
  }

  return { sospesi: ids.length, ids, motivo };
}

/**
 * Anticipa/posticipa diserbi pre-emergenza e rinnovo in base a T suolo.
 */
export async function adattaDateCalendarioPerSuolo(admin, userId, profilo, weatherBundle) {
  if (!admin || !userId) return { spostati: 0 };

  const centro = centroidPrato(profilo);
  if (!centro) return { spostati: 0 };

  let suolo;
  try {
    suolo = await getTemperaturaSuoloMedia(centro.lat, centro.lon, 5);
  } catch {
    return { spostati: 0 };
  }

  const t = suolo?.media;
  if (t == null) return { spostati: 0 };

  const oggi = oggiIso();
  const { data: rows } = await admin
    .from("prato_interventi")
    .select("*")
    .eq("user_id", userId)
    .eq("stato", "pianificato")
    .gte("data_prevista", oggi)
    .in("categoria", ["diserbo", "rinnovo"]);

  if (!rows?.length) return { spostati: 0 };

  const preEmerg = valutaPreEmergenzaAnnuali(weatherBundle);
  let spostati = 0;

  for (const row of rows) {
    const titolo = `${row.titolo} ${row.descrizione}`.toLowerCase();
    let nuovaData = null;
    let tipo = null;
    let motivo = null;

    if (/pre.?emerg|annualit|setaria|digitaria/i.test(titolo)) {
      if (preEmerg.finestraAperta && t >= 10 && row.data_prevista > addDays(oggi, 14)) {
        nuovaData = addDays(oggi, 7);
        tipo = "anticipato_meteo";
        motivo = `Suolo a ${t}°C e finestra pre-emergenza aperta: anticipato rispetto al calendario statico.`;
      } else if (!preEmerg.finestraAperta && t < 10) {
        nuovaData = addDays(row.data_prevista, 14);
        tipo = "posticipato_meteo";
        motivo = `Suolo ancora freddo (${t}°C): posticipato fino a minime stabili per pre-emergenza.`;
      }
    }

    if (row.categoria === "rinnovo") {
      if (t < 8) {
        nuovaData = addDays(oggi, 21);
        tipo = "posticipato_meteo";
        motivo = `Temperatura suolo ${t}°C < 8°C: semina bloccata fino a risalita termica.`;
      } else if (t >= 12 && t < 18 && row.data_prevista > addDays(oggi, 10)) {
        nuovaData = addDays(oggi, 5);
        tipo = "anticipato_meteo";
        motivo = `Suolo a ${t}°C: finestra ideale per festuche / rinnovo primaverile.`;
      }
    }

    if (!nuovaData || nuovaData === row.data_prevista) continue;

    const det = mergeDettaglioAdattamento(row, {
      tipo,
      motivo,
      data_originale: row.data_prevista,
      temperatura_suolo_c: t,
    });

    const { error } = await admin
      .from("prato_interventi")
      .update({
        data_prevista: nuovaData,
        descrizione: `[Data adattata al meteo] ${motivo} ${row.descrizione || ""}`.slice(0, 900),
        dettaglio_trattamento: det,
      })
      .eq("id", row.id)
      .eq("user_id", userId);

    if (!error) spostati += 1;
  }

  return { spostati, temperatura_suolo_c: t };
}

export async function pipelineAdattamentiPostPiano({
  admin,
  userId,
  profilo,
  weatherBundle,
  vision = null,
}) {
  const prodotti = await loadProdotti(admin);
  const byId = new Map(prodotti.map((p) => [p.id, p]));

  const suolo = await adattaDateCalendarioPerSuolo(admin, userId, profilo, weatherBundle);
  let fungo = { sospesi: 0 };
  if (vision) {
    fungo = await applicaSospensioneAzotoPerFungo(admin, userId, vision, byId);
  }

  return { suolo, fungo };
}
