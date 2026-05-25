export default function DispensaView({ mesi }) {
  if (!mesi.length) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl mb-4" aria-hidden>
          🛒
        </p>
        <p className="text-gray-800 font-medium">Dispensa vuota per ora</p>
        <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto leading-relaxed">
          Quando il piano suggerirà trattamenti tra 8 e 30 giorni, qui compariranno i prodotti da acquistare in
          anticipo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-500 leading-relaxed">
        Prodotti da avere a casa prima dei prossimi trattamenti — così sei pronto senza corse dell&apos;ultimo
        minuto.
      </p>
      {mesi.map((mese) => (
        <section key={mese.meseKey}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{mese.meseLabel}</h3>
          <p className="text-xs text-gray-400 mb-4">
            {mese.interventi} {mese.interventi === 1 ? "lavoro" : "lavori"} in programma
          </p>
          {mese.prodotti.length ? (
            <ul className="space-y-0 divide-y divide-gray-100">
              {mese.prodotti.map((p) => (
                <li key={`${p.marca}-${p.nome}`} className="py-4 flex gap-3">
                  <span className="text-lg shrink-0" aria-hidden>
                    🧴
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{p.nome}</p>
                    {p.marca ? <p className="text-xs text-gray-400 mt-0.5">{p.marca}</p> : null}
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1">Per: {p.perIntervento}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 py-2">
              Lavori in agenda senza prodotti collegati — aggiorna il piano se necessario.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
