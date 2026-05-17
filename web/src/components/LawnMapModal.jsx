import { useEffect, useMemo, useRef, useState } from "react";
import { localityFromGeocodeResult } from "../lib/geocodePlace";
import { renderZoneOverlays } from "../lib/mapZoneOverlays";
import { formatMqInput } from "../lib/parseMq";
import { calculatePolygonAreaSqm } from "../lib/polygonArea";
import {
  buildPratoZonePayload,
  computeOmbraZonePct,
  IRRIGATOR_MODES,
  normalizePratoZone,
  ZONE_TYPES,
} from "../lib/pratoZone";

const SCRIPT_ID = "google-maps-agripocket-js";

function loadGoogleMapsOnce(apiKey) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("SSR"));
      return;
    }
    if (window.google?.maps?.Map) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      if (window.google?.maps?.Map) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Caricamento Google Maps fallito")), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Caricamento Google Maps fallito"));
    document.head.appendChild(s);
  });
}

function polygonCentroid(vertices) {
  if (!vertices.length) return null;
  let lat = 0;
  let lng = 0;
  vertices.forEach((v) => {
    lat += v.lat;
    lng += v.lng;
  });
  return { lat: lat / vertices.length, lng: lng / vertices.length };
}

function reverseLocality(lat, lng) {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve("");
      return;
    }
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        resolve(localityFromGeocodeResult(results[0]));
      } else {
        resolve("");
      }
    });
  });
}

