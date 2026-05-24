import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { display_name: name.trim() || undefined } },
        });
        if (error) throw error;
        setMsg("Controlla la email di conferma.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        nav("/dashboard", { replace: true });
      }
    } catch (err) {
      setMsg(err.message || "Errore");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page auth">
      <h1>{mode === "login" ? "Accedi" : "Registrazione"}</h1>
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && (
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {msg && <p className="form-msg">{msg}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "…" : mode === "login" ? "Entra" : "Crea account"}
        </button>
      </form>
      <button
        type="button"
        className="btn-link"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Registrati" : "Accedi"}
      </button>
    </div>
  );
}
