export default function StepGuide({ intro, whatToDo, hint, reassurance, bullets, stepNumber, totalSteps }) {
  return (
    <aside className="step-guide" aria-label="Istruzioni passo corrente">
      <p className="step-guide__kicker">
        Passo {stepNumber} di {totalSteps}
      </p>
      {reassurance ? <p className="step-guide__reassurance">{reassurance}</p> : null}
      {intro ? <p className="step-guide__intro">{intro}</p> : null}
      {bullets?.length ? (
        <ul className="step-guide__bullets">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {whatToDo ? (
        <p className="step-guide__action">
          <span className="step-guide__action-label">Cosa fare adesso</span>
          {whatToDo}
        </p>
      ) : null}
      {hint ? <p className="step-guide__hint">{hint}</p> : null}
    </aside>
  );
}
