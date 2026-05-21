import { getIstruzioniPrelievoSuolo, getLaboratoriSuolo } from "../lib/laboratoriSuolo";

export default function AnalisiSuoloAlert({ localita, motivo }) {
  if (!localita) return null;

  const labs = getLaboratoriSuolo(localita);
  const istruzioni = getIstruzioniPrelievoSuolo();

  return (
    <section className="dash-card dash-card--wide analisi-suolo-alert" role="alert">
      <h3 className="analisi-suolo-alert__title">Analisi del suolo consigliata</h3>
      <p className="analisi-suolo-alert__lead">
        {motivo ||
          "I sintomi indicano possibili squilibri di pH o carenze nutrizionali: serve un campione in laboratorio, non solo consigli generici."}
      </p>
      <h4 className="analisi-suolo-alert__subtitle">Laboratori nelle vicinanze</h4>
      <ul className="analisi-suolo-alert__labs">
        {labs.map((lab) => (
          <li key={lab.nome}>
            <strong>{lab.nome}</strong>
            <span>{lab.nota}</span>
          </li>
        ))}
      </ul>
      <h4 className="analisi-suolo-alert__subtitle">Come prelevare le carote di terra</h4>
      <ol className="analisi-suolo-alert__steps">
        {istruzioni.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
