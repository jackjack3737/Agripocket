/** Specie / generi comuni per prato (selezione facoltativa, utenti esperti) */

export const GRASS_SPECIES_BY_TYPE = {
  cespitoso: [
    { id: "festuca_arundinacea", scientific: "Festuca arundinacea", common: "Festuca alta" },
    { id: "festuca_rubra", scientific: "Festuca rubra", common: "Festuca rossa" },
    { id: "festuca_trachyphylla", scientific: "Festuca trachyphylla", common: "Festuca delle praterie" },
    { id: "agrostis_capillaris", scientific: "Agrostis capillaris", common: "Agrostide comune" },
    { id: "dactylis_glomerata", scientific: "Dactylis glomerata", common: "Gherbo mazzetto" },
  ],
  tappeto: [
    { id: "lolium_perenne", scientific: "Lolium perenne", common: "Loietto inglese" },
    { id: "poa_pratensis", scientific: "Poa pratensis", common: "Poa dei prati" },
    { id: "agrostis_stolonifera", scientific: "Agrostis stolonifera", common: "Agrostide stolonifera" },
    { id: "lolium_multiflorum", scientific: "Lolium multiflorum", common: "Loietto italico" },
    { id: "cynodon_dactylon", scientific: "Cynodon dactylon", common: "Gramigna bermuda" },
    { id: "zoysia", scientific: "Zoysia spp.", common: "Zoysia" },
    { id: "paspalum", scientific: "Paspalum vaginatum", common: "Paspalo" },
  ],
  rustico: [
    { id: "festuca_arundinacea", scientific: "Festuca arundinacea", common: "Festuca alta (resistente)" },
    { id: "lolium_perenne", scientific: "Lolium perenne", common: "Loietto (miscugli rustici)" },
    { id: "dactylis_glomerata", scientific: "Dactylis glomerata", common: "Gherbo mazzetto" },
    { id: "cynodon_dactylon", scientific: "Cynodon dactylon", common: "Gramigna (clima caldo)" },
    { id: "festuca_ovina", scientific: "Festuca ovina", common: "Festuca ovina" },
  ],
  misto: [
    { id: "miscuglio_commerciale", scientific: "Miscuglio commerciale", common: "Prato da giardino in sacco" },
    { id: "lolium_perenne", scientific: "Lolium perenne", common: "Loietto" },
    { id: "poa_pratensis", scientific: "Poa pratensis", common: "Poa dei prati" },
    { id: "festuca_rubra", scientific: "Festuca rubra", common: "Festuca rossa" },
    { id: "festuca_arundinacea", scientific: "Festuca arundinacea", common: "Festuca alta" },
    { id: "cynodon_dactylon", scientific: "Cynodon dactylon", common: "Gramigna" },
  ],
};

export function speciesForTipo(tipo) {
  return GRASS_SPECIES_BY_TYPE[tipo] ?? [];
}
