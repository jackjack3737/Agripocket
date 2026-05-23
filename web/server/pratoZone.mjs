import { calculatePolygonAreaSqm } from "./polygonArea.mjs";

export const ZONE_TYPES = {
  irrigatore: { label: "Irrigatore", color: "#1565c0", fill: "#1565c0" },
  esposizione: { label: "Esposizione", color: "#f9a825", fill: "#ffee58" },
  muschio: { label: "Muschio", color: "#6d4c41", fill: "#6d4c41" },
  pendenza: { label: "Pendenza", color: "#ef6c00", fill: "#ef6c00" },
};

export const ESPOSIZIONE_LIVELLI = {
  sole: { label: "Sole", short: "S", color: "#f9a825", fill: "#fff59d", peso_ombra: 0 },
  mezzombra: { label: "Mezz'ombra", short: "M", color: "#607d8b", fill: "#b0bec5", peso_ombra: 0.5 },
  ombra: { label: "Ombra", short: "O", color: "#455a64", fill: "#455a64", peso_ombra: 1 },
};

export function normalizeEsposizioneLivello(raw) {
  const v = String(raw || "mezzombra").toLowerCase();
  if (v === "ombra" || v === "full") return "ombra";
  if (v === "sole" || v === "pieno" || v === "sun") return "sole";
  if (v === "mezzombra" || v === "mezzo" || v === "half") return "mezzombra";
  return "mezzombra";
}

export function pesoOmbraLivello(livello) {
  return ESPOSIZIONE_LIVELLI[normalizeEsposizioneLivello(livello)]?.peso_ombra ?? 0;
}

export function zoneEsposizioneEntries(zoneList) {
  const out = [];
  for (const z of zoneList || []) {
    if (z.tipo === "esposizione") {
      out.push({ id: z.id, path: z.path, livello: normalizeEsposizioneLivello(z.livello) });
    } else if (z.tipo === "ombra") {
      out.push({ id: z.id, path: z.path, livello: "ombra" });
    }
  }
  return out;
}

export const IRRIGATOR_MODES = {
  statico: { label: "Statico", short: "S", desc: "Getti fissi / pop-up" },
  rotator: { label: "Rotator", short: "R", desc: "Testina a settore rotante" },
  dinamico: { label: "Oscillante", short: "O", desc: "Irrigatore a banda / mammella" },
};

export function normalizeIrrigatorModalita(raw) {
  const v = String(raw || "statico").toLowerCase();
  if (v === "rotator" || v === "rotativo" || v === "testine") return "rotator";
  if (v === "dinamico" || v === "oscillante") return "dinamico";
  return "statico";
}

export const LINEA_CENTRALINA_MAX = 8;

export function normalizeLineaCentralina(raw) {
  const n = Math.round(Number(raw));
  if (n >= 1 && n <= LINEA_CENTRALINA_MAX) return n;
  return null;
}

