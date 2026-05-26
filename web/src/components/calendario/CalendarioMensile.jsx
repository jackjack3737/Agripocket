import { useMemo, useState } from "react";
import {
  CALENDARIO_AMBITI,
  CALENDARIO_TIPO_FILTRI,
  contaLavoriPianificatiFiltrati,
  filtraInterventiPerCalendario,
  formatDataIt,
  formatMeseIt,
  groupInterventiPerMese,
} from "../../lib/dashboard.js";
import { interventoToSolum } from "../../lib/mapInterventoSolum.js";
import { CalendarioFiltri } from "./CalendarioInterventi.jsx";
import TrattamentoDetailPanel from "./TrattamentoDetailPanel.jsx";

function TrattamentoRiga({
  item,
  selected,
  onSelect,
  userMq,
  onComplete,
  onPin,
  completing,
}) {
  const task = interventoToSolum(item);
  const done = item.stato === "completato";
  const isOpen = selected?.id === item.id;

  return (
    <li className={`cal-trattamento-item${isOpen ? " cal-trattamento-item--open" : ""}`}>
      <button
        type="button"
        className={[
          "cal-trattamento-riga w-full text-left",
          item.isRitardo ? " cal-trattamento-riga--ritardo" : "",
          done ? " cal-trattamento-riga--done" : "",
          isOpen ? " cal-trattamento-riga--selected" : "",
        ].join("")}
        onClick={() => onSelect(isOpen ? null : item)}
        aria-expanded={isOpen}
        aria-controls={isOpen ? `dettaglio-${item.id}` : undefined}
      >
        <span className="cal-trattamento-riga__icon" aria-hidden>
          {task.icona}
        </span>
        <span className="cal-trattamento-riga__main min-w-0">
          <span className="cal-trattamento-riga__meta">
            <time dateTime={item.data_prevista}>
              {item.isRitardo && item.data_originale
                ? `Era ${formatDataIt(item.data_originale)}`
                : formatDataIt(item.data_prevista)}
            </time>
            {item.isRitardo ? <span className="cal-trattamento-riga__badge">In ritardo</span> : null}
            {item.duplicati_uniti > 1 ? (
              <span className="cal-trattamento-riga__badge cal-trattamento-riga__badge--dup">
                ×{item.duplicati_uniti} uniti
              </span>
            ) : null}
          </span>
          <span className="cal-trattamento-riga__titolo">{task.titolo_semplice}</span>
          <span className="cal-trattamento-riga__hint line-clamp-1">{task.descrizione_semplice}</span>
        </span>
        <span className="cal-trattamento-riga__chev" aria-hidden>
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen ? (
        <div id={`dettaglio-${item.id}`} className="cal-trattamento-item__dettaglio">
          <TrattamentoDetailPanel
            layout="inline"
            item={item}
            userMq={userMq}
            onClose={() => onSelect(null)}
            onComplete={onComplete}
            onPin={onPin}
            completing={completing}
          />
        </div>
      ) : null}
    </li>
  );
}

function MeseAccordionClick({
  mese,
  open,
  onToggle,
  selected,
  onSelect,
  userMq,
  onComplete,
  onPin,
  completingId,
}) {
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
          {mese.total} {mese.total === 1 ? "trattamento" : "trattamenti"} · {mese.giorni.length}{" "}
          {mese.giorni.length === 1 ? "giorno" : "giorni"}
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
                <span className="dash-day__count">
                  {items.length} {items.length === 1 ? "lavoro" : "lavori"}
                </span>
              </h4>
              <ul className="cal-trattamento-list">
                {items.map((item) => (
                  <TrattamentoRiga
                    key={item.id}
                    item={item}
                    selected={selected}
                    onSelect={onSelect}
                    userMq={userMq}
                    onComplete={onComplete}
                    onPin={onPin}
                    completing={completingId === item.id}
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

export default function CalendarioMensile({
  interventi = [],
  loading = false,
  onComplete,
  onPin,
  onAggiornaPiano = null,
  generatingPiano = false,
  canAggiornaPiano = true,
  userMq = 150,
  meseCorrente,
}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const [tipo, setTipo] = useState("tutti");
  const [ambito, setAmbito] = useState("anno");
  const [selected, setSelected] = useState(null);
  const [completingId, setCompletingId] = useState(null);

  const filtrati = useMemo(
    () => filtraInterventiPerCalendario(interventi, { tipo, ambito, meseCorrente }),
    [interventi, tipo, ambito, meseCorrente],
  );

  const mesi = useMemo(
    () => groupInterventiPerMese(filtrati, { oggiIso: oggi }),
    [filtrati, oggi],
  );

  const [openMonths, setOpenMonths] = useState(() => new Set([meseCorrente || oggi.slice(0, 7)]));

  const conteggi = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(CALENDARIO_TIPO_FILTRI).map((k) => [
          k,
          contaLavoriPianificatiFiltrati(interventi, {
            tipo: k,
            ambito,
            meseCorrente,
          }),
        ]),
      ),
    [interventi, ambito, meseCorrente],
  );

  function toggleMonth(key) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleComplete(item) {
    if (!onComplete || !item) return;
    const ids = item.duplicati_ids?.length ? item.duplicati_ids : [item.id];
    setCompletingId(item.id);
    try {
      for (const id of ids) {
        await onComplete(id, true);
      }
      setSelected(null);
    } finally {
      setCompletingId(null);
    }
  }

  return (
    <div className="calendario-mensile">
      <div className="dash-calendar__head">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2>Il tuo calendario</h2>
            <p className="dash-calendar__lead">
              Tocca un trattamento per aprire sotto di esso prodotti, dosi e scienza. Tocca di nuovo
              per chiudere e riportare su la lista.
            </p>
          </div>
          {onAggiornaPiano ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm shrink-0"
              onClick={onAggiornaPiano}
              disabled={generatingPiano || !canAggiornaPiano}
            >
              {generatingPiano ? "Sincronizza…" : "Sincronizza piano"}
            </button>
          ) : null}
        </div>
      </div>

      <CalendarioFiltri
        tipo={tipo}
        ambito={ambito}
        meseLabel={formatMeseIt(meseCorrente)}
        conteggi={conteggi}
        onTipo={setTipo}
        onAmbito={setAmbito}
      />

      <div className="cal-layout cal-layout--inline">
        {loading ? (
          <p className="dash-calendar-section__empty">Caricamento calendario…</p>
        ) : mesi.length ? (
          <div className="dash-month-timeline">
            {mesi.map((mese) => (
              <MeseAccordionClick
                key={mese.monthKey}
                mese={mese}
                open={openMonths.has(mese.monthKey)}
                onToggle={() => toggleMonth(mese.monthKey)}
                selected={selected}
                onSelect={setSelected}
                userMq={userMq}
                onComplete={handleComplete}
                onPin={onPin}
                completingId={completingId}
              />
            ))}
          </div>
        ) : (
          <p className="dash-calendar__empty-block">
            Nessun trattamento in questo periodo. Usa «Sincronizza piano» per generare il programma
            annuale.
          </p>
        )}
      </div>
    </div>
  );
}
