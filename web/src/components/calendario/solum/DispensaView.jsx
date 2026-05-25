export default function DispensaView({ mesi }) {
  if (!mesi.length) {
    return (
      <div className="rounded-3xl bg-white border border-gray-100 p-8 text-center shadow-sm">
        <p className="text-4xl mb-3" aria-hidden>
          🛒
        </p>
        <p className="text-gray-800 font-medium">Dispensa vuota per ora</p>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
          Quando il piano suggerirà trattamenti tra 8 e 30 giorni, qui compariranno i prodotti da acquistare in
          anticipo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 leading-relaxed">
        Prodotti da avere a casa prima dei prossimi trattamenti — così sei pronto senza corse dell&apos;ultimo
        minuto.
      </p>
      {mesi.map((mese) => (
        <section
          key={mese.meseKey}
          className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden"
        >
          <header className="px-5 py-4 border-b border-gray-50 bg-gradient-to-r from-solum-green-light/40 to-white">
            <h3 className="text-base font-semibold text-gray-800">{mese.meseLabel}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {mese.interventi} {mese.interventi === 1 ? "lavoro" : "lavori"} in programma
            </p>
          </header>
          {mese.prodotti.length ? (
            <ul className="divide-y divide-gray-50">
              {mese.prodotti.map((p) => (
                <li key={`${p.marca}-${p.nome}`} className="px-5 py-4 flex gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-lg"
                    aria-hidden
                  >
                    🧴
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800">{p.nome}</p>
                    {p.marca ? <p className="text-xs text-gray-500">{p.marca}</p> : null}
                    <p className="text-xs text-gray-400 mt-1">
                      Per: {p.perIntervento}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-gray-500">
              Lavori in agenda senza prodotti in vetrina collegati — rigenera il piano se necessario.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
