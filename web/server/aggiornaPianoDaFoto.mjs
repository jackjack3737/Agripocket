import {
  arricchisciInterventoConProdotto,
  catalogoCompattoPerPrompt,
  consenteTutteMarche,
  loadProdotti,
  mqPrato,
} from "./prodottiCatalogo.mjs";

function oggiIso() {
  return new Date().toISOString().slice(0, 10);
}

function giorniDaOggi(iso) {
  const a = new Date(oggiIso() + "T12:00:00");
  const b = new Date(iso + "T12:00:00");
  return Math.round((b - a) / 86400000);
}

function rowFromIntervento(userId, analisiId, i, fonte) {
  return {
    user_id: userId,
    analisi_id: analisiId,
    titolo: i.titolo,
    descrizione: i.descrizione || null,
    priorita: i.priorita,
    categoria: i.categoria,
    stato: "pianificato",
    data_prevista: i.data_prevista,
    ordine: i.ordine ?? 0,
    fonte,
    prodotto_id: i.prodotto_id ?? null,
    prodotto_nome: i.prodotto_nome ?? null,
    dose_totale: i.dose_totale ?? null,
    dose_unita: i.dose_unita ?? null,
    dose_per_mq: i.dose_per_mq ?? null,
  };
}

/**
 * Chiede a Gemini come integrare la foto nel piano stagionale esistente.
 */
export async function pianificaAggiornamentiDaFoto({
  profilo,
  vision,
  report,
  calendarioEsistente,
  interventiUrgenti,
  prodotti,
  geminiGenerate,
  geminiKey,
}) {
  const mq = mqPrato(profilo);
  const prompt = `Sei un agronomo. Dalla analisi foto del prato, proponi modifiche al CALENDARIO STAGIONALE (non solo urgenze).

Superficie prato: ${mq} m² (usa per coerenza dosi, non ricalcolare qui).

Visione foto:
${JSON.stringify(vision, null, 2).slice(0, 2500)}

Report (estratto):
${String(report).slice(0, 3500)}

Interventi urgenti già creati (non duplicare):
${JSON.stringify(interventiUrgenti.map((i) => ({ titolo: i.titolo, data: i.data_prevista, cat: i.categoria })), null, 2)}

Calendario stagionale attuale (${calendarioEsistente.length} voci, prossimi 12 mesi):
${JSON.stringify(
  calendarioEsistente.slice(0, 60).map((i) => ({
    id: i.id,
    titolo: i.titolo,
    data: i.data_prevista,
    cat: i.categoria,
    priorita: i.priorita,
  })),
  null,
  2,
)}

Catalogo prodotti (id per prodotto_suggerito_id se serve trattamento/concime/diserbo):
${catalogoCompattoPerPrompt(prodotti, 60)}

Rispondi SOLO JSON:
{
  "aggiungi_calendario": [
    {
      "titolo": "max 80 char",
      "descrizione": "cosa fare",
      "priorita": "alta|media|bassa",
      "categoria": "taglio|irrigazione|concime|trattamento|diserbo|arieggiatura|biostimolante|umettante|rinnovo|altro",
      "data_prevista": "YYYY-MM-DD",
      "prodotto_suggerito_id": null
    }
  ],
  "modifica_calendario": [
    { "id": "uuid", "titolo": null, "descrizione": null, "data_prevista": null, "priorita": null, "nota": "perché" }
  ],
  "annulla_ids": []
}

Regole:
- 0-5 aggiunte al calendario stagionale se la foto mostra problemi non coperti (es. fungicida, diserbo mirato).
- Date da oggi in avanti, distribuite logicamente (non tutte lo stesso giorno).
- annulla_ids solo se un lavoro pianificato è chiaramente inutile o dannoso dopo la foto (raro, max 2).
- modifica per anticipare/posticipare trattamenti in base a gravità visiva.
- Prodotto: preferisci marca BOTTOS per concimi, biostimolanti, sementi, bagnanti.
- Per fungicidi, diserbanti e insetticidi puoi usare qualsiasi marca del catalogo (id in elenco).`;

  const raw = await geminiGenerate(geminiKey, [{ text: prompt }], {
    json: true,
    maxTokens: 4096,
    temperature: 0.25,
  });

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { aggiungi_calendario: [], modifica_calendario: [], annulla_ids: [] };
  }
}

