import { useState } from "react";
import { supabase } from "../lib/supabase";

const DOMANDA_DEFAULT = "Perché l'erba non cresce in questa zona?";

export default function ChatZonaPanel({ profile, zonaId, zonaNome }) {
  const [domanda, setDomanda] = useState(DOMANDA_DEFAULT);
  const [risposta, setRisposta] = useState("");
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function invia(e) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    setRisposta("");

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Accedi per usare il consulente zona.");

      const res = await fetch("/api/chat-zona", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domanda: domanda.trim() || DOMANDA_DEFAULT,
          zonaId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Risposta non disponibile");

      setRisposta(data.risposta || "");
      setMeta({ fonte: data.fonte, chunksUsed: data.chunksUsed });
    } catch (err) {
      setError(err.message || "Errore chat");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="dash-card dash-card--wide chat-zona">
      <h2 className="dash-card__title">Consulente zona</h2>
      <p className="dash-card__sub">
        Contesto: <strong>{zonaNome || "Prato principale"}</strong>
        {profile?.localita ? ` · ${profile.localita}` : ""}. Meteo ET0/GDD e storico analisi
        passano in background — risposta solo da knowledge base.
      </p>

      <form className="chat-zona__form" onSubmit={invia}>
        <label className="chat-zona__label" htmlFor="chat-zona-domanda">
          Domanda
        </label>
        <textarea
          id="chat-zona-domanda"
          className="chat-zona__input"
          rows={2}
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Analisi in corso…" : "Chiedi all'agronomo"}
        </button>
      </form>

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      {risposta ? (
        <div className="chat-zona__risposta">
          <p className="chat-zona__risposta-text">{risposta}</p>
          {meta ? (
            <p className="dash-card__meta">
              Fonte: {meta.fonte === "rag" ? "Knowledge base" : "Dati insufficienti"} ·{" "}
              {meta.chunksUsed} estratti
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
