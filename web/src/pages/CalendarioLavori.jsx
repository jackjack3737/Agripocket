import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import DashPageHeader from "../components/DashPageHeader";
import {
  CalendarioFiltri,
  InterventoSection,
  MeseAccordion,
  TimelineBisogni,
} from "../components/calendario/CalendarioInterventi";
import {
  loadTimelineBisogni,
  saveTimelineBisogni,
  timelineDaInterventi,
} from "../lib/timelineBisogni";
import { abitudiniDaProfilo } from "../lib/abitudiniPrato.js";
import {
  contaLavoriPianificatiFiltrati,
  filtraInterventiPerCalendario,
  groupInterventi,
  interventiInRitardo,
  formatMeseIt,
  groupInterventiPerMese,
  haCalendarioStagionale,
  prossimiInterventi,
  loadInterventi,
  syncControlliMensili,
  setInterventoCompletato,
  setInterventoManualOverride,
  sortInterventiCronologico,
} from "../lib/dashboard";
import { generaPianoAnnuale } from "../lib/generaPiano";
import { CALENDARIO_REFRESH_EVENT } from "../lib/calendarioMeteoClient";
import { supabase } from "../lib/supabase";

function AbitudiniPratoCard({ profile }) {
  const abitudini = useMemo(() => abitudiniDaProfilo(profile), [profile]);
  if (!abitudini.length) return null;
  return (
    <section className="dash-card dash-abitudini">
      <h2 className="dash-card__title">Le tue abitudini</h2>
      <p className="dash-card__lead">
        Taglio e irrigazione non compaiono nel calendario lavori: segui queste routine dal profilo.
      </p>
      <ul className="dash-abitudini__list">
        {abitudini.map((a) => (
          <li key={a.id} className="dash-abitudini__item">
            <span className="dash-abitudini__icon" aria-hidden>
              {a.icon}
            </span>
            <div className="dash-abitudini__body">
              <strong>{a.titolo}</strong>
              <p>{a.descrizione}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CalendarioLavori({ profile, session }) {
  const location = useLocation();
  const userId = session?.user?.id;

  const [interventi, setInterventi] = useState([]);
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
  const [timelineBisogni, setTimelineBisogni] = useState(null);

  const hasPiano = haCalendarioStagionale(interventi);
  const superficieMq = profile?.superficie_mq ?? null;
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
  const inRitardo = useMemo(() => interventiInRitardo(interventiCalendario), [interventiCalendario]);

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
      const list = await loadInterventi(userId);
      setInterventi(list);
      const stored = loadTimelineBisogni(userId);
      setTimelineBisogni(
        stored || (list.length ? timelineDaInterventi(list, new Date().toISOString().slice(0, 10)) : null),
      );
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
    const onRefresh = () => refresh();
    window.addEventListener(CALENDARIO_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(CALENDARIO_REFRESH_EVENT, onRefresh);
  }, [userId]);

  useEffect(() => {
    if (loading || !userId || !profile?.localita || hasPiano || generatingPiano) return;
    if (autoPianoStarted.current) return;
    autoPianoStarted.current = true;
    setBanner("Creazione automatica del piano annuale… (1-2 minuti, non chiudere la pagina)");
    handleGeneraPiano();
  }, [loading, userId, profile?.localita, hasPiano, generatingPiano]);

  async function handleGeneraPiano() {
    setGeneratingPiano(true);
    setError("");
    try {
      const result = await generaPianoAnnuale();
      if (result.timeline_bisogni) {
        saveTimelineBisogni(userId, result.timeline_bisogni);
        setTimelineBisogni(result.timeline_bisogni);
      }
      setBanner(`Calendario annuale creato: ${result.count} lavori in agenda (diagnostica Solum, senza catalogo brand).`);
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
              : i,
          ),
        ),
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
        prev.map((i) => (i.id === id ? { ...i, manual_override: !!manualOverride } : i)),
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
    <div className="page dashboard dashboard--calendario">
      <DashPageHeader active="calendario" profile={profile} onLogout={logout} />

      {banner ? (
        <p className="dash-banner">
          {banner}
          <button type="button" className="dash-banner__close" onClick={() => setBanner("")} aria-label="Chiudi">
            ×
          </button>
        </p>
      ) : null}

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      <AbitudiniPratoCard profile={profile} />

      <section className="dash-calendar">
        <div className="dash-calendar__head">
          <p className="dash-calendar__lead">
            Piano predittivo giorno per giorno: necessità molecolari e fisiologiche (NPK, biostimolanti, principi attivi).
            Nessun catalogo commerciale. Usa «Mantieni al rigenera» per i lavori da conservare alla rigenerazione.
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
              <p className="dash-calendar__warn">
                <Link to="/onboarding">Imposta la località</Link> nel profilo.
              </p>
            ) : null}
          </div>
        </div>

        {soloControlliFoto ? (
          <p className="dash-calendar__warn dash-calendar__warn--piano" role="status">
            Vedi solo i <strong>controlli foto mensili</strong> perché il piano annuale lavori non è ancora stato
            generato. Clicca «Genera piano annuale completo» per concimi, diserbi e lavori strategici stagionali.
          </p>
        ) : null}

        {hasPiano && timelineBisogni ? <TimelineBisogni timeline={timelineBisogni} /> : null}

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
            {inRitardo.length ? (
              <InterventoSection
                title="Interventi in sospeso / in ritardo"
                hint="Date passate: completa o aggiorna il piano. Il Radar tiene conto di questi lavori."
                items={inRitardo}
                superficieMq={superficieMq}
                onToggle={toggleIntervento}
                onPin={togglePinIntervento}
              />
            ) : null}

            {groups.daFoto.length && calTipo === "tutti" ? (
              <InterventoSection
                title="Urgenti dall'analisi foto"
                hint="Dall'ultima foto."
                items={groups.daFoto}
                superficieMq={superficieMq}
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
                    superficieMq={superficieMq}
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
                superficieMq={superficieMq}
                onToggle={toggleIntervento}
                onPin={togglePinIntervento}
              />
            ) : null}

            {!mesi.length && !prossimi.length && groups.senzaData.length ? (
              <InterventoSection
                title="Prossimi interventi"
                items={groups.senzaData}
                superficieMq={superficieMq}
                onToggle={toggleIntervento}
                onPin={togglePinIntervento}
              />
            ) : null}

            <InterventoSection
              title="Completati"
              items={groups.completati}
              superficieMq={superficieMq}
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
    </div>
  );
}
