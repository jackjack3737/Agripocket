/** Percorsi immagini onboarding — preferisce WebP generato da optimize:onboarding */

export function onboardingImg(fileName) {
  const base = String(fileName).replace(/\.(png|webp|jpe?g)$/i, "");
  return `/onboarding/${base}.webp`;
}

/** Precarica un'immagine di sfondo (evita flash al cambio step). */
export function preloadOnboardingImage(url) {
  if (!url || typeof window === "undefined") return;
  const key = url;
  if (preloadOnboardingImage._done?.has(key)) return;
  if (!preloadOnboardingImage._done) preloadOnboardingImage._done = new Set();
  preloadOnboardingImage._done.add(key);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}
