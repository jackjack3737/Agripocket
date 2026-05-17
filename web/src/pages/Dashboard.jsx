import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import WeatherCard from "../components/WeatherCard";
import { profileSummary } from "../data/onboardingSteps";
import {
  CATEGORIA_LABEL,
  PRIORITA_LABEL,
  formatDataIt,
  groupInterventi,
  groupInterventiPerGiorno,
  haCalendarioStagionale,
  loadInterventi,
  loadUltimaAnalisi,
  setInterventoCompletato,
} from "../lib/dashboard";
import { generaPianoAnnuale } from "../lib/generaPiano";
import { fetchMeteoForCity } from "../lib/weatherClient";
import { supabase } from "../lib/supabase";

function InterventoRow({ item, onToggle }) {
  const done = item.stato === "completato";
  return (
    <li className={`intervento-row intervento-row--${item.priorita}${done ? " intervento-row--done" : ""}`}>
      <label className="intervento-row__check">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onToggle(item.id, e.target.checked)}
        />
        <span className="intervento-row__box" aria-hidden />
      </label>
      <div className="intervento-row__body">
        <div className="intervento-row__top">
          <span className={`intervento-pill intervento-pill--${item.priorita}`}>
            {PRIORITA_LABEL[item.priorita]}
          </span>
          <span className="intervento-pill intervento-pill--cat">{CATEGORIA_LABEL[item.categoria] || "Altro"}</span>
          <time className="intervento-row__date" dateTime={item.data_prevista || undefined}>
            {formatDataIt(item.data_prevista)}
          </time>
        </div>
        <p className="intervento-row__title">{item.titolo}</p>
        {item.descrizione ? <p className="intervento-row__desc">{item.descrizione}</p> : null}
      </div>
    </li>
  );
}

function InterventoSection({ title, hint, items, onToggle, empty }) {
  if (!items.length && !empty) return null;
  return (
    <section className="dash-calendar-section">
      <h3 className="dash-calendar-section__title">{title}</h3>
      {hint ? <p className="dash-calendar-section__hint">{hint}</p> : null}
      {items.length ? (
        <ul className="intervento-list">
          {items.map((item) => (
            <InterventoRow key={item.id} item={item} onToggle={onToggle} />
          ))}
        </ul>
      ) : (
        <p className="dash-calendar-section__empty">{empty}</p>
      )}
    </section>
  );
}

