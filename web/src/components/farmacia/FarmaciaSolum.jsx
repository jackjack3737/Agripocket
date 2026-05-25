import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import FiltriFarmacia from "./FiltriFarmacia.jsx";
import FarmacoCard from "./FarmacoCard.jsx";
import {
  MOCK_PRODOTTI_FARMACIA,
  prodottoPassaFiltri,
} from "./mockProdotti.js";
import "../../styles/farmacia-solum.css";

const DEFAULT_MQ = 150;

export default function FarmaciaSolum({
  prodotti = MOCK_PRODOTTI_FARMACIA,
  userMq = DEFAULT_MQ,
}) {
  const [azioni, setAzioni] = useState(() => new Set());
  const [molecole, setMolecole] = useState(() => new Set());
  const [filtriAperti, setFiltriAperti] = useState(false);

  const mq = Math.max(1, Number(userMq) || DEFAULT_MQ);

  const filtrati = useMemo(
    () => prodotti.filter((p) => prodottoPassaFiltri(p, azioni, molecole)),
    [prodotti, azioni, molecole],
  );

  function toggleAzione(id) {
    setAzioni((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMolecola(id) {
    setMolecole((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetFiltri() {
    setAzioni(new Set());
    setMolecole(new Set());
  }

  const filtriProps = {
    azioniSelezionate: azioni,
    molecoleSelezionate: molecole,
    onToggleAzione: toggleAzione,
    onToggleMolecola: toggleMolecola,
    onReset: resetFiltri,
    risultati: filtrati.length,
  };

  return (
    <div className="farmacia-solum max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">Farmacia intelligente</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xl leading-relaxed">
          Catalogo prescrizionale: ogni prodotto è calcolato sui tuoi{" "}
          <span className="text-green-800 font-semibold">{mq} m²</span>. Nessuno sconto, solo ciò che
          serve al prato.
        </p>
      </header>

      <button
        type="button"
        className="lg:hidden mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm"
        onClick={() => setFiltriAperti(true)}
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden />
        Filtra per bisogno
        {(azioni.size > 0 || molecole.size > 0) && (
          <span className="bg-green-800 text-white text-xs rounded-full px-2 py-0.5">
            {azioni.size + molecole.size}
          </span>
        )}
      </button>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <div className="hidden lg:block w-full lg:w-[25%] shrink-0">
          <FiltriFarmacia {...filtriProps} variant="sidebar" />
        </div>

        <div className="flex-1 min-w-0 lg:w-[75%]">
          {filtrati.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filtrati.map((p) => (
                <FarmacoCard key={p.id} prodotto={p} userMq={mq} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
              <p className="text-gray-800 font-medium">Nessun prodotto con questi filtri</p>
              <p className="text-sm text-gray-500 mt-2">
                Prova un&apos;altra azione o molecola, oppure azzera i filtri.
              </p>
              <button
                type="button"
                onClick={resetFiltri}
                className="mt-4 text-sm font-semibold text-green-800 hover:underline"
              >
                Mostra tutto il catalogo
              </button>
            </div>
          )}
        </div>
      </div>

      {filtriAperti ? (
        <div
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="farmacia-filtri-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-[1px]"
            aria-label="Chiudi filtri"
            onClick={() => setFiltriAperti(false)}
          />
          <div className="relative bg-white rounded-t-3xl shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
              <h2 id="farmacia-filtri-title" className="text-lg font-semibold text-gray-800">
                Filtra per bisogno
              </h2>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                onClick={() => setFiltriAperti(false)}
                aria-label="Chiudi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-6">
              <FiltriFarmacia {...filtriProps} variant="sheet" />
            </div>
            <div className="p-4 border-t border-gray-100">
              <button
                type="button"
                className="w-full rounded-full bg-green-800 text-white font-semibold py-3"
                onClick={() => setFiltriAperti(false)}
              >
                Vedi {filtrati.length} prodotti
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
