import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import LawnMapModal from "../components/LawnMapModal";
import LawnMapProfileCard from "../components/LawnMapProfileCard";
import ProfileResetButton from "../components/ProfileResetButton";
import PratoZoneEditor from "../components/PratoZoneEditor";
import PratoRadar from "../components/PratoRadar";
import WeatherCard from "../components/WeatherCard";
import { computePratoStats, labelStatoPrato } from "../lib/pratoStats";
import { profileSummary } from "../data/onboardingSteps";
import {
  CATEGORIA_LABEL,
  PRIORITA_LABEL,
  PRIORITY_LEVEL,
  formatDataIt,
  CALENDARIO_AMBITI,
  CALENDARIO_TIPO_FILTRI,
  contaLavoriPianificatiFiltrati,
  filtraInterventiPerCalendario,
  groupInterventi,
  formatMeseIt,
  groupInterventiPerMese,
  haCalendarioStagionale,
  prossimiInterventi,
  loadInterventi,
  loadUltimaAnalisi,
  syncControlliMensili,
  setInterventoCompletato,
  setInterventoManualOverride,
  sortInterventiCronologico,
} from "../lib/dashboard";
import { generaPianoAnnuale } from "../lib/generaPiano";
import { fetchMeteoForCity } from "../lib/weatherClient";
import { savePratoProfilo, supabase } from "../lib/supabase";
import {
  AVVISO_FITOFARMACO,
  AVVISO_MQ_MANCANTI,
  isInterventoFitofarmaco,
  superficieMqVerificata,
} from "../lib/sicurezzaClient";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

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

