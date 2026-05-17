/** Accetta "120", "120,5", "1.234,5" (migliaia IT) o "1234.5" */
export function parseMqInput(value) {
  if (value == null || value === "") return null;
  let s = String(value).trim().replace(/\s/g, "");
  if (!s) return null;

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

export function formatMqInput(n) {
  if (n == null || !Number.isFinite(n)) return "";
  const rounded = Math.round(n * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return s.replace(".", ",");
}
