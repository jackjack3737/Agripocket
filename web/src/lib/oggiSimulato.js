const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Alias comodi (?simula=6giugno → 6 giugno dell'anno in corso). */
const SIMULA_ALIAS = {
  "6giugno": (y) => `${y}-06-06`,
  "6-giugno": (y) => `${y}-06-06`,
  "6giu": (y) => `${y}-06-06`,
};

function annoRiferimento() {
  return new Date().getFullYear();
}

/**
 * Data «oggi» per UI calendario: URL ?oggi=YYYY-MM-DD o ?simula=6giugno, poi VITE_OGGI_SIMULATA.
 * @returns {{ iso: string, simulato: boolean, fonte: string|null }}
 */
export function risolviOggi(search = "") {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);

  const daUrl = params.get("oggi")?.trim();
  if (daUrl && ISO_RE.test(daUrl)) {
    return { iso: daUrl, simulato: true, fonte: "url" };
  }

  const alias = params.get("simula")?.trim().toLowerCase();
  if (alias && SIMULA_ALIAS[alias]) {
    const iso = SIMULA_ALIAS[alias](annoRiferimento());
    return { iso, simulato: true, fonte: "simula" };
  }

  const env = import.meta.env.VITE_OGGI_SIMULATA?.trim();
  if (env && ISO_RE.test(env)) {
    return { iso: env, simulato: true, fonte: "env" };
  }

  return {
    iso: new Date().toISOString().slice(0, 10),
    simulato: false,
    fonte: null,
  };
}

export function getOggiIso(search = "") {
  return risolviOggi(search).iso;
}

export function formatOggiIt(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