function InterventoRow({ item, onToggle, onPin }) {
  const done = item.stato === "completato";
  const fito = isInterventoFitofarmaco(item);
  const mostraDose = !fito && item.dose_totale != null && item.dose_unita;
  const controlloMensile = item.fonte === "controllo_mensile";
  return (
    <li
      className={`intervento-row intervento-row--${item.priorita}${done ? " intervento-row--done" : ""}${item.manual_override ? " intervento-row--pinned" : ""}${controlloMensile ? " intervento-row--controllo" : ""}`}
    >
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
          {item.manual_override ? (
            <span className="intervento-pill intervento-pill--pin" title="Non viene rimosso alla rigenerazione del piano">
              Fissato
            </span>
          ) : null}
        </div>
        <p className="intervento-row__title">{item.titolo}</p>
        {fito ? (
          <p className="intervento-row__avviso intervento-row__avviso--fito" role="note">
            {AVVISO_FITOFARMACO}
          </p>
        ) : null}
        {item.prodotto_nome ? (
          <p className="intervento-row__prodotto">
            <span className="intervento-row__prodotto-nome">
              {fito ? "Riferimento catalogo: " : ""}
              {item.titolo?.startsWith("Catalogo —") ? "" : "Principale: "}
              {item.prodotto_nome}
            </span>
            {mostraDose ? (
              <span className="intervento-row__dose">
                {formattaDoseIntervento(item.dose_totale, item.dose_unita, item.dose_per_mq)}
              </span>
            ) : null}
          </p>
        ) : null}
        {item.descrizione ? (
          <p className="intervento-row__desc">
            {item.descrizione.includes("Alternative catalogo")
              ? item.descrizione.split(/(?=Alternative catalogo)/).map((chunk, i) => (
                  <span key={i} className={i > 0 ? "intervento-row__alt" : undefined}>
                    {chunk}
                  </span>
                ))
              : item.descrizione}
          </p>
        ) : null}
        {controlloMensile && !done ? (
          <Link
            className="btn btn-primary btn-sm intervento-row__foto-cta"
            to={`/chat?controllo=${item.id}`}
          >
            Carica foto controllo mensile
          </Link>
        ) : null}
        {onPin && item.fonte === "calendario_stagionale" ? (
          <button
            type="button"
            className={`intervento-row__pin${item.manual_override ? " intervento-row__pin--on" : ""}`}
            onClick={() => onPin(item.id, !item.manual_override)}
            title="Mantieni questo lavoro quando rigeneri il piano annuale"
          >
            {item.manual_override ? "✓ Mantieni al rigenera" : "Mantieni al rigenera"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function MeseAccordion({ mese, open, onToggle, onToggleIntervento, onPinIntervento }) {
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
                  <InterventoRow
                    key={item.id}
                    item={item}
                    onToggle={onToggleIntervento}
                    onPin={onPinIntervento}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CalendarioFiltri({ tipo, ambito, meseLabel, conteggi, onTipo, onAmbito }) {
  return (
    <div className="dash-cal-filters">
      <div className="dash-cal-filters__row">
        <span className="dash-cal-filters__label">Tipo</span>
        <div className="dash-cal-filters__chips" role="group" aria-label="Filtra per tipo">
          {Object.entries(CALENDARIO_TIPO_FILTRI).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              className={`dash-cal-filters__chip${tipo === key ? " dash-cal-filters__chip--on" : ""}`}
              onClick={() => onTipo(key)}
            >
              {cfg.label}
              {conteggi?.[key] != null ? ` (${conteggi[key]})` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="dash-cal-filters__row">
        <span className="dash-cal-filters__label">Periodo</span>
        <div className="dash-cal-filters__chips" role="group" aria-label="Filtra per periodo">
          {Object.entries(CALENDARIO_AMBITI).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              className={`dash-cal-filters__chip${ambito === key ? " dash-cal-filters__chip--on" : ""}`}
              onClick={() => onAmbito(key)}
            >
              {key === "mese" ? `${cfg.label} (${meseLabel})` : cfg.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InterventoSection({ title, hint, items, onToggle, onPin, empty }) {
  if (!items.length && !empty) return null;
  return (
    <section className="dash-calendar-section">
      <h3 className="dash-calendar-section__title">{title}</h3>
      {hint ? <p className="dash-calendar-section__hint">{hint}</p> : null}
      {items.length ? (
        <ul className="intervento-list">
          {items.map((item) => (
            <InterventoRow key={item.id} item={item} onToggle={onToggle} onPin={onPin} />
          ))}
        </ul>
      ) : (
        <p className="dash-calendar-section__empty">{empty}</p>
      )}
    </section>
  );
}

export default function Dashboard({ profile, session, onProfileUpdate }) {
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
      return `Analisi foto: ${parts.join(", ")}. Calendario aggiornato (fitofarmaci senza dose automatica).`;
    }
    const n = location.state.interventiCount;
    return n
      ? `Analisi foto: ${n} interventi in agenda. I fitofarmaci mostrano solo riferimenti di catalogo.`
      : "Piano aggiornato dall'ultima analisi foto.";
  });
  const [generatingPiano, setGeneratingPiano] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapSaving, setMapSaving] = useState(false);

  const userId = session?.user?.id;
  const hasPiano = haCalendarioStagionale(interventi);
  const autoPianoStarted = useRef(false);
  const meseCorrente = new Date().toISOString().slice(0, 7);
  const [mesiAperti, setMesiAperti] = useState(() => new Set([meseCorrente]));
  const [calTipo, setCalTipo] = useState("tutti");
  const [calAmbito, setCalAmbito] = useState("anno");

  const filtroOpts = useMemo(
    () => ({ tipo: calTipo, ambito: calAmbito, meseCorrente }),
    [calTipo, calAmbito, meseCorrente],
  );

  const interventiCalendario = useMemo(
    () => filtraInterventiPerCalendario(interventi, filtroOpts),
    [interventi, filtroOpts],
  );

  const groups = useMemo(() => groupInterventi(interventiCalendario), [interventiCalendario]);
  const mesi = useMemo(() => groupInterventiPerMese(interventiCalendario), [interventiCalendario]);
  const prossimi = useMemo(() => prossimiInterventi(interventiCalendario), [interventiCalendario]);

  const conteggiFiltri = useMemo(() => {
    const base = { tipo: calTipo, meseCorrente };
    return {
      tutti: contaLavoriPianificatiFiltrati(interventi, { ...base, tipo: "tutti", ambito: "anno" }),
      trattamenti: contaLavoriPianificatiFiltrati(interventi, { ...base, tipo: "trattamenti", ambito: "anno" }),
      giardino: contaLavoriPianificatiFiltrati(interventi, { ...base, tipo: "giardino", ambito: "anno" }),
    };
  }, [interventi, calTipo, meseCorrente]);

  const soloControlliFoto =
    !hasPiano && interventi.some((i) => i.fonte === "controllo_mensile" && i.stato === "pianificato");

  const mqVerificati = superficieMqVerificata(profile);

  const pratoRadar = useMemo(
    () => computePratoStats({ interventi, analisi: ultimaAnalisi, weather }),
    [interventi, ultimaAnalisi, weather]
  );

  async function handleProfileMapApply({ localita, superficie_mq, prato_zone }) {
    if (!userId) return;
    setMapSaving(true);
    setError("");
    try {
      const updated = await savePratoProfilo(userId, {
        ...profile,
        disclaimer_accettato: true,
        localita: localita?.trim() || profile.localita,
        superficie_mq: superficie_mq ?? profile.superficie_mq,
        prato_zone: prato_zone ?? profile.prato_zone,
      });
      onProfileUpdate?.(updated);
      setMapOpen(false);
    } catch (e) {
      setError(e.message || "Errore salvataggio mappa");
    } finally {
      setMapSaving(false);
    }
  }

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
      await syncControlliMensili(userId).catch(() => 0);
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
    if (loading || !userId || !profile?.localita || hasPiano || generatingPiano) return;
    if (autoPianoStarted.current) return;
    autoPianoStarted.current = true;
    setBanner("Creazione automatica del piano annuale… (1-2 minuti, non chiudere la pagina)");
    handleGeneraPiano();
  }, [loading, userId, profile?.localita, hasPiano, generatingPiano]);

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
      const extra =
        result.catalogoAggiunti > 0
          ? ` (+${result.catalogoAggiunti} voci da catalogo prodotti, priorità media/bassa).`
          : "";
      setBanner(`Calendario annuale creato: ${result.count} lavori in agenda.${extra}`);
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

  async function togglePinIntervento(id, manualOverride) {
    try {
      const updated = await setInterventoManualOverride(id, manualOverride);
      if (!updated) {
        setError("Aggiorna il database (sql/patch_sicurezza_beta.sql) per usare «Mantieni al rigenera».");
        return;
      }
      setInterventi((prev) =>
        prev.map((i) => (i.id === id ? { ...i, manual_override: !!manualOverride } : i))
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

      {!mqVerificati ? (
        <p className="dash-safety-banner" role="alert">
          {AVVISO_MQ_MANCANTI}{" "}
          <Link to="/onboarding">Aggiorna profilo</Link>
        </p>
      ) : null}

      <div className="dash-grid">
        <PratoZoneEditor profile={profile} userId={userId} onProfileUpdate={onProfileUpdate} />

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

        <section className="dash-card dash-card--profile dash-card--wide">
          <h2 className="dash-card__title">Profilo prato</h2>
          <LawnMapProfileCard
            compact
            onOpenMap={() => setMapOpen(true)}
            localita={profile?.localita}
            superficie_mq={profile?.superficie_mq}
            pratoZone={profile?.prato_zone}
            apiKeyMissing={!GOOGLE_MAPS_API_KEY?.trim()}
          />
          {mapSaving ? <p className="dash-card__loading">Salvataggio mappa…</p> : null}
          <ul className="dash-profile-list">
            {profile?.localita ? <li>📍 {profile.localita}</li> : null}
            {profile?.superficie_mq ? <li>📐 {profile.superficie_mq} m²</li> : null}
            {profile?.note ? <li>🌿 {profile.note}</li> : null}
            {profile?.marca_seme ? <li>🌱 {profile.marca_seme}</li> : null}
            {(profile?.problemi_noti?.length ?? 0) > 0 ? (
              <li>⚠️ Problemi noti: {(profile.problemi_noti || []).length}</li>
            ) : null}
            {profile?.analisi_terreno_fatta ? <li>🧪 Analisi terreno in profilo</li> : null}
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
          <ProfileResetButton embedded onResetComplete={onProfileUpdate} />
        </section>
      </div>

      <section className="dash-calendar">
        <div className="dash-calendar__head">
          <h2>Calendario lavori</h2>
          <p className="dash-calendar__lead">
            Piano giorno per giorno. I fitofarmaci (diserbi, fungicidi, insetticidi) non hanno dose automatica: usa
            «Mantieni al rigenera» per i lavori da non cancellare.
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

        {soloControlliFoto ? (
          <p className="dash-calendar__warn dash-calendar__warn--piano" role="status">
            Vedi solo i <strong>controlli foto mensili</strong> perché il piano annuale lavori non è ancora stato
            generato. Clicca «Genera piano annuale completo» per tagli, concimi, diserbi e tutti i lavori stagionali.
          </p>
        ) : null}

        <CalendarioFiltri
          tipo={calTipo}
          ambito={calAmbito}
          meseLabel={formatMeseIt(meseCorrente)}
          conteggi={conteggiFiltri}
          onTipo={setCalTipo}
          onAmbito={setCalAmbito}
        />

        {loading || generatingPiano ? (
          <p className="dash-card__loading">
            {generatingPiano ? "Creazione piano annuale in corso… 1-2 minuti" : "Caricamento piano…"}
          </p>
        ) : (
          <>
            {groups.daFoto.length && calTipo === "tutti" ? (
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
                    onPinIntervento={togglePinIntervento}
                  />
                ))}
              </div>
            ) : null}

            {!mesi.length && !prossimi.length && !groups.daFoto.length && !groups.senzaData.length && hasPiano ? (
              <p className="dash-calendar-section__empty">
                Nessun lavoro con questo filtro
                {calAmbito === "mese" ? ` per ${formatMeseIt(meseCorrente)}` : ""}. Prova «Tutto l&apos;anno» o un altro
                tipo.
              </p>
            ) : null}

            {!mesi.length && prossimi.length ? (
              <InterventoSection
                title="Prossimi lavori"
                hint="Piano in agenda."
                items={prossimi}
                onToggle={toggleIntervento}
                onPin={togglePinIntervento}
              />
            ) : null}

            {!mesi.length && !prossimi.length && groups.senzaData.length ? (
              <InterventoSection
                title="Prossimi interventi"
                items={groups.senzaData}
                onToggle={toggleIntervento}
                onPin={togglePinIntervento}
              />
            ) : null}

            <InterventoSection
              title="Completati"
              items={groups.completati}
              onToggle={toggleIntervento}
              onPin={togglePinIntervento}
            />

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

      <LawnMapModal
        open={mapOpen}
        apiKey={GOOGLE_MAPS_API_KEY}
        purpose="boundary"
        initialLocalita={profile?.localita || ""}
        initialPratoZone={profile?.prato_zone}
        onClose={() => setMapOpen(false)}
        onApply={handleProfileMapApply}
      />
    </div>
  );
}
