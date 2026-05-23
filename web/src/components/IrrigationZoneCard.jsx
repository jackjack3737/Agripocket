import { countZonesByType, normalizePratoZone } from "../lib/pratoZone";

/** Riepilogo linee centralina in mappa (senza elenco singoli getti). */
function riepilogoLinee(pratoZone) {
  const { zone } = normalizePratoZone(pratoZone);
  const byLinea = new Map();
  for (const z of zone) {
    if (z.tipo !== "irrigatore") continue;
    const L = z.linea ?? 1;
    if (!byLinea.has(L)) byLinea.set(L, { n: 0, statico: 0, rotator: 0, dinamico: 0 });
    const row = byLinea.get(L);
    row.n += 1;
    if (z.modalita === "rotator") row.rotator += 1;
    else if (z.modalita === "dinamico") row.dinamico += 1;
    else row.statico += 1;
  }
  return [...byLinea.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([linea, c]) => {
      const tipi = [];
      if (c.statico) tipi.push(`${c.statico} stat.`);
      if (c.rotator) tipi.push(`${c.rotator} rot.`);
      if (c.dinamico) tipi.push(`${c.dinamico} osc.`);
      return { linea, n: c.n, label: tipi.join(", ") };
    });
}

export default function IrrigationZoneCard({ profile }) {
  const pratoZone = profile?.prato_zone;
  if (!pratoZone) return null;

  const counts = countZonesByType(pratoZone);
  const linee = riepilogoLinee(pratoZone);

  if (!counts.irrigatore) return null;

  return (
    <div className="irrigation-zone irrigation-zone--compact">
      <p className="irrigation-zone__hint">
        {linee.length} uscit{linee.length === 1 ? "a" : "e"} in mappa · programma giornaliero nel riquadro
        irrigazione sopra.
      </p>
      <ul className="irrigation-zone__lines">
        {linee.map((l) => (
          <li key={l.linea}>
            <strong>Linea {l.linea}</strong>
            <span>
              {l.n} gett{l.n === 1 ? "o" : "i"}
              {l.label ? ` (${l.label})` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
