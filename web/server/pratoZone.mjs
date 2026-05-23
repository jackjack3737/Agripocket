import { calculatePolygonAreaSqm } from "./polygonArea.mjs";

export const ZONE_TYPES = {
  irrigatore: { label: "Irrigatore", color: "#1565c0", fill: "#1565c0" },
  ombra: { label: "Ombra", color: "#455a64", fill: "#455a64" },
  muschio: { label: "Muschio", color: "#6d4c41", fill: "#6d4c41" },
  pendenza: { label: "Pendenza", color: "#ef6c00", fill: "#ef6c00" },
};

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
    const modalita = normalizeIrrigatorModalita(z.modalita);
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

/**
 * Aggiorna mappa: sostituisce le zone dei tipi indicati e opzionalmente il poligono.
 * @param {unknown} existing
 * @param {{ poligono?: {lat,lng}[], zones?: object[], replaceTypes?: string[] }} patch
 */
export function mergePratoZoneUpdate(existing, { poligono, zones, replaceTypes = [] }) {
  const base = normalizePratoZone(existing);
  const types = new Set(replaceTypes);
  let merged = types.size ? base.zone.filter((z) => !types.has(z.tipo)) : [...base.zone];
  if (zones?.length) merged = [...merged, ...zones.map((z) => ({ ...z }))];
  return {
    version: 1,
    poligono: (poligono?.length ? poligono : base.poligono).map((p) => ({
      lat: p.lat,
      lng: p.lng,
    })),
    zone: merged,
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

export function computeOmbraZoneAreas(pratoZone) {
  const { poligono, zone } = normalizePratoZone(pratoZone);
  const lawnMq = calculatePolygonAreaSqm(poligono);
  if (lawnMq <= 0) return null;

  const zones = [];
  let totalMq = 0;
  let idx = 0;
  for (const z of zone) {
    if (z.tipo !== "ombra") continue;
    const mq = calculatePolygonAreaSqm(z.path);
    if (mq < 0.5) continue;
    idx += 1;
    totalMq += mq;
    zones.push({
      id: z.id,
      label: `Zona ombra ${idx}`,
      mq: Math.round(mq * 10) / 10,
      pctOfLawn: Math.round((mq / lawnMq) * 100),
    });
  }
  if (totalMq <= 0) return null;

  return {
    lawnMq: Math.round(lawnMq * 10) / 10,
    totalMq: Math.round(totalMq * 10) / 10,
    pctTotal: Math.min(100, Math.round((totalMq / lawnMq) * 100)),
    zones,
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
  const out = { irrigatore: 0, ombra: 0, muschio: 0, pendenza: 0, statico: 0, rotator: 0, dinamico: 0 };
  for (const z of zone) {
    if (out[z.tipo] != null) out[z.tipo] += 1;
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
  if (counts.ombra) {
    const areas = computeOmbraZoneAreas(pratoZone);
    lines.push(
      areas
        ? `Zone ombra: ${counts.ombra} poligoni, ${areas.totalMq} m² (${areas.pctTotal}% prato).`
        : `Zone ombra disegnate: ${counts.ombra}.`,
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

