import { Link } from "react-router-dom";

const LINKS = [
  { key: "dashboard", to: "/dashboard", label: "Dashboard" },
  { key: "chat", to: "/chat", label: "Analisi foto" },
  { key: "profilo", to: "/onboarding", label: "Profilo" },
  { key: "calendario", to: "/calendario", label: "Calendario" },
];

export default function AppNav({ active, onLogout }) {
  return (
    <nav className="dash-nav">
      {LINKS.map(({ key, to, label }) => (
        <Link
          key={key}
          className={`dash-nav__link${active === key ? " dash-nav__link--active" : ""}`}
          to={to}
        >
          {label}
        </Link>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
        Esci
      </button>
    </nav>
  );
}
