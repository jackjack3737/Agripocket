import { useState } from "react";

function StepImage({ src, caption }) {
  if (!src) return null;
  return (
    <figure className="observe-figure">
      <img src={src} alt="" loading="lazy" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export default function GrassObservationGuide({ guide, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!guide) return null;

  return (
    <section className="observe-guide">
      <button
        type="button"
        className="observe-guide__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{guide.title}</span>
        <span className="observe-guide__chevron">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="observe-guide__body observe-guide__body--open">
          {guide.lead ? <p className="observe-guide__lead">{guide.lead}</p> : null}
          <ol className="observe-steps">
            {guide.steps.map((s, i) => (
              <li key={i} className="observe-step">
                <span className="observe-step__title">{s.title}</span>
                <p>{s.body}</p>
                {s.note ? <p className="observe-note">{s.note}</p> : null}
                <StepImage src={s.image} caption={s.imageCaption} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
