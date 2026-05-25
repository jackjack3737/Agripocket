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
import "../../styles/calendario-solum.css";

const TAB_SETTIMANA = "settimana";
const TAB_DISPENSA = "dispensa";

export default function CalendarioSolum({
  interventi = [],
  onComplete,
  loading = false,
  onAggiornaPiano = null,
  generatingPiano = false,
  canAggiornaPiano = true,
}) {
  const [tab, setTab] = useState(TAB_SETTIMANA);
  const [completingId, setCompletingId] = useState(null);
  const [pianoFuturoOpen, setPianoFuturoOpen] = useState(false);
  const oggi = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
    <div className="calendario-solum min-h-0 py-2 sm:py-4">
      <div className="max-w-lg mx-auto px-1 sm:px-0">
        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-gray-800 tracking-tight">Il tuo calendario</h2>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              Solo ciò che conta oggi. La scienza resta a un tap di distanza.
            </p>
          </div>
          {onAggiornaPiano ? (
            <button
              type="button"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:border-gray-300 transition-colors disabled:opacity-40"
              onClick={onAggiornaPiano}
              disabled={generatingPiano || !canAggiornaPiano}
              title={generatingPiano ? "Generazione in corso" : "Aggiorna piano annuale"}
              aria-label="Aggiorna piano annuale"
            >
              <span className={generatingPiano ? "inline-block animate-spin" : ""} aria-hidden>
                🔄
              </span>
              <span className="hidden sm:inline">
                {generatingPiano ? "…" : "Aggiorna"}
              </span>
            </button>
          ) : null}
        </header>

        <nav
          className="flex p-1 rounded-xl bg-gray-100 mb-8"
          role="tablist"
          aria-label="Sezioni calendario"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === TAB_SETTIMANA}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              tab === TAB_SETTIMANA
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setTab(TAB_SETTIMANA)}
          >
            Questa settimana
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === TAB_DISPENSA}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
              tab === TAB_DISPENSA
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setTab(TAB_DISPENSA)}
          >
            La tua dispensa
          </button>
        </nav>

        {loading ? (
          <p className="text-center text-sm text-gray-500 py-16">Caricamento…</p>
        ) : (
          <div role="tabpanel">
            {tab === TAB_SETTIMANA ? (
              <>
                <WeeklyView
                  giorni={giorni}
                  inRitardo={inRitardo}
                  prossimoTask={prossimoTask}
                  onComplete={handleComplete}
                  completingId={completingId}
                />
                {haPianoFuturo ? (
                  <div className="mt-10 text-center">
                    <button
                      type="button"
                      className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                      onClick={() => setPianoFuturoOpen(true)}
                    >
                      Vedi tutti gli interventi futuri
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <DispensaView mesi={dispensa} />
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
