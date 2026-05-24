/**
 * Graminacee e infestanti da prato in Italia — nomi latini, raggruppati per tipologia.
 * Parametri termici: germinazione / crescita vs °C suolo (modello campana Solum).
 */

/** @typedef {'fredda'|'calda'} TipoStagione */
/** @typedef {'ovunque'|'nord_centro'|'sud'|'costa'} UsoItalia */
/** @typedef {'sole'|'nuvola'|'ombra'} EsposizioneLuce */
/** @typedef {'tappeto_c3'|'macroterma_c4'|'rustico'|'infestante_c3'|'infestante_c4'|'infestante_ciperacea'} TipologiaPrato */

/** Icone esposizione per specie da prato (semina / tappeto). */
export const ESPOSIZIONE_LUCE = {
  sole: { icon: "☀️", label: "Pieno sole" },
  nuvola: { icon: "⛅", label: "Mezz'ombra" },
  ombra: { icon: "☁️", label: "Ombra" },
};

export const TIPOLOGIE_PRATO = [
  { id: "tappeto_c3", label: "Prato tappeto (C3)", desc: "Graminacee da tappeto a stagione fresca" },
  { id: "macroterma_c4", label: "Prato macroterma (C4)", desc: "Graminacee da prato a stagione calda" },
  { id: "rustico", label: "Rustico / foraggero", desc: "Miscugli rustici e pascolo leggero" },
  { id: "infestante_c3", label: "Infestanti C3", desc: "Annualità e infestanti a stagione fresca" },
  { id: "infestante_c4", label: "Infestanti C4 estive", desc: "Digitaria, Setaria, Panico, Giavena…" },
  { id: "infestante_ciperacea", label: "Ciperacee", desc: "Cyperus e sedge da prato" },
];

/** @param {object} base */
function sp(base) {
  return {
    tipologia: "tappeto_c3",
    tipo: "fredda",
    uso_italia: "ovunque",
    esposizione: "nuvola",
    germMin: 8,
    germOptMin: 10,
    germOptMax: 18,
    germMax: 26,
    growMin: 6,
    growOptMin: 12,
    growOptMax: 20,
    growMax: 26,
    ...base,
  };
}

