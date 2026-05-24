import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchIrrigazioneGiornaliera,
  AZIONE_IRRIGAZIONE_LABEL,
  IRRIGAZIONE_REFRESH_EVENT,
} from "../lib/irrigazioneClient";
import "../styles-irrigation-widget.css";

function formatMinutiLinea(z) {
  if (!z.attiva_oggi) return "OFF";
  if (z.cicli > 1) return `${z.cicli}×${z.minuti_per_ciclo} min`;
  const m = z.minuti_totali_linea ?? z.minuti_per_ciclo ?? 0;
  return m > 0 ? `${m} min` : "OFF";
}

function formatMinutiLineaSettimana(l) {
  if (l.cicli > 1) return `${l.cicli}×${l.minuti_per_ciclo}`;
  const m = l.minuti_totali ?? l.minuti_per_ciclo ?? 0;
  return m > 0 ? String(m) : "0";
}

function GiornoSettimanaIrrigazione({ g }) {
  const mm = g.fabbisogno_mm ?? g.mm_necessari;
  const linee = g.linee?.filter((l) => (l.minuti_totali ?? l.minuti_per_ciclo ?? 0) > 0 || l.cicli > 0);
  const multiLinea = linee?.length > 1;

  if (multiLinea) {
    return (
      <div className="irrigation-widget__giorno-body">
        {mm != null ? <span className="irrigation-widget__giorno-mm">{mm} mm</span> : null}
        <ul className="irrigation-widget__giorno-linee" aria-label="Minuti per linea centralina">
          {linee.map((l) => (
            <li key={l.n}>
              <span className="irrigation-widget__giorno-linea-n">L{l.n}</span>
              <strong className="irrigation-widget__giorno-linea-v">
                {formatMinutiLineaSettimana(l)} min
              </strong>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <span className="irrigation-widget__giorno-min">{g.nota || `${g.minuti} min`}</span>;
}

/** Riga compatta: Linea 1 → tot minuti */
function IrrigationProgramCompact({ programma, centralina, tecnici, azione }) {
  if (programma?.zone?.length) {
    return (
      <ul className="irrigation-widget__lines" aria-label="Programma per linea centralina">
        {programma.zone.map((z) => (
          <li key={z.zona_numero} className="irrigation-widget__line">
            <span className="irrigation-widget__line-n">Linea {z.zona_numero}</span>
            <strong className="irrigation-widget__line-v">{formatMinutiLinea(z)}</strong>
          </li>
        ))}
      </ul>
    );
  }

  if (azione === "SPEGNI") {
    return <p className="irrigation-widget__lines-single">Centralina spenta oggi</p>;
  }

  const min = tecnici?.minuti_totali_consigliati ?? centralina?.minuti_per_ciclo;
  if (min > 0) {
    const cicli = centralina?.cicli_consigliati;
    const label =
      cicli > 1 ? `${cicli}×${centralina.minuti_per_ciclo} min` : `${min} min`;
    return <p className="irrigation-widget__lines-single">{label}</p>;
  }

  return null;
}

function IrrigationZoneProgramDetails({ programma }) {
  if (!programma?.zone?.length) return null;

  return (
    <div className="irrigation-widget__zone-details">
      {programma.sintesi ? <p className="irrigation-widget__zone-prog-sintesi">{programma.sintesi}</p> : null}
      <ul className="irrigation-widget__zone-list">
        {programma.zone.map((z) => (
          <li
            key={z.zona_numero}
            className={`irrigation-widget__zone-card${z.attiva_oggi ? "" : " irrigation-widget__zone-card--off"}`}
          >
            <strong className="irrigation-widget__zone-name">Linea {z.zona_numero}</strong>
            {z.attiva_oggi ? (
              <div className="irrigation-widget__zone-stats">
                {z.mm_da_evadere != null ? (
                  <span>
                    <em>Acqua</em> {z.mm_da_evadere} mm
                  </span>
                ) : null}
                <span>
                  <em>Minuti</em> {formatMinutiLinea(z)}
                </span>
                <span>
                  <em>Ora</em> {z.orario_consigliato}
                </span>
              </div>
            ) : (
              <p className="irrigation-widget__zone-off">Spenta oggi</p>
            )}
            {z.impostazione ? (
              <p className="irrigation-widget__zone-impostazione">{z.impostazione}</p>
            ) : null}
            {z.nota ? <p className="irrigation-widget__zone-nota">{z.nota}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function IrrigationWeeklySchedule({ schema, azione }) {
  if (!schema?.giorni?.length) return null;
  const freq = schema.frequenza;

  return (
    <section className="irrigation-widget__settimana" aria-label="Programma irrigazione settimanale">
      <h3 className="irrigation-widget__settimana-title">Settimana</h3>
      <p className="irrigation-widget__settimana-freq">
        <strong>{freq?.label || "Frequenza"}</strong>
        {freq?.passate_settimana != null ? (
          <span>
            {" "}
            · {freq.passate_settimana} passat{freq.passate_settimana === 1 ? "a" : "e"} / 7 gg
          </span>
        ) : null}
      </p>

      <div className="irrigation-widget__griglia" role="list">
        {schema.giorni.map((g) => (
          <div
            key={g.iso}
            role="listitem"
            className={`irrigation-widget__giorno${g.irriga ? " irrigation-widget__giorno--on" : ""}${
              g.irriga && g.linee?.length > 1 ? " irrigation-widget__giorno--multilinea" : ""
            }`}
          >
            <span className="irrigation-widget__giorno-nome">{g.nome}</span>
            {g.irriga ? (
              <GiornoSettimanaIrrigazione g={g} />
            ) : (
              <span className="irrigation-widget__giorno-stato irrigation-widget__giorno-stato--off">
                {g.nota || "—"}
              </span>
            )}
          </div>
        ))}
      </div>

      {schema.riepilogo_ux ? <p className="irrigation-widget__settimana-riepilogo">{schema.riepilogo_ux}</p> : null}
      {azione === "SPEGNI" && schema.oggi_irriga === false ? (
        <p className="irrigation-widget__settimana-oggi">Oggi: nessuna irrigazione necessaria.</p>
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

function IrrigationSerbatoioBar({ bilancio }) {
  const b = bilancio;
  if (b?.livello_serbatoio_pct == null) return null;

  const pct = Math.min(100, Math.max(0, Number(b.livello_serbatoio_pct) || 0));
  const mm = Number(b.mm_mancanti_oggi) || 0;
  const sat = b.saturazione_suolo;

  const fab = Number(b.fabbisogno_oggi_mm) || 0;
  let hint = "Nessun deficit oggi";
  if (sat) hint = "Suolo saturo (pioggia recente)";
  else if (fab > 0) hint = `Irriga ${fab} mm (sotto soglia)`;
  else if (mm > 0) hint = `Mancano ${mm} mm alla soglia`;
  else if (pct <= 55) hint = "Vicino alla soglia di stress";

  return (
    <div className="irrigation-widget__serbatoio" role="status" aria-label={`Serbatoio idrico al ${pct} per cento`}>
      <div className="irrigation-widget__serbatoio-head">
        <span className="irrigation-widget__serbatoio-label">Serbatoio</span>
        <strong className="irrigation-widget__serbatoio-pct">{pct}%</strong>
        <span className="irrigation-widget__serbatoio-mm">{hint}</span>
      </div>
      <div className="irrigation-widget__serbatoio-track" aria-hidden>
        <span
          className={`irrigation-widget__serbatoio-fill${pct < 50 ? " irrigation-widget__serbatoio-fill--low" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function IconChevron({ open }) {
  return (
    <svg
      className={`irrigation-widget__chevron${open ? " irrigation-widget__chevron--open" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function IrrigationWidget({ profile, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const canRun = enabled && profile?.localita?.trim() && profile?.irrigazione !== "pioggia";

  function loadIrrigazione(force = false) {
    setLoading(true);
    setError("");
    return fetchIrrigazioneGiornaliera({ force })
      .then((payload) => {
        setData(payload);
        if (force) setExpanded(true);
      })
      .catch((e) => setError(e.message || "Errore calcolo"))
      .finally(() => setLoading(false));
  }

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

  useEffect(() => {
    if (!canRun) return;
    const onRefresh = () => loadIrrigazione(true);
    window.addEventListener(IRRIGAZIONE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(IRRIGAZIONE_REFRESH_EVENT, onRefresh);
  }, [canRun, profile?.localita, profile?.tipo_irrigatori, profile?.tempo_irrigazione_base, profile?.prato_zone]);

  if (!profile?.localita?.trim()) {
    return (
      <section className="irrigation-widget irrigation-widget--muted">
        <h2 className="irrigation-widget__title">Irrigazione</h2>
        <p className="irrigation-widget__lead">
          <Link to="/onboarding">Imposta la località</Link> per il programma da ET0 e pioggia.
        </p>
      </section>
    );
  }

  if (profile?.irrigazione === "pioggia") {
    return (
      <section className="irrigation-widget irrigation-widget--muted">
        <h2 className="irrigation-widget__title">Irrigazione</h2>
        <p className="irrigation-widget__lead">Profilo «solo pioggia»: motore in stand-by.</p>
      </section>
    );
  }

  const azione = data?.azione_irrigazione;
  const meta = azione ? AZIONE_IRRIGAZIONE_LABEL[azione] : null;
  const centralina = data?.dati_centralina;
  const tecnici = data?.dati_tecnici;
  const schema = data?.schema_settimanale;
  const programmaZone = data?.programma_zone;
  const hasData = data && !loading;

  return (
    <section
      id="irrigazione-widget"
      className={`irrigation-widget irrigation-widget--compact${azione ? ` irrigation-widget--${meta?.tone || "ok"}` : ""}${expanded ? " irrigation-widget--expanded" : ""}`}
    >
      <button
        type="button"
        className="irrigation-widget__toggle"
        onClick={() => hasData && setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="irrigation-widget-details"
        disabled={!hasData}
      >
        <span className="irrigation-widget__toggle-main">
          <span className="irrigation-widget__icon-wrap">
            <IconDroplet />
          </span>
          <span className="irrigation-widget__toggle-text">
            <span className="irrigation-widget__title-row">
              <span className="irrigation-widget__title">Irrigazione oggi</span>
              {meta ? (
                <span className={`irrigation-widget__pill irrigation-widget__pill--${meta.tone}`}>
                  {meta.label}
                </span>
              ) : null}
            </span>
            {loading ? (
              <span className="irrigation-widget__loading-inline">Calcolo…</span>
            ) : hasData ? (
              <>
                <IrrigationSerbatoioBar
                  bilancio={data.bilancio_serbatoio ?? schema?.bilancio_serbatoio}
                />
                <IrrigationProgramCompact
                  programma={programmaZone}
                  centralina={centralina}
                  tecnici={tecnici}
                  azione={azione}
                />
              </>
            ) : error ? (
              <span className="irrigation-widget__error-inline">{error}</span>
            ) : null}
          </span>
        </span>
        {hasData ? <IconChevron open={expanded} /> : null}
      </button>

      {hasData && expanded ? (
        <div id="irrigation-widget-details" className="irrigation-widget__details">
          {programmaZone?.zone?.length ? (
            <IrrigationZoneProgramDetails programma={programmaZone} />
          ) : null}

          {!programmaZone?.zone?.length && azione !== "SPEGNI" && centralina?.cicli_consigliati > 0 ? (
            <div className="irrigation-widget__centralina">
              <p>
                <strong>{tecnici?.minuti_totali_consigliati ?? 0} min</strong>
                {centralina.cicli_consigliati > 1
                  ? ` · ${centralina.cicli_consigliati} cicli da ${centralina.minuti_per_ciclo} min`
                  : null}
              </p>
            </div>
          ) : null}

          {schema ? <IrrigationWeeklySchedule schema={schema} azione={azione} /> : null}

          {data.messaggio_ux ? (
            <p className="irrigation-widget__messaggio">{data.messaggio_ux}</p>
          ) : null}

          {data.meteo_utilizzato ? (
            <p className="irrigation-widget__meteo-badge" role="note">
              Calcolo con meteo locale (ET0, pioggia).
            </p>
          ) : null}

          {tecnici?.contesto_mappa?.ha_zone_ombra || tecnici?.contesto_mappa?.ha_pendenza_mappa ? (
            <p className="irrigation-widget__mappa-badge" role="note">
              Mappa:
              {tecnici.contesto_mappa.ha_zone_ombra
                ? ` ombra ~${tecnici.percentuale_ombra_mappa ?? tecnici.contesto_mappa.pct_ombra_prato}%`
                : ""}
              {tecnici.contesto_mappa.ha_pendenza_mappa
                ? ` · pendenza ${tecnici.pendenza_effettiva || "—"}`
                : ""}
            </p>
          ) : null}

          {tecnici?.et0_mm != null ? (
            <p className="irrigation-widget__tech" role="note">
              ET0 {tecnici.et0_mm} mm · Kc {tecnici.kc} · oggi {tecnici.fabbisogno_calcolato_mm} mm
              {tecnici.precipitazioni_mm != null ? ` · pioggia ${tecnici.precipitazioni_mm} mm` : ""}
            </p>
          ) : null}

          <button
            type="button"
            className="irrigation-widget__refresh btn btn-outline btn-sm"
            disabled={loading}
            onClick={(e) => {
              e.stopPropagation();
              loadIrrigazione(true);
            }}
          >
            Aggiorna calcolo
          </button>
        </div>
      ) : null}
    </section>
  );
}
