import { analizzaPrato } from "../server/analizzaPratoCore.mjs";
import { loadServerEnv } from "../server/serverEnv.mjs";

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const auth = req.headers.authorization || "";
  if (!auth) {
    res.status(401).json({ error: "Non autenticato" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const result = await analizzaPrato({
      imageBase64: body?.imageBase64,
      mimeType: body?.mimeType || "image/jpeg",
      authHeader: auth,
      env: loadServerEnv(),
    });
    res.status(200).json(result);
  } catch (e) {
    console.error("[analizza-prato]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
