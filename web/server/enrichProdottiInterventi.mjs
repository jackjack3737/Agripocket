/**
 * Arricchisce interventi utente già in DB con prodotti_mercato (senza rigenerare tutto il piano).
 */

import { createClient } from "@supabase/supabase-js";
import { loadProdotti } from "./prodottiCatalogo.mjs";
import {
  loadIndiceProdottiPerIntervento,
  loadProdottiMercatoRows,
} from "./prodottiMercato.mjs";
import { arricchisciInterventoEsigenze } from "./esigenzeAgronomiche.mjs";
import { arricchisciInterventoTrattamento } from "./trattamentoPipeline.mjs";
import { macroIntervento } from "./link_prodotti_calendario.mjs";

const TRATTAMENTO_CATS = new Set([
  "concime",
  "biostimolante",
  "umettante",
  "trattamento",
  "diserbo",
  "rinnovo",
]);

function parseDettaglio(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function haProdottiConsigliati(intervento) {
  const det = parseDettaglio(intervento.dettaglio_trattamento);
  return (det?.prodotti_consigliati?.length ?? 0) > 0;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} userId
 * @param {object} profilo
 */
export async function enrichProdottiInterventiUtente(admin, userId, profilo) {
  const { data: rows, error } = await admin
    .from("prato_interventi")
    .select("*")
    .eq("user_id", userId)
    .eq("stato", "pianificato")
    .order("data_prevista", { ascending: true });

  if (error) throw new Error(error.message);

  const candidati = (rows || []).filter((i) => {
    const cat = String(i.categoria || "").toLowerCase();
    return TRATTAMENTO_CATS.has(cat) && !haProdottiConsigliati(i);
  });

  if (!candidati.length) {
    return { scanned: rows?.length ?? 0, updated: 0, skipped: rows?.length ?? 0 };
  }

  const [prodotti, indice, mercatoRows] = await Promise.all([
    loadProdotti(admin),
    loadIndiceProdottiPerIntervento(admin),
    loadProdottiMercatoRows(admin),
  ]);

  let updated = 0;
  const errors = [];

  for (const row of candidati) {
    try {
      const base = arricchisciInterventoEsigenze({
        ...row,
        macro_categoria: row.macro_categoria || macroIntervento(row),
        esigenze_molecolari:
          row.esigenze_molecolari?.length > 0
            ? row.esigenze_molecolari
            : undefined,
      });
      const enriched = await arricchisciInterventoTrattamento(base, profilo, prodotti, null, null, {
        indiceProdottiIntervento: indice,
        mercatoRows,
      });
      const det = parseDettaglio(enriched.dettaglio_trattamento);
      if (!det?.prodotti_consigliati?.length) continue;

      const patch = {
        dettaglio_trattamento: enriched.dettaglio_trattamento,
        macro_categoria: enriched.macro_categoria ?? row.macro_categoria,
        spiegazione_semplice: enriched.spiegazione_semplice ?? row.spiegazione_semplice,
        messaggio_ux: enriched.messaggio_ux ?? row.messaggio_ux,
      };

      const { error: upErr } = await admin.from("prato_interventi").update(patch).eq("id", row.id);
      if (upErr) {
        if (/dettaglio_trattamento/.test(upErr.message || "")) {
          const { error: retry } = await admin
            .from("prato_interventi")
            .update({ messaggio_ux: patch.messaggio_ux })
            .eq("id", row.id);
          if (!retry) updated += 1;
        } else {
          errors.push(`${row.id}: ${upErr.message}`);
        }
      } else {
        updated += 1;
      }
    } catch (e) {
      errors.push(`${row.id}: ${e.message}`);
    }
  }

  return {
    scanned: rows?.length ?? 0,
    candidati: candidati.length,
    updated,
    errors: errors.slice(0, 5),
    catalogo_mercato: mercatoRows.length,
  };
}

export async function enrichProdottiCalendarioHandler(authHeader, env) {
  const supabaseUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user) throw new Error("Sessione non valida");

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: profilo } = await admin
    .from("prato_profilo")
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profilo) throw new Error("Profilo non trovato");

  return enrichProdottiInterventiUtente(admin, userData.user.id, profilo);
}
