import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { calcolaStatoClinico } from "../lib/statoClinico";
import { resolveSignedFotoFromAnalisi } from "../lib/fotoPrato";
import { getIrrigazioneCached, IRRIGAZIONE_REFRESH_EVENT } from "../lib/irrigazioneClient";
import { valutaAlertMeteoIrrigazione } from "../lib/meteoIrrigazioneAlert";

function parseVision(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseIrrigazioneProfilo(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function MeteoIrrigazioneAlerts({ alert, profile }) {
  if (!alert?.consiglia_irrigazione) return null;

  const irrigazioneAttiva = profile?.irrigazione && profile.irrigazione !== "pioggia";

  function scrollEAggiornaIrrigazione() {
    window.dispatchEvent(new CustomEvent(IRRIGAZIONE_REFRESH_EVENT));
    const el = document.getElementById("irrigazione-widget");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div
      className={`stato-clinico__alerts stato-clinico__alerts--${alert.livello}`}
      role="alert"
    >
      <p className="stato-clinico__alerts-title">Meteo aggiornato</p>
      <ul className="stato-clinico__alerts-motivi">
        {alert.motivi.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      {alert.ore_da_calcolo != null ? (
        <p className="stato-clinico__alerts-meta">
          Ultimo calcolo irrigazione: circa {alert.ore_da_calcolo} ore fa.
        </p>
      ) : null}
      <div className="stato-clinico__alerts-actions">
        {irrigazioneAttiva ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={scrollEAggiornaIrrigazione}>
            Aggiorna irrigazione
          </button>
        ) : null}
        {alert.consiglia_programma ? (
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={scrollEAggiornaIrrigazione}>
              Apri programma centralina
            </button>
            <Link className="btn btn-outline btn-sm" to="/calendario">
              Calendario lavori
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function StatoClinicoWidget({
  ultimaAnalisi,
  zonaNome,
  weather,
  userId,
  profile,
}) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [irrCacheTick, setIrrCacheTick] = useState(0);

  const vision = useMemo(
    () => parseVision(ultimaAnalisi?.vision_json),
    [ultimaAnalisi?.vision_json],
  );

  const stato = useMemo(
    () => calcolaStatoClinico({ vision, weather, agronomic: weather?.agronomic }),
    [vision, weather],
  );

  const irrigazioneProfilo = useMemo(
    () => parseIrrigazioneProfilo(profile?.irrigazione_oggi),
    [profile?.irrigazione_oggi],
  );

  const alertMeteo = useMemo(() => {
    if (!weather || profile?.irrigazione === "pioggia") return null;
    return valutaAlertMeteoIrrigazione({
      weather,
      irrigazioneUltima: getIrrigazioneCached(),
      irrigazioneProfilo,
    });
    // irrCacheTick: ricalcola dopo refresh irrigazione
  }, [weather, irrigazioneProfilo, profile?.irrigazione, irrCacheTick]);

  useEffect(() => {
    const onRefresh = () => setIrrCacheTick((n) => n + 1);
    window.addEventListener(IRRIGAZIONE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(IRRIGAZIONE_REFRESH_EVENT, onRefresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!ultimaAnalisi) {
      setThumbUrl(null);
      return;
    }
    resolveSignedFotoFromAnalisi(ultimaAnalisi).then((url) => {
      if (!cancelled) setThumbUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [ultimaAnalisi?.id, ultimaAnalisi?.foto_path, ultimaAnalisi?.foto_url, userId]);

  const dataLabel = ultimaAnalisi?.created_at
    ? new Date(ultimaAnalisi.created_at).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <section
      className={`dash-card stato-clinico stato-clinico--${stato.livello}`}
      aria-live="polite"
    >
      <div className="stato-clinico__header">
        <h2 className="stato-clinico__title">Stato clinico attuale</h2>
        <span className={`stato-clinico__semaforo stato-clinico__semaforo--${stato.livello}`}>
          <span className="stato-clinico__dot" aria-hidden />
          {stato.label}
        </span>
      </div>

      {alertMeteo ? <MeteoIrrigazioneAlerts alert={alertMeteo} profile={profile} /> : null}

      <div className="stato-clinico__body">
        <div className="stato-clinico__thumb">
          {thumbUrl ? (
            <img src={thumbUrl} alt="Ultima analisi foto prato" />
          ) : (
            <div className="stato-clinico__thumb-placeholder">
              <span>Nessuna foto</span>
              <Link to="/chat">Analizza</Link>
            </div>
          )}
        </div>
        <div className="stato-clinico__meta">
          <p>
            <strong>Zona:</strong> {zonaNome || "Prato principale"}
          </p>
          <p>
            <strong>Ultima analisi:</strong> {dataLabel}
          </p>
          <p className="stato-clinico__motivo">{stato.motivo}</p>
        </div>
      </div>
    </section>
  );
}
