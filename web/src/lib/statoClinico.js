/**
 * FASE 5 — Semaforo stato clinico (Verde / Giallo / Rosso).
 */

const MSG = {
  verde: "Sano",
  giallo: "Allerta meteo",
  rosso: "Patologia",
  grigio: "Da analizzare",
};

export function calcolaStatoClinico({ vision, weather, agronomic } = {}) {
  const ag = agronomic || weather?.agronomic;
  const malattie = vision?.malattie_sospette || [];
  const problemi = vision?.problemi_rilevati || [];
  const stato = String(vision?.stato_generale || "").toLowerCase();

  const patologiaAlta =
    stato === "critico" ||
    malattie.some((m) => String(typeof m === "object" ? m?.gravita : "").toLowerCase() === "alta") ||
    problemi.some((p) => String(p?.gravita || "").toLowerCase() === "alta") ||
    String(vision?.patologia_confermata?.confidenza || "").toLowerCase() === "alta";

  if (patologiaAlta) {
    return {
      livello: "rosso",
      label: MSG.rosso,
      motivo: "Patologia o stress grave rilevati nell'ultima analisi foto.",
    };
  }

  const et0 = ag?.et0_mm_oggi ?? ag?.et0_mm_media_7g;
  const gdd30 = ag?.gdd?.cumul_30g;
  const tSuolo = ag?.soil_temperature_10cm_c;
  const tAria = weather?.current?.main?.temp;

  const stressTermico =
    (et0 != null && et0 >= 5.5) ||
    (gdd30 != null && gdd30 >= 280) ||
    (tSuolo != null && tSuolo >= 28) ||
    (tAria != null && tAria >= 32);

  if (stressTermico && vision) {
    return {
      livello: "giallo",
      label: MSG.giallo,
      motivo:
        et0 >= 5.5
          ? `Evapotraspirazione elevata (ET0 ${et0} mm/g): monitorare irrigazione.`
          : gdd30 >= 280
            ? `GDD cumulati 30 gg alti (${gdd30}): crescita rapida, possibile stress idrico.`
            : "Condizioni termiche stressanti per il tappeto.",
    };
  }

  if (!vision) {
    return {
      livello: "grigio",
      label: MSG.grigio,
      motivo: "Carica una foto del prato per lo stato clinico.",
    };
  }

  if (stato === "discreto" && malattie.length) {
    return {
      livello: "giallo",
      label: MSG.giallo,
      motivo: "Segni da monitorare: patologie sospette con gravità media.",
    };
  }

  return {
    livello: "verde",
    label: MSG.verde,
    motivo: "Nessuna patologia grave; parametri nella norma.",
  };
}
