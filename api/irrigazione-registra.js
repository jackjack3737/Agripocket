import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "../web/server/serverEnv.mjs";
import { fetchWeatherBundle } from "../web/server/weatherCore.mjs";
import { calcolaIrrigazioneGiornalieraAsync } from "../web/server/motoreIrrigazione.mjs";
import { lawnCentroid } from "../web/server/pratoZone.mjs";
import {
  applicaLogUtenteSuRisultato,
  costruisciLogIrrigazione,
  estraiLogIrrigazioneOggi,
  lineeConsigliateDaProgramma,
  oggiIso,
} from "../web/server/irrigazioneUtente.mjs";
import { normalizzaInputIrrigazione } from "../web/server/irrigazioneInput.mjs";

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
    const supabaseUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) {
      res.status(401).json({ error: "Sessione non valida" });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: profilo } = await admin
      .from("prato_profilo")
      .select("*")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!profilo?.localita?.trim()) {
      res.status(400).json({ error: "Imposta la localitÃ  nel profilo." });
      return;
    }

    const oggi = oggiIso();
    let ioEsistente = profilo.irrigazione_oggi;
    if (typeof ioEsistente === "string") {
      try {
        ioEsistente = JSON.parse(ioEsistente);
      } catch {
        ioEsistente = null;
      }
    }

    if (body.annulla === true) {
      const merged = { ...(ioEsistente || {}), data: oggi };
      delete merged.irrigazione_utente;
      await admin
        .from("prato_profilo")
        .update({
          irrigazione_oggi: merged,
          irrigazione_oggi_aggiornato: new Date().toISOString(),
        })
        .eq("user_id", userData.user.id);

      return res.status(200).json({ ok: true, annullato: true });
    }

    let pratoZone = profilo.prato_zone;
    if (typeof pratoZone === "string") {
      try {
        pratoZone = JSON.parse(pratoZone);
      } catch {
        pratoZone = null;
      }
    }
    const c = lawnCentroid(pratoZone);
    const weatherBundle = await fetchWeatherBundle(profilo.localita, null, {
      lat: c?.lat,
      lon: c?.lng,
    });

    let risultato =
      ioEsistente?.azione_irrigazione && ioEsistente?.data === oggi
        ? { ...ioEsistente, data_consiglio: oggi }
        : await calcolaIrrigazioneGiornalieraAsync(profilo, weatherBundle, { admin });

    const input = normalizzaInputIrrigazione(profilo);
    const statoSuolo = risultato.bilancio_serbatoio?.stato_suolo_mm ?? risultato.schema_settimanale?.bilancio_serbatoio?.stato_suolo_mm;

    let linee = Array.isArray(body.linee) ? body.linee : [];
    if (body.usa_consigliati === true || linee.length === 0) {
      linee = lineeConsigliateDaProgramma(risultato.programma_zone);
    }
    if (!linee.length) {
      const min = risultato.dati_tecnici?.minuti_totali_consigliati ?? risultato.dati_centralina?.minuti_per_ciclo;
      if (min > 0) {
        linee = [{ zona_numero: 1, minuti: min }];
      }
    }
    if (!linee.length) {
      return res.status(400).json({ error: "Nessun minuto da registrare. Inserisci i minuti per linea o aggiorna il calcolo." });
    }

    const log = costruisciLogIrrigazione({
      linee,
      programma_zone: risultato.programma_zone,
      input: { ...input, stato_suolo_mm_oggi: statoSuolo },
    });

    risultato = applicaLogUtenteSuRisultato(risultato, log);

    const payload = {
      ...risultato,
      data: oggi,
      irrigazione_utente: log,
      calcolato_il: ioEsistente?.calcolato_il || new Date().toISOString(),
    };

    await admin
      .from("prato_profilo")
      .update({
        irrigazione_oggi: payload,
        irrigazione_oggi_aggiornato: new Date().toISOString(),
      })
      .eq("user_id", userData.user.id);

    res.status(200).json({
      ok: true,
      ...payload,
      messaggio_ux_append: risultato.messaggio_ux_append,
    });
  } catch (e) {
    console.error("[irrigazione-registra]", e);
    res.status(500).json({ error: e.message || String(e) });
  }
}
