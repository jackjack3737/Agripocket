/** Laboratori e istruzioni prelievo suolo (client). */

const LABORATORI = [
  {
    match: [/busto\s*arsizio/i, /21052/, /varese/i, /busto/i],
    labs: [
      { nome: "L T srl", nota: "Analisi agronomiche suolo — contattare per campionamento prato" },
      { nome: "TomaLab", nota: "Laboratorio analisi terreno e acqua" },
      { nome: "Cerba Healthcare Varese/Busto", nota: "Network diagnostico, campioni suolo su richiesta" },
    ],
  },
  {
    match: [/milano/i, /monza/i, /brianza/i],
    labs: [
      { nome: "Agrolab Milano", nota: "Analisi NPK, pH, CIC suolo" },
      { nome: "Cerba Healthcare Lombardia", nota: "Punti prelievo in provincia" },
    ],
  },
];

export function getIstruzioniPrelievoSuolo() {
  return [
    "Preleva 6–8 carote di terra (10–15 cm) in punti diversi della zona (schema a W).",
    "Mescola in un secchio pulito fino a ~500 g di campione composito.",
    "Etichetta data e zona; consegna al lab entro 24–48 ore.",
    "Richiedi pH, sostanza organica, P, K e microelementi se clorosi diffuse.",
  ];
}

export function getLaboratoriSuolo(localita = "") {
  const probe = String(localita).toLowerCase();
  for (const area of LABORATORI) {
    if (area.match.some((rx) => rx.test(probe))) {
      return area.labs;
    }
  }
  return [
    {
      nome: "Laboratorio agronomico di zona",
      nota: "Cerca «analisi suolo prato» + il tuo comune.",
    },
  ];
}
