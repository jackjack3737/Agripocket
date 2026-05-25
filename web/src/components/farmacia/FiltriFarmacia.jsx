import { FILTRI_AZIONE, FILTRI_MOLECOLA } from "./mockProdotti.js";

function PillGroup({ title, hint, options, selected, onToggle }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all border ${
                active
                  ? "bg-green-800 text-white border-green-800 shadow-sm"
                  : "bg-white text-gray-700 border-gray-200 hover:border-green-800/30 hover:bg-gray-50"
              }`}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FiltriFarmacia({
  azioniSelezionate,
  molecoleSelezionate,
  onToggleAzione,
  onToggleMolecola,
  onReset,
  risultati,
  variant = "sidebar",
}) {
  const isSidebar = variant === "sidebar";

  return (
    <aside
      className={
        isSidebar
          ? "farmacia-filtri lg:sticky lg:top-6 space-y-8"
          : "farmacia-filtri space-y-6"
      }
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-800 tracking-tight">Filtra per bisogno</h2>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Nessuna ricerca generica: solo ciò che il tuo prato richiede.
        </p>
        <p className="text-xs text-green-800 font-medium mt-3">
          {risultati} {risultati === 1 ? "prodotto idoneo" : "prodotti idonei"}
        </p>
      </div>

      <PillGroup
        title="Per azione"
        options={FILTRI_AZIONE}
        selected={azioniSelezionate}
        onToggle={onToggleAzione}
      />

      <PillGroup
        title="Per molecola"
        hint="Per chi vuole il dettaglio tecnico"
        options={FILTRI_MOLECOLA}
        selected={molecoleSelezionate}
        onToggle={onToggleMolecola}
      />

      {(azioniSelezionate.size > 0 || molecoleSelezionate.size > 0) && (
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-gray-500 hover:text-green-800 underline-offset-2 hover:underline"
        >
          Azzera filtri
        </button>
      )}
    </aside>
  );
}
