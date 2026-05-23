import { IRRIGATOR_MODES, ZONE_TYPES } from "./pratoZone";

/**
 * @param {google.maps.Map} map
 * @param {{ markers: google.maps.Marker[], polygons: google.maps.Polygon[], polylines: google.maps.Polyline[] }} refs
 * @param {object[]} zones
 * @param {{ path?: {lat,lng}[], from?: {lat,lng} } | null} draft
 */
export function renderZoneOverlays(map, refs, zones, draft = null) {
  if (!map || !window.google?.maps) return;

  refs.markers.forEach((m) => m.setMap(null));
  refs.polygons.forEach((p) => p.setMap(null));
  refs.polylines.forEach((l) => l.setMap(null));
  refs.markers = [];
  refs.polygons = [];
  refs.polylines = [];

  for (const z of zones) {
    const style = ZONE_TYPES[z.tipo];
    if (z.tipo === "irrigatore") {
      const mode = IRRIGATOR_MODES[z.modalita] || IRRIGATOR_MODES.statico;
      const m = new window.google.maps.Marker({
        position: { lat: z.lat, lng: z.lng },
        map,
        title: `Irrigatore ${mode.label}`,
        label: {
          text: z.linea ? `${z.linea}${mode.short}` : mode.short,
          color: "#fff",
          fontWeight: "700",
          fontSize: z.linea ? "10px" : "11px",
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: style.color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      refs.markers.push(m);
    } else if (z.tipo === "ombra" || z.tipo === "muschio") {
      const poly = new window.google.maps.Polygon({
        paths: z.path,
        map,
        strokeColor: style.color,
        strokeWeight: 2,
        fillColor: style.fill,
        fillOpacity: z.tipo === "ombra" ? 0.35 : 0.45,
        clickable: false,
      });
      refs.polygons.push(poly);
    } else if (z.tipo === "pendenza") {
      const line = new window.google.maps.Polyline({
        path: [z.from, z.to],
        map,
        strokeColor: style.color,
        strokeWeight: 4,
        clickable: false,
        icons: [
          {
            icon: {
              path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 4,
              strokeColor: style.color,
              fillColor: style.color,
              fillOpacity: 1,
            },
            offset: "100%",
          },
        ],
      });
      refs.polylines.push(line);
    }
  }

  if (draft?.path?.length) {
    const tipo = draft.tipo || "ombra";
    const style = ZONE_TYPES[tipo];
    const poly = new window.google.maps.Polygon({
      paths: draft.path,
      map,
      strokeColor: style.color,
      strokeWeight: 2,
      strokeOpacity: 0.8,
      fillColor: style.fill,
      fillOpacity: 0.2,
      clickable: false,
    });
    refs.polygons.push(poly);
    draft.path.forEach((p, i) => {
      const m = new window.google.maps.Marker({
        position: p,
        map,
        label: String(i + 1),
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: style.color,
          fillOpacity: 0.9,
          strokeWeight: 1,
          strokeColor: "#fff",
        },
      });
      refs.markers.push(m);
    });
  }

  if (draft?.from && draft?.to) {
    const style = ZONE_TYPES.pendenza;
    const line = new window.google.maps.Polyline({
      path: [draft.from, draft.to],
      map,
      strokeColor: style.color,
      strokeOpacity: 0.7,
      strokeWeight: 3,
      clickable: false,
      icons: [
        {
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 3.5,
            strokeColor: style.color,
            fillColor: style.color,
            fillOpacity: 1,
          },
          offset: "100%",
        },
      ],
    });
    refs.polylines.push(line);
  } else if (draft?.from && !draft?.to) {
    const m = new window.google.maps.Marker({
      position: draft.from,
      map,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: ZONE_TYPES.pendenza.color,
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
    });
    refs.markers.push(m);
  }
}
