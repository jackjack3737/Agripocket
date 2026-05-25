/** Mock catalogo prescrizionale — sostituire con API prodotti_mercato + calendario. */
export const MOCK_PRODOTTI_FARMACIA = [
  {
    id: 1,
    nome_commerciale: "Slow K 13-5-20",
    marca: "Bottos",
    immagine: "https://via.placeholder.com/150",
    tag_tecnici: ["#AzotoLento", "#Antistress"],
    obiettivo: "Resistenza al Caldo",
    molecola_chiave: "Potassio",
    dose_mq: 30,
    unita_misura: "g",
    formato_vendita: 5000,
    timing_tag: "ora",
    link_partner: "https://shop.partner.com/prodotto1",
  },
  {
    id: 2,
    nome_commerciale: "Trico-Sym",
    marca: "Biogard",
    immagine: "https://via.placeholder.com/150",
    tag_tecnici: ["#Trichoderma", "#Micorrize"],
    obiettivo: "Lotta ai funghi",
    molecola_chiave: "Trichoderma",
    dose_mq: 10,
    unita_misura: "g",
    formato_vendita: 1000,
    timing_tag: "futuro",
    link_partner: "https://shop.partner.com/prodotto2",
  },
];

export const FILTRI_AZIONE = [
  { id: "antistress", label: "Antistress" },
  { id: "radicazione", label: "Radicazione" },
  { id: "funghi", label: "Lotta ai funghi" },
  { id: "rinverdimento", label: "Rinverdimento" },
];

export const FILTRI_MOLECOLA = [
  { id: "trichoderma", label: "Trichoderma" },
  { id: "ferro", label: "Ferro" },
  { id: "umettanti", label: "Umettanti" },
  { id: "azoto_lento", label: "Azoto Lento" },
];

const AZIONE_MATCH = {
  antistress: /antistress|caldo|stress|potass/i,
  radicazione: /radic|fosfor|micorr|rizogen/i,
  funghi: /fung|trichoderma|oidio|patogen/i,
  rinverdimento: /rinverd|verde|clorofill|azoto/i,
};

const MOLECOLA_MATCH = {
  trichoderma: /trichoderma/i,
  ferro: /ferro|chelat|clorosi/i,
  umettanti: /umett|surfact|bagnante/i,
  azoto_lento: /azoto\s*lento|slow\s*n|ureaform/i,
};

export function blobProdotto(p) {
  return [
    p.obiettivo,
    p.molecola_chiave,
    ...(p.tag_tecnici || []),
    p.nome_commerciale,
  ]
    .join(" ")
    .toLowerCase();
}

export function prodottoPassaFiltri(prodotto, azioniSelezionate, molecoleSelezionate) {
  const blob = blobProdotto(prodotto);
  if (azioniSelezionate.size) {
    const okAzione = [...azioniSelezionate].some((id) => AZIONE_MATCH[id]?.test(blob));
    if (!okAzione) return false;
  }
  if (molecoleSelezionate.size) {
    const okMol = [...molecoleSelezionate].some((id) => MOLECOLA_MATCH[id]?.test(blob));
    if (!okMol) return false;
  }
  return true;
}
