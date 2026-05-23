import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchIrrigazioneGiornaliera, AZIONE_IRRIGAZIONE_LABEL } from "../lib/irrigazioneClient";
import "../styles-irrigation-widget.css";

function IconDroplet() {
  return (
    <svg className="irrigation-widget__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.69l5.66 5.66a8 8 0 1 1-11.32 0L12 2.69Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function IrrigationWidget({ profile, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canRun = enabled && profile?.localita?.trim() && profile?.irrigazione !== "pioggia";

  useEffect(() => {
    if (!canRun) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchIrrigazioneGiornaliera()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Errore calcolo");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canRun, profile?.localita, profile?.tipo_irrigatori, profile?.tempo_irrigazione_base]);

  if (!profile?.localita?.trim()) {
    return (
      <section className="irrigation-widget irrigation-widget--muted">
        <h2 className="irrigation-widget__title">Irrigazione smart</h2>
        <p className="irrigation-widget__lead">
          <Link to="/onboarding">Imposta la località</Link> per calcolare i minuti di irrigazione da ET0 e pioggia.
        </p>
      </section>
    );
  }

  if (profile?.irrigazione === "pioggia") {
    return (
      <section className="irrigation-widget irrigation-widget--muted">
        <h2 className="irrigation-widget__title">Irrigazione smart</h2>
        <p className="irrigation-widget__lead">
          Profilo «solo pioggia»: il motore resta in stand-by. In siccità prolungata valuta irrigazione manuale.
        </p>
      </section>
    );
  }

  const azione = data?.azione_irrigazione;
  const meta = azione ? AZIONE_IRRIGAZIONE_LABEL[azione] : null;
  const centralina = data?.dati_centralina;
  const tecnici = data?.dati_tecnici;

  return (
    <section className={`irrigation-widget${azione ? ` irrigation-widget--${meta?.tone || "ok"}` : ""}`}>
      <header className="irrigation-widget__head">
        <div className="irrigation-widget__icon-wrap">
          <IconDroplet />
        </div>
        <div>
          <h2 className="irrigation-widget__title">Irrigazione di oggi</h2>
          <p className="irrigation-widget__sub">Minuti centralina da bilancio idrico (ET0 − pioggia)</p>
        </div>
      </header>

      {loading ? <p className="irrigation-widget__loading">Calcolo in corso…</p> : null}
      {error && !loading ? <p className="irrigation-widget__error">{error}</p> : null}

      {data && !loading ? (
        <>
          {meta ? (
            <p className={`irrigation-widget__azione irrigation-widget__azione--${meta.tone}`}>
              {meta.label}
            </p>
          ) : null}

          {azione !== "SPEGNI" && centralina?.cicli_consigliati > 0 ? (
            <div className="irrigation-widget__centralina" role="group" aria-label="Impostazioni centralina">
              <div className="irrigation-widget__stat irrigation-widget__stat--primary">
                <span className="irrigation-widget__stat-label">Minuti totali</span>
                <strong>{tecnici?.minuti_totali_consigliati ?? 0}</strong>
              </div>
              {centralina.cicli_consigliati > 1 ? (
                <>
                  <div className="irrigation-widget__stat">
                    <span className="irrigation-widget__stat-label">Cicli</span>
                    <strong>{centralina.cicli_consigliati}</strong>
                  </div>
                  <div className="irrigation-widget__stat">
                    <span className="irrigation-widget__stat-label">Minuti per ciclo</span>
                    <strong>{centralina.minuti_per_ciclo}</strong>
                  </div>
                  {centralina.pausa_tra_cicli_min ? (
                    <p className="irrigation-widget__pausa">
                      Pausa tra i cicli: circa {centralina.pausa_tra_cicli_min} minuti
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="irrigation-widget__stat">
                  <span className="irrigation-widget__stat-label">Un ciclo da</span>
                  <strong>{centralina.minuti_per_ciclo} min</strong>
                </div>
              )}
              {centralina.tempo_base_minuti ? (
                <p className="irrigation-widget__base">
                  Riferimento centralina: {centralina.tempo_base_minuti} min · impianto{" "}
                  {centralina.tipo_irrigatori || "—"}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="irrigation-widget__edu">
            <p className="irrigation-widget__messaggio">{data.messaggio_ux}</p>
          </div>

          {tecnici?.et0_mm != null ? (
            <p className="irrigation-widget__tech" role="note">
              ET0 oggi {tecnici.et0_mm} mm · fabbisogno netto {tecnici.fabbisogno_calcolato_mm} mm
              {tecnici.precipitazioni_mm != null ? ` · pioggia conteggiata ${tecnici.precipitazioni_mm} mm` : ""}
            </p>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        className="irrigation-widget__refresh btn btn-outline btn-sm"
        disabled={loading}
        onClick={() => {
          setLoading(true);
          fetchIrrigazioneGiornaliera({ force: true })
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
        }}
      >
        Aggiorna calcolo
      </button>
    </section>
  );
}
