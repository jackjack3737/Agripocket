import { useState } from "react";
import { Link } from "react-router-dom";
import LawnMapModal from "./LawnMapModal";
import OmbraSeedHint from "./zoneMapHints/OmbraSeedHint";
import IrrigatoriHint from "./zoneMapHints/IrrigatoriHint";
import PendenzaHint from "./zoneMapHints/PendenzaHint";
import { countZonesByType, normalizePratoZone, ZONE_TYPES } from "../lib/pratoZone";
import { updatePratoZoneMappa } from "../lib/supabase";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

const ZONE_BUTTONS = [
  {
    tool: "irrigatore",
    label: "Irrigatori",
    desc: "Tocca ogni getto sulla mappa, scegli statico, rotator o oscillante e assegna la linea della centralina (Linea 1, 2…).",
  },
  {
    tool: "esposizione",
    label: "Sole / ombra",
    desc: "Disegna un poligono sull'area interessata, poi indica se è a pieno sole, mezz'ombra o ombra. Puoi segnare più zone diverse.",
  },
  {
    tool: "pendenza",
    label: "Pendenza",
    desc: "Traccia una freccia nel verso in cui scende l'acqua: migliora drenaggio, irrigazione e avvisi di ristagno.",
  },
];

function ZoneHintPanel({ tool, profile }) {
  if (tool === "esposizione") return <OmbraSeedHint profile={profile} />;
  if (tool === "irrigatore") return <IrrigatoriHint profile={profile} />;
  if (tool === "pendenza") return <PendenzaHint profile={profile} />;
  return null;
}

export default function PratoZoneEditor({ profile, userId, onProfileUpdate }) {
  const [mapOpen, setMapOpen] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [hintTool, setHintTool] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const normalized = normalizePratoZone(profile?.prato_zone);
  const hasPoligono = normalized.poligono.length >= 3;
  const counts = countZonesByType(profile?.prato_zone);

  function openTool(tool) {
    setError("");
    if (!hasPoligono) {
      setError("Prima disegna il contorno del prato in Profilo (mappa luogo e m²).");
      return;
    }
    setActiveTool(tool);
    setMapOpen(true);
  }

  async function handleZoneSave({ prato_zone }) {
    if (!userId || !prato_zone) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updatePratoZoneMappa(userId, prato_zone);
      onProfileUpdate?.(updated);
      setMapOpen(false);
      setActiveTool(null);
    } catch (e) {
      setError(e.message || "Errore salvataggio mappa");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-card dash-card--zone-editor dash-card--wide">
      <h2 className="dash-card__title">Mappa del prato</h2>
      <p className="dash-card__sub">
        Tocca una funzione per aprire la mappa; la freccia ▾ mostra il riepilogo (seme, irrigatori o pendenza).
      </p>

      {!hasPoligono ? (
        <p className="dash-zone-editor__warn">
          Disegna prima il prato in <Link to="/onboarding">Aggiorna profilo</Link> (mappa luogo e m²),
          poi torna qui.
        </p>
      ) : (
        <p className="dash-zone-editor__ok">
          Contorno salvato ({profile?.superficie_mq} m²). Scegli cosa segnare:
        </p>
      )}

      <div className="dash-zone-editor__grid">
        {ZONE_BUTTONS.map(({ tool, label }) => {
          const n = counts[tool] ?? 0;
          const hintOpen = hintTool === tool;
          return (
            <div
              key={tool}
              className={`dash-zone-editor__card${hintOpen ? " dash-zone-editor__card--hint-open" : ""}`}
            >
              <div className="dash-zone-editor__card-top">
                <button
                  type="button"
                  className="dash-zone-editor__btn"
                  disabled={!hasPoligono || saving}
                  onClick={() => openTool(tool)}
                >
                  <span className="dash-zone-editor__dot" style={{ background: ZONE_TYPES[tool]?.color }} />
                  <span className="dash-zone-editor__label">{label}</span>
                  {n > 0 ? <span className="dash-zone-editor__count">{n} segnati</span> : null}
                </button>
                <button
                  type="button"
                  className="dash-zone-editor__hint-btn"
                  aria-expanded={hintOpen}
                  aria-label={hintOpen ? `Chiudi riepilogo ${label}` : `Riepilogo ${label}`}
                  onClick={() => setHintTool((t) => (t === tool ? null : tool))}
                >
                  <span className="dash-zone-editor__hint-chev" aria-hidden />
                </button>
              </div>
              {hintOpen ? (
                <div className="dash-zone-editor__hint-panel">
                  <ZoneHintPanel tool={tool} profile={profile} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}
      {saving ? <p className="dash-card__loading">Salvataggio mappa…</p> : null}

      <LawnMapModal
        key={activeTool || "zone-map"}
        open={mapOpen}
        apiKey={GOOGLE_MAPS_API_KEY}
        purpose="zone"
        zoneTool={activeTool}
        initialLocalita={profile?.localita || ""}
        initialPratoZone={profile?.prato_zone}
        onClose={() => {
          setMapOpen(false);
          setActiveTool(null);
        }}
        onApply={handleZoneSave}
      />
    </section>
  );
}
