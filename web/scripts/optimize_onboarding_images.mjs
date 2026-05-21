#!/usr/bin/env node
/**
 * Comprime PNG onboarding → WebP (sfondo max 1280px, opzioni max 512px).
 * Uso: cd web && npm run optimize:onboarding
 */
import { readdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "../public/onboarding");

const BG_MAX = 1280;
const OPT_MAX = 512;
const WEBP_QUALITY = 78;

async function optimizeFile(filePath, name) {
  const isBg = name.startsWith("bg-") || name.startsWith("grass-");
  const maxWidth = isBg ? BG_MAX : OPT_MAX;
  const outPath = filePath.replace(/\.png$/i, ".webp");

  const pipeline = sharp(filePath).rotate().resize({
    width: maxWidth,
    withoutEnlargement: true,
  });

  const webp = await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toFile(outPath);
  const before = (await stat(filePath)).size;
  const after = webp.size;
  const pct = Math.round((1 - after / before) * 100);
  console.log(`  ${name} → ${name.replace(".png", ".webp")}  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (-${pct}%)`);
  return { before, after };
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".png"));
  if (!files.length) {
    console.log("Nessun PNG in public/onboarding");
    return;
  }
  console.log(`Ottimizzazione ${files.length} immagini…\n`);
  let totalBefore = 0;
  let totalAfter = 0;
  for (const name of files.sort()) {
    const p = join(DIR, name);
    const { before, after } = await optimizeFile(p, name);
    totalBefore += before;
    totalAfter += after;
  }
  console.log(
    `\nTotale: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024 / 1024).toFixed(1)}MB`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
