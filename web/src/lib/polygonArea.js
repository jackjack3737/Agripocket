/** Raggio terrestre (m), allineato a Ground / preventivo. */
const EARTH_RADIUS_M = 6371000;

/**
 * Area poligono in m² da vertici { lat, lng } (WGS84).
 * @param {{ lat: number, lng: number }[]} points
 */
export function calculatePolygonAreaSqm(points) {
  if (!points || points.length < 3) return 0;
  const r = EARTH_RADIUS_M;
  const lat0 = (points[0].lat * Math.PI) / 180;
  const lon0 = (points[0].lng * Math.PI) / 180;
  const projected = points.map((p) => {
    const lat = (p.lat * Math.PI) / 180;
    const lon = (p.lng * Math.PI) / 180;
    const x = (lon - lon0) * Math.cos(lat0) * r;
    const y = (lat - lat0) * r;
    return { x, y };
  });
  let sum = 0;
  for (let i = 0; i < projected.length; i++) {
    const j = (i + 1) % projected.length;
    sum += projected[i].x * projected[j].y - projected[j].x * projected[i].y;
  }
  return Math.abs(sum) * 0.5;
}
