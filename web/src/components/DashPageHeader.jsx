import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "./AppNav";
import ConsulenteZonaFoto from "./ConsulenteZonaFoto";
import { loadZonaDefault } from "../lib/zonePrato";

const TAGLINE_WORDS = ["la", "scienza", "sotto", "il", "verde"];

function taglineGiaVista() {
  try {
    return sessionStorage.getItem("solum_tagline_seen") === "1";
  } catch {
    return true;
  }
}

const PAGINE_CON_AGRONOMO = new Set(["dashboard", "calendario"]);

/** Header app: logo + tagline + nav + Chiedi all'agronomo (dashboard/calendario). */
export default function DashPageHeader({
  active,
  onLogout,
  profile,
  session,
  onAgronomoAnalisiComplete,
}) {
  const taglineReady = useMemo(() => taglineGiaVista(), []);
  const userId = session?.user?.id;
  const mostraAgronomo = PAGINE_CON_AGRONOMO.has(active) && Boolean(userId);
  const [zonaDefault, setZonaDefault] = useState(null);

  useEffect(() => {
    if (!userId) {
      setZonaDefault(null);
      return undefined;
    }
    let cancelled = false;
    loadZonaDefault(userId)
      .then((z) => {
        if (!cancelled) setZonaDefault(z);
      })
      .catch(() => {
        if (!cancelled) setZonaDefault(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (taglineReady) return undefined;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.setItem("solum_tagline_seen", "1");
      } catch {
        /* ignore */
      }
    }, 2200);
    return () => window.clearTimeout(id);
  }, [taglineReady]);

  return (
    <header className="dash-header dash-header--hero">
      <div className="dash-header__brandline">
        <div className="dash-header__brand-lockup">
          <Link to="/dashboard" className="dash-header__logo-link" aria-label="Solum — la scienza sotto il verde">
            <img
              src="/brand/solum-mark.png"
              alt="Solum"
              className="dash-header__logo"
              width={1024}
              height={568}
              decoding="async"
            />
          </Link>
          <p
            className={`dash-header__tagline${taglineReady ? " dash-header__tagline--ready" : ""}`}
            aria-label="la scienza sotto il verde"
          >
            {TAGLINE_WORDS.map((word, i) => (
              <span
                key={word}
                className={[
                  "dash-header__tagline-word",
                  word === "verde" && "dash-header__tagline-word--accent",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ "--tagline-i": i }}
              >
                {word}
              </span>
            ))}
          </p>
        </div>
        <div className="dash-header__actions">
          <Link to="/onboarding" className="dash-header__action">
            Profilo
          </Link>
          <button
            type="button"
            className="dash-header__action dash-header__action--logout"
            onClick={onLogout}
          >
            Esci
          </button>
        </div>
      </div>
      <AppNav active={active} profile={profile} />
      {mostraAgronomo ? (
        <div className="dash-header__agronomo">
          <ConsulenteZonaFoto
            variant="google"
            profile={profile}
            userId={userId}
            zonaId={zonaDefault?.id}
            zonaNome={zonaDefault?.nome_zona}
            onAnalisiComplete={onAgronomoAnalisiComplete}
          />
        </div>
      ) : null}
    </header>
  );
}