export default function LawnMapModal({
  open,
  apiKey,
  initialLocalita = "",
  initialPratoZone = null,
  onClose,
  onApply,
}) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const polyRef = useRef(null);
  const markersRef = useRef([]);
  const clickListenerRef = useRef(null);
  const lastGeocodeRef = useRef(null);
  const zoneOverlayRefs = useRef({ markers: [], polygons: [], polylines: [] });

  const [mapStep, setMapStep] = useState("boundary");
  const [panMode, setPanMode] = useState(true);
  const [zoneTool, setZoneTool] = useState("pan");
  const [vertices, setVertices] = useState([]);
  const [zones, setZones] = useState([]);
  const [draftPath, setDraftPath] = useState([]);
  const [draftTipo, setDraftTipo] = useState("ombra");
  const [pendenzaFrom, setPendenzaFrom] = useState(null);
  const [irrigatorPick, setIrrigatorPick] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [mapTick, setMapTick] = useState(0);
  const [address, setAddress] = useState("");
  const [addressHint, setAddressHint] = useState(null);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const areaSqm = useMemo(() => calculatePolygonAreaSqm(vertices), [vertices]);
  const mapReady = mapTick > 0 && !!mapRef.current;
  const inZones = mapStep === "zones";

  function runGeocode(query, { fitMap = true } = {}) {
    const q = query.trim();
    if (!q) {
      setAddressHint("Scrivi un indirizzo o un luogo (es. via Roma 1, Milano).");
      return Promise.resolve(false);
    }
    const map = mapRef.current;
    if (!map || !window.google?.maps?.Geocoder) {
      setAddressHint("Attendi il caricamento della mappa.");
      return Promise.resolve(false);
    }

    setGeocodeBusy(true);
    setAddressHint(null);

    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: q, region: "it" }, (results, status) => {
        setGeocodeBusy(false);
        if (!mapRef.current) {
          resolve(false);
          return;
        }
        if (status !== "OK" || !results?.[0]?.geometry) {
          setAddressHint(
            status === "ZERO_RESULTS"
              ? "Nessun risultato. Prova con via, numero e città."
              : "Ricerca non riuscita. Verifica Geocoding API sulla chiave Google.",
          );
          resolve(false);
          return;
        }

        const result = results[0];
        lastGeocodeRef.current = result;
        const { geometry } = result;
        if (fitMap) {
          if (geometry.viewport) mapRef.current.fitBounds(geometry.viewport);
          else if (geometry.bounds) mapRef.current.fitBounds(geometry.bounds);
          else {
            mapRef.current.setCenter(geometry.location);
            mapRef.current.setZoom(19);
          }
        }
        setPanMode(true);
        resolve(true);
      });
    });
  }

  function handleGeocodeAddress(e) {
    e?.preventDefault?.();
    runGeocode(address);
  }

  function resetDraft() {
    setDraftPath([]);
    setPendenzaFrom(null);
    setIrrigatorPick(null);
  }

  function addZone(zone) {
    setZones((prev) => [...prev, zone]);
    resetDraft();
  }

  function removeZone(id) {
    setZones((prev) => prev.filter((z) => z.id !== id));
  }

  function handleMapClick(lat, lng) {
    if (inZones) {
      if (zoneTool === "pan") return;
      if (zoneTool === "irrigatore") {
        setIrrigatorPick({ lat, lng });
        return;
      }
      if (zoneTool === "ombra" || zoneTool === "muschio") {
        setDraftTipo(zoneTool);
        setDraftPath((prev) => [...prev, { lat, lng }]);
        return;
      }
      if (zoneTool === "pendenza") {
        if (!pendenzaFrom) {
          setPendenzaFrom({ lat, lng });
        } else {
          addZone({
            id: `z_${Date.now()}`,
            tipo: "pendenza",
            from: pendenzaFrom,
            to: { lat, lng },
          });
        }
        return;
      }
      return;
    }

    if (!panMode) {
      setVertices((prev) => [...prev, { lat, lng }]);
    }
  }

  function confirmIrrigator(modalita) {
    if (!irrigatorPick) return;
    addZone({
      id: `z_${Date.now()}`,
      tipo: "irrigatore",
      lat: irrigatorPick.lat,
      lng: irrigatorPick.lng,
      modalita,
    });
    setIrrigatorPick(null);
  }

  function closeDraftPolygon() {
    if (draftPath.length < 3) return;
    addZone({
      id: `z_${Date.now()}`,
      tipo: draftTipo,
      path: [...draftPath],
    });
  }

  useEffect(() => {
    if (!open) return;
    const normalized = normalizePratoZone(initialPratoZone);
    setVertices(normalized.poligono.length >= 3 ? normalized.poligono : []);
    setZones(normalized.zone);
    setMapStep("boundary");
    setPanMode(true);
    setZoneTool("pan");
    resetDraft();
    setLoadError(null);
    setAddress(initialLocalita?.trim() || "");
    setAddressHint(null);
    setGeocodeBusy(false);
    setApplyBusy(false);
    setMapTick(0);
    lastGeocodeRef.current = null;
  }, [open, initialLocalita, initialPratoZone]);

  useEffect(() => {
    if (!open || !apiKey?.trim() || !mapElRef.current) return undefined;

    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMapsOnce(apiKey.trim());
        if (cancelled || !mapElRef.current) return;

        const map = new window.google.maps.Map(mapElRef.current, {
          center: { lat: 41.9028, lng: 12.4964 },
          zoom: 18,
          mapTypeId: "satellite",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        mapRef.current = map;

        const poly = new window.google.maps.Polygon({
          paths: [],
          strokeColor: "#1a3d2e",
          strokeOpacity: 0.9,
          strokeWeight: 3,
          fillColor: "#1a3d2e",
          fillOpacity: 0.12,
          map,
          geodesic: true,
        });
        polyRef.current = poly;

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled || !mapRef.current) return;
              mapRef.current.setCenter({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              });
            },
            () => {},
            { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 },
          );
        }

        setMapTick((t) => t + 1);
      } catch (e) {
        if (!cancelled) setLoadError(e?.message ?? "Errore mappe");
      }
    })();

    return () => {
      cancelled = true;
      if (clickListenerRef.current) {
        window.google?.maps?.event?.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      zoneOverlayRefs.current.markers.forEach((m) => m.setMap(null));
      zoneOverlayRefs.current.polygons.forEach((p) => p.setMap(null));
      zoneOverlayRefs.current.polylines.forEach((l) => l.setMap(null));
      zoneOverlayRefs.current = { markers: [], polygons: [], polylines: [] };
      polyRef.current?.setMap(null);
      polyRef.current = null;
      mapRef.current = null;
    };
  }, [open, apiKey]);

  useEffect(() => {
    if (!open || !mapReady || !initialLocalita?.trim()) return;
    runGeocode(initialLocalita, { fitMap: true });
  }, [open, mapReady, initialLocalita]);

  useEffect(() => {
    if (!open) return;
    const poly = polyRef.current;
    if (!poly) return;
    poly.setPath(vertices);
  }, [vertices, open, mapTick]);

  useEffect(() => {
    if (!open || inZones) return;
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    vertices.forEach((v, i) => {
      const m = new window.google.maps.Marker({
        position: v,
        map,
        label: String(i + 1),
        title: "Clic per rimuovere questo vertice",
      });
      m.addListener("click", () => {
        setVertices((prev) => prev.filter((_, idx) => idx !== i));
      });
      markersRef.current.push(m);
    });
  }, [vertices, open, mapTick, inZones]);

  useEffect(() => {
    if (!open || !mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const draft =
      draftPath.length > 0
        ? { path: draftPath, tipo: draftTipo }
        : pendenzaFrom
          ? { from: pendenzaFrom, to: null }
          : null;

    if (inZones) {
      renderZoneOverlays(map, zoneOverlayRefs.current, zones, draft);
    } else {
      zoneOverlayRefs.current.markers.forEach((m) => m.setMap(null));
      zoneOverlayRefs.current.polygons.forEach((p) => p.setMap(null));
      zoneOverlayRefs.current.polylines.forEach((l) => l.setMap(null));
      zoneOverlayRefs.current = { markers: [], polygons: [], polylines: [] };
    }
  }, [zones, draftPath, draftTipo, pendenzaFrom, open, mapTick, mapReady, inZones]);

  useEffect(() => {
    if (!open) return;
    const map = mapRef.current;
    if (!map) return;

    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    const drawMode = inZones ? zoneTool !== "pan" : !panMode;
    map.setOptions({ draggable: !drawMode, scrollwheel: true });

    if (drawMode || (!inZones && !panMode)) {
      clickListenerRef.current = map.addListener("click", (e) => {
        handleMapClick(e.latLng.lat(), e.latLng.lng());
      });
    }

    return () => {
      if (clickListenerRef.current) {
        window.google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [panMode, zoneTool, inZones, open, mapTick, pendenzaFrom]);

  async function handleApply() {
    if (vertices.length < 3 || areaSqm <= 0) return;
    setApplyBusy(true);

    let localita = lastGeocodeRef.current ? localityFromGeocodeResult(lastGeocodeRef.current) : "";

    if (!localita) {
      const center = polygonCentroid(vertices);
      if (center) localita = await reverseLocality(center.lat, center.lng);
    }

    const prato_zone = buildPratoZonePayload(vertices, zones);
    const ombra_zone_pct = computeOmbraZonePct(prato_zone);

    onApply({
      localita: localita || undefined,
      superficie_mq: Math.round(areaSqm),
      prato_zone,
      ombra_zone_pct: ombra_zone_pct || undefined,
    });
    setApplyBusy(false);
    onClose();
  }

  if (!open) return null;

  const missingKey = !apiKey?.trim();
  const canBoundary = vertices.length >= 3 && areaSqm > 0;
  const previewLocalita = lastGeocodeRef.current ? localityFromGeocodeResult(lastGeocodeRef.current) : "";
  const irrCount = zones.filter((z) => z.tipo === "irrigatore").length;

  return (
    <div
      className="map-modal-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="map-modal map-modal--wide" role="dialog" aria-labelledby="map-modal-title">
        <div className="map-modal-header">
          <h2 id="map-modal-title" className="map-modal-title">
            {inZones ? "Segna zone sul prato" : "Luogo e superficie"}
          </h2>
          <button type="button" className="map-modal-close" onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </div>

        {missingKey && (
          <div className="map-modal-banner">
            Aggiungi <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>web/.env.local</code>.
          </div>
        )}

        {loadError && !missingKey && <div className="map-modal-banner map-modal-banner--error">{loadError}</div>}

        {!missingKey && !loadError && !inZones && (
          <p className="map-modal-hint">
            Cerca l&apos;indirizzo, poi <strong>Freccia</strong> per disegnare il contorno del prato.
          </p>
        )}

        {!missingKey && !loadError && inZones && (
          <p className="map-modal-hint">
            Segna irrigatori (<strong>S</strong> statico, <strong>D</strong> dinamico), ombra, muschio e pendenza.
            Poi salva.
          </p>
        )}

        {!missingKey && !loadError && !inZones && (
          <form className="map-modal-search" onSubmit={handleGeocodeAddress}>
            <input
              type="text"
              className="map-modal-search-input"
              placeholder="Indirizzo (es. Via Dante 10, Bologna)"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                if (addressHint) setAddressHint(null);
              }}
              disabled={!mapReady || geocodeBusy}
              autoComplete="street-address"
            />
            <button type="submit" className="map-modal-search-btn" disabled={!mapReady || geocodeBusy}>
              {geocodeBusy ? "…" : "Cerca"}
            </button>
          </form>
        )}
        {addressHint && !missingKey && <div className="map-modal-address-hint">{addressHint}</div>}
        {previewLocalita && !missingKey && !inZones && (
          <p className="map-modal-place-preview">
            Luogo: <strong>{previewLocalita}</strong>
          </p>
        )}

        {!inZones ? (
          <div className="map-modal-toolbar">
            <div className="map-modal-toggle">
              <button type="button" className={`map-toggle-btn${panMode ? " active" : ""}`} onClick={() => setPanMode(true)}>
                Mano
              </button>
              <button
                type="button"
                className={`map-toggle-btn${!panMode ? " active" : ""}`}
                onClick={() => setPanMode(false)}
              >
                Disegna prato
              </button>
            </div>
            <button type="button" className="btn-outline-sm" onClick={() => setVertices([])} disabled={vertices.length === 0}>
              Azzera contorno
            </button>
          </div>
        ) : (
          <div className="map-zone-toolbar">
            {["pan", "irrigatore", "ombra", "muschio", "pendenza"].map((tool) => (
              <button
                key={tool}
                type="button"
                className={`map-zone-tool${zoneTool === tool ? " map-zone-tool--on" : ""}`}
                onClick={() => {
                  setZoneTool(tool);
                  resetDraft();
                }}
              >
                {tool === "pan" ? "Mano" : ZONE_TYPES[tool]?.label || tool}
              </button>
            ))}
            {(draftPath.length > 0 || pendenzaFrom) && (
              <button type="button" className="btn-outline-sm" onClick={resetDraft}>
                Annulla disegno
              </button>
            )}
            {draftPath.length >= 3 && (
              <button type="button" className="btn-outline-sm map-zone-tool-confirm" onClick={closeDraftPolygon}>
                Chiudi area {ZONE_TYPES[draftTipo]?.label}
              </button>
            )}
          </div>
        )}

        {zones.length > 0 && inZones && (
          <ul className="map-zone-list">
            {zones.map((z) => (
              <li key={z.id}>
                <span className="map-zone-list__dot" style={{ background: ZONE_TYPES[z.tipo]?.color }} />
                {z.tipo === "irrigatore"
                  ? `Irrigatore ${IRRIGATOR_MODES[z.modalita]?.label || z.modalita}`
                  : ZONE_TYPES[z.tipo]?.label}
                <button type="button" className="map-zone-list__del" onClick={() => removeZone(z.id)} aria-label="Rimuovi">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div ref={mapElRef} className="map-modal-map" />

        {irrigatorPick && (
          <div className="map-irrigator-pick" role="dialog" aria-label="Tipo irrigatore">
            <p>Che tipo di irrigatore è qui?</p>
            <div className="map-irrigator-pick__actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => confirmIrrigator("statico")}>
                {IRRIGATOR_MODES.statico.label}
                <span className="map-irrigator-pick__sub">{IRRIGATOR_MODES.statico.desc}</span>
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => confirmIrrigator("dinamico")}>
                {IRRIGATOR_MODES.dinamico.label}
                <span className="map-irrigator-pick__sub">{IRRIGATOR_MODES.dinamico.desc}</span>
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIrrigatorPick(null)}>
                Annulla
              </button>
            </div>
          </div>
        )}

        <div className="map-modal-footer">
          <div className="map-modal-area">
            {vertices.length < 3 ? (
              <span className="map-area-muted">Area: — (almeno 3 punti)</span>
            ) : (
              <span>
                Area: <strong>{formatMqInput(areaSqm)} m²</strong>
                {inZones && irrCount > 0 ? (
                  <>
                    {" "}
                    · <strong>{irrCount}</strong> irrigatori
                  </>
                ) : null}
              </span>
            )}
          </div>
          <div className="map-modal-actions">
            {inZones ? (
              <button type="button" className="btn-outline-sm" onClick={() => setMapStep("boundary")}>
                Indietro contorno
              </button>
            ) : (
              <button type="button" className="btn-outline-sm" onClick={onClose}>
                Annulla
              </button>
            )}
            {!inZones && canBoundary && (
              <button
                type="button"
                className="btn-outline-sm"
                onClick={() => {
                  setMapStep("zones");
                  setPanMode(false);
                  setZoneTool("irrigatore");
                }}
              >
                Segna zone →
              </button>
            )}
            <button
              type="button"
              className="map-modal-apply"
              disabled={!canBoundary || applyBusy}
              onClick={handleApply}
            >
              {applyBusy ? "…" : inZones ? "Salva mappa e m²" : "Salva (solo contorno)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