function uid() {
  return `z_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizePolygonRing(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng ?? p.lon) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export function getLawnPolygons(pratoZone) {
  const z = normalizePratoZone(pratoZone);
  if (z.poligoni?.length) {
    return z.poligoni.filter((ring) => ring.length >= 3);
  }
  if (z.poligono.length >= 3) return [z.poligono];
  return [];
}

export function lawnAreaSqm(pratoZone) {
  return getLawnPolygons(pratoZone).reduce((s, ring) => s + calculatePolygonAreaSqm(ring), 0);
}

export function lawnCentroid(pratoZone) {
  const polys = getLawnPolygons(pratoZone);
  if (!polys.length) return null;
  let tLat = 0;
  let tLng = 0;
  let tArea = 0;
  for (const ring of polys) {
    const a = calculatePolygonAreaSqm(ring);
    if (a <= 0) continue;
    let lat = 0;
    let lng = 0;
    ring.forEach((p) => {
      lat += p.lat;
      lng += p.lng;
    });
    lat /= ring.length;
    lng /= ring.length;
    tLat += lat * a;
    tLng += lng * a;
    tArea += a;
  }
  if (tArea > 0) return { lat: tLat / tArea, lng: tLng / tArea };
  const flat = polys.flat();
  return {
    lat: flat.reduce((s, p) => s + p.lat, 0) / flat.length,
    lng: flat.reduce((s, p) => s + p.lng, 0) / flat.length,
  };
}

export function hasLawnContour(pratoZone) {
  return getLawnPolygons(pratoZone).length > 0;
}

function coercePratoZoneRaw(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return null;
}

/** @param {unknown} raw */
export function normalizePratoZone(raw) {
  const data = coercePratoZoneRaw(raw);
  if (!data) {
    return { version: 2, poligono: [], poligoni: [], zone: [] };
  }
  const zone = Array.isArray(data.zone) ? data.zone.map(normalizeZone).filter(Boolean) : [];

  let poligoni = [];
  if (Array.isArray(data.poligoni)) {
    poligoni = data.poligoni.map(normalizePolygonRing).filter((ring) => ring.length >= 3);
  }
  const legacy = normalizePolygonRing(data.poligono);
  if (!poligoni.length && legacy.length >= 3) {
    poligoni = [legacy];
  }
  const poligono = poligoni[0] || legacy || [];

  return { version: 2, poligono, poligoni, zone };
}

function normalizeZone(z) {
  if (!z?.tipo) return null;
  if (z.tipo === "ombra") z = { ...z, tipo: "esposizione", livello: "ombra" };
  if (!ZONE_TYPES[z.tipo]) return null;
  const id = z.id || uid();
  if (z.tipo === "irrigatore") {
    const lat = Number(z.lat);
    const lng = Number(z.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const modalita = normalizeIrrigatorModalita(z.modalita);
    const linea = normalizeLineaCentralina(z.linea) ?? 1;
    return { id, tipo: "irrigatore", lat, lng, modalita, linea };
  }
  if (z.tipo === "esposizione") {
    const path = (z.path || [])
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (path.length < 3) return null;
    return { id, tipo: "esposizione", livello: normalizeEsposizioneLivello(z.livello), path };
  }
  if (z.tipo === "muschio") {
    const path = (z.path || [])
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (path.length < 3) return null;
    return { id, tipo: "muschio", path };
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

export function buildPratoZonePayload(poligono, zone, poligoni = null) {
  const rings =
    poligoni?.length > 0
      ? poligoni.map((r) => r.map((p) => ({ lat: p.lat, lng: p.lng })))
      : poligono?.length >= 3
        ? [poligono.map((p) => ({ lat: p.lat, lng: p.lng }))]
        : [];
  return {
    version: 2,
    poligono: rings[0] || [],
    poligoni: rings,
    zone: zone.map((z) => ({ ...z })),
  };
}

/**
 * Aggiorna mappa: sostituisce le zone dei tipi indicati e opzionalmente il poligono.
 * @param {unknown} existing
 * @param {{ poligono?: {lat,lng}[], zones?: object[], replaceTypes?: string[] }} patch
 */
export function mergePratoZoneUpdate(existing, { poligono, poligoni, zones, replaceTypes = [] }) {
  const base = normalizePratoZone(existing);
  const types = new Set(replaceTypes);
  let merged = types.size
    ? base.zone.filter((z) => {
        if (types.has(z.tipo)) return false;
        if (types.has("esposizione") && z.tipo === "ombra") return false;
        return true;
      })
    : [...base.zone];
  if (zones?.length) merged = [...merged, ...zones.map((z) => ({ ...z }))];

  let nextPoligoni;
  if (Array.isArray(poligoni) && poligoni.length) {
    nextPoligoni = poligoni.map(normalizePolygonRing).filter((ring) => ring.length >= 3);
  } else if (poligono?.length >= 3) {
    nextPoligoni = [normalizePolygonRing(poligono)];
  } else {
    nextPoligoni = getLawnPolygons(base);
  }

  return {
    version: 2,
    poligono: (nextPoligoni[0] || []).map((p) => ({ lat: p.lat, lng: p.lng })),
    poligoni: nextPoligoni.map((ring) => ring.map((p) => ({ lat: p.lat, lng: p.lng }))),
    zone: merged,
  };
}

export function computeEsposizioneWeightedPct(pratoZone) {
  const { zone } = normalizePratoZone(pratoZone);
  const lawnMq = lawnAreaSqm(pratoZone);
  if (lawnMq <= 0) return 0;
  let weighted = 0;
  for (const e of zoneEsposizioneEntries(zone)) {
    weighted += calculatePolygonAreaSqm(e.path) * pesoOmbraLivello(e.livello);
  }
  return Math.min(100, Math.round((weighted / lawnMq) * 100));
}

export function computeOmbraZonePct(pratoZone) {
  const pct = computeEsposizioneWeightedPct(pratoZone);
  if (pct <= 0) return null;
  if (pct <= 12) return "0_25";
  if (pct <= 37) return "25_50";
  if (pct <= 62) return "50_75";
  return "75_100";
}

export function computeOmbraZoneAreas(pratoZone) {
  const { zone } = normalizePratoZone(pratoZone);
  const lawnMq = lawnAreaSqm(pratoZone);
  if (lawnMq <= 0) return null;

  const zones = [];
  let totalMq = 0;
  for (const e of zoneEsposizioneEntries(zone)) {
    if (e.livello === "sole") continue;
    const mq = calculatePolygonAreaSqm(e.path);
    if (mq < 0.5) continue;
    const info = ESPOSIZIONE_LIVELLI[e.livello];
    totalMq += mq;
    zones.push({
      id: e.id,
      label: info?.label || e.livello,
      livello: e.livello,
      mq: Math.round(mq * 10) / 10,
      pctOfLawn: Math.round((mq / lawnMq) * 100),
    });
  }
  if (totalMq <= 0) return null;

  return {
    lawnMq: Math.round(lawnMq * 10) / 10,
    totalMq: Math.round(totalMq * 10) / 10,
    pctTotal: Math.min(100, Math.round((totalMq / lawnMq) * 100)),
    pctOmbraPesata: computeEsposizioneWeightedPct(pratoZone),
    zones,
  };
}

export function computeOmbraZonePctNumeric(pratoZone) {
  return computeEsposizioneWeightedPct(pratoZone);
}

const PENDENZA_VICINANZA_M = 12;

function pointInPolygon(lat, lng, path) {
  if (!path?.length) return false;
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const yi = path[i].lat;
    const xi = path[i].lng;
    const yj = path[j].lat;
    const xj = path[j].lng;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = p2 - p1;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function distanzaPuntoSegmentoM(lat, lng, latA, lngA, latB, lngB) {
  const lat0 = (latA + latB) / 2;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ax = lngA * mPerDegLng;
  const ay = latA * mPerDegLat;
  const bx = lngB * mPerDegLng;
  const by = latB * mPerDegLat;
  const px = lng * mPerDegLng;
  const py = lat * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return haversineM(lat, lng, latA, lngA);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return haversineM(lat, lng, qy / mPerDegLat, qx / mPerDegLng);
}

export function livelloEsposizioneAtPoint(lat, lng, zoneList) {
  for (const e of zoneEsposizioneEntries(zoneList)) {
    if (pointInPolygon(lat, lng, e.path)) return e.livello;
  }
  return null;
}

function pendenzaDaNumeroFrecce(n) {
  if (n >= 3) return "forte";
  if (n >= 2) return "media";
  if (n >= 1) return "leggera";
  return null;
}

/** Contesto irrigazione da zone disegnate (ombra, pendenza, posizione teste). */
export function analizzaContestoIrrigazioneMappa(pratoZone) {
  const { zone } = normalizePratoZone(pratoZone);
  const esposizione = zoneEsposizioneEntries(zone);
  const pendenzaSegs = zone.filter((z) => z.tipo === "pendenza");
  const heads = zone.filter((z) => z.tipo === "irrigatore");

  const areas = computeOmbraZoneAreas(pratoZone);
  const pct_ombra_prato = computeEsposizioneWeightedPct(pratoZone);

  const teste = heads.map((h) => {
    const livello = livelloEsposizioneAtPoint(h.lat, h.lng, zone);
    const peso_ombra = livello != null ? pesoOmbraLivello(livello) : 0;
    const vicino_pendenza = pendenzaSegs.some(
      (seg) =>
        distanzaPuntoSegmentoM(h.lat, h.lng, seg.from.lat, seg.from.lng, seg.to.lat, seg.to.lng) <=
        PENDENZA_VICINANZA_M,
    );
    return {
      id: h.id,
      linea: h.linea ?? 1,
      modalita: h.modalita,
      livello_esposizione: livello,
      peso_ombra,
      in_ombra: livello === "ombra",
      in_mezzombra: livello === "mezzombra",
      vicino_pendenza,
    };
  });

  const num_pendenza = pendenzaSegs.length;

  return {
    pct_ombra_prato,
    ombra_zone: areas?.zones ?? [],
    esposizione_zone: esposizione.map((e) => ({
      id: e.id,
      livello: e.livello,
      label: ESPOSIZIONE_LIVELLI[e.livello]?.label,
    })),
    num_pendenza,
    pendenza_da_mappa: pendenzaDaNumeroFrecce(num_pendenza),
    teste,
    teste_by_id: Object.fromEntries(teste.map((t) => [t.id, t])),
    num_teste_in_ombra: teste.filter((t) => t.in_ombra).length,
    num_teste_in_mezzombra: teste.filter((t) => t.in_mezzombra).length,
    num_teste_vicino_pendenza: teste.filter((t) => t.vicino_pendenza).length,
    ha_zone_ombra: esposizione.length > 0,
    ha_pendenza_mappa: num_pendenza > 0,
  };
}

export function raccomandazioneMiscelaOmbra(pctOmbra, ombraZonePct) {
  const bucket =
    ombraZonePct || (pctOmbra >= 60 ? "75_100" : pctOmbra >= 35 ? "50_75" : pctOmbra >= 15 ? "25_50" : "0_25");

  if (bucket === "75_100" || pctOmbra >= 55) {
    return {
      miscela: "Poa supina + Festuca rubra trapezifera",
      specie: ["Poa supina", "Festuca rubra trapezifera"],
      gPerMq: 45,
      nota: "Ombra intensa: evitare Lolium perenne dominante; preferire specie da tappeto ombreggiato.",
    };
  }
  if (bucket === "50_75" || pctOmbra >= 30) {
    return {
      miscela: "Poa trivialis + Festuca rubra",
      specie: ["Poa trivialis", "Festuca rubra"],
      gPerMq: 40,
      nota: "Mezzombra: miscela resistente con Poa trivialis per recupero zone poco soleggiate.",
    };
  }
  return {
    miscela: "Festuca rubra + Poa trivialis (ombre leggere)",
    specie: ["Festuca rubra", "Poa trivialis"],
    gPerMq: 35,
    nota: "Ombra parziale: rinforzo con specie tolleranti; integrare dove il tappeto dirada.",
  };
}

export function suggestOmbraSeed(pratoZone, opts = {}) {
  const areas = computeOmbraZoneAreas(pratoZone);
  if (!areas) return null;

  const rec = raccomandazioneMiscelaOmbra(areas.pctTotal, opts.ombra_zone_pct);
  const grammi = Math.round(areas.totalMq * rec.gPerMq);
  const kg = Math.round((grammi / 1000) * 10) / 10;

  const catalogo = (opts.prodottiCatalogo || []).filter(
    (p) =>
      String(p.categoria || "").toUpperCase() === "SEMENTI" &&
      /ombra|shade|trivialis|supina|mezzombra|royal|ombreggiat/i.test(
        `${p.nome || ""} ${p.descrizione || ""}`,
      ),
  );

  const prodottiSuggeriti = catalogo.slice(0, 4).map((p) => ({ id: p.id, nome: p.nome }));

  return {
    ...areas,
    ...rec,
    grammi,
    kg,
    doseLabel: `${grammi} g (${kg} kg) per ${areas.totalMq} m² in ombra`,
    prodottiSuggeriti,
    finestre: ["marzo–aprile", "settembre (se temperature miti)"],
  };
}

export function formatOmbraSeedForPrompt(pratoZone, profilo) {
  const seed = suggestOmbraSeed(pratoZone, {
    ombra_zone_pct: profilo?.ombra_zone_pct,
    prodottiCatalogo: profilo?._prodottiCatalogo,
  });
  if (!seed) return null;

  const lines = [
    `Zone ombra in mappa: ${seed.totalMq} m² (${seed.pctTotal}% del prato, ${seed.zones.length} area/e).`,
    `Overseeding consigliato: ${seed.miscela} — ${seed.doseLabel} a ${seed.gPerMq} g/m².`,
    seed.nota,
    `Finestre: ${seed.finestre.join(", ")}.`,
  ];
  if (seed.prodottiSuggeriti.length) {
    lines.push(`Sementi catalogo idonee ombra: ${seed.prodottiSuggeriti.map((p) => p.nome).join("; ")}.`);
  }
  for (const z of seed.zones) {
    const zg = Math.round(z.mq * seed.gPerMq);
    lines.push(`  · ${z.label}: ${z.mq} m² → ~${zg} g seme.`);
  }
  return lines.join("\n");
}

export function ensureOmbraOverseedInterventi(interventi, pratoZone, profilo, oggi, addDays) {
  const seed = suggestOmbraSeed(pratoZone, { ombra_zone_pct: profilo?.ombra_zone_pct });
  if (!seed || seed.totalMq < 1) return interventi;

  const blob = (i) => `${i.titolo} ${i.descrizione}`.toLowerCase();
  const has = interventi.some(
    (i) =>
      i.categoria === "rinnovo" &&
      /ombra|overseed|rinnovo.*ombra|seme.*ombra|trivialis|supina/.test(blob(i)),
  );
  if (has) return interventi;

  const m = new Date(`${oggi}T12:00:00`).getMonth() + 1;
  let data = oggi;
  if (m > 4 && m < 9) data = addDays(oggi, 14);
  else if (m >= 9) data = addDays(oggi, 21);

  const prodHint =
    seed.prodottiSuggeriti.length > 0
      ? ` Prodotti catalogo: ${seed.prodottiSuggeriti.map((p) => p.nome).join(", ")}.`
      : "";

  return [
    ...interventi,
    {
      titolo: "Arieggiatura leggera pre-overseeding (zone ombra)",
      descrizione:
        "Scarifica/arieggiatura superficiale sulle zone ombra prima della semina, per migliorare il contatto seme-terreno.",
      priorita: seed.pctTotal >= 40 ? "alta" : "media",
      categoria: "arieggiatura",
      data_prevista: data,
      ordine: 4199,
    },
    {
      titolo: `Overseeding zone ombra (${seed.totalMq} m²)`,
      descrizione: [
        `Rinnovo mirato sulle ${seed.zones.length} zone in ombra (${seed.totalMq} m², ${seed.pctTotal}% prato).`,
        `Miscela: ${seed.miscela}. Quantità: ${seed.doseLabel} (${seed.gPerMq} g/m²).`,
        `Preparare il letto (scarifica leggera), semina a secco, irrigazione leggera e frequente 2–3 settimane.`,
        seed.nota + prodHint,
      ].join(" "),
      priorita: seed.pctTotal >= 40 ? "alta" : "media",
      categoria: "rinnovo",
      data_prevista: data,
      ordine: 4200,
    },
  ].sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || (a.ordine ?? 0) - (b.ordine ?? 0));
}

export function countZonesByType(pratoZone) {
  const { zone } = normalizePratoZone(pratoZone);
  const out = {
    irrigatore: 0,
    esposizione: 0,
    esposizione_sole: 0,
    esposizione_mezzombra: 0,
    esposizione_ombra: 0,
    muschio: 0,
    pendenza: 0,
    statico: 0,
    rotator: 0,
    dinamico: 0,
  };
  for (const z of zone) {
    if (z.tipo === "esposizione") {
      out.esposizione += 1;
      if (z.livello === "sole") out.esposizione_sole += 1;
      else if (z.livello === "ombra") out.esposizione_ombra += 1;
      else out.esposizione_mezzombra += 1;
    } else if (out[z.tipo] != null) out[z.tipo] += 1;
    if (z.tipo === "irrigatore") {
      if (z.modalita === "rotator") out.rotator += 1;
      else if (z.modalita === "dinamico") out.dinamico += 1;
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
  const zoneCounts = countZonesByType(pratoZone);
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
  if (zoneCounts.esposizione) {
    suggerimenti.push(
      `Esposizione in mappa: ${zoneCounts.esposizione_sole} sole, ${zoneCounts.esposizione_mezzombra} mezz'ombra, ${zoneCounts.esposizione_ombra} ombra.`,
    );
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
    const heads = zone.filter((z) => z.tipo === "irrigatore");
    const perLinea = new Map();
    for (const h of heads) {
      const L = h.linea ?? 1;
      if (!perLinea.has(L)) perLinea.set(L, []);
      perLinea.get(L).push(h);
    }
    const uscite = [...perLinea.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([L, teste]) => {
        const tipi = [...new Set(teste.map((t) => IRRIGATOR_MODES[t.modalita]?.label || t.modalita))];
        return `uscita ${L} (${teste.length} teste, ${tipi.join(" + ")})`;
      });
    lines.push(
      `Irrigatori: ${counts.statico} statici, ${counts.rotator} rotator, ${counts.dinamico} oscillanti; centralina: ${uscite.join("; ")}.`,
    );
  }
  if (counts.esposizione) {
    const areas = computeOmbraZoneAreas(pratoZone);
    const pesata = computeEsposizioneWeightedPct(pratoZone);
    lines.push(
      areas
        ? `Esposizione: ${counts.esposizione} aree (sole ${counts.esposizione_sole}, mezz'ombra ${counts.esposizione_mezzombra}, ombra ${counts.esposizione_ombra}); ombra pesata ~${pesata}%.`
        : `Esposizione: ${counts.esposizione} aree disegnate.`,
    );
  }
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

