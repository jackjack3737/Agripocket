import { Link } from "react-router-dom";

export default function Home({ session }) {
  return (
    <div className="page home">
      <header className="hero">
        <p className="eyebrow">AgriPocket</p>
        <h1>Agronomia del prato</h1>
        <p className="lead">
          Ti guidiamo passo passo a descrivere il prato — anche se non sai che erba hai — poi parli con
          l&apos;agronomo.
        </p>
      </header>
      <div className="home-actions">
        {session ? (
          <Link className="btn btn-primary" to="/dashboard">
            Vai alla dashboard
          </Link>
        ) : (
          <Link className="btn btn-primary" to="/login">
            Accedi
          </Link>
        )}
      </div>
    </div>
  );
}
