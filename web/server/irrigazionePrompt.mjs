/** Serializza irrigazione_oggi (motore) per prompt chat agronomo. */

export function parseIrrigazioneOggi(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

export function domandaSuIrrigazioneCalcolata(domanda) {
  return /irrig|acqua|minut|centralina|et0|pioggia|serbatoio|cycle|ammollo|linea\s*\d|fabbisogno|deficit|aumenta|diminuisci|speg/i.test(
    String(domanda || ""),
  );
}

export function domandaRichiedeSpiegazione(domanda) {
  return /perch[eéè]|come mai|spieg|motivo|ragion|significa|pochi min|poco acqua|così poco|solo \d/i.test(
    String(domanda || ""),
  );
}

export function formatIrrigazioneOggiForPrompt(raw) {
  const io = parseIrrigazioneOggi(raw);
  if (!io) return null;

  const lines = [];
  if (io.data || io.calcolato_il) {
    lines.push(`Snapshot: ${io.data || io.calcolato_il?.slice(0, 10) || "oggi"}`);
  }
  if (io.azione_irrigazione) lines.push(`Azione centralina: ${io.azione_irrigazione}`);
  if (io.messaggio_ux) lines.push(`Sintesi UX: ${io.messaggio_ux}`);

  const dt = io.dati_tecnici;
  if (dt) {
    lines.push("Bilancio idrico (motore deterministico):");
    if (dt.et0_mm != null) lines.push(`- ET0 oggi: ${dt.et0_mm} mm`);
    if (dt.precipitazioni_mm != null) lines.push(`- Pioggia conteggiata: ${dt.precipitazioni_mm} mm`);
    if (dt.kc != null) lines.push(`- Kc applicato: ${dt.kc}${dt.kc_stagionale ? " (tabella stagionale)" : ""}`);
    if (dt.fabbisogno_calcolato_mm != null) lines.push(`- Fabbisogno netto oggi: ${dt.fabbisogno_calcolato_mm} mm`);
    if (dt.minuti_totali_consigliati != null) lines.push(`- Minuti totali impianto: ${dt.minuti_totali_consigliati}`);
    if (dt.capacita_campo_mm != null) lines.push(`- Capacità di campo stimata: ${dt.capacita_campo_mm} mm`);
    if (dt.modificatore_ombra != null) lines.push(`- Modificatore ombra mappa: ${dt.modificatore_ombra}`);
    if (dt.pendenza_effettiva) lines.push(`- Pendenza usata nel calcolo: ${dt.pendenza_effettiva}`);
    if (dt.saturazione_suolo) lines.push(`- Saturazione suolo: ${dt.saturazione_suolo}`);
    const cm = dt.contesto_mappa;
    if (cm) {
      lines.push(
        `- Mappa irrigazione: ombra pesata ${cm.pct_ombra_prato ?? "?"}%, ${cm.num_teste_in_ombra ?? 0} teste in ombra, ${cm.num_teste_vicino_pendenza ?? 0} vicino pendenza, ${cm.num_pendenza ?? 0} frecce pendenza`,
      );
    }
  }

  const bs = io.bilancio_serbatoio;
  if (bs) {
    lines.push(
      `Serbatoio suolo: ${bs.livello_serbatoio_pct ?? "?"}% · mancano ${bs.mm_mancanti_oggi ?? "?"} mm oggi · fabbisogno ${bs.fabbisogno_oggi_mm ?? "?"} mm`,
    );
    if (bs.riepilogo) lines.push(`Stato serbatoio: ${bs.riepilogo}`);
  }

  const dc = io.dati_centralina;
  if (dc) {
    lines.push(
      `Centralina: ${dc.cicli_consigliati ?? 0} cicli × ${dc.minuti_per_ciclo ?? 0} min` +
        (dc.pausa_tra_cicli_min ? `, pausa ${dc.pausa_tra_cicli_min} min` : "") +
        ` · tempo base utente ${dc.tempo_base_minuti ?? "?"} min`,
    );
  }

  const pz = io.programma_zone;
  const zoneList = Array.isArray(pz) ? pz : pz?.zone;
  if (zoneList?.length) {
    lines.push("Programma per linea (da mappa irrigatori):");
    for (const z of zoneList.slice(0, 10)) {
      const stato = z.attiva_oggi === false ? "OFF" : `${z.minuti_totali_linea ?? z.minuti_totali_zona ?? 0} min`;
      lines.push(`- ${z.etichetta || `Linea ${z.zona_numero}`}: ${stato}${z.cicli > 1 ? ` (${z.cicli}×${z.minuti_per_ciclo} min)` : ""}`);
      if (z.nota) lines.push(`  Nota: ${z.nota}`);
      else if (z.impostazione) lines.push(`  ${z.impostazione}`);
    }
  }

  if (io.schema_settimanale?.frequenza?.label) {
    lines.push(`Frequenza settimanale: ${io.schema_settimanale.frequenza.label}`);
  }

  return lines.join("\n");
}
