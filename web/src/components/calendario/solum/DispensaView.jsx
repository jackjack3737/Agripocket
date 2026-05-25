export default function DispensaView({ mesi }) {
  if (!mesi.length) {
    return (
      <div className="py-20 text-center">
        <p className="text-5xl mb-6 select-none" aria-hidden>
          🛒
        </p>
        <p className="text-slate-900 font-medium tracking-tight">Dispensa vuota per ora</p>
        <p className="text-sm text-slate-500 mt-3 max-w-sm mx-auto leading-relaxed font-light">
          Quando il piano suggerirà trattamenti tra 8 e 30 giorni, qui compariranno i prodotti da acquistare in
          anticipo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p className="text-sm text-slate-500 leading-relaxed font-light">
        Prodotti da avere a casa prima dei prossimi trattamenti — così sei pronto senza corse dell&apos;ultimo
        minuto.
      </p>
      {mesi.map((mese) => (
        <section key={mese.meseKey}>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight mb-1">{mese.meseLabel}</h3>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-5">
            {mese.interventi} {mese.interventi === 1 ? "lavoro" : "lavori"} in programma
          </p>
          {mese.prodotti.length ? (
            <ul className="space-y-3">
              {mese.prodotti.map((p) => (
                <li
                  key={`${p.marca}-${p.nome}`}
                  className="rounded-2xl bg-white px-5 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex gap-3"
                >
                  <span className="text-lg shrink-0 select-none" aria-hidden>
                    🧴
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 text-sm break-words">{p.nome}</p>
                    {p.marca ? <p className="text-xs text-slate-400 mt-0.5">{p.marca}</p> : null}
                    <p className="text-xs text-slate-400 mt-1.5 break-words line-clamp-1">
                      Per: {p.perIntervento}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 py-2 font-light">
              Lavori in agenda senza prodotti collegati — sincronizza il piano se necessario.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
