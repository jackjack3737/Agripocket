import { useMemo, useState } from "react";
import { buildMeteoMetriche } from "../lib/meteoSpiegazioni";

function MeteoMetricPanel({ metric, onClose }) {
  if (!metric) return null;
  return (
    <div className="weather-card__panel" role="region" aria-labelledby={`meteo-metric-${metric.id}`}>
      <div className="weather-card__panel-head">
        <h3 id={`meteo-metric-${metric.id}`} className="weather-card__panel-title">
          {metric.titolo}
        </h3>
        <button type="button" className="weather-card__panel-close" onClick={onClose} aria-label="Chiudi spiegazione">
          ×
        </button>
      </div>
      <p className="weather-card__panel-cosa">{metric.cosa}</p>
      <p className="weather-card__panel-sub">Perché conta</p>
      <ul className="weather-card__panel-list">
        {(metric.perche || []).map((t, i) => (
          <li key={`p-${i}`}>{t}</li>
        ))}
      </ul>
      <p className="weather-card__panel-sub">In pratica sul prato</p>
      <ul className="weather-card__panel-list">
        {(metric.pratica || []).map((t, i) => (
          <li key={`m-${i}`}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function WeatherCard({ bundle, compact = false, zonaNome }) {
  const [activeId, setActiveId] = useState(null);

  const metriche = useMemo(() => buildMeteoMetriche(bundle), [bundle]);
  const active = metriche.find((m) => m.id === activeId) ?? null;

  if (!bundle?.current) return null;

  const temp = Math.round(bundle.current.main.temp);
  const desc = bundle.current.weather?.[0]?.description ?? "";
  const { advice, location } = bundle;

  function toggleMetric(id) {
    setActiveId((prev) => (prev === id ? null : id));
  }

  return (
    <section className={`weather-card${compact ? " weather-card--compact" : ""}`}>
      <div className="weather-card__main">
        <div>
          <p className="weather-card__label">
            Meteo · {location}
            {zonaNome ? ` · ${zonaNome}` : ""}
          </p>
          <p className="weather-card__temp">{temp}°C</p>
          <p className="weather-card__desc">{desc}</p>
        </div>
        {advice ? (
          <div className="weather-card__advice" style={{ borderColor: advice.color }}>
            <strong>{advice.status}</strong>
            <span>{advice.advice}</span>
          </div>
        ) : null}
      </div>

      {metriche.length ? (
        <>
          <p className="weather-card__metrics-hint">Tocca un indicatore per la spiegazione</p>
          <div className="weather-card__metrics" role="group" aria-label="Indicatori meteo agronomici">
            {metriche.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`weather-card__metric${activeId === m.id ? " weather-card__metric--on" : ""}`}
                onClick={() => toggleMetric(m.id)}
                aria-expanded={activeId === m.id}
                aria-controls={activeId === m.id ? `meteo-panel-${m.id}` : undefined}
              >
                <span className="weather-card__metric-label">{m.label}</span>
                <span className="weather-card__metric-value">{m.valore}</span>
              </button>
            ))}
          </div>
          {active ? (
            <div id={`meteo-panel-${active.id}`}>
              <MeteoMetricPanel metric={active} onClose={() => setActiveId(null)} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
