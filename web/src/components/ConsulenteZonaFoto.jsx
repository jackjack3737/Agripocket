import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { analizzaMacchiaZona } from "../lib/analizzaPrato";
import { fileToCompressedBase64 } from "../lib/photoCompress";
import SintesiAnalisiBlocks from "./SintesiAnalisiBlocks";

export default function ConsulenteZonaFoto({
  profile,
  userId,
  zonaId,
  zonaNome,
  onAnalisiComplete,
}) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!profile?.localita?.trim()) {
      setError("Imposta la località del prato nel profilo prima di analizzare.");
      return;
    }

    setError("");
    setResult(null);
    setLoading(true);

    try {
      const { base64, mimeType, previewUrl } = await fileToCompressedBase64(file);
      setPreview(previewUrl);
      const data = await analizzaMacchiaZona({
        base64,
        mimeType,
        userId,
        zonaId,
        zonaNome,
      });
      setResult(data);
      onAnalisiComplete?.(data);
    } catch (err) {
      setError(err.message || "Analisi non riuscita");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="dash-card dash-card--wide consulente-zona">
      <h2 className="dash-card__title">Consulente zona — foto macchia</h2>
      <p className="dash-card__sub">
        Scatta una foto della <strong>zona problematica</strong> (es. dove l&apos;erba non cresce).
        Gemini analizza la macchia con meteo, profilo e knowledge base — non è una chat testuale.
      </p>
      {zonaNome ? (
        <p className="dash-card__meta">
          Zona: <strong>{zonaNome}</strong>
          {profile?.localita ? ` · ${profile.localita}` : ""}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="photo-input-hidden"
        onChange={onPhoto}
      />

      {!result && !loading ? (
        <button
          type="button"
          className="btn btn-primary consulente-zona__camera"
          onClick={() => inputRef.current?.click()}
          disabled={!profile?.localita?.trim()}
        >
          📷 Fotografa la macchia
        </button>
      ) : null}

      {!profile?.localita?.trim() ? (
        <p className="form-msg form-msg--error">
          <Link to="/onboarding">Imposta la località</Link> nel profilo.
        </p>
      ) : null}

      {loading ? (
        <div className="consulente-zona__loading">
          {preview ? <img src={preview} alt="" className="consulente-zona__preview" /> : null}
          <p>Analisi in corso… (1–2 min)</p>
        </div>
      ) : null}

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      {result && !loading ? (
        <div className="consulente-zona__result">
          {preview ? <img src={preview} alt="" className="consulente-zona__preview" /> : null}
          <SintesiAnalisiBlocks
            visionJson={result?.vision}
            reportMarkdown={result?.report}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setResult(null);
              setPreview(null);
              inputRef.current?.click();
            }}
          >
            Nuova foto macchia
          </button>
        </div>
      ) : null}
    </section>
  );
}
