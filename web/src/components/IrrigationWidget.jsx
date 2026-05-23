import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchIrrigazioneGiornaliera, AZIONE_IRRIGAZIONE_LABEL } from "../lib/irrigazioneClient";
import "../styles-irrigation-widget.css";

const MODALITA_BADGE = {
  statico: "S",
  rotator: "R",
  dinamico: "O",
};

function IrrigationZoneProgram({ programma }) {
  if (!programma?.zone?.length) return null;

  return (
    <section className="irrigation-widget__zone-prog" aria-label="Programma centralina per zona">
      <h3 className="irrigation-widget__zone-prog-title">Centralina — una riga per linea</h3>
      {programma.sintesi ? <p className="irrigation-widget__zone-prog-sintesi">{programma.sintesi}</p> : null}
      <ul className="irrigation-widget__zone-list">
        {programma.zone.map((z) => (
          <li
            key={z.id || z.zona_numero}
            className={`irrigation-widget__zone-card${z.attiva_oggi ? "" : " irrigation-widget__zone-card--off"}`}
          >
            <div className="irrigation-widget__zone-card-head">
              <span className={`irrigation-widget__zone-badge irrigation-widget__zone-badge--${z.modalita}`}>
                {MODALITA_BADGE[z.modalita] || "?"}
              </span>
              <strong className="irrigation-widget__zone-name">{z.etichetta}</strong>
            </div>
            {z.attiva_oggi ? (
              <div className="irrigation-widget__zone-stats">
                {z.mm_da_evadere != null ? (
                  <span>
                    <em>Acqua</em> {z.mm_da_evadere} mm
                  </span>
                ) : null}
                <span>
                  <em>Minuti linea</em>{" "}
                  {z.cicli > 1 ? `${z.cicli}×${z.minuti_per_ciclo}` : z.minuti_per_ciclo || z.minuti_totali_linea}
                </span>
                <span>
                  <em>Quando</em> {z.frequenza_label?.slice(0, 40)}
                  {(z.frequenza_label?.length ?? 0) > 40 ? "…" : ""}
                </span>
                <span>
                  <em>Ora</em> {z.orario_consigliato}
                </span>
              </div>
            ) : (
              <p className="irrigation-widget__zone-off">Spenta oggi</p>
            )}
            {z.giorni_settimana?.length ? (
              <p className="irrigation-widget__zone-giorni">
                Giorni: <strong>{z.giorni_settimana.join(" · ")}</strong>
              </p>
            ) : null}
            <p className="irrigation-widget__zone-impostazione">{z.impostazione}</p>
          </li>
        ))}
      </ul>
      {programma.minuti_totali_zone > 0 ? (
        <p className="irrigation-widget__zone-totale">
          Totale stimato tutte le zone: <strong>{programma.minuti_totali_zone} min</strong> (se tutte attive oggi)
        </p>
      ) : null}
    </section>
  );
}

function IrrigationWeeklySchedule({ schema, azione }) {
  if (!schema?.giorni?.length) return null;
  const freq = schema.frequenza;

  return (
    <section className="irrigation-widget__settimana" aria-label="Programma irrigazione settimanale">
      <h3 className="irrigation-widget__settimana-title">Programma settimanale</h3>
      <p className="irrigation-widget__settimana-freq">
        <strong>{freq?.label || "Frequenza"}</strong>
        {freq?.passate_settimana != null ? (
          <span>
            {" "}
            · {freq.passate_settimana} passat{freq.passate_settimana === 1 ? "a" : "e"} in 7 giorni
            {freq.minuti_per_passata ? ` · ${freq.minuti_per_passata} min a passata` : ""}
          </span>
        ) : null}
      </p>

      <div className="irrigation-widget__griglia" role="list">
        {schema.giorni.map((g) => (
          <div
            key={g.iso}
            role="listitem"
            className={`irrigation-widget__giorno${g.irriga ? " irrigation-widget__giorno--on" : ""}${g.nota === "Oggi no" ? " irrigation-widget__giorno--oggi-off" : ""}`}
          >
            <span className="irrigation-widget__giorno-nome">{g.nome}</span>
            {g.irriga ? (
              <>
                <span className="irrigation-widget__giorno-stato">Irriga</span>
                <span className="irrigation-widget__giorno-min">{g.nota || `${g.minuti} min`}</span>
              </>
            ) : (
              <span className="irrigation-widget__giorno-stato irrigation-widget__giorno-stato--off">
                {g.nota || "—"}
              </span>
            )}
          </div>
        ))}
      </div>

      {schema.riepilogo_ux ? <p className="irrigation-widget__settimana-riepilogo">{schema.riepilogo_ux}</p> : null}
      {schema.impostazione_centralina ? (
        <p className="irrigation-widget__settimana-centralina">
          <span className="irrigation-widget__settimana-centralina-label">In centralina: </span>
          {schema.impostazione_centralina}
        </p>
      ) : null}

      {azione === "SPEGNI" && schema.oggi_irriga === false ? (
        <p className="irrigation-widget__settimana-oggi">Oggi: centralina spenta (pioggia o fabbisogno coperto).</p>
      ) : null}
    </section>
  );
}

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
  }, [canRun, profile?.localita, profile?.tipo_irrigatori, profile?.tempo_irrigazione_base, profile?.prato_zone]);

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
  const schema = data?.schema_settimanale;
  const programmaZone = data?.programma_zone;
  const meteoUsato = data?.meteo_utilizzato;
  const hasZoneProgram = programmaZone?.zone?.length > 0;

  return (
    <section className={`irrigation-widget${azione ? ` irrigation-widget--${meta?.tone || "ok"}` : ""}`}>
      <header className="irrigation-widget__head">
        <div className="irrigation-widget__icon-wrap">
          <IconDroplet />
        </div>
        <div>
          <h2 className="irrigation-widget__title">Irrigazione di oggi</h2>
          <p className="irrigation-widget__sub">
            Minuti e frequenza da bilancio idrico (ET0 − pioggia)
            {meteoUsato ? " · meteo incluso" : ""}
          </p>
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

          {hasZoneProgram ? <IrrigationZoneProgram programma={programmaZone} /> : null}

          {!hasZoneProgram && azione !== "SPEGNI" && centralina?.cicli_consigliati > 0 ? (
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

          {schema ? <IrrigationWeeklySchedule schema={schema} azione={azione} /> : null}

          <div className="irrigation-widget__edu">
            <p className="irrigation-widget__messaggio">{data.messaggio_ux}</p>
          </div>

          {meteoUsato ? (
            <p className="irrigation-widget__meteo-badge" role="note">
              Calcolo basato su previsioni e dati meteo della tua località (ET0, pioggia recente e prevista).
            </p>
          ) : null}

          {tecnici?.et0_mm != null ? (
            <p className="irrigation-widget__tech" role="note">
              ET0 {tecnici.et0_mm} mm · Kc {tecnici.kc} · da reintegrare oggi {tecnici.fabbisogno_calcolato_mm} mm
              {tecnici.capacita_campo_mm != null ? ` · cap. campo ~${tecnici.capacita_campo_mm} mm` : ""}
              {tecnici.precipitazioni_mm != null ? ` · pioggia oggi ${tecnici.precipitazioni_mm} mm` : ""}
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
