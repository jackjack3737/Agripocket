import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, "crawler", ".env");
const vars = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim();
}

const { SUPABASE_URL, SUPABASE_KEY } = vars;
const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

for (const table of ["prato_analisi", "prato_interventi"]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers });
  const body = await res.text();
  if (!res.ok) {
    console.error(`MISSING_${table.toUpperCase()}`, res.status, body.slice(0, 120));
    process.exit(1);
  }
}
console.log("dashboard_ok");
