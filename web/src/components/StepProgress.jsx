export default function StepProgress({ current, total }) {
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="step-progress" aria-label={`${current + 1} di ${total}`}>
      <div className="step-progress__track">
        <div className="step-progress__bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="step-progress__text">
        {String(current + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
}
