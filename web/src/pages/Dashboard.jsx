import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PratoRadar from "../components/PratoRadar";
import WeatherCard from "../components/WeatherCard";
import { computePratoStats, labelStatoPrato } from "../lib/pratoStats";
import { profileSummary } from "../data/onboardingSteps";
import {
  CATEGORIA_LABEL,
  PRIORITA_LABEL,
  PRIORITY_LEVEL,
  formatDataIt,
  groupInterventi,
  groupInterventiPerMese,
  haCalendarioStagionale,
  prossimiInterventi,
  loadInterventi,
  loadUltimaAnalisi,
  setInterventoCompletato,
  sortInterventiCronologico,
} from "../lib/dashboard";
import { generaPianoAnnuale } from "../lib/generaPiano";
import { fetchMeteoForCity } from "../lib/weatherClient";
import { supabase } from "../lib/supabase";

function formattaDoseIntervento(totale, unita, perMq) {
  const u = (unita || "g").toLowerCase();
  let val = Number(totale);
  let label = u;
  if (u === "ml" && val >= 1000) {
    val = val / 1000;
    label = "L";
  } else if (u === "g" && val >= 1000) {
    val = val / 1000;
    label = "kg";
  }
  const tot = `${val >= 10 ? Math.round(val) : val.toFixed(1)} ${label}`;
  if (perMq != null) {
    const pm = Number(perMq);
    return `${tot} totali (${pm} ${u}/m²)`;
  }
  return tot;
}

function ImportanzaIndicatore({ priorita }) {
  const level = PRIORITY_LEVEL[priorita] ?? 2;
  const label = PRIORITA_LABEL[priorita] || "Media";
  return (
    <span
      className={`importanza importanza--${priorita || "media"}`}
      title={`Importanza: ${label}`}
      aria-label={`Importanza ${label}`}
    >
      <span className="importanza__label">Importanza</span>
      <span className="importanza__bar" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={`importanza__seg${i <= level ? " importanza__seg--on" : ""}`} />
        ))}
      </span>
      <span className="importanza__testo">{label}</span>
    </span>
  );
}

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
          <time className="intervento-row__date" dateTime={item.data_prevista || undefined}>
            {formatDataIt(item.data_prevista)}
          </time>
          <span className="intervento-pill intervento-pill--cat">{CATEGORIA_LABEL[item.categoria] || "Altro"}</span>
          <ImportanzaIndicatore priorita={item.priorita} />
        </div>
        <p className="intervento-row__title">{item.titolo}</p>
        {item.prodotto_nome ? (
          <p className="intervento-row__prodotto">
            <span className="intervento-row__prodotto-nome">{item.prodotto_nome}</span>
            {item.dose_totale != null && item.dose_unita ? (
              <span className="intervento-row__dose">
                {formattaDoseIntervento(item.dose_totale, item.dose_unita, item.dose_per_mq)}
              </span>
            ) : null}
          </p>
        ) : null}
        {item.descrizione ? <p className="intervento-row__desc">{item.descrizione}</p> : null}
      </div>
    </li>
  );
}

