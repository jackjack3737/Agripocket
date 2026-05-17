import { GRASS_VISUAL_EXAM } from "../data/grassVisualExam";

function ExamFigure({ src, caption }) {
  if (!src) return null;
  return (
    <figure className="gvexam-figure">
      <img src={src} alt="" loading="lazy" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function ComparePair({ test }) {
  return (
    <div className="gvexam-compare">
      <div className="gvexam-compare__col">
        <ExamFigure src={test.imageA} caption={test.captionA} />
      </div>
      <div className="gvexam-compare__col">
        <ExamFigure src={test.imageB} caption={test.captionB} />
      </div>
    </div>
  );
}

export default function GrassVisualExam({ options, selected, onSelect }) {
  const exam = GRASS_VISUAL_EXAM;

  return (
    <div className="gvexam">
      <p className="gvexam__intro">
        Non serve sapere il nome del sacco di semi. Osserviamo solo i fili d&apos;erba: in due minuti capiamo che
        tipo di prato hai.
      </p>

      <section className="gvexam-block">
        <h2 className="gvexam-block__title">{exam.prepare.title}</h2>
        <p className="gvexam-block__text">{exam.prepare.text}</p>
        <ExamFigure src={exam.prepare.image} caption={exam.prepare.caption} />
      </section>

      {exam.tests.map((test) => (
        <section key={test.id} className="gvexam-block">
          <h2 className="gvexam-block__title">{test.title}</h2>
          <p className="gvexam-block__text">{test.question}</p>
          {test.imageA ? (
            <ComparePair test={test} />
          ) : (
            <ExamFigure src={test.image} caption={test.caption} />
          )}
          {test.note ? <p className="gvexam-block__note">{test.note}</p> : null}
        </section>
      ))}

      <section className="gvexam-result">
        <h2 className="gvexam-result__title">{exam.resultIntro}</h2>
        <ul className="gvexam-choices">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                className={`gvexam-choice${selected === opt.value ? " gvexam-choice--selected" : ""}`}
                onClick={() => onSelect(opt.value)}
                aria-pressed={selected === opt.value}
              >
                <span className="gvexam-choice__label">{opt.label}</span>
                {opt.desc ? <span className="gvexam-choice__desc">{opt.desc}</span> : null}
                {opt.species?.length ? (
                  <span className="gvexam-choice__species">{opt.species.join(" · ")}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
