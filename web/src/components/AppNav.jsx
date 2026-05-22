import { Link } from "react-router-dom";
import DashRotatingWord from "./DashRotatingWord";

const LINKS = [
  { key: "dashboard", to: "/dashboard", label: "Dashboard" },
  { key: "chat", to: "/chat", label: "Analisi foto" },
  { key: "calendario", to: "/calendario", label: "Calendario" },
];

export default function AppNav({ active, showRotatingWord = false, profile }) {
  return (
    <nav className="dash-nav" aria-label="Sezioni app">
      {LINKS.map(({ key, to, label }) => (
        <Link
          key={key}
          className={`dash-nav__link${active === key ? " dash-nav__link--active" : ""}`}
          to={to}
        >
          {label}
        </Link>
      ))}
      {showRotatingWord ? <DashRotatingWord profile={profile} /> : null}
    </nav>
  );
}
