/**
 * Finestra pre-emergenza per annualità estive (setaria, digitaria).
 * Usa proxy su temperature aria (Open-Meteo): in pianura padana la finestra
 * può cadere in maggio–giugno, non solo febbraio–marzo.
 */

function isZonaPadana(location = "", admin1 = "") {
  const blob = `${location} ${admin1}`.toLowerCase();
  return /lombard|venet|emilia|piemont|friuli|padana|pianura|verona|bologna|milano|torino|padova|modena|parma|mantova|cremona|rovigo|bergamo|brescia|ferrara|ravenna|reggio|piacenza|udine|treviso|vicenza|trentino alto adige|trento/i.test(
    blob,
  );
}

function streakGiorniMin(rows, soglia) {
  let streak = 0;
  let max = 0;
  for (const r of rows) {
    if (r.tMin != null && r.tMin >= soglia) {
      streak += 1;
      max = Math.max(max, streak);
    } else streak = 0;
  }
  return max;
}

/**
 * @param {import('./weatherCore.mjs').fetchWeatherBundle extends (...args: any) => Promise<infer B> ? B : never} bundle
 */
export function valutaPreEmergenzaAnnuali(bundle) {
  if (!bundle?.history?.rows?.length) {
    return {
      finestraAperta: false,
      urgenza: null,
      padanaLikely: isZonaPadana(bundle?.location, bundle?.geo?.admin1),
      motivo: "Storico temperature non disponibile per valutare la pre-emergenza.",
      testoPrompt: "",
    };
  }

  const recent7 = bundle.history.rows.slice(-7);
  const mins = recent7.map((r) => r.tMin).filter((t) => t != null);
  const maxs = recent7.map((r) => r.tMax).filter((t) => t != null);
  const avgMin7 = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : 0;
  const avgMax7 = maxs.length ? maxs.reduce((a, b) => a + b, 0) / maxs.length : 0;
  const streak12 = streakGiorniMin(recent7, 12);
  const streak14 = streakGiorniMin(bundle.history.rows, 12);

  const current = bundle.current?.main?.temp ?? null;
  const month = new Date().getMonth() + 1;
  const padanaLikely = isZonaPadana(bundle.location, bundle.geo?.admin1);

  // Apr–giu: annualità estive; in padana mag–giu è frequente con minime in risalita
  const inStagione = month >= 4 && month <= 6;
  const termicaBase = avgMin7 >= 11 && streak12 >= 3;
  const termicaForte = avgMin7 >= 13 || streak14 >= 5 || (current != null && current >= 18 && avgMin7 >= 10);
  const padanaBoost = padanaLikely && month >= 5 && avgMin7 >= 10 && streak12 >= 2;

  const finestraAperta = inStagione && (termicaForte || termicaBase || padanaBoost);

  let urgenza = "media";
  if (finestraAperta && (termicaForte || (padanaBoost && month >= 5))) urgenza = "alta";

  const motivo = finestraAperta
    ? `Finestra pre-emergenza setaria/digitaria: min media ultimi 7 gg ${avgMin7.toFixed(1)}°C, max media ${avgMax7.toFixed(1)}°C, ${streak12} giorni consecutivi con min≥12°C${padanaLikely ? " (zona compatibile con pianura padana)" : ""}.`
    : `Pre-emergenza setaria/digitaria non prioritaria ora: min media 7 gg ${avgMin7.toFixed(1)}°C (servono minime stabili ≥12°C per più giorni, tipicamente apr–giu).`;

  const testoPrompt = [
    "## Pre-emergenza annuali estive (setaria, digitaria)",
    motivo,
    finestraAperta
      ? "AZIONE RICHIESTA: inserisci almeno 1 intervento categoria diserbo entro 7-14 giorni da oggi, titolo esplicito (es. «Pre-emergenza setaria e digitaria»), priorita alta, descrizione che cita finestra termica e che l'applicazione va fatta PRIMA della germinazione visibile delle infestanti estive."
      : "Se nel periodo apr-giu le minime salgono, ripianifica pre-emergenza; non usare solo il mese sul calendario.",
    "In pianura padana (Emilia, Lombardia, Veneto) la pre-emergenza su setaria/digitaria può essere corretta anche a maggio, non solo a febbraio-marzo.",
    "Dopo la germinazione visibile passare a diserbo post-emergenza selettivo (categoria diserbo, titolo diverso).",
  ].join("\n");

  return {
    finestraAperta,
    urgenza,
    padanaLikely,
    avgMin7: +avgMin7.toFixed(1),
    avgMax7: +avgMax7.toFixed(1),
    streak12,
    currentTemp: current,
    motivo,
    testoPrompt,
  };
}

export function ensurePreEmergenzaAnnuali(interventi, valutazione, oggi, addDays) {
  if (!valutazione?.finestraAperta) return interventi;

  const testo = (i) => `${i.titolo} ${i.descrizione}`.toLowerCase();
  const has = interventi.some(
    (i) =>
      i.categoria === "diserbo" &&
      (/setaria|digitaria|panico|annualit/.test(testo(i)) &&
        /pre.?emerg|antigermin|pre emergenza/.test(testo(i))),
  );
  if (has) return interventi;

  const data = addDays(oggi, 7);
  return [
    ...interventi,
    {
      titolo: "Pre-emergenza setaria e digitaria",
      descrizione: `${valutazione.motivo} Antigerminale pre-emergenza per annualità estive: applicare prima della germinazione visibile, con terreno umido e senza pioggia intensa nelle 24h successive. Verificare etichetta e normativa PAN.`,
      priorita: valutazione.urgenza === "alta" ? "alta" : "media",
      categoria: "diserbo",
      data_prevista: data,
      ordine: 9000,
    },
  ].sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || a.ordine - b.ordine);
}
