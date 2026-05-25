import { formatDataIt } from "../../../lib/dashboard.js";
import TaskCard from "./TaskCard.jsx";

function SettimanaTranquilla({ prossimoTask }) {
  return (
    <div className="py-10 text-center">
      <p className="text-5xl mb-5" aria-hidden>
        🌿
      </p>
      <h3 className="text-xl font-semibold text-gray-800 tracking-tight">Settimana tranquilla</h3>
      <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto leading-relaxed">
        Il tuo prato al momento non ha bisogno di interventi. Goditi il risultato!
      </p>

      {prossimoTask ? (
        <>
          <div className="mt-10 border-t border-gray-100 pt-8 max-w-sm mx-auto text-left">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              In programma il {formatDataIt(prossimoTask.data_prevista)}
            </p>
            <h4 className="text-base font-semibold text-gray-800 mt-2 leading-snug">
              {prossimoTask.titolo_semplice}
            </h4>
            <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">
              {prossimoTask.descrizione_semplice}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

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
    <div className="space-y-10">
      {inRitardo.length ? (
        <section aria-labelledby="solum-ritardo">
          <h3
            id="solum-ritardo"
            className="text-[11px] font-medium uppercase tracking-wider text-amber-700/90 mb-4"
          >
            Da recuperare
          </h3>
          <ul className="space-y-5">
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
            <h3
              id={`giorno-${giorno.data}`}
              className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-4"
            >
              {giorno.etichetta}
            </h3>
            <ul className="space-y-5">
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
