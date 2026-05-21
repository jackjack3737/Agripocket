export default function WeatherCard({ bundle, compact = false, zonaNome }) {
  if (!bundle?.current) return null;

  const temp = Math.round(bundle.current.main.temp);
  const desc = bundle.current.weather?.[0]?.description ?? "";
  const { advice, history, location, agronomic } = bundle;
  const ag = agronomic;

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
        <div className="weather-card__advice" style={{ borderColor: advice.color }}>
          <strong>{advice.status}</strong>
          <span>{advice.advice}</span>
        </div>
      </div>
      {ag ? (
        <p className="weather-card__agro">
          {ag.et0_mm_oggi != null ? `ET0 ${ag.et0_mm_oggi} mm/g` : null}
          {ag.gdd?.oggi != null ? ` · GDD oggi ${ag.gdd.oggi}` : null}
          {ag.gdd?.cumul_30g != null ? ` · GDD 30 gg ${ag.gdd.cumul_30g}` : null}
          {ag.soil_temperature_10cm_c != null
            ? ` · Suolo 10 cm ${ag.soil_temperature_10cm_c}°C`
            : null}
        </p>
      ) : null}
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