export async function integraFotoNelPiano({
  admin,
  userId,
  analisiId,
  profilo,
  vision,
  report,
  interventiUrgenti,
  geminiGenerate,
  geminiKey,
}) {
  const { data: calendario } = await admin
    .from("prato_interventi")
    .select("*")
    .eq("user_id", userId)
    .eq("fonte", "calendario_stagionale")
    .eq("stato", "pianificato")
    .gte("data_prevista", oggiIso())
    .order("data_prevista");

  const prodotti = await loadProdotti(admin);
  const piano = await pianificaAggiornamentiDaFoto({
    profilo,
    vision,
    report,
    calendarioEsistente: calendario ?? [],
    interventiUrgenti,
    prodotti,
    geminiGenerate,
    geminiKey,
  });

  const inseriti = [];
  const aggiornati = [];
  let annullati = 0;

  for (const id of piano.annulla_ids || []) {
    const { error } = await admin
      .from("prato_interventi")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .eq("fonte", "calendario_stagionale")
      .eq("stato", "pianificato");
    if (!error) annullati += 1;
  }

  for (const mod of piano.modifica_calendario || []) {
    if (!mod?.id) continue;
    const patch = {};
    if (mod.titolo) patch.titolo = String(mod.titolo).slice(0, 120);
    if (mod.descrizione) patch.descrizione = String(mod.descrizione).slice(0, 900);
    if (mod.data_prevista) patch.data_prevista = mod.data_prevista;
    if (mod.priorita) patch.priorita = mod.priorita;
    if (mod.nota) {
      const { data: cur } = await admin.from("prato_interventi").select("descrizione").eq("id", mod.id).single();
      patch.descrizione = [cur?.descrizione, `Aggiornato da foto: ${mod.nota}`].filter(Boolean).join(" ").slice(0, 900);
    }
    if (!Object.keys(patch).length) continue;
    const { data, error } = await admin
      .from("prato_interventi")
      .update(patch)
      .eq("id", mod.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (!error && data) aggiornati.push(data);
  }

  let ordineBase = (calendario?.length ?? 0) + 100;
  for (const raw of piano.aggiungi_calendario || []) {
    if (!raw?.titolo?.trim() || !raw?.data_prevista) continue;
    if (giorniDaOggi(raw.data_prevista) < 0) continue;

    let item = {
      titolo: String(raw.titolo).trim().slice(0, 120),
      descrizione: String(raw.descrizione || "").trim(),
      priorita: raw.priorita || "media",
      categoria: raw.categoria || "trattamento",
      data_prevista: raw.data_prevista,
      ordine: ordineBase++,
    };

    if (raw.prodotto_suggerito_id) {
      let p = prodotti.find((x) => x.id === Number(raw.prodotto_suggerito_id));
      if (p && !consenteTutteMarche(p) && String(p.marca || "").toUpperCase() !== "BOTTOS") {
        p = null;
      }
      if (p) item = arricchisciInterventoConProdotto(item, profilo, [p], vision);
      else item = arricchisciInterventoConProdotto(item, profilo, prodotti, vision);
    } else {
      item = arricchisciInterventoConProdotto(item, profilo, prodotti, vision);
    }

    const { data, error } = await admin
      .from("prato_interventi")
      .insert(rowFromIntervento(userId, analisiId, item, "calendario_stagionale"))
      .select("*")
      .single();

    if (!error && data) inseriti.push(data);
    else if (error) console.warn("[piano-foto] insert:", error.message);
  }

  return {
    inseritiCalendario: inseriti.length,
    aggiornatiCalendario: aggiornati.length,
    annullatiCalendario: annullati,
    inseriti,
    aggiornati,
  };
}
