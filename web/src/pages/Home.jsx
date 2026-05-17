import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadUltimaFoto } from "../lib/fotoPrato";

export default function Home({ session }) {
  const [ultimaFoto, setUltimaFoto] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setUltimaFoto(null);
      return;
    }
    loadUltimaFoto(session.user.id)
      .then(setUltimaFoto)
      .catch(() => setUltimaFoto(null));
  }, [session?.user?.id]);

  const fotoStyle = ultimaFoto?.foto_url
    ? { backgroundImage: `linear-gradient(165deg, rgba(12, 42, 18, 0.88) 0%, rgba(18, 58, 28, 0.78) 45%, rgba(8, 28, 14, 0.92) 100%), url(${ultimaFoto.foto_url})` }
    : undefined;

  return (
    <div className={`page home${ultimaFoto?.foto_url ? " home--has-photo" : ""}`} style={fotoStyle}>
      {ultimaFoto?.foto_url ? (
        <div className="home-photo-badge" aria-hidden>
          <img src={ultimaFoto.foto_url} alt="" />
          <span>
            Ultima foto —{" "}
            {new Date(ultimaFoto.created_at).toLocaleDateString("it-IT", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      ) : null}

      <header className="hero home-hero">
        <p className="eyebrow">AgriPocket</p>
        <h1>Agronomia del prato</h1>
        <p className="lead">
          Ti guidiamo passo passo a descrivere il prato — anche se non sai che erba hai — poi parli con
          l&apos;agronomo.
        </p>
        {session && !ultimaFoto?.foto_url ? (
          <p className="home-photo-hint">Dopo la prima analisi foto, qui vedrai l&apos;ultima immagine del tuo prato.</p>
        ) : null}
      </header>
      <div className="home-actions">
        {session ? (
          <>
            <Link className="btn btn-primary" to="/dashboard">
              Vai alla dashboard
            </Link>
            <Link className="btn btn-outline" to="/chat">
              Analisi foto
            </Link>
          </>
        ) : (
          <Link className="btn btn-primary" to="/login">
            Accedi
          </Link>
        )}
      </div>
    </div>
  );
}
