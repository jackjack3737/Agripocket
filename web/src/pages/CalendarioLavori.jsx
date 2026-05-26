import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import DashPageHeader from "../components/DashPageHeader";
import CalendarioMensile from "../components/calendario/CalendarioMensile";
import {
  loadTimelineBisogni,
  saveTimelineBisogni,
  timelineDaInterventi,
} from "../lib/timelineBisogni";
import {
  filtraInterventiPerCalendario,
  haCalendarioStagionale,
  loadInterventi,
  syncControlliMensili,
  setInterventoCompletato,
  setInterventoManualOverride,
  sortInterventiCronologico,
} from "../lib/dashboard";
import { generaPianoAnnuale } from "../lib/generaPiano";
import { arricchisciProdottiCalendario, CALENDARIO_REFRESH_EVENT } from "../lib/calendarioMeteoClient";
import { supabase } from "../lib/supabase";
import { parseMqInput } from "../lib/parseMq";

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
      return `Analisi foto: ${parts.join(", ")}. Calendario aggiornato.`;
    }
    const n = location.state.interventiCount;
    return n
      ? `Analisi foto: ${n} interventi in agenda.`
      : "Piano aggiornato dall'ultima analisi foto.";
  });
  const [generatingPiano, setGeneratingPiano] = useState(false);

  const hasPiano = haCalendarioStagionale(interventi);
  const autoPianoStarted = useRef(false);
  const meseCorrente = new Date().toISOString().slice(0, 7);

  const interventiCalendario = interventi;

  const soloControlliFoto =
    !hasPiano && interventi.some((i) => i.fonte === "controllo_mensile" && i.stato === "pianificato");

  async function refresh() {
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      await syncControlliMensili(userId).catch(() => 0);
      let list = await loadInterventi(userId);

      const trattamentoCats = new Set([
        "concime",
        "biostimolante",
        "umettante",
        "trattamento",
        "diserbo",
        "rinnovo",
      ]);
      const senzaProdotti = list.some((i) => {
        if (i.stato !== "pianificato" || !trattamentoCats.has(String(i.categoria || "").toLowerCase())) {
          return false;
        }
        let det = i.dettaglio_trattamento;
        if (typeof det === "string") {
          try {
            det = JSON.parse(det);
          } catch {
            det = null;
          }
        }
        return !(det?.prodotti_consigliati?.length > 0);
      });

      if (senzaProdotti && haCalendarioStagionale(list)) {
        try {
          const enrich = await arricchisciProdottiCalendario();
          if (enrich.updated > 0) {
            list = await loadInterventi(userId);
            setBanner(enrich.messaggio || `Prodotti collegati a ${enrich.updated} lavori.`);
          }
        } catch (enrichErr) {
          console.warn("[calendario] enrich prodotti:", enrichErr.message);
        }
      }

      setInterventi(list);
      const stored = loadTimelineBisogni(userId);
      if (!stored && list.length) {
        saveTimelineBisogni(userId, timelineDaInterventi(list, new Date().toISOString().slice(0, 10)));
      }
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
      if (result.timeline_bisogni && userId) {
        saveTimelineBisogni(userId, result.timeline_bisogni);
      }
      setBanner(`Piano creato: ${result.count} lavori in agenda.`);
      await refresh();
    } catch (e) {
      const msg =
        e.name === "AbortError"
          ? "Generazione troppo lunga. Riprova con «Aggiorna piano»."
          : e.message;
      setError(msg);
      autoPianoStarted.current = false;
    } finally {
      setGeneratingPiano(false);
    }
  }

  async function togglePin(id, manualOverride) {
    try {
      await setInterventoManualOverride(id, manualOverride);
      setInterventi((prev) =>
        prev.map((i) => (i.id === id ? { ...i, manual_override: !!manualOverride } : i)),
      );
    } catch (e) {
      setError(e.message);
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
      throw e;
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="page dashboard dashboard--calendario">
      <DashPageHeader
        active="calendario"
        profile={profile}
        session={session}
        onLogout={logout}
        onAgronomoAnalisiComplete={() => refresh()}
      />

      {banner ? (
        <p className="dash-banner">
          {banner}
          <button type="button" className="dash-banner__close" onClick={() => setBanner("")} aria-label="Chiudi">
            ×
          </button>
        </p>
      ) : null}

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      {soloControlliFoto ? (
        <p className="dash-calendar__warn dash-calendar__warn--piano" role="status">
          Solo i <strong>controlli foto mensili</strong> sono visibili. Usa «Crea piano annuale» per il programma
          completo.
        </p>
      ) : null}

      {!profile?.localita ? (
        <p className="text-sm text-gray-500 px-4 mb-4">
          <Link to="/onboarding" className="underline text-gray-700">
            Imposta la località
          </Link>{" "}
          nel profilo per generare il piano.
        </p>
      ) : null}

      <section className="dash-calendar dash-calendar--wide pb-12">
        <CalendarioMensile
          interventi={interventiCalendario}
          onComplete={toggleIntervento}
          onPin={togglePin}
          loading={loading || generatingPiano}
          onAggiornaPiano={handleGeneraPiano}
          generatingPiano={generatingPiano}
          canAggiornaPiano={!!profile?.localita}
          userMq={parseMqInput(profile?.superficie_mq) ?? profile?.superficie_mq ?? null}
          meseCorrente={meseCorrente}
        />
      </section>
    </div>
  );
}
