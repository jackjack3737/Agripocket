import { Link } from "react-router-dom";
import DashRotatingWord from "./DashRotatingWord";

const LINKS = [
  { key: "dashboard", to: "/dashboard", label: "Dashboard" },
  { key: "calendario", to: "/calendario", label: "Calendario" },
  { key: "farmacia", to: "/farmacia", label: "Farmacia" },
];

export default function AppNav({ active, profile }) {
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
      <span className="dash-nav__tail">
        <DashRotatingWord profile={profile} />
      </span>
    </nav>
  );
}
