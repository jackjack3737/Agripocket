import {
  analizzaContestoIrrigazioneMappa,
  countZonesByType,
  IRRIGATOR_MODES,
  normalizePratoZone,
  suggestIrrigation,
} from "../../lib/pratoZone";

export default function IrrigatoriHint({ profile }) {
  const pratoZone = profile?.prato_zone;
  const counts = countZonesByType(pratoZone);
  const { zone } = normalizePratoZone(pratoZone);
  const heads = zone.filter((z) => z.tipo === "irrigatore");

  if (!counts.irrigatore) {
    return (
      <div className="zone-hint zone-hint--irrigatore">
        <p className="zone-hint__lead">
          Segna ogni getto sulla mappa: statico, rotator o oscillante. Assegna la <strong>linea centralina</strong>{" "}
          (Linea 1, 2…) per il programma giornaliero.
        </p>
      </div>
    );
  }

  const perLinea = new Map();
  for (const h of heads) {
    const L = h.linea ?? 1;
    if (!perLinea.has(L)) perLinea.set(L, []);
    perLinea.get(L).push(h);
  }

  const ctx = analizzaContestoIrrigazioneMappa(pratoZone);
  const advice = suggestIrrigation({
    pratoZone,
    superficie_mq: profile?.superficie_mq,
    irrigazione: profile?.irrigazione,
  });

  return (
    <div className="zone-hint zone-hint--irrigatore">
      <p className="zone-hint__lead">
        <strong>{counts.irrigatore}</strong> irrigatori in mappa: {counts.statico} statici, {counts.rotator}{" "}
        rotator, {counts.dinamico} oscillanti.
      </p>
      <ul className="zone-hint__list">
        {[...perLinea.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([linea, teste]) => {
            const tipi = [...new Set(teste.map((t) => IRRIGATOR_MODES[t.modalita]?.label || t.modalita))];
            return (
              <li key={linea}>
                <strong>Linea {linea}</strong> — {teste.length} teste ({tipi.join(", ")})
              </li>
            );
          })}
      </ul>
      {ctx.num_teste_vicino_pendenza > 0 ? (
        <p className="zone-hint__note">
          {ctx.num_teste_vicino_pendenza} teste vicino a frecce di pendenza: il motore applica cicli più brevi
          (cycle-soak).
        </p>
      ) : null}
      {ctx.pct_ombra_prato > 0 ? (
        <p className="zone-hint__note">
          Ombra pesata sul prato ~{ctx.pct_ombra_prato}%: i minuti per linea tengono conto delle teste in sole /
          mezz&apos;ombra / ombra.
        </p>
      ) : null}
      {advice.programmaSintesi ? <p className="zone-hint__meta">{advice.programmaSintesi}</p> : null}
      {advice.suggerimenti.slice(0, 3).map((s, i) => (
        <p key={i} className="zone-hint__meta">
          {s}
        </p>
      ))}
      <p className="zone-hint__foot">Apri la mappa per aggiungere o spostare i getti, poi usa il widget Irrigazione.</p>
    </div>
  );
}
