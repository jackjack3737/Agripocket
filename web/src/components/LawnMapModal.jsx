import { useEffect, useMemo, useRef, useState } from "react";
import { localityFromGeocodeResult } from "../lib/geocodePlace";
import { formatMqInput } from "../lib/parseMq";
import { calculatePolygonAreaSqm } from "../lib/polygonArea";

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

export default function LawnMapModal({ open, apiKey, initialLocalita = "", onClose, onApply }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const polyRef = useRef(null);
  const markersRef = useRef([]);
  const clickListenerRef = useRef(null);
  const lastGeocodeRef = useRef(null);

  const [panMode, setPanMode] = useState(true);
  const [vertices, setVertices] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [mapTick, setMapTick] = useState(0);
  const [address, setAddress] = useState("");
  const [addressHint, setAddressHint] = useState(null);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const areaSqm = useMemo(() => calculatePolygonAreaSqm(vertices), [vertices]);
  const mapReady = mapTick > 0 && !!mapRef.current;

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
              : "Ricerca non riuscita. Verifica Geocoding API sulla chiave Google."
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

  useEffect(() => {
    if (!open) return;
    setVertices([]);
    setPanMode(true);
    setLoadError(null);
    setAddress(initialLocalita?.trim() || "");
    setAddressHint(null);
    setGeocodeBusy(false);
    setApplyBusy(false);
    setMapTick(0);
    lastGeocodeRef.current = null;
  }, [open, initialLocalita]);

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
            { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 }
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
    const map = mapRef.current;
    const poly = polyRef.current;
    if (!map || !poly) return;

    poly.setPath(vertices);
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
  }, [vertices, open, mapTick]);

  useEffect(() => {
    if (!open) return;
    const map = mapRef.current;
    if (!map) return;

    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    map.setOptions({ draggable: panMode, scrollwheel: true });

    if (!panMode) {
      clickListenerRef.current = map.addListener("click", (e) => {
        setVertices((prev) => [...prev, { lat: e.latLng.lat(), lng: e.latLng.lng() }]);
      });
    }

    return () => {
      if (clickListenerRef.current) {
        window.google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [panMode, open, mapTick]);

  async function handleApply() {
    if (vertices.length < 3 || areaSqm <= 0) return;
    setApplyBusy(true);

    let localita = lastGeocodeRef.current
      ? localityFromGeocodeResult(lastGeocodeRef.current)
      : "";

    if (!localita) {
      const center = polygonCentroid(vertices);
      if (center) localita = await reverseLocality(center.lat, center.lng);
    }

    const rounded = Math.round(areaSqm * 10) / 10;
    onApply({
      localita: localita || undefined,
      superficie_mq: rounded,
    });
    setApplyBusy(false);
    onClose();
  }

  if (!open) return null;

  const missingKey = !apiKey?.trim();
  const canApply = vertices.length >= 3 && areaSqm > 0;
  const previewLocalita = lastGeocodeRef.current
    ? localityFromGeocodeResult(lastGeocodeRef.current)
    : "";

  return (
    <div
      className="map-modal-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="map-modal" role="dialog" aria-labelledby="map-modal-title">
        <div className="map-modal-header">
          <h2 id="map-modal-title" className="map-modal-title">
            Luogo e superficie
          </h2>
          <button type="button" className="map-modal-close" onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </div>

        {missingKey && (
          <div className="map-modal-banner">
            Aggiungi <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>web/.env.local</code> (stessa chiave del
            preventivo).
          </div>
        )}

        {loadError && !missingKey && <div className="map-modal-banner map-modal-banner--error">{loadError}</div>}

        {!missingKey && !loadError && (
          <p className="map-modal-hint">
            Cerca l&apos;indirizzo (compila il <strong>luogo</strong>), poi <strong>Freccia</strong> per disegnare il
            prato e calcolare i <strong>m²</strong>.
          </p>
        )}

        {!missingKey && !loadError && (
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
        {previewLocalita && !missingKey && (
          <p className="map-modal-place-preview">
            Luogo: <strong>{previewLocalita}</strong>
          </p>
        )}

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
              Freccia
            </button>
          </div>
          <button type="button" className="btn-outline-sm" onClick={() => setVertices([])} disabled={vertices.length === 0}>
            Azzera
          </button>
        </div>

        <div ref={mapElRef} className="map-modal-map" />

        <div className="map-modal-footer">
          <div className="map-modal-area">
            {vertices.length < 3 ? (
              <span className="map-area-muted">Area: — (almeno 3 punti)</span>
            ) : (
              <span>
                Area: <strong>{formatMqInput(areaSqm)} m²</strong>
              </span>
            )}
          </div>
          <div className="map-modal-actions">
            <button type="button" className="btn-outline-sm" onClick={onClose}>
              Annulla
            </button>
            <button
              type="button"
              className="map-modal-apply"
              disabled={!canApply || applyBusy}
              onClick={handleApply}
            >
              {applyBusy ? "…" : "Usa luogo e m²"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
