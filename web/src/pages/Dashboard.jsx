import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import DashPageHeader from "../components/DashPageHeader";
import ProfileResetButton from "../components/ProfileResetButton";
import PratoRadar from "../components/PratoRadar";
import WeatherCard from "../components/WeatherCard";
import StatoClinicoWidget from "../components/StatoClinicoWidget";
import StatoClinicoGeminiBar from "../components/StatoClinicoGeminiBar";
import PratoZoneEditor from "../components/PratoZoneEditor";
import ConsulenteZonaFoto from "../components/ConsulenteZonaFoto";
import AnalisiSuoloAlert from "../components/AnalisiSuoloAlert";
import IrrigationWidget from "../components/IrrigationWidget";
import { computePratoStats, labelStatoPrato } from "../lib/pratoStats";
import { loadInterventi, loadUltimaAnalisi } from "../lib/dashboard";
import { fetchMeteoForCity } from "../lib/weatherClient";
import { loadZonaDefault } from "../lib/zonePrato";
import { supabase } from "../lib/supabase";
import { AVVISO_MQ_MANCANTI, superficieMqVerificata } from "../lib/sicurezzaClient";

export default function Dashboard({ profile, session, onProfileUpdate }) {
  const location = useLocation();
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [interventi, setInterventi] = useState([]);
  const [ultimaAnalisi, setUltimaAnalisi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(() => {
    if (!location.state?.fromAnalysis) return "";
    const p = location.state.pianoAggiornato;
    if (p?.inseritiCalendario || p?.aggiornatiCalendario) {
      const parts = [];
      if (p.inseritiCalendario) parts.push(`${p.inseritiCalendario} lavori aggiunti al calendario`);
      if (p.aggiornatiCalendario) parts.push(`${p.aggiornatiCalendario} aggiornati`);
      return `Analisi foto: ${parts.join(", ")}. Vedi il calendario per i dettagli.`;
    }
    const n = location.state.interventiCount;
    return n
      ? `Analisi foto: ${n} interventi in agenda. Apri il calendario per vederli.`
      : "Piano aggiornato dall'ultima analisi foto.";
  });

  const userId = session?.user?.id;
  const mqVerificati = superficieMqVerificata(profile);
  const [zonaDefault, setZonaDefault] = useState(null);

  const visionUltima = useMemo(() => {
    const raw = ultimaAnalisi?.vision_json;
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [ultimaAnalisi?.vision_json]);

  const pratoRadar = useMemo(
    () => computePratoStats({ interventi, analisi: ultimaAnalisi, weather }),
    [interventi, ultimaAnalisi, weather],
  );

  async function refresh() {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const [list, analisi] = await Promise.all([
        loadInterventi(userId),
        loadUltimaAnalisi(userId).catch(() => null),
      ]);
      setInterventi(list);
      setUltimaAnalisi(analisi);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadZonaDefault(userId)
      .then(setZonaDefault)
      .catch(() => setZonaDefault(null));
  }, [userId]);

  useEffect(() => {
    if (!profile?.localita) {
      setWeather(null);
      setWeatherError("");
      return;
    }
    setWeatherLoading(true);
    setWeatherError("");
    const gps = zonaDefault?.coordinate_gps;
    fetchMeteoForCity(profile.localita, {
      zonaId: zonaDefault?.id,
      lat: gps?.lat,
      lon: gps?.lon,
    })
      .then((bundle) => {
        setWeather(bundle);
        setWeatherError("");
      })
      .catch((e) => {
        setWeather(null);
        setWeatherError(e.message || "Meteo non disponibile");
      })
      .finally(() => setWeatherLoading(false));
  }, [profile?.localita, zonaDefault?.id, zonaDefault?.coordinate_gps?.lat, zonaDefault?.coordinate_gps?.lon]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="page dashboard">
      <DashPageHeader active="dashboard" profile={profile} onLogout={logout} />

      <ConsulenteZonaFoto
        variant="google"
        profile={profile}
        userId={userId}
        zonaId={zonaDefault?.id}
        zonaNome={zonaDefault?.nome_zona}
        onAnalisiComplete={async () => {
          const analisi = await loadUltimaAnalisi(userId).catch(() => null);
          setUltimaAnalisi(analisi);
        }}
      />

      {banner ? (
        <p className="dash-banner">
          {banner}{" "}
          <Link to="/calendario" className="dash-banner__link">
            Apri calendario
          </Link>
          <button type="button" className="dash-banner__close" onClick={() => setBanner("")} aria-label="Chiudi">
            ×
          </button>
        </p>
      ) : null}

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      {!mqVerificati ? (
        <p className="dash-safety-banner" role="alert">
          {AVVISO_MQ_MANCANTI}{" "}
          <Link to="/onboarding">Aggiorna profilo</Link>
        </p>
      ) : null}

      <div className="dash-grid">
        <div className="dash-grid__col">
          <section className="dash-card dash-card--weather">
            <h2 className="dash-card__title">Meteo</h2>
            {profile?.localita ? (
              <p className="dash-card__sub">{profile.localita}</p>
            ) : (
              <p className="dash-card__sub">
                <Link to="/onboarding">Imposta la località</Link> nel profilo.
              </p>
            )}
            {weatherLoading ? <p className="dash-card__loading">Caricamento meteo…</p> : null}
            {weatherError && !weatherLoading ? (
              <p className="form-msg form-msg--error">{weatherError}</p>
            ) : null}
            {weather ? (
              <WeatherCard bundle={weather} compact zonaNome={zonaDefault?.nome_zona} />
            ) : null}
          </section>

          <IrrigationWidget profile={profile} enabled={!!profile?.localita} />

          <StatoClinicoWidget
            ultimaAnalisi={ultimaAnalisi}
            zonaNome={zonaDefault?.nome_zona}
            weather={weather}
            userId={userId}
            profile={profile}
          />
        </div>

        <section className="dash-card dash-card--radar">
          <h2 className="dash-card__title">Stato prato</h2>
          <p className="dash-card__sub">
            Punteggio dalla <strong>foto</strong> (valida 30 giorni). Solo i lavori <strong>scaduti</strong> lo
            abbassano, con un tetto di −15 punti per asse.
          </p>
          {loading ? (
            <p className="dash-card__loading">Calcolo stato…</p>
          ) : (
            <PratoRadar
              stats={pratoRadar.stats}
              media={pratoRadar.media}
              insights={pratoRadar.insights}
              hasVision={pratoRadar.hasVision}
              statoLabel={labelStatoPrato(pratoRadar.media, pratoRadar.hasVision)}
              compact
            />
          )}
          {!pratoRadar.hasVision ? (
            <p className="dash-card__meta dash-card__meta--radar">
              {pratoRadar.isExpired ? (
                <>
                  Foto scaduta ({pratoRadar.ageDays} giorni).{" "}
                  <Link to="/chat">Carica una nuova foto</Link>.
                </>
              ) : pratoRadar.needsPunteggiAssi ? (
                <>
                  Analisi precedente senza punteggi per asse.{" "}
                  <Link to="/chat">Rifai l&apos;analisi foto</Link>.
                </>
              ) : (
                <>
                  <Link to="/chat">Carica una foto</Link> per attivare l&apos;esagono.
                </>
              )}
            </p>
          ) : ultimaAnalisi?.created_at ? (
            <p className="dash-card__meta dash-card__meta--radar">
              Ultima foto:{" "}
              {new Date(ultimaAnalisi.created_at).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "short",
              })}
              {pratoRadar.ageDays > 0 ? ` (${pratoRadar.ageDays} gg fa)` : " (oggi)"}
              {pratoRadar.hasOverdue
                ? ` · ${pratoRadar.overdueCount} lavori scaduti (max −15 pt per asse)`
                : null}
            </p>
          ) : null}
        </section>

        <StatoClinicoGeminiBar ultimaAnalisi={ultimaAnalisi} />

        <PratoZoneEditor profile={profile} userId={userId} onProfileUpdate={onProfileUpdate} />

        {visionUltima?.richiede_analisi_suolo ? (
          <AnalisiSuoloAlert
            localita={profile?.localita}
            motivo={visionUltima.motivo_analisi_suolo}
          />
        ) : null}
      </div>

      <footer className="dash-footer">
        <ProfileResetButton minimal onResetComplete={onProfileUpdate} />
      </footer>
    </div>
  );
}
