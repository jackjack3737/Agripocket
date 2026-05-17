/** Domande rapide → quale opzione scegliere (passo tipo erba) */
export default function GrassQuickGuide({ questions }) {
  if (!questions?.length) return null;

  return (
    <section className="grass-quick" aria-label="Domande rapide per capire il tipo di erba">
      <h2 className="grass-quick__title">Due domande veloci (30 secondi)</h2>
      <p className="grass-quick__lead">
        Non serve il nome del sacco di semi. Rispondi a occhio: ti indichiamo quale riga toccare sotto.
      </p>
      <ol className="grass-quick__list">
        {questions.map((item, i) => (
          <li key={i} className="grass-quick__item">
            <p className="grass-quick__q">{item.question}</p>
            <div className="grass-quick__answers">
              {item.yes ? (
                <p className="grass-quick__a grass-quick__a--yes">
                  <span className="grass-quick__label">Sì</span> → {item.yes}
                </p>
              ) : null}
              {item.no ? (
                <p className="grass-quick__a grass-quick__a--no">
                  <span className="grass-quick__label">No</span> → {item.no}
                </p>
              ) : null}
              {item.either ? (
                <p className="grass-quick__a grass-quick__a--either">
                  <span className="grass-quick__label">Dipende / non so</span> → {item.either}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
