import { useEffect, useMemo, useState } from "react";
import { sintesiDaAnalisi } from "../lib/sintesiAnalisi";
import SintesiAnalisiBlocks from "./SintesiAnalisiBlocks";

export default function StatoClinicoGeminiBar({ ultimaAnalisi, className = "" }) {
  const [sintesiAperta, setSintesiAperta] = useState(false);

  const haSintesi = useMemo(() => {
    if (!ultimaAnalisi) return false;
    return !sintesiDaAnalisi({
      vision_json: ultimaAnalisi.vision_json,
      report_markdown: ultimaAnalisi.report_markdown,
    }).vuota;
  }, [ultimaAnalisi?.vision_json, ultimaAnalisi?.report_markdown]);

  useEffect(() => {
    setSintesiAperta(false);
  }, [ultimaAnalisi?.id]);

  if (!haSintesi) return null;

  return (
    <div className={`stato-clinico-gemini dash-grid__span${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className={`stato-clinico-gemini__toggle${sintesiAperta ? " stato-clinico-gemini__toggle--open" : ""}`}
        onClick={() => setSintesiAperta((v) => !v)}
        aria-expanded={sintesiAperta}
        aria-controls="stato-clinico-sintesi-panel"
      >
        <span className="stato-clinico-gemini__label">Analisi Gemini</span>
        <span className="stato-clinico-gemini__chevron" aria-hidden />
      </button>
      {sintesiAperta ? (
        <div id="stato-clinico-sintesi-panel" className="stato-clinico-gemini__panel">
          <SintesiAnalisiBlocks
            visionJson={ultimaAnalisi.vision_json}
            reportMarkdown={ultimaAnalisi.report_markdown}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}
