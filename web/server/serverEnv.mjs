import { loadCrawlerEnv } from "./loadEnv.mjs";

/** Env per API server (Vercel) o dev (crawler/.env via loadCrawlerEnv). */
export function loadServerEnv() {
  const fromProcess = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
  };

  if (fromProcess.GEMINI_API_KEY && fromProcess.SUPABASE_URL && fromProcess.SUPABASE_SERVICE_ROLE_KEY) {
    return fromProcess;
  }
  return loadCrawlerEnv();
}
