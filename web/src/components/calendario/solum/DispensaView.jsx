import PrescrizioneProdottoCard from "./PrescrizioneProdottoCard.jsx";

const DEFAULT_MQ = 150;

export default function DispensaView({ mesi, userMq = DEFAULT_MQ }) {
  const mq = Math.max(1, Number(userMq) || DEFAULT_MQ);

  if (!mesi.length) {
    return (
      <div className="py-20 text-center">
        <p className="text-5xl mb-6 select-none" aria-hidden>
          🛒
        </p>
        <p className="text-slate-900 font-medium tracking-tight">Niente da anticipare per ora</p>
        <p className="text-sm text-slate-500 mt-3 max-w-sm mx-auto leading-relaxed font-light">
          Tra 8 e 30 giorni il piano ti dirà cosa tenere in dispensa — con dose già calcolata sui tuoi{" "}
          <span className="font-medium text-slate-700">{mq} m²</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-14">
      <div>
        <p className="text-sm text-slate-500 leading-relaxed font-light max-w-md">
          Prescrizione contestuale: prodotti legati ai prossimi lavori, dose su misura per il tuo prato. Un tap per
          ordinare, senza carrello né catalogo infinito.
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
          Superficie prato: {mq} m²
        </p>
      </div>

      {mesi.map((mese) => (
        <section key={mese.meseKey} aria-labelledby={`dispensa-${mese.meseKey}`}>
          <h3
            id={`dispensa-${mese.meseKey}`}
            className="text-sm font-semibold text-slate-900 tracking-tight mb-1"
          >
            {mese.meseLabel}
          </h3>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-6">
            {mese.interventi} {mese.interventi === 1 ? "lavoro" : "lavori"} in programma
          </p>

          {mese.prodotti.length ? (
            <ul className="space-y-4">
              {mese.prodotti.map((item) => (
                <li key={item.key}>
                  <PrescrizioneProdottoCard
                    prodotto={item.prodotto}
                    perIntervento={item.perIntervento}
                    userMq={mq}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 font-light py-2">
              Lavori in agenda senza prodotti collegati — sincronizza il piano.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
