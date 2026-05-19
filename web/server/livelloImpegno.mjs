/** Densità calendario per livello impegno utente. */

export const LIVELLI_IMPEGNO = {
  base: {
    label: "Base",
    maxInterventi: 20,
    maxCatalogo: 4,
    liquidiMensili: false,
  },
  pro: {
    label: "Pro",
    maxInterventi: 35,
    maxCatalogo: 10,
    liquidiMensili: true,
  },
  greenkeeper: {
    label: "Greenkeeper",
    maxInterventi: 50,
    maxCatalogo: 18,
    liquidiMensili: true,
  },
};

export function normalizzaLivelloImpegno(raw) {
  const v = String(raw || "base").toLowerCase();
  return LIVELLI_IMPEGNO[v] ? v : "base";
}

export function configLivelloImpegno(profilo) {
  return LIVELLI_IMPEGNO[normalizzaLivelloImpegno(profilo?.livello_impegno)];
}

export function testoLivelloPerPrompt(profilo) {
  const cfg = configLivelloImpegno(profilo);
  return `Livello impegno: ${cfg.label} (max ${cfg.maxInterventi} interventi strategici/anno${
    cfg.liquidiMensili ? "; ammessi liquidi mensili" : "; NO liquidi mensili ripetuti"
  })`;
}
