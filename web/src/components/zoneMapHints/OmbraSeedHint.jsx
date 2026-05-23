import { Link } from "react-router-dom";
import { suggestOmbraSeed } from "../../lib/pratoZone";

export default function OmbraSeedHint({ profile }) {
  const seed = suggestOmbraSeed(profile?.prato_zone, { ombra_zone_pct: profile?.ombra_zone_pct });

  if (!seed) {
    return (
      <div className="zone-hint zone-hint--ombra">
        <p className="zone-hint__lead">
          Disegna le aree in mappa e indica sole, mezz&apos;ombra o ombra: qui comparirà la miscela e la
          dose di seme per il rinnovo mirato.
        </p>
      </div>
    );
  }

  return (
    <div className="zone-hint zone-hint--ombra">
      <p className="zone-hint__lead">
        Calcolo da mappa: <strong>{seed.totalMq} m²</strong> in ombra ({seed.pctTotal}% del prato,{" "}
        {seed.zones.length} {seed.zones.length === 1 ? "area" : "aree"}).
      </p>
      <p>
        <strong>Miscela consigliata:</strong> {seed.miscela}
      </p>
      <p>
        <strong>Quantità:</strong> {seed.doseLabel} — {seed.gPerMq} g/m²
      </p>
      <p className="zone-hint__note">{seed.nota}</p>
      <p className="zone-hint__meta">Finestre: {seed.finestre.join(" · ")}</p>
      {seed.zones.length > 0 ? (
        <ul className="zone-hint__list">
          {seed.zones.map((z) => (
            <li key={z.id}>
              {z.label}: {z.mq} m² → ~{Math.round(z.mq * seed.gPerMq)} g seme
            </li>
          ))}
        </ul>
      ) : null}
      {seed.prodottiSuggeriti?.length > 0 ? (
        <p className="zone-hint__meta">In catalogo: {seed.prodottiSuggeriti.map((p) => p.nome).join(", ")}</p>
      ) : null}
      <p className="zone-hint__foot">
        <Link to="/calendario">Rigenera il calendario</Link> per inserire l&apos;overseeding nelle date migliori.
      </p>
    </div>
  );
}
