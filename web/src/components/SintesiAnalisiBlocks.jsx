import { sintesiDaAnalisi } from "../lib/sintesiAnalisi";

export default function SintesiAnalisiBlocks({ visionJson, reportMarkdown, compact }) {
  const sintesi = sintesiDaAnalisi({
    vision_json: visionJson,
    report_markdown: reportMarkdown,
  });

  if (sintesi.vuota) return null;

  return (
    <div className={`sintesi-analisi${compact ? " sintesi-analisi--compact" : ""}`}>
      {sintesi.sezioni.map((s) => (
        <div key={s.id} className="sintesi-blocco">
          <h4 className="sintesi-blocco__title">
            <span aria-hidden>{s.icon}</span> {s.titolo}
          </h4>
          <ul className="sintesi-blocco__list">
            {s.righe.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ))}
      {sintesi.pianoAzione.length ? (
        <div className="sintesi-blocco sintesi-blocco--azione">
          <h4 className="sintesi-blocco__title">Cosa fare</h4>
          <ul className="sintesi-blocco__list">
            {sintesi.pianoAzione.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
