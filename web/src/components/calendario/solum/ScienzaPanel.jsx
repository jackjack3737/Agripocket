export default function ScienzaPanel({ titoloTecnico, fabbisogno, open }) {
  if (!fabbisogno && !titoloTecnico) return null;

  return (
    <div
      className="solum-accordion-grid mt-3"
      data-open={open ? "true" : "false"}
      aria-hidden={!open}
    >
      <div className="solum-accordion-inner">
        <div
          className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4 space-y-3"
          id={open ? undefined : undefined}
        >
          {titoloTecnico ? (
            <h4 className="font-serif text-base text-gray-800 leading-snug">{titoloTecnico}</h4>
          ) : null}
          {fabbisogno ? (
            <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{fabbisogno}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
