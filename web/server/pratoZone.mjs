import { calculatePolygonAreaSqm } from "./polygonArea.mjs";

export const ZONE_TYPES = {
  irrigatore: { label: "Irrigatore", color: "#1565c0", fill: "#1565c0" },
  ombra: { label: "Ombra", color: "#455a64", fill: "#455a64" },
  muschio: { label: "Muschio", color: "#6d4c41", fill: "#6d4c41" },
  pendenza: { label: "Pendenza", color: "#ef6c00", fill: "#ef6c00" },
};

export const IRRIGATOR_MODES = {
  statico: { label: "Statico", short: "S", desc: "Getti fissi / pop-up" },
  dinamico: { label: "Dinamico", short: "D", desc: "Rotativo o oscillante" },
};

function uid() {
  return `z_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** @param {unknown} raw */
export function normalizePratoZone(raw) {
  if (!raw || typeof raw !== "object") return { version: 1, poligono: [], zone: [] };
  const poligono = Array.isArray(raw.poligono)
    ? raw.poligono
        .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    : [];
  const zone = Array.isArray(raw.zone) ? raw.zone.map(normalizeZone).filter(Boolean) : [];
  return { version: 1, poligono, zone };
}

function normalizeZone(z) {
  if (!z?.tipo || !ZONE_TYPES[z.tipo]) return null;
  const id = z.id || uid();
  if (z.tipo === "irrigatore") {
    const lat = Number(z.lat);
    const lng = Number(z.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const modalita = z.modalita === "dinamico" ? "dinamico" : "statico";
    return { id, tipo: "irrigatore", lat, lng, modalita };
  }
  if (z.tipo === "ombra" || z.tipo === "muschio") {
    const path = (z.path || [])
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (path.length < 3) return null;
    return { id, tipo: z.tipo, path };
  }
  if (z.tipo === "pendenza") {
    const from = z.from;
    const to = z.to;
    if (!from || !to) return null;
    return {
      id,
      tipo: "pendenza",
      from: { lat: Number(from.lat), lng: Number(from.lng) },
      to: { lat: Number(to.lat), lng: Number(to.lng) },
    };
  }
  return null;
}

export function buildPratoZonePayload(poligono, zone) {
  return {
    version: 1,
    poligono: poligono.map((p) => ({ lat: p.lat, lng: p.lng })),
    zone: zone.map((z) => ({ ...z })),
  };
}

/** Stima % ombra sul prato (somma aree zone ombra / area prato, cap 100). */
export function computeOmbraZonePct(pratoZone) {
  const { poligono, zone } = normalizePratoZone(pratoZone);
  const lawnMq = calculatePolygonAreaSqm(poligono);
  if (lawnMq <= 0) return null;
  let ombraMq = 0;
  for (const z of zone) {
    if (z.tipo === "ombra") ombraMq += calculatePolygonAreaSqm(z.path);
  }
  if (ombraMq <= 0) return null;
  const pct = Math.min(100, Math.round((ombraMq / lawnMq) * 100));
  if (pct <= 12) return "0_25";
  if (pct <= 37) return "25_50";
  if (pct <= 62) return "50_75";
  return "75_100";
}

export function countZonesByType(pratoZone) {
  const { zone } = normalizePratoZone(pratoZone);
  const out = { irrigatore: 0, ombra: 0, muschio: 0, pendenza: 0, statico: 0, dinamico: 0 };
  for (const z of zone) {
    if (out[z.tipo] != null) out[z.tipo] += 1;
    if (z.tipo === "irrigatore") {
      if (z.modalita === "dinamico") out.dinamico += 1;
      else out.statico += 1;
    }
  }
  return out;
}

/**
 * Suggerimenti tempi irrigazione da mappa zone.
 * @param {{ pratoZone?: object, superficie_mq?: number, irrigazione?: string, month?: number }} opts
 */
export function suggestIrrigation({ pratoZone, superficie_mq, irrigazione, month = new Date().getMonth() + 1 }) {
  const { zone } = normalizePratoZone(pratoZone);
  const heads = zone.filter((z) => z.tipo === "irrigatore");
  const estate = month >= 5 && month <= 9;
  const primavera = month >= 3 && month <= 4;

  const perTesta = [];
  const suggerimenti = [];

  if (irrigazione === "pioggia") {
    suggerimenti.push("Profilo «quasi solo pioggia»: usa i tempi sotto solo in siccità prolungata.");
  }

  if (!heads.length) {
    suggerimenti.push("Segna gli irrigatori sulla mappa (statico o dinamico) per tempi su misura.");
    return { perTesta, suggerimenti, programmaSintesi: null };
  }

  let idxStatic = 0;
  let idxDyn = 0;

  for (const h of heads) {
    if (h.modalita === "dinamico") {
      idxDyn += 1;
      const min = estate ? 38 : primavera ? 25 : 18;
      perTesta.push({
        id: h.id,
        label: `Irrigatore dinamico ${idxDyn}`,
        modalita: "dinamico",
        minutiPerCiclo: min,
        frequenza: estate
          ? "2–3 passate/settimana (mattina 6–9)"
          : primavera
            ? "1–2 passate/settimana"
            : "1 passata/settimana se siccità",
        nota: "Rotativo/oscillante: una passata lunga; in vento forte riduci del 20%.",
      });
    } else {
      idxStatic += 1;
      const min = estate ? 16 : primavera ? 12 : 8;
      perTesta.push({
        id: h.id,
        label: `Irrigatore statico ${idxStatic}`,
        modalita: "statico",
        minutiPerCiclo: min,
        frequenza: estate
          ? "3–4 cicli/settimana (6–8, max 12 min per zona)"
          : primavera
            ? "2 cicli/settimana"
            : "1 ciclo/settimana o a bisogno",
        nota: "Getti fissi: cicli brevi; meglio aumentare la frequenza che i minuti.",
      });
    }
  }

  const nStatic = idxStatic;
  const nDyn = idxDyn;
  const minStaticTot = perTesta.filter((p) => p.modalita === "statico").reduce((a, p) => a + p.minutiPerCiclo, 0);
  const minDynTot = perTesta.filter((p) => p.modalita === "dinamico").reduce((a, p) => a + p.minutiPerCiclo, 0);

  if (nStatic && nDyn) {
    suggerimenti.push(
      `Hai ${nStatic} statici e ${nDyn} dinamici: avvia prima i statici (cicli brevi), poi il dinamico per le zone scoperte.`,
    );
  }
  if (estate && superficie_mq && superficie_mq > 200 && nStatic >= 3) {
    suggerimenti.push("Superficie ampia: considera irrigazione a zone alternate (metà teste per giorno).");
  }
  if (zone.some((z) => z.tipo === "ombra")) {
    suggerimenti.push("Zone in ombra segnate: riduci del 30–40% i minuti sui getti che le bagnano.");
  }

  const programmaSintesi =
    estate
      ? `Estate: ~${minStaticTot} min totali statici + ~${minDynTot} min dinamici per ciclo completo.`
      : `Stagione mite: ~${minStaticTot + minDynTot} min totali per ciclo.`;

  return { perTesta, suggerimenti, programmaSintesi };
}

export function formatZonesForPrompt(pratoZone) {
  const { zone } = normalizePratoZone(pratoZone);
  if (!zone.length) return null;
  const lines = [];
  const counts = countZonesByType(pratoZone);
  if (counts.irrigatore) {
    lines.push(
      `Irrigatori in mappa: ${counts.statico} statici, ${counts.dinamico} dinamici (rotativi/oscillanti).`,
    );
  }
  if (counts.ombra) lines.push(`Zone ombra disegnate: ${counts.ombra}.`);
  if (counts.muschio) lines.push(`Zone muschio/problema: ${counts.muschio}.`);
  if (counts.pendenza) lines.push(`Frecce pendenza/drenaggio: ${counts.pendenza}.`);
  return lines.join("\n");
}

export function formatIrrigationForPrompt(pratoZone, profilo) {
  const advice = suggestIrrigation({
    pratoZone,
    superficie_mq: profilo?.superficie_mq,
    irrigazione: profilo?.irrigazione,
  });
  if (!advice.perTesta.length && !advice.suggerimenti.length) return null;
  const lines = [];
  if (advice.programmaSintesi) lines.push(advice.programmaSintesi);
  for (const p of advice.perTesta) {
    lines.push(
      `${p.label} (${p.modalita}): ${p.minutiPerCiclo} min/ciclo, ${p.frequenza}. ${p.nota}`,
    );
  }
  for (const s of advice.suggerimenti) lines.push(s);
  return lines.join("\n");
}

