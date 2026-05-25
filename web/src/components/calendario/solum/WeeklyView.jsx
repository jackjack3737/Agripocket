import TaskCard from "./TaskCard.jsx";

export default function WeeklyView({ giorni, inRitardo = [], onComplete, completingId }) {
  const totale = giorni.reduce((n, g) => n + g.tasks.length, 0);

  if (!totale && !inRitardo.length) {
    return (
      <div className="rounded-3xl bg-white border border-gray-100 p-8 text-center shadow-sm">
        <p className="text-4xl mb-3" aria-hidden>
          🌿
        </p>
        <p className="text-gray-800 font-medium">Settimana tranquilla</p>
        <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
          Nessun intervento nei prossimi 7 giorni. Controlla la dispensa per prepararti al mese prossimo.
        </p>
      </div>
    );
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
