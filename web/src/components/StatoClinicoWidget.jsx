import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { calcolaStatoClinico } from "../lib/statoClinico";
import { resolveSignedFotoFromAnalisi } from "../lib/fotoPrato";

function parseVision(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function StatoClinicoWidget({
  ultimaAnalisi,
  zonaNome,
  weather,
  userId,
}) {
  const [thumbUrl, setThumbUrl] = useState(null);

  const vision = useMemo(
    () => parseVision(ultimaAnalisi?.vision_json),
    [ultimaAnalisi?.vision_json],
  );

  const stato = useMemo(
    () => calcolaStatoClinico({ vision, weather, agronomic: weather?.agronomic }),
    [vision, weather],
  );

  useEffect(() => {
    let cancelled = false;
    if (!ultimaAnalisi) {
      setThumbUrl(null);
      return;
    }
    resolveSignedFotoFromAnalisi(ultimaAnalisi).then((url) => {
      if (!cancelled) setThumbUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [ultimaAnalisi?.id, ultimaAnalisi?.foto_path, ultimaAnalisi?.foto_url, userId]);

  const dataLabel = ultimaAnalisi?.created_at
    ? new Date(ultimaAnalisi.created_at).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <section
      className={`dash-card dash-card--wide stato-clinico stato-clinico--${stato.livello}`}
      aria-live="polite"
    >
      <div className="stato-clinico__header">
        <h2 className="stato-clinico__title">Stato clinico attuale</h2>
        <span className={`stato-clinico__semaforo stato-clinico__semaforo--${stato.livello}`}>
          <span className="stato-clinico__dot" aria-hidden />
          {stato.label}
        </span>
      </div>

      <div className="stato-clinico__body">
        <div className="stato-clinico__thumb">
          {thumbUrl ? (
            <img src={thumbUrl} alt="Ultima analisi foto prato" />
          ) : (
            <div className="stato-clinico__thumb-placeholder">
              <span>Nessuna foto</span>
              <Link to="/chat">Analizza</Link>
            </div>
          )}
        </div>
        <div className="stato-clinico__meta">
          <p>
            <strong>Zona:</strong> {zonaNome || "Prato principale"}
          </p>
          <p>
            <strong>Ultima analisi:</strong> {dataLabel}
          </p>
          <p className="stato-clinico__motivo">{stato.motivo}</p>
        </div>
      </div>
    </section>
  );
}
