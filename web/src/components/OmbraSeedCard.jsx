import { suggestOmbraSeed } from "../lib/pratoZone";

export default function OmbraSeedCard({ profile }) {
  const seed = suggestOmbraSeed(profile?.prato_zone, { ombra_zone_pct: profile?.ombra_zone_pct });
  if (!seed) return null;

  return (
    <section className="dash-card dash-card--ombra-seed">
      <h2 className="dash-card__title">Seme per zone ombra</h2>
      <p className="dash-card__sub">
        Calcolo da mappa: {seed.totalMq} m² in ombra ({seed.pctTotal}% del prato, {seed.zones.length}{" "}
        {seed.zones.length === 1 ? "area" : "aree"}).
      </p>

      <p className="ombra-seed__miscela">
        <strong>Miscela consigliata:</strong> {seed.miscela}
      </p>
      <p className="ombra-seed__dose">
        <strong>Quantità:</strong> {seed.doseLabel} — {seed.gPerMq} g/m²
      </p>
      <p className="ombra-seed__note">{seed.nota}</p>
      <p className="ombra-seed__finestre">
        Finestre: {seed.finestre.join(" · ")}
      </p>

      {seed.zones.length > 1 ? (
        <ul className="ombra-seed__zones">
          {seed.zones.map((z) => (
            <li key={z.id}>
              {z.label}: {z.mq} m² → ~{Math.round(z.mq * seed.gPerMq)} g seme
            </li>
          ))}
        </ul>
      ) : null}

      {seed.prodottiSuggeriti?.length > 0 ? (
        <p className="ombra-seed__catalog">
          In catalogo: {seed.prodottiSuggeriti.map((p) => p.nome).join(", ")}
        </p>
      ) : null}

      <p className="ombra-seed__hint">
        Rigenera il calendario per inserire l&apos;overseeding nelle date migliori.
      </p>
    </section>
  );
}
