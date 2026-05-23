import { useState } from "react";
import { Link } from "react-router-dom";
import LawnMapModal from "./LawnMapModal";
import IrrigationZoneCard from "./IrrigationZoneCard";
import OmbraSeedCard from "./OmbraSeedCard";
import { countZonesByType, normalizePratoZone, ZONE_TYPES } from "../lib/pratoZone";
import { updatePratoZoneMappa } from "../lib/supabase";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

const ZONE_BUTTONS = [
  { tool: "irrigatore", label: "Irrigatori", desc: "Statico, rotator o oscillante" },
  { tool: "ombra", label: "Ombra", desc: "Siepi, alberi, zone poco sole" },
  { tool: "muschio", label: "Muschio", desc: "Zone con muschio o problemi" },
  { tool: "pendenza", label: "Pendenza", desc: "Direzione in cui scende l'acqua" },
];

export default function PratoZoneEditor({ profile, userId, onProfileUpdate }) {
  const [mapOpen, setMapOpen] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
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
        Ogni pulsante apre una mappa dedicata: vedi solo irrigatori, solo ombra, ecc. Ideale anche per
        giardini piccoli.
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
        {ZONE_BUTTONS.map(({ tool, label, desc }) => {
          const n = counts[tool] ?? 0;
          return (
            <button
              key={tool}
              type="button"
              className="dash-zone-editor__btn"
              disabled={!hasPoligono || saving}
              onClick={() => openTool(tool)}
            >
              <span className="dash-zone-editor__dot" style={{ background: ZONE_TYPES[tool]?.color }} />
              <span className="dash-zone-editor__label">{label}</span>
              <span className="dash-zone-editor__desc">{desc}</span>
              {n > 0 ? <span className="dash-zone-editor__count">{n} segnati</span> : null}
            </button>
          );
        })}
      </div>

      {error ? <p className="form-msg form-msg--error">{error}</p> : null}
      {saving ? <p className="dash-card__loading">Salvataggio mappa…</p> : null}

      <OmbraSeedCard profile={profile} />
      <IrrigationZoneCard profile={profile} hideEditLink />

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
