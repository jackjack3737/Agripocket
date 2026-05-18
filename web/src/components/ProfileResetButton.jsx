import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { resetPratoProfiloCompleto } from "../lib/resetProfilo";

/**
 * Reset profilo con doppia conferma.
 */
export default function ProfileResetButton({ onResetComplete, embedded = false, stayOnPage = false }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (busy) return;
    setStep(0);
    setError("");
  }

  async function confirmReset() {
    setBusy(true);
    setError("");
    try {
      const { profile } = await resetPratoProfiloCompleto();
      onResetComplete?.(profile ?? null);
      close();
      if (!stayOnPage) navigate("/onboarding", { replace: true });
    } catch (e) {
      setError(e.message || "Reset non riuscito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {embedded ? (
        <div className="profile-reset-inline">
          <p className="profile-reset-inline__label">Zona pericolosa</p>
          <p className="profile-reset-inline__desc">
            Cancella profilo, mappa, calendario e foto. Rifarai l&apos;onboarding.
          </p>
          <button type="button" className="btn profile-reset-inline__btn" onClick={() => setStep(1)}>
            Reset profilo
          </button>
        </div>
      ) : (
        <section className="profile-reset-zone">
          <h3 className="profile-reset-zone__title">Zona pericolosa</h3>
          <p className="profile-reset-zone__desc">
            Elimina profilo, mappa, calendario e analisi foto. Dovrai rifare l&apos;onboarding da zero.
          </p>
          <button type="button" className="btn profile-reset-zone__btn" onClick={() => setStep(1)}>
            Reset profilo
          </button>
        </section>
      )}

      {step > 0 ? (
        <div className="profile-reset-backdrop" role="presentation" onClick={close}>
          <div
            className="profile-reset-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="profile-reset-title" className="profile-reset-dialog__title">
              {step === 1 ? "Reset profilo?" : "Conferma definitiva"}
            </h2>

            {step === 1 ? (
              <>
                <p className="profile-reset-dialog__text">
                  Stai per cancellare tutti i dati del prato salvati in AgriPocket: risposte al questionario,
                  contorno su mappa, zone (irrigatori, ombra, muschio), calendario lavori e analisi foto.
                </p>
                <p className="profile-reset-dialog__warn">Questa azione non si può annullare.</p>
              </>
            ) : (
              <>
                <p className="profile-reset-dialog__text">
                  Ultima richiesta: confermi di voler <strong>resettare tutto</strong> e ricominciare
                  l&apos;onboarding?
                </p>
                <ul className="profile-reset-dialog__list">
                  <li>Profilo e mappa Google</li>
                  <li>Calendario e interventi</li>
                  <li>Analisi e foto del prato</li>
                </ul>
              </>
            )}

            {error ? <p className="form-msg form-msg--error">{error}</p> : null}

            <div className="profile-reset-dialog__actions">
              <button type="button" className="btn btn-outline" onClick={close} disabled={busy}>
                Annulla
              </button>
              {step === 1 ? (
                <button type="button" className="btn profile-reset-dialog__btn-danger" onClick={() => setStep(2)}>
                  Continua
                </button>
              ) : (
                <button
                  type="button"
                  className="btn profile-reset-dialog__btn-danger"
                  onClick={confirmReset}
                  disabled={busy}
                >
                  {busy ? "Reset in corso…" : "Sì, resetta tutto"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
