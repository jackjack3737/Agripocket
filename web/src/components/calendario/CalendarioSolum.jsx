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
  headerSlot = null,
  actionsSlot = null,
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
    <div className="calendario-solum min-h-0 bg-gray-50 rounded-3xl p-4 sm:p-6 -mx-1 sm:mx-0">
      <div className="max-w-lg mx-auto">
        {headerSlot ? <div className="mb-4">{headerSlot}</div> : (
          <header className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 tracking-tight">Il tuo calendario</h2>
            <p className="text-sm text-gray-500 mt-1">
              Solo ciò che conta oggi. La scienza resta a un tap di distanza.
            </p>
          </header>
        )}

        {actionsSlot ? <div className="mb-5">{actionsSlot}</div> : null}

        <nav
          className="flex gap-1 p-1 rounded-2xl bg-white border border-gray-100 shadow-sm mb-6"
          role="tablist"
          aria-label="Sezioni calendario"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === TAB_SETTIMANA}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              tab === TAB_SETTIMANA
                ? "bg-solum-green text-white shadow-sm"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
            onClick={() => setTab(TAB_SETTIMANA)}
          >
            Questa settimana
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === TAB_DISPENSA}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
              tab === TAB_DISPENSA
                ? "bg-solum-green text-white shadow-sm"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
            onClick={() => setTab(TAB_DISPENSA)}
          >
            La tua dispensa
          </button>
        </nav>

        {loading ? (
          <p className="text-center text-sm text-gray-500 py-12">Caricamento…</p>
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
                  <div className="mt-8 text-center">
                    <button
                      type="button"
                      className="text-sm font-semibold text-solum-green hover:text-solum-green/80 transition-colors px-4 py-2 rounded-xl hover:bg-solum-green-light/50"
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
