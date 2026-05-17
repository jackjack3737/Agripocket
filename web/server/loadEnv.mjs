import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Carica crawler/.env per dev server (chiavi Gemini + Supabase). */
export function loadCrawlerEnv() {
  const envPath = path.resolve(__dirname, "../../crawler/.env");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const raw = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/\r$/, "");
  }
  return {
    GEMINI_API_KEY: out.API_KEY,
    SUPABASE_URL: out.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: out.SUPABASE_KEY,
    SUPABASE_ANON_KEY: out.SUPABASE_ANON_KEY,
    OPENWEATHER_API_KEY: out.OPENWEATHER_API_KEY || out.WEATHER_API_KEY,
  };
}
