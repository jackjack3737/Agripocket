import { useMemo, useState } from "react";
import {
  dispensaPerMese,
  gruppiSettimanaCorrente,
  interventiInRitardoSolum,
  prossimoInterventoSolum,
  timelineFuturoSolum,
} from "../../lib/mapInterventoSolum.js";
import WeeklyView from "./solum/WeeklyView.jsx";
import DispensaView from "./solum/DispensaView.jsx";
import PianoFuturoPanel from "./solum/PianoFuturoPanel.jsx";
import { formatOggiIt } from "../../lib/oggiSimulato.js";
import "../../styles/calendario-solum.css";

const TAB_SETTIMANA = "settimana";
const TAB_DISPENSA = "dispensa";

const tabClass = (active) =>
  [
    "flex-1 rounded-full py-2.5 px-3 text-sm font-medium transition-all duration-200",
    active
      ? "bg-white text-slate-900 shadow-xs"
      : "text-slate-400 hover:text-slate-600 transition-colors",
  ].join(" ");

const DEFAULT_MQ = 150;

export default function CalendarioSolum({
  interventi = [],
  onComplete,
  loading = false,
  onAggiornaPiano = null,
  generatingPiano = false,
  canAggiornaPiano = true,
  userMq = DEFAULT_MQ,
  initialTab = null,
  oggiIso = null,
  oggiSimulato = false,
}) {
  const [tab, setTab] = useState(
    initialTab === TAB_DISPENSA ? TAB_DISPENSA : TAB_SETTIMANA,
  );
  const [completingId, setCompletingId] = useState(null);
  const [pianoFuturoOpen, setPianoFuturoOpen] = useState(false);
  const oggi = useMemo(
    () => oggiIso || new Date().toISOString().slice(0, 10),
    [oggiIso],
  );

  const giorni = useMemo(() => gruppiSettimanaCorrente(interventi, oggi), [interventi, oggi]);
  const dispensa = useMemo(() => dispensaPerMese(interventi, oggi), [interventi, oggi]);
  const inRitardo = useMemo(() => interventiInRitardoSolum(interventi, oggi), [interventi, oggi]);
  const prossimoTask = useMemo(() => prossimoInterventoSolum(interventi, oggi), [interventi, oggi]);
  const timelineFuturo = useMemo(() => timelineFuturoSolum(interventi, oggi), [interventi, oggi]);
  const haPianoFuturo = timelineFuturo.some((m) => m.tasks.length > 0);

  async function handleComplete(id) {
    if (!onComplete) return;
    setCompletingId(id);
    try {
      await onComplete(id, true);
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <div className="calendario-solum min-h-full bg-slate-50/50">
      <div className="max-w-lg mx-auto px-6 sm:px-8 py-10 sm:py-14">
        {oggiSimulato ? (
          <p
            className="mb-6 text-center text-[11px] font-medium text-amber-800/90 bg-amber-50/90 border border-amber-100/80 rounded-full px-4 py-2"
            role="status"
          >
            Vista simulata — oggi è il {formatOggiIt(oggi)}
          </p>
        ) : null}
        <header className="flex items-start justify-between gap-6 mb-12">
          <div className="min-w-0">
            <h2 className="text-2xl sm:text-[1.65rem] font-semibold text-slate-900 tracking-tight">
              Il tuo calendario
            </h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-[18rem]">
              Solo ciò che conta oggi. La scienza resta a un tap di distanza.
            </p>
          </div>
          {onAggiornaPiano ? (
            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-xs transition-colors disabled:opacity-40"
              onClick={onAggiornaPiano}
              disabled={generatingPiano || !canAggiornaPiano}
              title={generatingPiano ? "Sincronizzazione in corso" : "Sincronizza piano annuale"}
              aria-label="Sincronizza piano annuale"
            >
              <span
                className={`text-sm leading-none ${generatingPiano ? "inline-block animate-spin" : ""}`}
                aria-hidden
              >
                🔄
              </span>
              <span>{generatingPiano ? "…" : "Sincronizza"}</span>
            </button>
          ) : null}
        </header>

        <nav
          className="flex p-1 rounded-full bg-slate-100/80 mb-12"
          role="tablist"
          aria-label="Sezioni calendario"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === TAB_SETTIMANA}
            className={tabClass(tab === TAB_SETTIMANA)}
            onClick={() => setTab(TAB_SETTIMANA)}
          >
            Questa settimana
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === TAB_DISPENSA}
            className={tabClass(tab === TAB_DISPENSA)}
            onClick={() => setTab(TAB_DISPENSA)}
          >
            La tua dispensa
          </button>
        </nav>

        {loading ? (
          <p className="text-center text-sm text-slate-400 py-24 tracking-wide">Caricamento…</p>
        ) : (
          <div role="tabpanel" className="pb-8">
            {tab === TAB_SETTIMANA ? (
              <>
                <WeeklyView
                  giorni={giorni}
                  inRitardo={inRitardo}
                  prossimoTask={prossimoTask}
                  onComplete={handleComplete}
                  completingId={completingId}
                  userMq={userMq}
                />
                {haPianoFuturo ? (
                  <div className="mt-14 text-center">
                    <button
                      type="button"
                      className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors"
                      onClick={() => setPianoFuturoOpen(true)}
                    >
                      Vedi tutti gli interventi futuri
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <DispensaView mesi={dispensa} userMq={userMq} />
            )}
          </div>
        )}
      </div>

      <PianoFuturoPanel
        mesi={timelineFuturo}
        open={pianoFuturoOpen}
        onClose={() => setPianoFuturoOpen(false)}
      />
    </div>
  );
}