function MeseAccordion({ mese, open, onToggle, onToggleIntervento }) {
  return (
    <section className={`dash-month${open ? " dash-month--open" : ""}`}>
      <button
        type="button"
        className="dash-month__head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="dash-month__label">{mese.label}</span>
        <span className="dash-month__meta">
          {mese.total} lavori · {mese.giorni.length} {mese.giorni.length === 1 ? "giorno" : "giorni"}
        </span>
        <span className="dash-month__chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="dash-month__body">
          {mese.giorni.map(({ data, items }) => (
            <section key={data} className="dash-day">
              <h4 className="dash-day__date">
                <time dateTime={data}>{formatDataIt(data)}</time>
                <span className="dash-day__count">{items.length} lavori</span>
              </h4>
              <ul className="intervento-list">
                {items.map((item) => (
                  <InterventoRow key={item.id} item={item} onToggle={onToggleIntervento} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
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
  const [banner, setBanner] = useState(() => {
    if (!location.state?.fromAnalysis) return "";
    const p = location.state.pianoAggiornato;
    if (p?.inseritiCalendario || p?.aggiornatiCalendario) {
      const parts = [];
      if (p.inseritiCalendario) parts.push(`${p.inseritiCalendario} lavori aggiunti al calendario`);
      if (p.aggiornatiCalendario) parts.push(`${p.aggiornatiCalendario} aggiornati`);
      return `Analisi foto: ${parts.join(", ")}. Prodotti e dosi calcolati sui m² del prato.`;
    }
    const n = location.state.interventiCount;
    return n
      ? `Analisi foto: ${n} interventi in agenda con prodotti e dosi sui m².`
      : "Piano aggiornato dall'ultima analisi foto.";
  });
  const [generatingPiano, setGeneratingPiano] = useState(false);

  const userId = session?.user?.id;
  const groups = groupInterventi(interventi);
  const mesi = groupInterventiPerMese(interventi);
  const prossimi = prossimiInterventi(interventi);
  const hasPiano = haCalendarioStagionale(interventi);
  const autoPianoStarted = useRef(false);
  const meseCorrente = new Date().toISOString().slice(0, 7);
  const [mesiAperti, setMesiAperti] = useState(() => new Set([meseCorrente]));

  const pratoRadar = useMemo(
    () => computePratoStats({ interventi, analisi: ultimaAnalisi, weather }),
    [interventi, ultimaAnalisi, weather]
  );

  function toggleMese(monthKey) {
    setMesiAperti((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

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
    if (loading || !userId || !profile?.localita || interventi.length > 0 || generatingPiano) return;
    if (autoPianoStarted.current) return;
    autoPianoStarted.current = true;
    setBanner("Creazione automatica del piano annuale… (1-2 minuti, non chiudere la pagina)");
    handleGeneraPiano();
  }, [loading, userId, profile?.localita, interventi.length, generatingPiano]);

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
      const msg =
        e.name === "AbortError"
          ? "Generazione troppo lunga. Riprova con «Genera piano annuale»."
          : e.message;
      setError(msg);
      autoPianoStarted.current = false;
    } finally {
      setGeneratingPiano(false);
    }
  }

  async function toggleIntervento(id, completato) {
    try {
      await setInterventoCompletato(id, completato);
      setInterventi((prev) =>
        sortInterventiCronologico(
          prev.map((i) =>
            i.id === id
              ? {
                  ...i,
                  stato: completato ? "completato" : "pianificato",
                  data_completamento: completato ? new Date().toISOString().slice(0, 10) : null,
                }
              : i
          )
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

        <section className="dash-card dash-card--radar">
          <h2 className="dash-card__title">Stato prato</h2>
          <p className="dash-card__sub">
            Esagono aggiornato da foto e lavori in calendario (spunta = migliora).
          </p>
          {loading ? (
            <p className="dash-card__loading">Calcolo stato…</p>
          ) : (
            <PratoRadar
              stats={pratoRadar.stats}
              media={pratoRadar.media}
              statoLabel={labelStatoPrato(pratoRadar.media)}
              compact
            />
          )}
          {ultimaAnalisi?.created_at ? (
            <p className="dash-card__meta dash-card__meta--radar">
              Ultima foto:{" "}
              {new Date(ultimaAnalisi.created_at).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "short",
              })}
              {!pratoRadar.hasInterventi ? " · aggiungi lavori o spunta il calendario" : null}
            </p>
          ) : (
            <p className="dash-card__meta dash-card__meta--radar">
              <Link to="/chat">Carica una foto</Link> per aggiornare l&apos;esagono.
            </p>
          )}
        </section>

        <section className="dash-card dash-card--profile dash-card--wide">
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

        {loading || generatingPiano ? (
          <p className="dash-card__loading">
            {generatingPiano ? "Creazione piano annuale in corso… 1-2 minuti" : "Caricamento piano…"}
          </p>
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

            {mesi.length ? (
              <div className="dash-month-timeline">
                <h3 className="dash-calendar-section__title">Piano mese per mese</h3>
                <p className="dash-calendar-section__hint">
                  {prossimi.length} lavori · apri un mese per vedere i giorni e le attività.
                </p>
                {mesi.map((mese) => (
                  <MeseAccordion
                    key={mese.monthKey}
                    mese={mese}
                    open={mesiAperti.has(mese.monthKey)}
                    onToggle={() => toggleMese(mese.monthKey)}
                    onToggleIntervento={toggleIntervento}
                  />
                ))}
              </div>
            ) : null}

            {!mesi.length && prossimi.length ? (
              <InterventoSection
                title="Prossimi lavori"
                hint="Piano in agenda."
                items={prossimi}
                onToggle={toggleIntervento}
              />
            ) : null}

            {!mesi.length && !prossimi.length && groups.senzaData.length ? (
              <InterventoSection title="Prossimi interventi" items={groups.senzaData} onToggle={toggleIntervento} />
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
