import { useMemo } from "react";
import { formatDataIt } from "../../../lib/dashboard.js";
import TaskCard from "./TaskCard.jsx";

const MESI_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

function partiData(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const weekday = d.toLocaleDateString("it-IT", { weekday: "long" });
  const month = MESI_IT[d.getMonth()] || d.toLocaleDateString("it-IT", { month: "long" });
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    dayNum: d.getDate(),
    month: month.charAt(0).toUpperCase() + month.slice(1),
  };
}

function TeaserProssimoIntervento({ task }) {
  const dataLabel = formatDataIt(task.data_prevista);

  return (
    <div className="mt-16 pt-10 border-t border-slate-100 max-w-sm mx-auto text-left">
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

function ColonnaData({ iso, isOggi, ritardo }) {
  const { weekday, dayNum, month } = partiData(iso);

  return (
    <div
      className={[
        "w-16 shrink-0 flex flex-col items-end text-right pt-1 pr-0.5",
        isOggi ? "relative" : "",
      ].join(" ")}
    >
      {ritardo ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
          Ritardo
        </span>
      ) : (
        <span
          className={[
            "text-xs uppercase tracking-wide",
            isOggi ? "text-[#2d6a4f] font-medium" : "text-slate-500",
          ].join(" ")}
        >
          {weekday}
        </span>
      )}
      <span
        className={[
          "text-2xl leading-none mt-0.5 tabular-nums",
          isOggi ? "font-semibold text-[#2d6a4f]" : "font-light text-slate-800",
        ].join(" ")}
      >
        {dayNum}
      </span>
      <span className={["text-xs mt-0.5", isOggi ? "text-[#2d6a4f]/80" : "text-slate-500"].join(" ")}>
        {month}
      </span>
      {isOggi ? (
        <span
          className="mt-2 mr-1 w-1.5 h-1.5 rounded-full bg-[#2d6a4f]"
          aria-hidden
          title="Oggi"
        />
      ) : null}
    </div>
  );
}

function RigaTimeline({ iso, tasks, isOggi, ritardo, onComplete, completingId, userMq }) {
  if (!tasks.length) return null;

  return (
    <div className="flex gap-4 sm:gap-6">
      <ColonnaData iso={iso} isOggi={isOggi} ritardo={ritardo} />
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onComplete={onComplete}
            completingId={completingId}
            userMq={userMq}
          />
        ))}
      </div>
    </div>
  );
}

export default function WeeklyView({
  giorni,
  inRitardo = [],
  prossimoTask = null,
  onComplete,
  completingId,
  userMq = 150,
}) {
  const oggiIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const totale = giorni.reduce((n, g) => n + g.tasks.length, 0);

  if (!totale && !inRitardo.length) {
    return <SettimanaTranquilla prossimoTask={prossimoTask} />;
  }

  const giorniConTask = giorni.filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-10 sm:space-y-12">
      {inRitardo.length > 0 ? (
        <section aria-labelledby="solum-ritardo" className="space-y-8">
          <h3
            id="solum-ritardo"
            className="text-[10px] font-bold uppercase tracking-widest text-amber-600/90 pl-[4.5rem] sm:pl-[5.5rem]"
          >
            Da recuperare
          </h3>
          <div className="space-y-10 sm:space-y-12">
            {inRitardo.map((task) => (
              <RigaTimeline
                key={task.id}
                iso={task.data_prevista || oggiIso}
                tasks={[task]}
                isOggi={task.data_prevista === oggiIso}
                ritardo
                onComplete={onComplete}
                completingId={completingId}
                userMq={userMq}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-10 sm:space-y-12" aria-label="Interventi della settimana">
        {giorniConTask.map((giorno) => (
          <RigaTimeline
            key={giorno.data}
            iso={giorno.data}
            tasks={giorno.tasks}
            isOggi={giorno.data === oggiIso}
            onComplete={onComplete}
            completingId={completingId}
            userMq={userMq}
          />
        ))}
      </div>
    </div>
  );
}
