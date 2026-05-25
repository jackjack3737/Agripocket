import { formatDataIt } from "../../../lib/dashboard.js";
import TaskCard from "./TaskCard.jsx";

function SettimanaTranquilla({ prossimoTask }) {
  return (
    <div className="bg-green-50 rounded-2xl p-6 text-center border border-green-100">
      <h3 className="text-xl font-bold text-gray-800">Settimana tranquilla 🌿</h3>
      <p className="text-gray-600 mt-2 max-w-sm mx-auto">
        Il tuo prato al momento non ha bisogno di interventi. Goditi il risultato!
      </p>
      {prossimoTask ? (
        <div className="mt-6 p-4 bg-white rounded-xl shadow-sm border border-green-100 text-left">
          <span className="text-xs font-bold text-solum-green uppercase tracking-wide">
            In programma il {formatDataIt(prossimoTask.data_prevista)}
          </span>
          <h4 className="font-bold text-gray-800 mt-1">{prossimoTask.titolo_semplice}</h4>
          <p className="text-sm text-gray-500 mt-1">{prossimoTask.descrizione_semplice}</p>
        </div>
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
    <div className="space-y-8">
      {inRitardo.length ? (
        <section aria-labelledby="solum-ritardo">
          <h3
            id="solum-ritardo"
            className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3"
          >
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
            <h3
              id={`giorno-${giorno.data}`}
              className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 sticky top-0 bg-gray-50/90 backdrop-blur py-1 z-10"
            >
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
