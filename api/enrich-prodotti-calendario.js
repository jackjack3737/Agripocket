import { loadServerEnv } from "../web/server/serverEnv.mjs";
import { enrichProdottiCalendarioHandler } from "../web/server/enrichProdottiInterventi.mjs";

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
    const env = loadServerEnv();
    const result = await enrichProdottiCalendarioHandler(auth, env);
    res.status(200).json({
      ok: true,
      messaggio:
        result.updated > 0
          ? `Collegati prodotti commerciali a ${result.updated} lavori in calendario.`
          : "Nessun nuovo collegamento prodotto (giÃ  presenti o nessun match idoneo).",
      ...result,
    });
  } catch (e) {
    console.error("[enrich-prodotti]", e);
    res.status(500).json({ error: e.message || "Errore collegamento prodotti" });
  }
}
