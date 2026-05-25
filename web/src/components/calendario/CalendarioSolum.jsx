import { useMemo, useState } from "react";
import {
  dispensaPerMese,
  gruppiSettimanaCorrente,
  interventiInRitardoSolum,
} from "../../lib/mapInterventoSolum.js";
import WeeklyView from "./solum/WeeklyView.jsx";
import DispensaView from "./solum/DispensaView.jsx";
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
  const oggi = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const giorni = useMemo(() => gruppiSettimanaCorrente(interventi, oggi), [interventi, oggi]);
  const dispensa = useMemo(() => dispensaPerMese(interventi, oggi), [interventi, oggi]);
  const inRitardo = useMemo(() => interventiInRitardoSolum(interventi, oggi), [interventi, oggi]);

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
              <WeeklyView
                giorni={giorni}
                inRitardo={inRitardo}
                onComplete={handleComplete}
                completingId={completingId}
              />
            ) : (
              <DispensaView mesi={dispensa} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
