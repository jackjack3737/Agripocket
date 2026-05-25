export default function ScienzaPanel({ titoloTecnico, fabbisogno, open }) {
  if (!fabbisogno && !titoloTecnico) return null;

  return (
    <div
      className="solum-scienza-reveal col-span-full"
      data-open={open ? "true" : "false"}
      aria-hidden={!open}
    >
      <div className="solum-scienza-reveal__inner">
        <div
          className={`border-t border-slate-100/80 transition-[padding] duration-300 ${
            open ? "pt-5 mt-1" : "pt-0"
          }`}
        >
          {titoloTecnico ? (
            <h4 className="font-serif text-[15px] text-slate-800 leading-snug tracking-tight">
              {titoloTecnico}
            </h4>
          ) : null}
          {fabbisogno ? (
            <div
              className={`text-sm text-slate-600 leading-relaxed whitespace-pre-line break-words ${
                titoloTecnico ? "mt-3" : ""
              }`}
            >
              {fabbisogno}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
