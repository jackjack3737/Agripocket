export default function WeatherCard({ bundle, compact = false }) {
  if (!bundle?.current) return null;

  const temp = Math.round(bundle.current.main.temp);
  const desc = bundle.current.weather?.[0]?.description ?? "";
  const { advice, history, location } = bundle;

  return (
    <section className={`weather-card${compact ? " weather-card--compact" : ""}`}>
      <div className="weather-card__main">
        <div>
          <p className="weather-card__label">Meteo · {location}</p>
          <p className="weather-card__temp">{temp}°C</p>
          <p className="weather-card__desc">{desc}</p>
        </div>
        <div className="weather-card__advice" style={{ borderColor: advice.color }}>
          <strong>{advice.status}</strong>
          <span>{advice.advice}</span>
        </div>
      </div>
      {history ? (
        <p className="weather-card__history">
          Ultimi {history.days} giorni: {history.minAbs.toFixed(0)}–{history.maxAbs.toFixed(0)}°C
          {history.frostDays > 0 ? ` · ${history.frostDays} giorni con gelo` : ""}
          {history.hotDays > 0 ? ` · ${history.hotDays} giorni oltre 30°C` : ""}
          {history.rainyDays > 0 ? ` · ${history.rainyDays} giorni di pioggia` : ""}
        </p>
      ) : null}
    </section>
  );
}
