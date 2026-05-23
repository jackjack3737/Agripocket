import { hasLawnContour } from "../lib/pratoZone";

/**
 * Evidenzia il disegno del prato su Google Maps (profilo / onboarding).
 */
export default function LawnMapProfileCard({
  onOpenMap,
  localita = "",
  superficie_mq = "",
  pratoZone = null,
  apiKeyMissing = false,
  compact = false,
}) {
  const hasContorno = hasLawnContour(pratoZone);
  const mqNum = Number(String(superficie_mq).replace(",", "."));
  const hasMq = Number.isFinite(mqNum) && mqNum > 0;

  return (
    <div
      className={`lawn-map-hero${compact ? " lawn-map-hero--compact" : ""}${hasContorno ? " lawn-map-hero--done" : ""}`}
    >
      <div className="lawn-map-hero__glow" aria-hidden />
      <div className="lawn-map-hero__inner">
        <div className="lawn-map-hero__icon" aria-hidden>
          <svg viewBox="0 0 48 48" width="40" height="40" focusable="false">
            <rect x="8" y="8" width="32" height="32" rx="4" fill="currentColor" opacity="0.12" />
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14 32 L22 18 L30 24 L38 14"
            />
            <circle cx="34" cy="14" r="3" fill="currentColor" />
          </svg>
        </div>

        <div className="lawn-map-hero__text">
          <p className="lawn-map-hero__kicker">Google Maps · vista satellite</p>
          <h3 className="lawn-map-hero__title">
            {hasContorno ? "Contorno del prato salvato" : "Disegna il tuo prato sulla mappa"}
          </h3>
          <p className="lawn-map-hero__desc">
            {hasContorno
              ? "Indirizzo e metri quadri calcolati dal poligono. In Dashboard potrai segnare irrigatori, ombra e muschio."
              : "Cerca l'indirizzo, traccia il bordo del prato con qualche tap: superficie e località si compilano da sole."}
          </p>
          {hasContorno && (hasMq || localita?.trim()) ? (
            <ul className="lawn-map-hero__stats">
              {hasMq ? <li>{Math.round(mqNum)} m²</li> : null}
              {localita?.trim() ? <li>{localita.trim()}</li> : null}
            </ul>
          ) : null}
        </div>

        <button
          type="button"
          className={`btn lawn-map-hero__cta${hasContorno ? " btn-outline" : ""}`}
          onClick={onOpenMap}
          disabled={apiKeyMissing}
        >
          {apiKeyMissing
            ? "Mappa non configurata"
            : hasContorno
              ? "Modifica contorno"
              : "Apri mappa e disegna il prato"}
        </button>
      </div>

      {apiKeyMissing ? (
        <p className="lawn-map-hero__warn">
          Aggiungi <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>web/.env.local</code> per usare la mappa.
        </p>
      ) : null}
    </div>
  );
}
