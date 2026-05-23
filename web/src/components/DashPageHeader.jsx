import { Link } from "react-router-dom";
import AppNav from "./AppNav";

const TAGLINE_WORDS = ["la", "scienza", "sotto", "il", "verde"];

/** Header app: logo + tagline + nav sempre visibili su dashboard, analisi foto, calendario. */
export default function DashPageHeader({ active, onLogout, profile }) {
  return (
    <header className="dash-header dash-header--hero">
      <div className="dash-header__brandline">
        <div className="dash-header__brand-lockup">
          <Link to="/dashboard" className="dash-header__logo-link" aria-label="Solum — la scienza sotto il verde">
            <img
              src="/brand/solum-mark.png"
              alt="Solum"
              className="dash-header__logo"
              width={512}
              height={284}
              decoding="async"
            />
          </Link>
          <p className="dash-header__tagline" aria-label="la scienza sotto il verde">
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
      <AppNav active={active} showRotatingWord={active === "dashboard"} profile={profile} />
    </header>
  );
}
