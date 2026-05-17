import { PROBLEMI_NOTI_OPTIONS } from "../data/onboardingSteps";

export default function ProblemiNotiPicker({ selected = [], onChange }) {
  function toggle(value) {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange([...set]);
  }

  return (
    <div className="problemi-picker">
      {PROBLEMI_NOTI_OPTIONS.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            className={`problemi-picker__item${on ? " problemi-picker__item--on" : ""}`}
            onClick={() => toggle(opt.value)}
            aria-pressed={on}
          >
            <span className="problemi-picker__label">{opt.label}</span>
            {opt.desc ? <span className="problemi-picker__desc">{opt.desc}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

