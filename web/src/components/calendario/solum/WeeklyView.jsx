import { formatDataIt } from "../../../lib/dashboard.js";
import TaskCard from "./TaskCard.jsx";

function TeaserProssimoIntervento({ task }) {
  const dataLabel = formatDataIt(task.data_prevista);

  return (
    <div className="mt-16 pt-10 border-t border-slate-100/80 max-w-sm mx-auto text-left">
      <p className="text-[10px] tracking-widest text-slate-400 font-bold uppercase">
        In programma il {dataLabel}
      </p>
      <h4 className="mt-3 text-lg font-semibold text-slate-900 tracking-tight leading-snug break-words line-clamp-2">
        {task.titolo_semplice}
      </h4>
      <p className="mt-2 text-sm text-slate-500 leading-relaxed break-words line-clamp-2">
        {task.descrizione_semplice}
      </p>
    </div>
  );
}

function SettimanaTranquilla({ prossimoTask }) {
  return (
    <div className="py-16 sm:py-20 text-center">
      <p className="text-6xl sm:text-7xl mb-8 select-none" aria-hidden>
        🌿
      </p>
      <h3 className="text-xl font-semibold text-slate-900 tracking-tight">Settimana tranquilla</h3>
      <p className="text-sm text-slate-500 mt-3 max-w-[16rem] mx-auto leading-relaxed font-light">
        Il tuo prato al momento non ha bisogno di interventi. Goditi il risultato.
      </p>
      {prossimoTask ? <TeaserProssimoIntervento task={prossimoTask} /> : null}
    </div>
  );
}

const sectionLabelClass =
  "text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-5";

export default function WeeklyView({
  giorni,
  inRitardo = [],
  prossimoTask = null,
  onComplete,
  completingId,
}) {
  const totale = giorni.reduce((n, g) => n + g.tasks.length, 0);

  if (!totale && !inRitardo.length) {
    return <SettimanaTranquilla prossimoTask={prossimoTask} />;
  }

  return (
    <div className="space-y-12">
      {inRitardo.length ? (
        <section aria-labelledby="solum-ritardo">
          <h3 id="solum-ritardo" className={`${sectionLabelClass} text-amber-600/90`}>
            Da recuperare
          </h3>
          <ul className="space-y-4">
            {inRitardo.map((task) => (
              <li key={task.id}>
                <TaskCard task={task} onComplete={onComplete} completingId={completingId} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {giorni.map((giorno) => {
        if (!giorno.tasks.length) return null;
        return (
          <section key={giorno.data} aria-labelledby={`giorno-${giorno.data}`}>
            <h3 id={`giorno-${giorno.data}`} className={sectionLabelClass}>
              {giorno.etichetta}
            </h3>
            <ul className="space-y-4">
              {giorno.tasks.map((task) => (
                <li key={task.id}>
                  <TaskCard task={task} onComplete={onComplete} completingId={completingId} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
