import { analizzaContestoIrrigazioneMappa, countZonesByType } from "../../lib/pratoZone";

const PENDENZA_LABEL = {
  leggera: "leggera",
  media: "media",
  forte: "marcata",
};

export default function PendenzaHint({ profile }) {
  const pratoZone = profile?.prato_zone;
  const counts = countZonesByType(pratoZone);
  const ctx = analizzaContestoIrrigazioneMappa(pratoZone);

  if (!counts.pendenza) {
    return (
      <div className="zone-hint zone-hint--pendenza">
        <p className="zone-hint__lead">
          Traccia una o più <strong>frecce</strong> nel verso in cui scende l&apos;acqua (dal punto alto verso il
          basso). Serve per drenaggio, irrigazione e avvisi di ristagno.
        </p>
      </div>
    );
  }

  const grado = ctx.pendenza_da_mappa || "leggera";
  const gradoLabel = PENDENZA_LABEL[grado] || grado;

  return (
    <div className="zone-hint zone-hint--pendenza">
      <p className="zone-hint__lead">
        <strong>{counts.pendenza}</strong> {counts.pendenza === 1 ? "freccia" : "frecce"} di pendenza — grado stimato:{" "}
        <strong>{gradoLabel}</strong>.
      </p>
      <p className="zone-hint__note">
        L&apos;acqua tende a scorrere lungo il senso delle frecce: evita ristagni a valle e irrigazioni troppo lunghe
        in discesa.
      </p>
      {ctx.num_teste_vicino_pendenza > 0 ? (
        <p className="zone-hint__meta">
          {ctx.num_teste_vicino_pendenza} irrigatori entro ~12 m da una freccia: programma con passate più corte e
          pause (cycle-soak).
        </p>
      ) : (
        <p className="zone-hint__meta">Nessun irrigatore ancora segnato vicino alle frecce.</p>
      )}
      <p className="zone-hint__foot">
        In caso di piogge intense controlla le zone a valle; valuta scarifica o drenaggi se l&apos;acqua resta ferma.
      </p>
    </div>
  );
}
