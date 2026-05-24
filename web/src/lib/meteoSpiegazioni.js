/**
 * Testi didattici per chip meteo (stile tooltip radar: cosa / perché / in pratica).
 */

export function buildMeteoMetriche(bundle) {
  if (!bundle) return [];
  const { agronomic: ag, history, advice } = bundle;
  const out = [];

  if (ag?.et0_mm_oggi != null || ag?.et0_mm_media_7g != null) {
    const oggi = ag.et0_mm_oggi;
    const media7 = ag.et0_mm_media_7g;
    out.push({
      id: "et0",
      label: "ET0",
      valore: oggi != null ? `${oggi} mm/g` : "—",
      titolo: "Evapotraspirazione (ET0)",
      cosa:
        "Stima di quanta acqua il prato perde ogni giorno per evaporazione e traspirazione (modello FAO da temperatura, umidità e vento). Si esprime in millimetri al giorno.",
      perche: [
        oggi != null ? `Oggi il fabbisogno idrico stimato è circa ${oggi} mm.` : null,
        media7 != null ? `Media ultimi 7 giorni: ${media7} mm/g.` : null,
        "Se ET0 è alto e non piove, il terreno si asciuga più in fretta: rischio stress idrico.",
        "Confronta ET0 con le irrigazioni e la pioggia degli ultimi giorni.",
      ].filter(Boolean),
      pratica: [
        "Oltre ~4–5 mm/g senza pioggia: valuta irrigazione profonda al mattino presto.",
        "Dopo taglio o concimazione: ET0 alto aumenta il fabbisogno — non irrigare di notte se fa freddo.",
        "In ondata di caldo (>30 °C): preferisci irrigazioni brevi e frequenti solo se il terreno è sabbioso.",
      ],
    });
  }

  if (ag?.gdd) {
    const { oggi, cumul_30g, cumul_stagione, base_temp } = ag.gdd;
    out.push({
      id: "gdd",
      label: "GDD",
      valore: oggi != null ? `${oggi} oggi` : cumul_30g != null ? `${cumul_30g} /30g` : "—",
      titolo: "Gradi giorno (GDD)",
      cosa: `Somma del calore utile per la crescita del tappeto (media giornaliera delle temperature meno ${base_temp ?? 10} °C, solo valori positivi).`,
      perche: [
        oggi != null ? `Oggi: ${oggi} GDD (attività di crescita).` : null,
        cumul_30g != null ? `Ultimi 30 giorni: ${cumul_30g} GDD cumulati.` : null,
        cumul_stagione != null ? `Stagione in corso: ${cumul_stagione} GDD.` : null,
        "Serve a capire se il prato è in fase di ripresa, crescita attiva o rallentamento.",
      ].filter(Boolean),
      pratica: [
        "GDD bassi (<5/giorno): crescita lenta — evita concimi azotati pesanti.",
        "GDD alti e umido: rischio malattie fogliari — aerazione e taglio con lame affilate.",
        "Per concimazioni: in primavera utile incrociare GDD con taglio e umidità del suolo.",
      ],
    });
  }

  if (ag?.soil_temperature_10cm_c != null) {
    const prof = ag.soil_depth_cm ?? 6;
    out.push({
      id: "suolo",
      label: "Suolo",
      valore: `${ag.soil_temperature_10cm_c}°C`,
      titolo: `Temperatura suolo (~${prof} cm)`,
      cosa: `Temperatura stimata nel terreno a circa ${prof} cm di profondità (dati orari Open-Meteo). Influenza radici, germinazione e attività microbica.`,
      perche: [
        `Valore attuale: ${ag.soil_temperature_10cm_c} °C.`,
        "Suolo freddo (<10 °C): radici poco attive, assorbimento nutrienti ridotto.",
        "Suolo caldo (>22 °C in estate): stress radicale se combinato con siccità.",
      ],
      pratica: [
        "Prima di concimare o diserbare: suolo troppo freddo = effetto limitato.",
        "In primavera, GDD e T suolo insieme indicano quando il prato «si sveglia».",
        "Con terreno argilloso e T suolo alta: irriga meno ma più a fondo.",
      ],
    });
  }

  if (history) {
    out.push({
      id: "storico",
      label: "Storico",
      valore: `${history.days} gg`,
      titolo: `Ultimi ${history.days} giorni`,
      cosa: "Riepilogo delle temperature e degli eventi meteo recenti nella tua zona (min/max, gelate, calde, pioggia).",
      perche: [
        `Escursione termica: ${history.minAbs?.toFixed(0)}–${history.maxAbs?.toFixed(0)} °C.`,
        history.frostDays > 0 ? `${history.frostDays} giorni con gelo (rischio danni fogliari).` : "Nessun giorno con gelo nel periodo.",
        history.hotDays > 0
          ? `${history.hotDays} giorni oltre 30 °C (stress termico).`
          : "Nessuna giornata oltre 30 °C nel periodo.",
        history.rainyDays > 0
          ? `${history.rainyDays} giorni con pioggia significativa.`
          : "Poca pioggia nel periodo: controlla irrigazione.",
      ],
      pratica: [
        "Dopo gelate: non tagliare subito; attendi ripresa e valuta danni.",
        "Dopo ondate di caldo: irrigazione al mattino, evita concimi in stress.",
        "Pioggia abbondante + caldo: rischio funghi — migliora aereazione.",
      ],
    });
  }

  if (advice?.status) {
    out.push({
      id: "consiglio",
      label: "Consiglio",
      valore: advice.status,
      titolo: `Consiglio del giorno: ${advice.status}`,
      cosa: "Sintesi automatica in base a temperatura, umidità, pioggia recente e fabbisogno idrico (ET0).",
      perche: [advice.advice].filter(Boolean),
      pratica: [
        "Usa questo come promemoria: incrocia sempre con quello che vedi sul prato (colore, impronte, feltro).",
        "Se il consiglio e la foto non coincidono, priorità alla diagnosi visiva dall'ultima foto del prato.",
      ],
    });
  }

  return out;
}
