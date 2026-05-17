import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, "crawler", ".env");
if (!fs.existsSync(envPath)) {
  console.error("MISSING_ENV");
  process.exit(1);
}

const vars = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim();
}

const { SUPABASE_URL, SUPABASE_KEY } = vars;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("INCOMPLETE_ENV");
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/prato_profilo?select=localita&limit=1`, {
  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
});
const body = await res.text();
if (!res.ok) {
  console.error("API_ERROR", res.status, body.slice(0, 200));
  process.exit(1);
}
if (body.includes("localita")) {
  console.log("localita_ok");
  process.exit(0);
}
console.error("NO_LOCALITA_COLUMN");
process.exit(1);
