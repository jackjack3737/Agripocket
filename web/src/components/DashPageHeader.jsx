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
}) {
  return (
    <header className="dash-header">
      <div className="dash-header__top">
        <div className="dash-header__brand">
          {kicker ? <p className="dash-header__kicker">{kicker}</p> : null}
          <h1 className={`dash-header__title${techTitle ? " dash-header__title--tech" : ""}`}>
            {titleAccent ? (
              <>
                <span className="dash-header__title-main">{title}</span>
                <span className="dash-header__title-accent">{titleAccent}</span>
              </>
            ) : (
              title
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
