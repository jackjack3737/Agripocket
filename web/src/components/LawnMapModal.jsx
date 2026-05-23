import { useEffect, useMemo, useRef, useState } from "react";
import { localityFromGeocodeResult } from "../lib/geocodePlace";
import { renderZoneOverlays } from "../lib/mapZoneOverlays";
import { formatMqInput } from "../lib/parseMq";
import { calculatePolygonAreaSqm } from "../lib/polygonArea";
import {
  computeOmbraZonePct,
  ESPOSIZIONE_LIVELLI,
  getLawnPolygons,
  IRRIGATOR_MODES,
  LINEA_CENTRALINA_MAX,
  mergePratoZoneUpdate,
  normalizeEsposizioneLivello,
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

/** Zoom sulla superficie del prato (giardini piccoli: più vicino, ma puoi allontanare). */
function fitMapToPolygon(map, vertices) {
  if (!map || !vertices?.length || !window.google?.maps?.LatLngBounds) return;
  const center = polygonCentroid(vertices);
  if (vertices.length === 1) {
    map.setCenter(vertices[0]);
    map.setZoom(20);
    return;
  }
  const area = calculatePolygonAreaSqm(vertices);
  if (center && area > 0 && area < 180) {
    map.setCenter(center);
    map.setZoom(area < 45 ? 20 : area < 90 ? 19 : 18);
    return;
  }
  const bounds = new window.google.maps.LatLngBounds();
  for (const v of vertices) bounds.extend(v);
  map.fitBounds(bounds, 72);
  window.google.maps.event.addListenerOnce(map, "idle", () => {
    if (map.getZoom() > 21) map.setZoom(21);
  });
}

function fitMapToAllPolygons(map, lawnPolygons) {
  const flat = (lawnPolygons || []).flat();
  if (!flat.length) return;
  fitMapToPolygon(map, flat);
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
  purpose = "boundary",
  zoneTool: zoneToolProp = "irrigatore",
  initialLocalita = "",
  initialPratoZone = null,
  onClose,
  onApply,
}) {
  const isZoneEdit = purpose === "zone";
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const polyRefs = useRef([]);
  const markersRef = useRef([]);
  const clickListenerRef = useRef(null);
  const lastGeocodeRef = useRef(null);
  const zoneOverlayRefs = useRef({ markers: [], polygons: [], polylines: [] });
  const drawStateRef = useRef({
    inZones: false,
    panMode: true,
    zoneTool: "pan",
    pendenzaFrom: null,
  });

  const [mapStep, setMapStep] = useState("boundary");
  const [panMode, setPanMode] = useState(true);
  const [zoneTool, setZoneTool] = useState("pan");
  const [lawnPolygons, setLawnPolygons] = useState([[]]);
  const [activePolyIndex, setActivePolyIndex] = useState(0);
  const [zones, setZones] = useState([]);
  const [draftPath, setDraftPath] = useState([]);
  const [draftTipo, setDraftTipo] = useState("esposizione");
  const [pendenzaFrom, setPendenzaFrom] = useState(null);
  const [irrigatorPick, setIrrigatorPick] = useState(null);
  const [esposizionePick, setEsposizionePick] = useState(null);
  const [pickLinea, setPickLinea] = useState(1);
  const [lastLinea, setLastLinea] = useState(1);
  const [loadError, setLoadError] = useState(null);
  const [mapTick, setMapTick] = useState(0);
  const [address, setAddress] = useState("");
  const [addressHint, setAddressHint] = useState(null);
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);

  const vertices = lawnPolygons[activePolyIndex] ?? [];

  const setVertices = (updater) => {
    setLawnPolygons((prev) => {
      const next = prev.map((ring) => [...ring]);
      while (next.length <= activePolyIndex) next.push([]);
      const cur = next[activePolyIndex] ?? [];
      next[activePolyIndex] = typeof updater === "function" ? updater(cur) : updater;
      return next;
    });
  };

  const areaSqm = useMemo(
    () =>
      lawnPolygons.reduce(
        (s, ring) => (ring.length >= 3 ? s + calculatePolygonAreaSqm(ring) : s),
        0,
      ),
    [lawnPolygons],
  );
  const validPolygons = useMemo(
    () => lawnPolygons.filter((ring) => ring.length >= 3),
    [lawnPolygons],
  );
  const mapReady = mapTick > 0 && !!mapRef.current;
  const inZones = isZoneEdit || mapStep === "zones";

  function addAnotherLawnArea() {
    setLawnPolygons((prev) => {
      setActivePolyIndex(prev.length);
      return [...prev, []];
    });
    setPanMode(false);
  }

  function removeActiveLawnArea() {
    if (lawnPolygons.length <= 1) {
      setLawnPolygons([[]]);
      setActivePolyIndex(0);
      return;
    }
    setLawnPolygons((prev) => prev.filter((_, i) => i !== activePolyIndex));
    setActivePolyIndex((i) => Math.max(0, i - 1));
  }

  /** In modifica zona: solo il layer attivo (irrigatori OR ombra OR …), mai sovrapposti. */
  const zonesOnMap = useMemo(() => {
    if (!isZoneEdit) return zones;
    return zones.filter((z) => z.tipo === zoneToolProp);
  }, [isZoneEdit, zones, zoneToolProp]);

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
        setPanMode(false);
        resolve(true);
      });
    });
  }

  function handleGeocodeAddress(e) {
    e?.preventDefault?.();
    runGeocode(address);
  }

  function geocodeLatLng(lat, lng) {
    return new Promise((resolve) => {
      if (!window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        resolve(status === "OK" && results?.[0] ? results[0] : null);
      });
    });
  }

  function centerMapOnLatLng(lat, lng, zoom = 19) {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter({ lat, lng });
    map.setZoom(zoom);
    if (!isZoneEdit) setPanMode(false);
  }

  function handleGeolocate() {
    if (!mapRef.current || geoBusy || geocodeBusy) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setAddressHint("Geolocalizzazione non disponibile su questo dispositivo.");
      return;
    }

    setGeoBusy(true);
    setAddressHint(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!mapRef.current) {
          setGeoBusy(false);
          return;
        }

        centerMapOnLatLng(lat, lng);
        const result = await geocodeLatLng(lat, lng);
        if (result) {
          lastGeocodeRef.current = result;
          const label = localityFromGeocodeResult(result);
          setAddressHint(label ? `Posizione GPS: ${label}` : "Centrato sulla tua posizione.");
        } else {
          setAddressHint("Centrato sulla tua posizione.");
        }
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        const msgs = {
          1: "Permesso posizione negato. Abilita il GPS nelle impostazioni del browser o del telefono.",
          2: "Posizione non disponibile. Verifica che il GPS sia attivo.",
          3: "Timeout GPS. Riprova all'aperto o vicino a una finestra.",
        };
        setAddressHint(msgs[err?.code] || "Impossibile ottenere la posizione.");
      },
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 45000 },
    );
  }

  function resetDraft() {
    setDraftPath([]);
    setPendenzaFrom(null);
    setIrrigatorPick(null);
    setEsposizionePick(null);
  }

  function addZone(zone) {
    setZones((prev) => [...prev, zone]);
    resetDraft();
  }

  function removeZone(id) {
    setZones((prev) => prev.filter((z) => z.id !== id));
  }

  function handleMapClick(lat, lng) {
    const { inZones: iz, panMode: pan, zoneTool: tool, pendenzaFrom: pFrom } = drawStateRef.current;

    if (iz) {
      if (tool === "pan") return;
      if (tool === "irrigatore") {
        setPickLinea(lastLinea);
        setIrrigatorPick({ lat, lng });
        return;
      }
      if (tool === "esposizione") {
        setDraftTipo(tool);
        setDraftPath((prev) => [...prev, { lat, lng }]);
        return;
      }
      if (tool === "pendenza") {
        if (!pFrom) {
          setPendenzaFrom({ lat, lng });
        } else {
          addZone({
            id: `z_${Date.now()}`,
            tipo: "pendenza",
            from: pFrom,
            to: { lat, lng },
          });
        }
        return;
      }
      return;
    }

    if (!pan) {
      setVertices((prev) => [...prev, { lat, lng }]);
    }
  }

  useEffect(() => {
    drawStateRef.current = {
      inZones,
      panMode,
      zoneTool: isZoneEdit ? zoneToolProp : zoneTool,
      pendenzaFrom,
    };
  }, [inZones, panMode, zoneTool, pendenzaFrom, isZoneEdit, zoneToolProp]);

  function confirmIrrigator(modalita) {
    if (!irrigatorPick) return;
    const linea = Math.min(Math.max(1, pickLinea), LINEA_CENTRALINA_MAX);
    addZone({
      id: `z_${Date.now()}`,
      tipo: "irrigatore",
      lat: irrigatorPick.lat,
      lng: irrigatorPick.lng,
      modalita,
      linea,
    });
    setLastLinea(linea);
    setIrrigatorPick(null);
  }

  function updateIrrigatorLinea(zoneId, linea) {
    const n = Math.min(Math.max(1, Math.round(Number(linea))), LINEA_CENTRALINA_MAX);
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId && z.tipo === "irrigatore" ? { ...z, linea: n } : z)),
    );
    setLastLinea(n);
  }

  function closeDraftPolygon() {
    if (draftPath.length < 3) return;
    if (draftTipo === "esposizione") {
      setEsposizionePick({ path: [...draftPath] });
      setDraftPath([]);
      return;
    }
    addZone({
      id: `z_${Date.now()}`,
      tipo: draftTipo,
      path: [...draftPath],
    });
    setDraftPath([]);
  }

  function confirmEsposizione(livello) {
    if (!esposizionePick?.path?.length) return;
    addZone({
      id: `z_${Date.now()}`,
      tipo: "esposizione",
      livello: normalizeEsposizioneLivello(livello),
      path: esposizionePick.path,
    });
    setEsposizionePick(null);
  }

  function updateEsposizioneLivello(zoneId, livello) {
    const L = normalizeEsposizioneLivello(livello);
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId && z.tipo === "esposizione" ? { ...z, livello: L } : z)),
    );
  }

  useEffect(() => {
    if (!open) return;
    const normalized = normalizePratoZone(initialPratoZone);
    const polys = getLawnPolygons(normalized);
    if (isZoneEdit) {
      setLawnPolygons(polys.length ? polys : [[]]);
      setActivePolyIndex(0);
      setZones(normalized.zone.filter((z) => z.tipo === zoneToolProp));
      setMapStep("zones");
      setZoneTool(zoneToolProp);
      setPanMode(false);
    } else {
      setLawnPolygons(polys.length ? polys : [[]]);
      setActivePolyIndex(0);
      setZones([]);
      setMapStep("boundary");
      setPanMode(false);
      setZoneTool("pan");
    }
    resetDraft();
    setLoadError(null);
    setAddress(initialLocalita?.trim() || "");
    setAddressHint(null);
    setGeocodeBusy(false);
    setApplyBusy(false);
    setMapTick(0);
    lastGeocodeRef.current = null;
  }, [open, initialLocalita, initialPratoZone, isZoneEdit, zoneToolProp]);

  useEffect(() => {
    if (!open || !apiKey?.trim() || !mapElRef.current) return undefined;

    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMapsOnce(apiKey.trim());
        if (cancelled || !mapElRef.current) return;

        const map = new window.google.maps.Map(mapElRef.current, {
          center: { lat: 41.9028, lng: 12.4964 },
          zoom: 19,
          mapTypeId: "satellite",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "greedy",
          scrollwheel: true,
        });
        mapRef.current = map;

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
      polyRefs.current.forEach((p) => p?.setMap(null));
      polyRefs.current = [];
      mapRef.current = null;
    };
  }, [open, apiKey]);

  useEffect(() => {
    if (!open || !mapReady || !initialLocalita?.trim() || isZoneEdit) return;
    runGeocode(initialLocalita, { fitMap: true });
  }, [open, mapReady, initialLocalita, isZoneEdit]);

  useEffect(() => {
    if (!open || !mapReady || !isZoneEdit || !validPolygons.length) return;
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => fitMapToAllPolygons(map, lawnPolygons), 120);
    return () => window.clearTimeout(t);
  }, [open, mapReady, isZoneEdit, zoneToolProp, lawnPolygons, validPolygons.length]);

  useEffect(() => {
    if (!open || inZones || !mapRef.current) return;
    const map = mapRef.current;
    polyRefs.current.forEach((p) => p?.setMap(null));
    polyRefs.current = lawnPolygons.map((ring, idx) => {
      if (ring.length < 2) return null;
      const active = idx === activePolyIndex;
      return new window.google.maps.Polygon({
        paths: ring,
        strokeColor: active ? "#1a3d2e" : "#4caf50",
        strokeOpacity: active ? 0.95 : 0.75,
        strokeWeight: active ? 3 : 2,
        fillColor: active ? "#1a3d2e" : "#4caf50",
        fillOpacity: active ? 0.14 : 0.08,
        map,
        geodesic: true,
        clickable: false,
        zIndex: active ? 2 : 1,
      });
    }).filter(Boolean);
  }, [lawnPolygons, activePolyIndex, open, mapTick, inZones]);

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
      esposizionePick?.path?.length
        ? { path: esposizionePick.path, tipo: "esposizione", livello: "mezzombra" }
        : draftPath.length > 0
          ? { path: draftPath, tipo: draftTipo }
          : pendenzaFrom
            ? { from: pendenzaFrom, to: null }
            : null;

    if (inZones) {
      renderZoneOverlays(map, zoneOverlayRefs.current, zonesOnMap, draft);
    } else {
      zoneOverlayRefs.current.markers.forEach((m) => m.setMap(null));
      zoneOverlayRefs.current.polygons.forEach((p) => p.setMap(null));
      zoneOverlayRefs.current.polylines.forEach((l) => l.setMap(null));
      zoneOverlayRefs.current = { markers: [], polygons: [], polylines: [] };
    }
  }, [zonesOnMap, draftPath, draftTipo, pendenzaFrom, esposizionePick, open, mapTick, mapReady, inZones]);

  useEffect(() => {
    if (!open || !mapRef.current || !mapTick) return undefined;
    const map = mapRef.current;

    const drawMode = inZones ? zoneTool !== "pan" : !panMode;
    map.setOptions({
      draggable: isZoneEdit || panMode,
      scrollwheel: true,
      gestureHandling: "greedy",
      disableDoubleClickZoom: false,
      zoomControl: true,
    });

    if (clickListenerRef.current) {
      window.google.maps.event.removeListener(clickListenerRef.current);
    }
    clickListenerRef.current = map.addListener("click", (e) => {
      if (!e?.latLng) return;
      handleMapClick(e.latLng.lat(), e.latLng.lng());
    });

    return () => {
      if (clickListenerRef.current) {
        window.google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [panMode, zoneTool, inZones, open, mapTick]);

  async function handleApply() {
    if (!validPolygons.length || areaSqm <= 0) return;
    setApplyBusy(true);

    let localita;
    let superficie_mq;
    let prato_zone;
    const poligoni = validPolygons.map((ring) => ring.map((p) => ({ lat: p.lat, lng: p.lng })));

    if (isZoneEdit) {
      const replaceTypes =
        zoneToolProp === "esposizione" ? ["esposizione", "ombra"] : [zoneToolProp];
      prato_zone = mergePratoZoneUpdate(initialPratoZone, {
        poligoni,
        zones,
        replaceTypes,
      });
    } else {
      prato_zone = mergePratoZoneUpdate(initialPratoZone, { poligoni });
      localita = lastGeocodeRef.current ? localityFromGeocodeResult(lastGeocodeRef.current) : "";
      if (!localita) {
        const center = polygonCentroid(poligoni.flat());
        if (center) localita = await reverseLocality(center.lat, center.lng);
      }
      superficie_mq = Math.round(areaSqm);
    }

    const ombra_zone_pct = computeOmbraZonePct(prato_zone);

    onApply({
      localita: localita || undefined,
      superficie_mq,
      prato_zone,
      ombra_zone_pct: ombra_zone_pct || undefined,
    });
    setApplyBusy(false);
    onClose();
  }

  if (!open) return null;

  const missingKey = !apiKey?.trim();
  const canBoundary = validPolygons.length > 0 && areaSqm > 0;
  const previewLocalita = lastGeocodeRef.current ? localityFromGeocodeResult(lastGeocodeRef.current) : "";
  const irrCount = zones.filter((z) => z.tipo === "irrigatore").length;

  return (
    <div
      className="map-modal-backdrop"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`map-modal map-modal--wide${isZoneEdit ? " map-modal--zone-edit" : ""}${isZoneEdit && zoneToolProp === "irrigatore" ? " map-modal--irrigatore" : ""}`}
        role="dialog"
        aria-labelledby="map-modal-title"
      >
        <div className="map-modal-header">
          <h2 id="map-modal-title" className="map-modal-title">
            {isZoneEdit
              ? `Segna: ${ZONE_TYPES[zoneToolProp]?.label || zoneToolProp}`
              : inZones
                ? "Segna zone sul prato"
                : "Luogo e superficie"}
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

        <div className="map-modal-body">
        {!missingKey && !loadError && isZoneEdit && (
          <p className="map-modal-hint">
            {zoneToolProp === "irrigatore"
              ? "Tocca la mappa per ogni irrigatore, poi scegli il tipo (statico, rotator o oscillante)."
              : zoneToolProp === "pendenza"
                ? "Due tap: inizio e fine della freccia (verso dove scende l'acqua)."
                : zoneToolProp === "esposizione"
                  ? "Disegna un'area (vertici), chiudi il poligono, poi indica se è sole, mezz'ombra o ombra."
                  : "Tocca i vertici dell'area, poi «Chiudi area»."}{" "}
            <strong>Solo {ZONE_TYPES[zoneToolProp]?.label?.toLowerCase()}</strong> su questa mappa (gli altri
            li segni con i pulsanti separati in Dashboard). Rotella/pinch per zoom, trascina per spostare.
          </p>
        )}

        {!missingKey && !loadError && !isZoneEdit && !inZones && (
          <p className="map-modal-hint">
            Cerca l&apos;indirizzo o usa <strong>GPS</strong>, poi <strong>Disegna prato</strong> e tocca la mappa (almeno
            3 punti). Zone e irrigatori si segnano in Dashboard.
          </p>
        )}
        {!missingKey && !loadError && !isZoneEdit && !inZones && panMode && (
          <p className="map-modal-mode-warn">Modalità mano: sposta la mappa. Per disegnare, scegli «Disegna prato».</p>
        )}
        {!missingKey && !loadError && !isZoneEdit && !inZones && !panMode && (
          <p className="map-modal-mode-ok">Modalità disegno attiva: ogni tap aggiunge un vertice del prato.</p>
        )}

        {!missingKey && !loadError && !isZoneEdit && !inZones && (
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
              disabled={!mapReady || geocodeBusy || geoBusy}
              autoComplete="street-address"
            />
            <button
              type="button"
              className="map-modal-geo-btn"
              onClick={handleGeolocate}
              disabled={!mapReady || geocodeBusy || geoBusy}
              aria-label="Usa la mia posizione GPS"
              title="La mia posizione"
            >
              {geoBusy ? (
                <span className="map-modal-geo-btn__busy">…</span>
              ) : (
                <svg className="map-modal-geo-btn__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <circle cx="12" cy="12" r="3.5" fill="currentColor" />
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    d="M12 2v4M12 18v4M2 12h4M18 12h4"
                  />
                </svg>
              )}
            </button>
            <button type="submit" className="map-modal-search-btn" disabled={!mapReady || geocodeBusy || geoBusy}>
              {geocodeBusy ? "…" : "Cerca"}
            </button>
          </form>
        )}
        {addressHint && !missingKey && <div className="map-modal-address-hint">{addressHint}</div>}
        {previewLocalita && !missingKey && !isZoneEdit && !inZones && (
          <p className="map-modal-place-preview">
            Luogo: <strong>{previewLocalita}</strong>
          </p>
        )}

        {!isZoneEdit && !inZones ? (
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
              Azzera area {activePolyIndex + 1}
            </button>
            {lawnPolygons.length > 1 ? (
              <button type="button" className="btn-outline-sm" onClick={removeActiveLawnArea}>
                Rimuovi area {activePolyIndex + 1}
              </button>
            ) : null}
            <button type="button" className="btn-outline-sm map-modal-add-area" onClick={addAnotherLawnArea}>
              + Aggiungi un&apos;altra area di prato (es. retro casa)
            </button>
            {lawnPolygons.length > 1 ? (
              <div className="map-poly-tabs" role="tablist" aria-label="Aree di prato">
                {lawnPolygons.map((ring, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === activePolyIndex}
                    className={`map-poly-tabs__btn${i === activePolyIndex ? " map-poly-tabs__btn--on" : ""}`}
                    onClick={() => setActivePolyIndex(i)}
                  >
                    Area {i + 1}
                    {ring.length >= 3 ? ` (${Math.round(calculatePolygonAreaSqm(ring))} m²)` : ""}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : inZones ? (
          <div className="map-zone-toolbar">
            {!isZoneEdit ? (
              ["pan", "irrigatore", "esposizione", "pendenza"].map((tool) => (
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
              ))
            ) : (
              <>
                <span className="map-zone-tool map-zone-tool--on">{ZONE_TYPES[zoneToolProp]?.label}</span>
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={handleGeolocate}
                  disabled={!mapReady || geoBusy}
                  title="La mia posizione GPS"
                >
                  {geoBusy ? "GPS…" : "GPS"}
                </button>
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => fitMapToAllPolygons(mapRef.current, lawnPolygons)}
                >
                  Centra sul prato
                </button>
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => {
                    setZones([]);
                    resetDraft();
                  }}
                >
                  Azzera {ZONE_TYPES[zoneToolProp]?.label?.toLowerCase()}
                </button>
              </>
            )}
            {(draftPath.length > 0 || pendenzaFrom) && (
              <button type="button" className="btn-outline-sm" onClick={resetDraft}>
                Annulla disegno
              </button>
            )}
            {draftPath.length >= 3 && !esposizionePick && (
              <button type="button" className="btn-outline-sm map-zone-tool-confirm" onClick={closeDraftPolygon}>
                {draftTipo === "esposizione" ? "Chiudi area e scegli esposizione" : `Chiudi area ${ZONE_TYPES[draftTipo]?.label}`}
              </button>
            )}
          </div>
        ) : null}

        {zones.length > 0 && inZones && isZoneEdit && !irrigatorPick && !esposizionePick && (
          <ul className="map-zone-list">
            {zones.map((z) => (
              <li key={z.id} className="map-zone-list__row">
                <span
                  className="map-zone-list__dot"
                  style={{
                    background:
                      z.tipo === "esposizione"
                        ? ESPOSIZIONE_LIVELLI[z.livello]?.color
                        : ZONE_TYPES[z.tipo]?.color,
                  }}
                />
                {z.tipo === "irrigatore" ? (
                  <>
                    <span className="map-zone-list__label">
                      Linea {z.linea ?? 1} · {IRRIGATOR_MODES[z.modalita]?.label || z.modalita}
                    </span>
                    <label className="map-zone-list__linea">
                      <select
                        value={z.linea ?? 1}
                        onChange={(e) => updateIrrigatorLinea(z.id, e.target.value)}
                        aria-label={`Linea centralina per ${IRRIGATOR_MODES[z.modalita]?.label}`}
                      >
                        {Array.from({ length: LINEA_CENTRALINA_MAX }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : z.tipo === "esposizione" ? (
                  <>
                    <span className="map-zone-list__label">
                      {ESPOSIZIONE_LIVELLI[z.livello]?.label || z.livello}
                    </span>
                    <label className="map-zone-list__linea">
                      <select
                        value={z.livello ?? "mezzombra"}
                        onChange={(e) => updateEsposizioneLivello(z.id, e.target.value)}
                        aria-label="Livello esposizione"
                      >
                        {Object.entries(ESPOSIZIONE_LIVELLI).map(([k, info]) => (
                          <option key={k} value={k}>
                            {info.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  ZONE_TYPES[z.tipo]?.label
                )}
                <button type="button" className="map-zone-list__del" onClick={() => removeZone(z.id)} aria-label="Rimuovi">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>

        <div className="map-modal-map-wrap">
          <div ref={mapElRef} className="map-modal-map" />

          {irrigatorPick ? (
            <div className="map-irrigator-pick map-irrigator-pick--sheet" role="dialog" aria-label="Irrigatore in mappa">
              <p className="map-irrigator-pick__heading">Uscita centralina (linea)</p>
              <p className="map-irrigator-pick__hint">
                Puoi avere più linee tutte statiche: scegli l’uscita della centralina (1, 2, …), non il tipo di getto.
              </p>
              <div className="map-irrigator-pick__linee" role="group" aria-label="Numero linea">
                {Array.from({ length: LINEA_CENTRALINA_MAX }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`map-irrigator-pick__line-btn${pickLinea === n ? " map-irrigator-pick__line-btn--on" : ""}`}
                    onClick={() => setPickLinea(n)}
                    aria-pressed={pickLinea === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="map-irrigator-pick__heading">Tipo irrigatore</p>
              <div className="map-irrigator-pick__actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => confirmIrrigator("statico")}>
                  {IRRIGATOR_MODES.statico.label}
                  <span className="map-irrigator-pick__sub">{IRRIGATOR_MODES.statico.desc}</span>
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => confirmIrrigator("rotator")}>
                  {IRRIGATOR_MODES.rotator.label}
                  <span className="map-irrigator-pick__sub">{IRRIGATOR_MODES.rotator.desc}</span>
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
          ) : null}

          {esposizionePick ? (
            <div className="map-irrigator-pick map-irrigator-pick--sheet" role="dialog" aria-label="Esposizione area">
              <p className="map-irrigator-pick__heading">Che esposizione ha quest&apos;area?</p>
              <p className="map-irrigator-pick__hint">
                Puoi disegnare più aree: una sotto l&apos;albero (ombra), una al sole, ecc.
              </p>
              <div className="map-irrigator-pick__actions">
                {(["sole", "mezzombra", "ombra"]).map((liv) => {
                  const info = ESPOSIZIONE_LIVELLI[liv];
                  return (
                    <button
                      key={liv}
                      type="button"
                      className={`btn btn-sm${liv === "mezzombra" ? " btn-primary" : " btn-outline"}`}
                      onClick={() => confirmEsposizione(liv)}
                    >
                      <span
                        className="map-esposizione-swatch"
                        style={{ background: info.fill, borderColor: info.color }}
                        aria-hidden
                      />
                      {info.label}
                    </button>
                  );
                })}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEsposizionePick(null)}>
                  Annulla
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="map-modal-footer map-modal-footer--sticky">
          <div className="map-modal-area">
            {!validPolygons.length ? (
              <span className="map-area-muted">Area: — (almeno 3 punti per area)</span>
            ) : (
              <span>
                Area totale: <strong>{formatMqInput(areaSqm)} m²</strong>
                {validPolygons.length > 1 ? (
                  <>
                    {" "}
                    · <strong>{validPolygons.length}</strong> aree
                  </>
                ) : null}
                {!inZones && lawnPolygons.length > 1 ? (
                  <>
                    {" "}
                    · stai disegnando <strong>area {activePolyIndex + 1}</strong>
                  </>
                ) : null}
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
            <button type="button" className="btn-outline-sm" onClick={onClose}>
              Annulla
            </button>
            {!isZoneEdit && !inZones && canBoundary && null}
            <button
              type="button"
              className="map-modal-apply"
              disabled={!canBoundary || applyBusy}
              onClick={handleApply}
            >
              {applyBusy
                ? "…"
                : isZoneEdit
                  ? `Salva ${ZONE_TYPES[zoneToolProp]?.label?.toLowerCase() || "zone"}`
                  : "Salva luogo e m²"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
