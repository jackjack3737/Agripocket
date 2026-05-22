import { Link } from "react-router-dom";
import AppNav from "./AppNav";

export default function DashPageHeader({
  active,
  kicker,
  title,
  titleAccent,
  summary,
  onLogout,
  techTitle = false,
  appleTitle = false,
  heroBrand = false,
  profile,
}) {
  const titleClass = [
    "dash-header__title",
    appleTitle && "dash-header__title--apple",
    techTitle && !appleTitle && "dash-header__title--tech",
  ]
    .filter(Boolean)
    .join(" ");

  if (heroBrand) {
    return (
      <header className="dash-header dash-header--hero">
        <div className="dash-header__brandline">
          <h1 className="dash-header__hero-brand">SOLUM</h1>
          <p className="dash-header__hero-tagline">la scienza sotto il verde</p>
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
        <AppNav active={active} showRotatingWord profile={profile} />
      </header>
    );
  }

  return (
    <header className="dash-header">
      <div className="dash-header__top">
        <div className="dash-header__brand">
          {kicker ? (
            <p className={`dash-header__kicker${appleTitle ? " dash-header__kicker--apple" : ""}`}>{kicker}</p>
          ) : null}
          <h1 className={titleClass}>
            {appleTitle || !titleAccent ? (
              title
            ) : (
              <>
                <span className="dash-header__title-main">{title}</span>
                <span className="dash-header__title-accent">{titleAccent}</span>
              </>
            )}
          </h1>
          {summary ? <p className="dash-header__chip profile-chip">{summary}</p> : null}
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
      <AppNav active={active} />
    </header>
  );
}