export const SPECIE_PRATO_ITALIA = [
  // ═══ Prato tappeto (C3) ═══════════════════════════════════════════════════
  sp({ id: "lolium_perenne", nome: "Lolium perenne", tipologia: "tappeto_c3", esposizione: "sole", germMin: 5, germOptMin: 8, germOptMax: 18, germMax: 26, growMin: 4, growOptMin: 12, growOptMax: 22, growMax: 28 }),
  sp({ id: "lolium_perenne_4n", nome: "Lolium perenne", citotipo: "4n", tipologia: "tappeto_c3", esposizione: "sole", germMin: 5, germOptMin: 8, germOptMax: 20, germMax: 28, growMin: 4, growOptMin: 12, growOptMax: 24, growMax: 30 }),
  sp({ id: "lolium_multiflorum", nome: "Lolium multiflorum", tipologia: "tappeto_c3", esposizione: "sole", germMin: 6, germOptMin: 8, germOptMax: 20, germMax: 28, growMin: 6, growOptMin: 10, growOptMax: 22, growMax: 28 }),
  sp({ id: "lolium_hybridum", nome: "Lolium hybridum", tipologia: "tappeto_c3", esposizione: "sole", germMin: 5, germOptMin: 8, germOptMax: 19, germMax: 27, growMin: 5, growOptMin: 11, growOptMax: 23, growMax: 29 }),
  sp({ id: "festuca_arundinacea", nome: "Festuca arundinacea", tipologia: "tappeto_c3", esposizione: "sole", germMin: 10, germOptMin: 12, germOptMax: 20, germMax: 28, growMin: 8, growOptMin: 15, growOptMax: 24, growMax: 30 }),
  sp({ id: "festuca_rubra", nome: "Festuca rubra", tipologia: "tappeto_c3", esposizione: "ombra", germMin: 8, germOptMin: 10, germOptMax: 18, germMax: 24, growMin: 6, growOptMin: 12, growOptMax: 20, growMax: 26 }),
  sp({ id: "festuca_rubra_commutata", nome: "Festuca rubra subsp. commutata", tipologia: "tappeto_c3", esposizione: "ombra", germMin: 8, germOptMin: 10, germOptMax: 18, germMax: 24, growMin: 6, growOptMin: 12, growOptMax: 20, growMax: 26 }),
  sp({ id: "festuca_rubra_trichophylla", nome: "Festuca rubra subsp. trichophylla", tipologia: "tappeto_c3", uso_italia: "nord_centro", esposizione: "ombra", germMin: 8, germOptMin: 10, germOptMax: 17, germMax: 23, growMin: 6, growOptMin: 11, growOptMax: 19, growMax: 25 }),
  sp({ id: "festuca_ovina", nome: "Festuca ovina", tipologia: "tappeto_c3", esposizione: "ombra", germMin: 8, germOptMin: 10, germOptMax: 17, germMax: 24, growMin: 5, growOptMin: 10, growOptMax: 18, growMax: 24 }),
  sp({ id: "festuca_trachyphylla", nome: "Festuca trachyphylla", tipologia: "tappeto_c3", uso_italia: "nord_centro", esposizione: "nuvola", germMin: 9, germOptMin: 11, germOptMax: 18, germMax: 25, growMin: 7, growOptMin: 12, growOptMax: 20, growMax: 26 }),
  sp({ id: "poa_pratensis", nome: "Poa pratensis", tipologia: "tappeto_c3", uso_italia: "nord_centro", esposizione: "nuvola", germMin: 10, germOptMin: 12, germOptMax: 20, germMax: 26, growMin: 8, growOptMin: 14, growOptMax: 22, growMax: 28 }),
  sp({ id: "poa_trivialis", nome: "Poa trivialis", tipologia: "tappeto_c3", esposizione: "ombra", germMin: 8, germOptMin: 10, germOptMax: 18, germMax: 22, growMin: 6, growOptMin: 11, growOptMax: 19, growMax: 24 }),
  sp({ id: "poa_supina", nome: "Poa supina", tipologia: "tappeto_c3", uso_italia: "nord_centro", esposizione: "ombra", germMin: 8, germOptMin: 10, germOptMax: 17, germMax: 22, growMin: 6, growOptMin: 10, growOptMax: 18, growMax: 24 }),
  sp({ id: "poa_angustifolia", nome: "Poa angustifolia", tipologia: "tappeto_c3", uso_italia: "nord_centro", esposizione: "nuvola", germMin: 10, germOptMin: 12, germOptMax: 19, germMax: 25, growMin: 8, growOptMin: 13, growOptMax: 21, growMax: 27 }),
  sp({ id: "agrostis_stolonifera", nome: "Agrostis stolonifera", tipologia: "tappeto_c3", uso_italia: "nord_centro", esposizione: "nuvola", germMin: 10, germOptMin: 14, germOptMax: 22, germMax: 26, growMin: 10, growOptMin: 16, growOptMax: 23, growMax: 27 }),
  sp({ id: "agrostis_capillaris", nome: "Agrostis capillaris", tipologia: "tappeto_c3", esposizione: "sole", germMin: 10, germOptMin: 12, germOptMax: 20, germMax: 26, growMin: 8, growOptMin: 14, growOptMax: 22, growMax: 28 }),

  // ═══ Macroterma (C4) ══════════════════════════════════════════════════════
  sp({ id: "cynodon_dactylon", nome: "Cynodon dactylon", tipologia: "macroterma_c4", tipo: "calda", uso_italia: "sud", esposizione: "sole", germMin: 18, germOptMin: 24, germOptMax: 32, germMax: 38, growMin: 15, growOptMin: 26, growOptMax: 34, growMax: 40 }),
  sp({ id: "zoysia_matrella", nome: "Zoysia matrella", tipologia: "macroterma_c4", tipo: "calda", uso_italia: "sud", esposizione: "sole", germMin: 18, germOptMin: 22, germOptMax: 30, germMax: 35, growMin: 12, growOptMin: 24, growOptMax: 32, growMax: 38 }),
  sp({ id: "zoysia_japonica", nome: "Zoysia japonica", tipologia: "macroterma_c4", tipo: "calda", uso_italia: "sud", esposizione: "nuvola", germMin: 18, germOptMin: 22, germOptMax: 30, germMax: 35, growMin: 12, growOptMin: 24, growOptMax: 32, growMax: 38 }),
  sp({ id: "paspalum_vaginatum", nome: "Paspalum vaginatum", tipologia: "macroterma_c4", tipo: "calda", uso_italia: "costa", esposizione: "sole", germMin: 20, germOptMin: 24, germOptMax: 32, germMax: 36, growMin: 18, growOptMin: 26, growOptMax: 34, growMax: 40 }),

  // ═══ Rustico ════════════════════════════════════════════════════════════════
  sp({ id: "dactylis_glomerata", nome: "Dactylis glomerata", tipologia: "rustico", esposizione: "nuvola", germMin: 8, germOptMin: 10, germOptMax: 20, germMax: 28, growMin: 7, growOptMin: 12, growOptMax: 22, growMax: 30 }),
  sp({ id: "lolium_rigidum", nome: "Lolium rigidum", tipologia: "rustico", uso_italia: "sud", esposizione: "sole", germMin: 8, germOptMin: 12, germOptMax: 22, germMax: 30, growMin: 8, growOptMin: 14, growOptMax: 24, growMax: 32 }),

  // ═══ Infestanti C3 ══════════════════════════════════════════════════════════
  sp({ id: "poa_annua", nome: "Poa annua", tipologia: "infestante_c3", germMin: 6, germOptMin: 8, germOptMax: 16, germMax: 22, growMin: 4, growOptMin: 8, growOptMax: 16, growMax: 22 }),
  sp({ id: "alopecurus_myosuroides", nome: "Alopecurus myosuroides", tipologia: "infestante_c3", uso_italia: "nord_centro", germMin: 6, germOptMin: 8, germOptMax: 14, germMax: 20, growMin: 5, growOptMin: 8, growOptMax: 15, growMax: 20 }),
  sp({ id: "bromus_hordeaceus", nome: "Bromus hordeaceus", tipologia: "infestante_c3", germMin: 8, germOptMin: 10, germOptMax: 18, germMax: 24, growMin: 6, growOptMin: 10, growOptMax: 18, growMax: 24 }),
  sp({ id: "avena_fatua", nome: "Avena fatua", tipologia: "infestante_c3", germMin: 5, germOptMin: 8, germOptMax: 16, germMax: 22, growMin: 5, growOptMin: 10, growOptMax: 18, growMax: 24 }),

  // ═══ Infestanti C4 estive ═════════════════════════════════════════════════
  sp({ id: "digitaria_sanguinalis", nome: "Digitaria sanguinalis", tipologia: "infestante_c4", tipo: "calda", germMin: 14, germOptMin: 18, germOptMax: 30, germMax: 36, growMin: 16, growOptMin: 22, growOptMax: 32, growMax: 38 }),
  sp({ id: "digitaria_ischaemum", nome: "Digitaria ischaemum", tipologia: "infestante_c4", tipo: "calda", germMin: 14, germOptMin: 18, germOptMax: 28, germMax: 34, growMin: 15, growOptMin: 20, growOptMax: 30, growMax: 36 }),
  sp({ id: "digitaria_horizontalis", nome: "Digitaria horizontalis", tipologia: "infestante_c4", tipo: "calda", uso_italia: "sud", germMin: 15, germOptMin: 20, germOptMax: 32, germMax: 36, growMin: 17, growOptMin: 24, growOptMax: 33, growMax: 38 }),
  sp({ id: "setaria_pumila", nome: "Setaria pumila", tipologia: "infestante_c4", tipo: "calda", germMin: 14, germOptMin: 18, germOptMax: 30, germMax: 35, growMin: 16, growOptMin: 22, growOptMax: 31, growMax: 36 }),
  sp({ id: "setaria_viridis", nome: "Setaria viridis", tipologia: "infestante_c4", tipo: "calda", germMin: 14, germOptMin: 18, germOptMax: 30, germMax: 35, growMin: 16, growOptMin: 22, growOptMax: 31, growMax: 36 }),
  sp({ id: "setaria_italica", nome: "Setaria italica", tipologia: "infestante_c4", tipo: "calda", germMin: 14, germOptMin: 18, germOptMax: 30, germMax: 35, growMin: 16, growOptMin: 22, growOptMax: 31, growMax: 36 }),
  sp({ id: "setaria_faberi", nome: "Setaria faberi", tipologia: "infestante_c4", tipo: "calda", uso_italia: "nord_centro", germMin: 14, germOptMin: 18, germOptMax: 28, germMax: 34, growMin: 15, growOptMin: 20, growOptMax: 28, growMax: 34 }),
  sp({ id: "echinochloa_crus_galli", nome: "Echinochloa crus-galli", tipologia: "infestante_c4", tipo: "calda", germMin: 16, germOptMin: 20, germOptMax: 32, germMax: 38, growMin: 18, growOptMin: 24, growOptMax: 33, growMax: 38 }),
  sp({ id: "panicum_dichotomiflorum", nome: "Panicum dichotomiflorum", tipologia: "infestante_c4", tipo: "calda", germMin: 16, germOptMin: 22, germOptMax: 32, germMax: 36, growMin: 18, growOptMin: 25, growOptMax: 33, growMax: 38 }),
  sp({ id: "sorghum_halepense", nome: "Sorghum halepense", tipologia: "infestante_c4", tipo: "calda", uso_italia: "sud", germMin: 16, germOptMin: 22, germOptMax: 34, germMax: 38, growMin: 18, growOptMin: 26, growOptMax: 34, growMax: 40 }),
  sp({ id: "cenchrus_echinatus", nome: "Cenchrus echinatus", tipologia: "infestante_c4", tipo: "calda", uso_italia: "costa", germMin: 18, germOptMin: 22, germOptMax: 32, germMax: 36, growMin: 18, growOptMin: 24, growOptMax: 32, growMax: 38 }),

  // ═══ Ciperacee (Cyperus) ══════════════════════════════════════════════════
  sp({ id: "cyperus_rotundus", nome: "Cyperus rotundus", tipologia: "infestante_ciperacea", tipo: "calda", uso_italia: "sud", germMin: 14, germOptMin: 20, germOptMax: 30, germMax: 34, growMin: 18, growOptMin: 24, growOptMax: 32, growMax: 36 }),
  sp({ id: "cyperus_esculentus", nome: "Cyperus esculentus", tipologia: "infestante_ciperacea", tipo: "calda", germMin: 14, germOptMin: 18, germOptMax: 28, germMax: 32, growMin: 16, growOptMin: 22, growOptMax: 30, growMax: 34 }),
  sp({ id: "cyperus_difformis", nome: "Cyperus difformis", tipologia: "infestante_ciperacea", tipo: "calda", germMin: 16, germOptMin: 20, germOptMax: 30, germMax: 34, growMin: 18, growOptMin: 23, growOptMax: 31, growMax: 35 }),
  sp({ id: "cyperus_iria", nome: "Cyperus iria", tipologia: "infestante_ciperacea", tipo: "calda", germMin: 16, germOptMin: 20, germOptMax: 30, germMax: 34, growMin: 18, growOptMin: 23, growOptMax: 31, growMax: 35 }),
  sp({ id: "cyperus_eragrostis", nome: "Cyperus eragrostis", tipologia: "infestante_ciperacea", tipo: "calda", germMin: 15, germOptMin: 19, germOptMax: 28, germMax: 32, growMin: 17, growOptMin: 22, growOptMax: 29, growMax: 33 }),
];

export const ELENCO_LATINO_ITALIA = SPECIE_PRATO_ITALIA.map((s) =>
  s.citotipo ? `${s.nome} (${s.citotipo})` : s.nome,
);

export function speciePerTipologia(tipologiaId) {
  return SPECIE_PRATO_ITALIA.filter((s) => s.tipologia === tipologiaId);
}
