import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { calcolaStatoClinico } from "../lib/statoClinico";
import { resolveSignedFotoFromAnalisi } from "../lib/fotoPrato";
import {
  fetchIrrigazioneGiornaliera,
  getIrrigazioneCached,
  IRRIGAZIONE_REFRESH_EVENT,
} from "../lib/irrigazioneClient";
import { adattaCalendarioMeteo } from "../lib/calendarioMeteoClient";
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

function MeteoConsigliPanel({ alert, profile, onIrrigazioneAggiornata }) {
  const navigate = useNavigate();
  const [busyIrr, setBusyIrr] = useState(false);
  const [busyCal, setBusyCal] = useState(false);
  const [azioneMsg, setAzioneMsg] = useState("");
  const [azioneErr, setAzioneErr] = useState("");

  if (!alert?.consiglia_irrigazione && !alert?.consiglia_calendario) return null;

  const irrigazioneAttiva = profile?.irrigazione && profile.irrigazione !== "pioggia";
  const mostraIrrigazione = irrigazioneAttiva && alert.consiglia_irrigazione;
  const mostraCalendario = alert.consiglia_calendario;

  async function aggiornaIrrigazione() {
    setAzioneErr("");
    setAzioneMsg("");
    setBusyIrr(true);
    try {
      window.dispatchEvent(new CustomEvent(IRRIGAZIONE_REFRESH_EVENT));
      await fetchIrrigazioneGiornaliera({ force: true });
      onIrrigazioneAggiornata?.();
      setAzioneMsg("Programma irrigazione ricalcolato con il meteo attuale.");
      document.getElementById("irrigazione-widget")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      setAzioneErr(e.message || "Errore aggiornamento irrigazione");
    } finally {
      setBusyIrr(false);
    }
  }

  async function aggiornaCalendario() {
    setAzioneErr("");
    setAzioneMsg("");
    setBusyCal(true);
    try {
      const data = await adattaCalendarioMeteo();
      setAzioneMsg(data.messaggio);
      navigate("/calendario", { state: { banner: data.messaggio } });
    } catch (e) {
      setAzioneErr(e.message || "Errore aggiornamento calendario");
    } finally {
      setBusyCal(false);
    }
  }

  return (
    <div
      className={`stato-clinico__alerts stato-clinico__alerts--${alert.livello}`}
      role="alert"
    >
      <p className="stato-clinico__alerts-title">Meteo cambiato — conviene aggiornare</p>
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
        {mostraIrrigazione ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busyIrr || busyCal}
            onClick={aggiornaIrrigazione}
          >
            {busyIrr ? "Aggiornamento…" : "Aggiorna irrigazione"}
          </button>
        ) : null}
        {mostraCalendario ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busyIrr || busyCal}
            onClick={aggiornaCalendario}
          >
            {busyCal ? "Calendario…" : "Aggiorna calendario"}
          </button>
        ) : null}
      </div>
      {azioneMsg ? <p className="stato-clinico__alerts-ok">{azioneMsg}</p> : null}
      {azioneErr ? <p className="stato-clinico__alerts-err">{azioneErr}</p> : null}
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
    if (!weather) return null;
    if (profile?.irrigazione === "pioggia") {
      const soloCal = valutaAlertMeteoIrrigazione({
        weather,
        irrigazioneUltima: null,
        irrigazioneProfilo: null,
      });
      if (!soloCal) return null;
      return {
        ...soloCal,
        consiglia_irrigazione: false,
        consiglia_calendario: true,
      };
    }
    return valutaAlertMeteoIrrigazione({
      weather,
      irrigazioneUltima: getIrrigazioneCached(),
      irrigazioneProfilo,
    });
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

      {alertMeteo ? (
        <MeteoConsigliPanel
          alert={alertMeteo}
          profile={profile}
          onIrrigazioneAggiornata={() => setIrrCacheTick((n) => n + 1)}
        />
      ) : null}

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
