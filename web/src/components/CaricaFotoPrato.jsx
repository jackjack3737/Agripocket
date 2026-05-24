import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { analizzaMacchiaZona } from "../lib/analizzaPrato";
import { setInterventoCompletato } from "../lib/dashboard";
import { fileToCompressedBase64 } from "../lib/photoCompress";

/**
 * Caricamento e analisi foto prato (stato clinico / esagono).
 */
export default function CaricaFotoPrato({
  profile,
  userId,
  zonaId,
  zonaNome,
  controlloId,
  onAnalisiComplete,
  compact = false,
}) {
  const fileInputRef = useRef(null);
  const [foto, setFoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const haLocalita = Boolean(profile?.localita?.trim());

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOkMsg("");
    setError("");
    try {
      const compressed = await fileToCompressedBase64(file);
      setFoto(compressed);
    } catch (err) {
      setError(err.message || "Impossibile leggere la foto");
    }
  }

  function rimuoviFoto() {
    setFoto(null);
    setOkMsg("");
    setError("");
  }

  async function analizza() {
    if (!haLocalita) {
      setError("Imposta la località del prato nel profilo.");
      return;
    }
    if (!foto?.base64) {
      fileInputRef.current?.click();
      return;
    }

    setLoading(true);
    setError("");
    setOkMsg("");

    try {
      const data = await analizzaMacchiaZona({
        base64: foto.base64,
        mimeType: foto.mimeType,
        userId,
        zonaId,
        zonaNome,
      });
      if (controlloId) {
        try {
          await setInterventoCompletato(controlloId, true);
        } catch {
          /* ignore */
        }
      }
      setOkMsg(
        controlloId
          ? "Analisi salvata. Controllo mensile segnato come completato."
          : data?.interventiCreati
            ? `Analisi salvata · ${data.interventiCreati} interventi aggiornati in calendario.`
            : "Analisi salvata. Stato clinico e esagono aggiornati.",
      );
      setFoto(null);
      await onAnalisiComplete?.(data);
    } catch (err) {
      setError(err.message || "Analisi non riuscita");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`carica-foto-prato${compact ? " carica-foto-prato--compact" : ""}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="photo-input-hidden"
        onChange={onFile}
      />

      <p className="carica-foto-prato__label">Carica la foto del prato</p>
      {controlloId ? (
        <p className="carica-foto-prato__controllo">
          Controllo mensile: dopo l&apos;analisi il lavoro verrà segnato completato in calendario.
        </p>
      ) : null}
      {!haLocalita ? (
        <p className="form-msg form-msg--error">
          <Link to="/onboarding">Imposta la località</Link> per analizzare la foto.
        </p>
      ) : null}

      {foto?.previewUrl ? (
        <div className="carica-foto-prato__preview">
          <img src={foto.previewUrl} alt="Anteprima foto prato" />
          <button type="button" className="carica-foto-prato__remove" onClick={rimuoviFoto} aria-label="Rimuovi foto">
            ×
          </button>
        </div>
      ) : null}

      <div className="carica-foto-prato__actions">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={loading || !haLocalita}
          onClick={() => fileInputRef.current?.click()}
        >
          {foto ? "Cambia foto" : "Scegli foto"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={loading || !haLocalita}
          onClick={analizza}
        >
          {loading ? "Analisi in corso…" : foto ? "Analizza foto" : "Scatta o carica"}
        </button>
      </div>

      {loading ? (
        <p className="carica-foto-prato__loading" role="status">
          Analisi in corso (circa 1–2 min)…
        </p>
      ) : null}
      {error ? <p className="form-msg form-msg--error">{error}</p> : null}
      {okMsg ? <p className="carica-foto-prato__ok">{okMsg}</p> : null}
    </div>
  );
}
