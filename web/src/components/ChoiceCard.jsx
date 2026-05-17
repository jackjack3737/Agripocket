export default function ChoiceCard({ option, selected, onSelect, hideThumb = false }) {
  const showThumb = option.image && !(hideThumb && selected);

  return (
    <button
      type="button"
      className={`choice-card${selected ? " choice-card--selected" : ""}${showThumb ? " choice-card--has-image" : ""}`}
      onClick={() => onSelect(option.value)}
      aria-pressed={selected}
    >
      {showThumb ? (
        <span className="choice-card__thumb" aria-hidden>
          <img src={option.image} alt="" loading="lazy" />
        </span>
      ) : null}
      <span className="choice-card__text">
        <span className="choice-card__label">{option.label}</span>
        {option.botanico ? <span className="choice-card__botanico">{option.botanico}</span> : null}
        {option.desc ? <span className="choice-card__desc">{option.desc}</span> : null}
        {option.help ? <span className="choice-card__help">{option.help}</span> : null}
      </span>
      <span className="choice-card__check" aria-hidden>
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}
