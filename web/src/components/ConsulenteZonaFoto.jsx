import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { analizzaMacchiaZona, chiediAgronomoTesto } from "../lib/analizzaPrato";
import { fileToCompressedBase64 } from "../lib/photoCompress";
import SintesiAnalisiBlocks from "./SintesiAnalisiBlocks";

const PLACEHOLDER_GOOGLE = "Chiedi all'agronomo";
const PLACEHOLDER_CARD =
  "Chiedi all'agronomo… es. perché qui non cresce l'erba?";

export default function ConsulenteZonaFoto({
  profile,
  userId,
  zonaId,
  zonaNome,
  onAnalisiComplete,
  variant = "card",
}) {
  const isGoogle = variant === "google";
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [domanda, setDomanda] = useState("");
  const [foto, setFoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultFoto, setResultFoto] = useState(null);
  const [resultTesto, setResultTesto] = useState(null);

  const haLocalita = Boolean(profile?.localita?.trim());
  const haInvio = Boolean(foto?.base64 || domanda.trim());

  function resetRisultati() {
    setResultFoto(null);
    setResultTesto(null);
    setError("");
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const compressed = await fileToCompressedBase64(file);
      setFoto(compressed);
      resetRisultati();
    } catch (err) {
      setError(err.message || "Impossibile leggere la foto");
    }
  }

  function rimuoviFoto() {
    setFoto(null);
    resetRisultati();
  }

  async function invia(e) {
    e?.preventDefault();
    if (!haLocalita) {
      setError("Imposta la località del prato nel profilo.");
      return;
    }
    if (!haInvio) {
      setError("Scrivi una domanda oppure allega una foto.");
      return;
    }

    setLoading(true);
    setError("");
    setResultFoto(null);
    setResultTesto(null);

    try {
      if (foto?.base64) {
        const data = await analizzaMacchiaZona({
          base64: foto.base64,
          mimeType: foto.mimeType,
          userId,
          zonaId,
          zonaNome,
          notaUtente: domanda.trim() || undefined,
        });
        setResultFoto(data);
        onAnalisiComplete?.(data);
      } else {
        const data = await chiediAgronomoTesto({
          domanda: domanda.trim(),
          zonaId,
        });
        setResultTesto(data);
      }
    } catch (err) {
      setError(err.message || "Richiesta non riuscita");
    } finally {
      setLoading(false);
    }
  }

  function nuovaRichiesta() {
    setDomanda("");
    setFoto(null);
    resetRisultati();
    inputRef.current?.focus();
  }

  const bar = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="photo-input-hidden"
        onChange={onFile}
      />

      <form
        className={isGoogle ? "agronomo-ask__google-form" : "agronomo-ask__bar"}
        onSubmit={invia}
      >
        <div className={isGoogle ? "agronomo-ask__google-box" : "agronomo-ask__field-wrap"}>
          {foto?.previewUrl ? (
            <div className="agronomo-ask__thumb-chip">
              <img src={foto.previewUrl} alt="" />
              <button
                type="button"
                className="agronomo-ask__thumb-remove"
                onClick={rimuoviFoto}
                aria-label="Rimuovi foto"
              >
                ×
              </button>
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            className="agronomo-ask__input"
            placeholder={isGoogle ? PLACEHOLDER_GOOGLE : PLACEHOLDER_CARD}
            value={domanda}
            onChange={(e) => setDomanda(e.target.value)}
            disabled={loading}
            aria-label="Chiedi all'agronomo"
          />
          {isGoogle ? (
            <>
              <button
                type="button"
                className="agronomo-ask__google-btn agronomo-ask__google-btn--attach"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !haLocalita}
                aria-label="Allega foto"
                title="Allega foto"
              >
                <span className="agronomo-ask__plus" aria-hidden>
                  +
                </span>
              </button>
              <button
                type="submit"
                className="agronomo-ask__google-btn agronomo-ask__google-btn--send"
                disabled={loading || !haLocalita || !haInvio}
                aria-label="Invia"
                title="Invia"
              >
                <span className="agronomo-ask__icon agronomo-ask__icon--send" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
        {!isGoogle ? (
          <>
            <button
              type="button"
              className="agronomo-ask__icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || !haLocalita}
              aria-label="Allega foto"
              title="Allega foto"
            >
              <span className="agronomo-ask__icon agronomo-ask__icon--camera" aria-hidden />
            </button>
            <button
              type="submit"
              className="agronomo-ask__icon-btn agronomo-ask__icon-btn--send"
              disabled={loading || !haLocalita || !haInvio}
              aria-label="Invia"
              title="Invia"
            >
              <span className="agronomo-ask__icon agronomo-ask__icon--send" aria-hidden />
            </button>
          </>
        ) : null}
      </form>
    </>
  );

  const feedback = (
    <>
      {!haLocalita ? (
        <p className="form-msg form-msg--error">
          <Link to="/onboarding">Imposta la località</Link> nel profilo.
        </p>
      ) : null}
      {loading ? (
        <p className="agronomo-ask__loading">
          {foto ? "Analisi foto in corso…" : "L'agronomo risponde…"} (circa 1–2 min)
        </p>
      ) : null}
      {error ? <p className="form-msg form-msg--error">{error}</p> : null}
      {resultFoto && !loading ? (
        <div className="agronomo-ask__risposta">
          <p className="agronomo-ask__risposta-label">Analisi dalla foto</p>
          {foto?.previewUrl ? (
            <img src={foto.previewUrl} alt="" className="agronomo-ask__preview" />
          ) : null}
          <SintesiAnalisiBlocks
            visionJson={resultFoto?.vision}
            reportMarkdown={resultFoto?.report}
          />
        </div>
      ) : null}
      {resultTesto && !loading ? (
        <div className="agronomo-ask__risposta agronomo-ask__risposta--testo">
          <p className="agronomo-ask__risposta-label">Risposta</p>
          <p className="agronomo-ask__testo">{resultTesto.risposta}</p>
          {resultTesto.chunksUsed != null ? (
            <p className="dash-card__meta">
              {resultTesto.fonte === "rag_verificato"
                ? "Knowledge base (verificata)"
                : resultTesto.fonte === "rag"
                  ? "Knowledge base"
                  : resultTesto.fonte === "kb_insufficiente"
                    ? "Dati insufficienti in KB"
                    : "Profilo e meteo"}{" "}
              · {resultTesto.chunksUsed} estratti
            </p>
          ) : null}
        </div>
      ) : null}
      {(resultFoto || resultTesto) && !loading ? (
        <button type="button" className="btn btn-ghost btn-sm agronomo-ask__reset" onClick={nuovaRichiesta}>
          Nuova domanda
        </button>
      ) : null}
    </>
  );

  if (isGoogle) {
    return (
      <section className="agronomo-ask agronomo-ask--google" aria-label="Chiedi all'agronomo">
        {bar}
        {feedback}
      </section>
    );
  }

  return (
    <section className="dash-card dash-card--wide agronomo-ask">
      <h2 className="dash-card__title">Chiedi all&apos;agronomo</h2>
      <p className="dash-card__sub">
        Una domanda sul prato o una foto della zona (macchia, erba malata). Zona:{" "}
        <strong>{zonaNome || "Prato principale"}</strong>
        {profile?.localita ? ` · ${profile.localita}` : ""}
      </p>
      {bar}
      {feedback}
    </section>
  );
}
