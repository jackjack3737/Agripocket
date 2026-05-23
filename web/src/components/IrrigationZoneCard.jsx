import { Link } from "react-router-dom";
import { suggestIrrigation, countZonesByType } from "../lib/pratoZone";

export default function IrrigationZoneCard({ profile, hideEditLink = false }) {
  const pratoZone = profile?.prato_zone;
  if (!pratoZone) return null;

  const counts = countZonesByType(pratoZone);
  const advice = suggestIrrigation({
    pratoZone,
    superficie_mq: profile?.superficie_mq,
    irrigazione: profile?.irrigazione,
  });

  if (!counts.irrigatore && !advice.suggerimenti.length) return null;

  return (
    <section className="dash-card dash-card--irrigation">
      <h2 className="dash-card__title">Irrigazione da mappa</h2>
      <p className="dash-card__sub">
        Tempi stimati da irrigatori segnati ({counts.statico} statici, {counts.rotator} rotator, {counts.dinamico}{" "}
        oscillanti).
      </p>
      {advice.programmaSintesi ? <p className="irrigation-zone__summary">{advice.programmaSintesi}</p> : null}
      {advice.perTesta.length > 0 ? (
        <ul className="irrigation-zone__list">
          {advice.perTesta.map((p) => (
            <li key={p.id}>
              <strong>{p.label}</strong>
              <span className={`irrigation-zone__badge irrigation-zone__badge--${p.modalita}`}>
                {p.modalita}
              </span>
              <p className="irrigation-zone__meta">
                {p.minutiPerCiclo} min per ciclo · {p.frequenza}
              </p>
              <p className="irrigation-zone__note">{p.nota}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {advice.suggerimenti.map((s, i) => (
        <p key={i} className="irrigation-zone__hint">
          {s}
        </p>
      ))}
      {!hideEditLink ? (
        <Link className="btn btn-outline btn-sm dash-card__cta" to="/onboarding">
          Modifica mappa zone
        </Link>
      ) : null}
    </section>
  );
}
