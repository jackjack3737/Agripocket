/**
 * FASE 4 — Laboratori analisi suolo e istruzioni prelievo.
 */

import { parseLocalitaQuery } from "./weatherCore.mjs";

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
  {
    match: [/torino/i, /piemonte/i],
    labs: [
      { nome: "Agroinnova / laboratori partner Piemonte", nota: "Verifica disponibilità campioni tappeto erboso" },
    ],
  },
  {
    match: [/bologna/i, /emilia/i, /modena/i],
    labs: [
      { nome: "Laboratorio analisi suolo Emilia-Romagna", nota: "Chiedere pacchetto prato / tappeto erboso" },
    ],
  },
  {
    match: [/roma/i, /lazio/i],
    labs: [
      { nome: "Laboratori CREA / partner Lazio", nota: "Analisi chimico-fisiche suolo" },
    ],
  },
];

const ISTRUZIONI_PRELIEVO = [
  "Preleva **6–8 carote** di terra (profondità radici prato: **10–15 cm**) in punti diversi della zona (schema a W o a zig-zag).",
  "Mescola le carote in un secchio pulito, elimina radici e detriti grossolani, ottieni **un campione composito di ~500 g**.",
  "Etichetta: data, indirizzo/zona, profondità. Invia al laboratorio entro **24–48 ore** (frigo se necessario).",
  "Chiedi al lab: **pH**, **sostanza organica**, **P₂O₅**, **K₂O**, **calcare**, eventualmente **CEC** e **microelementi** (Fe, Mn) se clorosi diffuse.",
];

export function getIstruzioniPrelievoSuolo() {
  return ISTRUZIONI_PRELIEVO;
}

export function getLaboratoriSuolo(localita) {
  const parsed = parseLocalitaQuery(localita || "");
  const probe = [
    localita || "",
    parsed.kind === "city" || parsed.kind === "city_cap" ? parsed.city : "",
    parsed.kind === "city_cap" || parsed.kind === "cap" ? parsed.cap : "",
  ]
    .filter(Boolean)
    .join(" ");

  for (const area of LABORATORI) {
    if (area.match.some((rx) => rx.test(probe))) {
      return { area: "consigliati", labs: area.labs };
    }
  }

  return {
    area: "generico",
    labs: [
      {
        nome: "Laboratorio agronomico di zona",
        nota: "Cerca «analisi suolo prato» + il tuo comune; porta il campione composito.",
      },
    ],
  };
}

export function testoAlertAnalisiSuolo(localita) {
  const { labs } = getLaboratoriSuolo(localita);
  const labList = labs.map((l) => `• **${l.nome}** — ${l.nota}`).join("\n");
  const istruzioni = ISTRUZIONI_PRELIEVO.map((s) => `- ${s}`).join("\n");
  return { labs, labListMarkdown: labList, istruzioni };
}
