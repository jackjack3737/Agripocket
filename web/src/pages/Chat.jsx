import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import DashPageHeader from "../components/DashPageHeader";
import { analizzaPratoFoto } from "../lib/analizzaPrato";
import { setInterventoCompletato } from "../lib/dashboard";
import { fileToCompressedBase64 } from "../lib/photoCompress";
import { supabase, updatePratoLocalita } from "../lib/supabase";
import { fetchMeteoForCity } from "../lib/weatherClient";
import WeatherCard from "../components/WeatherCard";
import AnalisiSuoloAlert from "../components/AnalisiSuoloAlert";

function ReportBody({ markdown }) {
  const blocks = markdown.split(/\n(?=## )/);
  return (
    <article className="lawn-report">
      {blocks.map((block, i) => {
        const lines = block.trim().split("\n");
        const title = lines[0]?.startsWith("## ") ? lines[0].replace(/^##\s*/, "") : null;
        const body = title ? lines.slice(1).join("\n").trim() : block.trim();
        if (!body && !title) return null;
        return (
          <section key={i} className="lawn-report__section">
            {title ? <h3>{title}</h3> : null}
            {body.split(/\n\n+/).map((para, j) => (
              <p key={j}>{para}</p>
            ))}
          </section>
        );
      })}
    </article>
  );
}

export default function Chat({ profile, session, onProfileUpdate }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const controlloId = searchParams.get("controllo");
  const userId = session?.user?.id;
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState("");
  const [meta, setMeta] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [cityInput, setCityInput] = useState(profile?.localita ?? "");
  const [citySaving, setCitySaving] = useState(false);

  useEffect(() => {
    setCityInput(profile?.localita ?? "");
    if (profile?.localita) loadWeather(profile.localita);
  }, [profile?.localita]);

  async function loadWeather(city) {
    if (!city?.trim()) {
      setWeather(null);
      return;
    }
    setWeatherLoading(true);
    try {
      const bundle = await fetchMeteoForCity(city);
      setWeather(bundle);
      setError("");
    } catch (err) {
      setWeather(null);
      setError(err.message || "Meteo non disponibile per questa località");
    } finally {
      setWeatherLoading(false);
    }
  }

  async function saveCity(e) {
    e.preventDefault();
    if (!cityInput.trim() || !userId) return;
    setCitySaving(true);
    setError("");
    try {
      const updated = await updatePratoLocalita(userId, cityInput);
      onProfileUpdate?.(updated);
      await loadWeather(cityInput);
    } catch (err) {
      setError(err.message || "Salvataggio località fallito");
    } finally {
      setCitySaving(false);
    }
  }

  async function onPhotoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!profile?.localita?.trim()) {
      setError("Imposta prima la città o il CAP del prato (sopra), poi scatta la foto.");
      return;
    }

    setError("");
    setReport("");
    setMeta(null);
    setLoading(true);

    try {
      const { base64, mimeType, previewUrl } = await fileToCompressedBase64(file);
      setPreview(previewUrl);
      const result = await analizzaPratoFoto({ base64, mimeType, userId });
      if (result.profile) onProfileUpdate?.(result.profile);
      if (controlloId) {
        try {
          await setInterventoCompletato(controlloId, true);
        } catch {
          /* ignore */
        }
      }
      setReport(result.report);
      setMeta({
        chunksUsed: result.chunksUsed,
        vision: result.vision,
        weatherUsed: result.weatherUsed,
        pianoAggiornato: result.pianoAggiornato,
        interventiCount: result.interventi?.length ?? 0,
        richiede_analisi_suolo: result.richiede_analisi_suolo,
        motivo_analisi_suolo: result.motivo_analisi_suolo,
      });
    } catch (err) {
      setError(err.message || "Analisi non riuscita");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  function openCamera() {
    inputRef.current?.click();
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="page dashboard chat chat--photo">
      <DashPageHeader active="chat" profile={profile} onLogout={logout} />

      <section className="weather-setup">
        <form className="weather-setup__form" onSubmit={saveCity}>
          <label className="field-block">
            Località del prato
            <input
              placeholder="Città o CAP"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={citySaving || !cityInput.trim()}>
            {citySaving ? "..." : "Aggiorna meteo"}
          </button>
        </form>
        {weatherLoading ? <p className="weather-setup__loading">Caricamento meteo...</p> : null}
        {weather ? <WeatherCard bundle={weather} /> : null}
      </section>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="photo-input-hidden"
        onChange={onPhotoSelected}
      />

      {controlloId ? (
        <p className="chat-controllo-banner">
          Controllo mensile: dopo l&apos;analisi segneremo il lavoro come completato in calendario.
        </p>
      ) : null}

      {!report && !loading && (
        <section className="photo-hero">
          <p className="photo-hero__lead">
            Scatta una foto del prato. L&apos;agronomo riconosce le specie dall&apos;immagine, incrocia profilo,
            meteo e la knowledge base TGIF — senza categorie generiche scelte a mano.
          </p>
          <button
            type="button"
            className="btn-photo-main"
            onClick={openCamera}
            disabled={loading || !profile?.localita?.trim()}
          >
            <span className="btn-photo-main__icon" aria-hidden>
              +
            </span>
            Fai la foto al prato
          </button>
          {!profile?.localita?.trim() ? (
            <p className="photo-hero__warn">Inserisci la località sopra per abilitare l&apos;analisi.</p>
          ) : null}
        </section>
      )}

      {loading && (
        <section className="photo-loading">
          {preview ? <img src={preview} alt="" className="photo-loading__preview" /> : null}
          <div className="photo-loading__box">
            <div className="spinner" aria-hidden />
            <p className="photo-loading__title">Analisi in corso…</p>
            <p className="photo-loading__sub">
              Può richiedere 1–2 minuti. Non chiudere la pagina.
            </p>
            <p className="photo-loading__sub photo-loading__sub--muted">
              Visione + meteo {profile?.localita} + knowledge base
            </p>
          </div>
        </section>
      )}

      {error && (
        <p className="form-msg form-msg--error photo-error">
          {error}
          <button type="button" className="btn btn-ghost btn-sm photo-retry" onClick={openCamera}>
            Riprova
          </button>
        </p>
      )}

      {report && !loading && (
        <section className="photo-result">
          {preview ? <img src={preview} alt="" className="photo-result__thumb" /> : null}
          <p className="photo-result__meta">
            Report con foto
            {meta?.weatherUsed ? `, meteo ${profile?.localita}` : ""}
            {meta?.chunksUsed ? `, ${meta.chunksUsed} fonti KB` : ""}
          </p>
          <ReportBody markdown={report} />
          {meta?.richiede_analisi_suolo ? (
            <AnalisiSuoloAlert
              localita={profile?.localita}
              motivo={meta?.motivo_analisi_suolo}
            />
          ) : null}
          <div className="photo-result__actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                navigate("/calendario", {
                  state: {
                    fromAnalysis: true,
                    pianoAggiornato: meta?.pianoAggiornato,
                    interventiCount: meta?.interventiCount,
                  },
                })
              }
            >
              Vai al calendario
            </button>
            <button type="button" className="btn btn-ghost photo-new" onClick={openCamera}>
              Nuova foto
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
