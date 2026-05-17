import { useState } from "react";
import { speciesForTipo } from "../data/grassSpecies";

export default function GrassSpeciesPicker({ tipoSeme, value, onChange }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");

  if (!tipoSeme || tipoSeme === "non_so") return null;

  const species = speciesForTipo(tipoSeme);
  if (!species.length) return null;

  const isCustom = value && !species.some((s) => s.scientific === value);

  function select(scientific) {
    onChange(value === scientific ? "" : scientific);
    setCustomOpen(false);
    setCustomText("");
  }

  function applyCustom(e) {
    e.preventDefault();
    const t = customText.trim();
    if (t) onChange(t);
    setCustomOpen(false);
  }

  return (
    <section className="grass-species" aria-label="Selezione specie botanica facoltativa">
      <h3 className="grass-species__title">Conosci la specie? (facoltativo)</h3>
      <p className="grass-species__lead">
        Se riconosci il genere o il nome latino dal sacco di semi o da un’analisi precedente, selezionalo qui.
      </p>
      <div className="grass-species__chips" role="group" aria-label="Specie botaniche">
        {species.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`grass-species__chip${value === s.scientific ? " grass-species__chip--active" : ""}`}
            onClick={() => select(s.scientific)}
            aria-pressed={value === s.scientific}
          >
            <span className="grass-species__scientific">{s.scientific}</span>
            {s.common ? <span className="grass-species__common">{s.common}</span> : null}
          </button>
        ))}
        <button
          type="button"
          className={`grass-species__chip grass-species__chip--other${isCustom ? " grass-species__chip--active" : ""}`}
          onClick={() => setCustomOpen((o) => !o)}
          aria-expanded={customOpen}
        >
          Altra specie…
        </button>
      </div>
      {isCustom && !customOpen ? (
        <p className="grass-species__selected">
          Selezionato: <em>{value}</em>
          <button type="button" className="grass-species__clear" onClick={() => onChange("")}>
            Rimuovi
          </button>
        </p>
      ) : null}
      {customOpen ? (
        <form className="grass-species__custom" onSubmit={applyCustom}>
          <input
            type="text"
            placeholder="es. Schedonorus arundinaceus, Poa trivialis…"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-outline-sm" disabled={!customText.trim()}>
            Usa
          </button>
        </form>
      ) : null}
    </section>
  );
}
