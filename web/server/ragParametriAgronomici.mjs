/**
 * RAG-first: parametri agronomici da KB universitaria con fallback deterministici.
 */

import { queryKnowledgeBasePrioritized } from "./kbQuery.mjs";

function capacitaCampoMm(tipo_terreno) {
  if (tipo_terreno === "argilloso") return 20;
  if (tipo_terreno === "sabbioso") return 8;
  return 14;
}

function kcStagionale(dataRef = new Date()) {
  const m = new Date(dataRef).getMonth() + 1;
  if (m >= 6 && m <= 8) return 0.82;
  if ((m >= 3 && m <= 5) || m === 9 || m === 10) return 0.65;
  return 0.58;
}

const EMBED_MODEL = "gemini-embedding-001";

const KC_MENSILE_FALLBACK = {
  1: 0.58,
  2: 0.58,
  3: 0.65,
  4: 0.65,
  5: 0.65,
  6: 0.82,
  7: 0.82,
  8: 0.82,
  9: 0.65,
  10: 0.65,
  11: 0.58,
  12: 0.58,
};

const PLUV_FALLBACK = {
  statici: 35,
  dinamici: 12,
  testine_rotator: 15,
  ala_gocciolante: 20,
};

const SUOLO_SEMINA_FALLBACK = {
  blocco_sotto_c: 8,
  loietto_min_c: 8,
  loietto_max_c: 12,
  festuca_min_c: 12,
  festuca_max_c: 18,
};

export async function geminiEmbedQuery(text, apiKey) {
  if (!apiKey?.trim()) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.embedding?.values ?? null;
}

/**
 * @param {'irrigazione'|'calendario'|'sementi'} dominio
 */
export async function recuperaParametriRag(dominio, { admin, geminiKey, profilo = {} } = {}) {
  const queryByDomain = {
    irrigazione: `coefficiente colturale Kc prato tappeto erboso irrigazione ET0 evapotraspirazione mensile stagionale capacità campo suolo sabbioso argilloso infiltrazione mm/h irrigatori`,
    calendario: `calendario concimazione NPK prato primavera azoto estate potassio autunno fosforo matrice stagionale turfgrass finestre patogeni fungini`,
    sementi: `temperatura suolo germinazione prato loietto festuca arundinacea pre-emergenza diserbo soglia gradi`,
  };

  const base = {
    fonte: "fallback",
    kc_mensile: { ...KC_MENSILE_FALLBACK },
    kc_oggi: kcStagionale(),
    pluviometria_mm_h: { ...PLUV_FALLBACK },
    capacita_campo_mm: {
      sabbioso: capacitaCampoMm("sabbioso"),
      medio: capacitaCampoMm("medio"),
      argilloso: capacitaCampoMm("argilloso"),
    },
    suolo_semina: { ...SUOLO_SEMINA_FALLBACK },
    estratti_kb: [],
  };

  if (!admin || !geminiKey) return base;

  try {
    const emb = await geminiEmbedQuery(
      `${queryByDomain[dominio] || queryByDomain.calendario} ${profilo?.localita || ""} ${profilo?.tipo_terreno || ""}`,
      geminiKey,
    );
    if (!emb?.length) return base;

    const chunks = await queryKnowledgeBasePrioritized(admin, emb, {
      matchCount: 6,
      fetchCount: 24,
      minLibri: 2,
    });

    if (!chunks?.length) return base;

    const blob = chunks.map((c) => `${c.patologia || ""}\n${c.soluzione || ""}`).join("\n");
    base.fonte = "rag";
    base.estratti_kb = chunks.slice(0, 3).map((c) => ({
      patologia: c.patologia,
      tier: c.soluzione?.startsWith("[libro_universitario:") ? "libro" : "altro",
    }));

    for (let m = 1; m <= 12; m += 1) {
      const re = new RegExp(`(?:mese\\s*${m}|${m}\\s*[:/]\\s*)(0[,.]\\d{2})`, "i");
      const hit = blob.match(re) || blob.match(new RegExp(`Kc[^0-9]{0,30}(0[,.]\\d{2})`, "i"));
      if (hit) {
        const v = Number(hit[1].replace(",", "."));
        if (v > 0.45 && v < 1.05) base.kc_mensile[m] = v;
      }
    }

    const kcGlob = blob.match(/Kc\s*[=:]?\s*(0[,.]\d{2})/i);
    if (kcGlob) {
      const v = Number(kcGlob[1].replace(",", "."));
      if (v > 0.45 && v < 1.05) base.kc_oggi = v;
    }

    const mese = new Date().getMonth() + 1;
    if (base.kc_mensile[mese]) base.kc_oggi = base.kc_mensile[mese];
  } catch (e) {
    console.warn("[ragParametri]", dominio, e.message);
  }

  return base;
}

export function kcPerData(parametri, dataIso) {
  const m = new Date(`${dataIso || new Date().toISOString().slice(0, 10)}T12:00:00`).getMonth() + 1;
  return parametri?.kc_mensile?.[m] ?? parametri?.kc_oggi ?? kcStagionale(dataIso);
}
