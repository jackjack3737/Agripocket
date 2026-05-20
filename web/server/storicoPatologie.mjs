/**
 * Storicizzazione patologie da vision_json (analisi foto).
 */

const GRAVITA_CONFERMA = new Set(["media", "alta"]);

function gravitaOk(g) {
  return GRAVITA_CONFERMA.has(String(g || "").toLowerCase());
}

function nomePatologia(entry) {
  if (typeof entry === "string") return entry.trim().slice(0, 200);
  if (!entry || typeof entry !== "object") return null;
  const nome =
    entry.nome ||
    entry.patologia ||
    entry.tipo ||
    entry.specie ||
    entry.erba ||
    entry.problema;
  return nome ? String(nome).trim().slice(0, 200) : null;
}

/**
 * Estrae patogeni/infestanti con gravità media o alta da vision.
 * @returns {string[]}
 */
export function estraiPatologieConfermate(vision) {
  if (!vision || typeof vision !== "object") return [];
  const nomi = new Set();

  for (const m of vision.malattie_sospette || []) {
    if (typeof m === "string") {
      nomi.add(m.trim());
      continue;
    }
    if (gravitaOk(m?.gravita) || gravitaOk(m?.severita)) {
      const n = nomePatologia(m);
      if (n) nomi.add(n);
    }
  }

  for (const e of vision.erbette_infestanti || []) {
    if (typeof e === "string") {
      nomi.add(e.trim());
      continue;
    }
    if (gravitaOk(e?.gravita) || gravitaOk(e?.severita) || gravitaOk(e?.infestazione)) {
      const n = nomePatologia(e);
      if (n) nomi.add(n);
    }
  }

  for (const p of vision.problemi_rilevati || []) {
    if (!gravitaOk(p?.gravita)) continue;
    const n = nomePatologia(p) || String(p?.problema || "").trim();
    if (n) nomi.add(n);
  }

  return [...nomi].filter((n) => n.length >= 2);
}

/**
 * Inserisce in prato_storico_patologie (skip se stesso user/mese/anno/patologia).
 */
export async function registraStoricoPatologie(admin, userId, vision) {
  const patologie = estraiPatologieConfermate(vision);
  if (!patologie.length) return { inseriti: 0, patologie: [] };

  const now = new Date();
  const mese = now.getMonth() + 1;
  const anno = now.getFullYear();
  let inseriti = 0;

  for (const patologia_rilevata of patologie) {
    const { data: esiste, error: selErr } = await admin
      .from("prato_storico_patologie")
      .select("id")
      .eq("user_id", userId)
      .eq("mese_rilevamento", mese)
      .eq("anno", anno)
      .eq("patologia_rilevata", patologia_rilevata)
      .maybeSingle();

    if (selErr) {
      if (selErr.code === "PGRST205") {
        console.warn("[storico-patologie] tabella assente: esegui sql/patch_storico_patologie.sql");
        return { inseriti: 0, patologie, tablesMissing: true };
      }
      console.warn("[storico-patologie] select:", selErr.message);
      continue;
    }
    if (esiste) continue;

    const { error } = await admin.from("prato_storico_patologie").insert({
      user_id: userId,
      patologia_rilevata,
      mese_rilevamento: mese,
      anno,
      risolto: false,
    });

    if (!error) inseriti += 1;
    else console.warn("[storico-patologie] insert:", error.message);
  }

  return { inseriti, patologie, mese, anno };
}