export default function Dashboard({ profile, session }) {
  const location = useLocation();
  const summary = profileSummary(profile);
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [interventi, setInterventi] = useState([]);
  const [ultimaAnalisi, setUltimaAnalisi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(location.state?.fromAnalysis ? "Piano aggiornato dall'ultima analisi foto." : "");
  const [generatingPiano, setGeneratingPiano] = useState(false);

  const userId = session?.user?.id;
  const groups = groupInterventi(interventi);
  const giorni = groupInterventiPerGiorno(interventi, { maxGiorni: 60 });
  const hasPiano = haCalendarioStagionale(interventi);

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
    if (!profile?.localita) {
      setWeather(null);
      return;
    }
    setWeatherLoading(true);
    fetchMeteoForCity(profile.localita)
      .then(setWeather)
      .catch(() => setWeather(null))
      .finally(() => setWeatherLoading(false));
  }, [profile?.localita]);

  async function handleGeneraPiano() {
    setGeneratingPiano(true);
    setError("");
    try {
      const result = await generaPianoAnnuale();
      setBanner(`Calendario annuale creato: ${result.count} lavori in agenda.`);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingPiano(false);
    }
  }

  async function toggleIntervento(id, completato) {
    try {
      await setInterventoCompletato(id, completato);
      setInterventi((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                stato: completato ? "completato" : "pianificato",
                data_completamento: completato ? new Date().toISOString().slice(0, 10) : null,
              }
            : i
        )
      );
    } catch (e) {
      setError(e.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="page dashboard">
      <header className="dash-header">
        <div>
          <p className="dash-header__kicker">Centrale prato</p>
          <h1>La tua dashboard</h1>
          {summary ? <p className="profile-chip">{summary}</p> : null}
        </div>
        <nav className="dash-nav">
          <Link className="dash-nav__link dash-nav__link--active" to="/dashboard">
            Dashboard
          </Link>
          <Link className="dash-nav__link" to="/chat">
            Analisi foto
          </Link>
          <Link className="dash-nav__link" to="/onboarding">
            Profilo
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Esci
          </button>
        </nav>
      </header>

      {banner ? (
        <p className="dash-banner">
          {banner}
          <button type="button" className="dash-banner__close" onClick={() => setBanner("")} aria-label="Chiudi">
            ×
          </button>
        </p>
      ) : null}

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      <div className="dash-grid">
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
          {weather ? <WeatherCard bundle={weather} compact /> : null}
        </section>

        <section className="dash-card dash-card--profile">
          <h2 className="dash-card__title">Profilo prato</h2>
          <ul className="dash-profile-list">
            {profile?.localita ? <li>📍 {profile.localita}</li> : null}
            {profile?.superficie_mq ? <li>📐 {profile.superficie_mq} m²</li> : null}
            {profile?.note ? <li>🌿 {profile.note}</li> : null}
            {profile?.marca_seme ? <li>🌱 {profile.marca_seme}</li> : null}
          </ul>
          {ultimaAnalisi ? (
            <p className="dash-card__meta">
              Ultima analisi:{" "}
              {new Date(ultimaAnalisi.created_at).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : (
            <p className="dash-card__meta">Nessuna analisi foto ancora.</p>
          )}
          <Link className="btn btn-outline btn-sm dash-card__cta" to="/chat">
            Nuova analisi foto
          </Link>
        </section>
      </div>

      <section className="dash-calendar">
        <div className="dash-calendar__head">
          <h2>Calendario lavori</h2>
          <p className="dash-calendar__lead">
            Piano giorno per giorno: concimi, diserbi, arieggiatura, taglio, biostimolanti, umettanti e trattamenti.
          </p>
          <div className="dash-calendar__actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={generatingPiano || !profile?.localita}
              onClick={handleGeneraPiano}
            >
              {generatingPiano
                ? "Generazione calendario… (1-2 min)"
                : hasPiano
                  ? "Rigenera piano annuale"
                  : "Genera piano annuale completo"}
            </button>
            {!profile?.localita ? (
              <p className="dash-calendar__warn">Imposta la località nel profilo (mappa).</p>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="dash-card__loading">Caricamento piano…</p>
        ) : (
          <>
            {groups.daFoto.length ? (
              <InterventoSection
                title="Urgenti dall'analisi foto"
                hint="Dall'ultima foto."
                items={groups.daFoto}
                onToggle={toggleIntervento}
              />
            ) : null}

            {giorni.length ? (
              <div className="dash-day-timeline">
                <h3 className="dash-calendar-section__title">Agenda giorno per giorno</h3>
                <p className="dash-calendar-section__hint">Prossimi 60 giorni.</p>
                {giorni.map(({ data, items }) => (
                  <section key={data} className="dash-day">
                    <h4 className="dash-day__date">
                      <time dateTime={data}>{formatDataIt(data)}</time>
                      <span className="dash-day__count">{items.length} lavori</span>
                    </h4>
                    <ul className="intervento-list">
                      {items.map((item) => (
                        <InterventoRow key={item.id} item={item} onToggle={toggleIntervento} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : null}

            {!giorni.length && groups.altri.length ? (
              <InterventoSection title="Prossimi interventi" items={groups.altri} onToggle={toggleIntervento} />
            ) : null}

            <InterventoSection title="Completati" items={groups.completati} onToggle={toggleIntervento} />

            {!groups.pianificati.length && !groups.completati.length ? (
              <div className="dash-calendar__empty-block">
                <p>Nessun lavoro in calendario.</p>
                <button
                  type="button"
                  className="btn btn-primary dash-calendar__cta"
                  disabled={generatingPiano || !profile?.localita}
                  onClick={handleGeneraPiano}
                >
                  Genera piano annuale
                </button>
                <Link className="btn btn-outline btn-sm" to="/chat">
                  Oppure analisi foto
                </Link>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
