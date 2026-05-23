/**
 * Integra nel piano annuale tutti i prodotti idonei del catalogo (1 riga/prodotto),
 * con priorità media/bassa, senza sostituire i lavori critici generati da Gemini.
 */

import {
  arricchisciInterventoConProdotto,
  filtraPoolMarca,
  inferMacroCategoriaProdotto,
  periodoCompatibile,
} from "./prodottiCatalogo.mjs";
import { concimeAmmessoPerProfilo } from "./livelloConcimi.mjs";
import { configLivelloImpegno } from "./livelloImpegno.mjs";
import { catalogoAmmessoSenzaFoto } from "./regoleFitofarmaci.mjs";
import { isProdottoAmmessoConsumer, isProdottoFitofarmaco } from "./sicurezzaProdotti.mjs";

const MESI_IT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function normalizeNome(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function mesiDaPeriodo(periodoUso) {
  if (!periodoUso) return [...Array(12).keys()];
  const p = String(periodoUso).toUpperCase();
  if (/TUTTO|ANNO|SEMPRE|12\s*MESI/.test(p)) return [...Array(12).keys()];
  const found = p.match(/GEN|FEB|MAR|APR|MAG|GIU|LUG|AGO|SET|OTT|NOV|DIC/g) || [];
  const idx = found.map((c) => MESI_IT.indexOf(c)).filter((i) => i >= 0);
  return idx.length ? [...new Set(idx)] : [...Array(12).keys()];
}

function primaDataNelPeriodo(oggi, mesiAmmessi) {
  const start = new Date(`${oggi}T12:00:00`);
  for (let offset = 0; offset < 366; offset++) {
    const d = new Date(start);
    d.setDate(d.getDate() + offset);
    if (mesiAmmessi.includes(d.getMonth())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}-15`;
    }
  }
  return addDays(oggi, 21);
}

function mappaTipoProdotto(prodotto) {
  const cat = String(prodotto.categoria || "").toUpperCase();
  const blob = `${prodotto.nome || ""} ${prodotto.descrizione || ""} ${prodotto.composizione || ""}`.toLowerCase();

  if (/DISERBANTE/.test(cat)) return { categoria: "diserbo", tipo: "diserbante" };
  if (/FUNGICIDA|INSETTICIDA/.test(cat)) return { categoria: "trattamento", tipo: "trattamento" };
  if (cat === "BAGNANTE" || /umett|bagnante|surfact/.test(blob)) return { categoria: "umettante", tipo: "umettante" };
  if (/BIOSTIM|BIOATTIV/.test(cat) || /biostim/.test(blob)) return { categoria: "biostimolante", tipo: "biostimolante" };
  if (/AMMEND|ORGANIC|HUMUS|LEONARDIT|MICORRIZ|CORRETTIV|FERRO/.test(cat) || /ammend|organico|humus|micorriz/.test(blob)) {
    return { categoria: "concime", tipo: "ammendante" };
  }
  if (cat.includes("LIQUID") || /liquid/.test(blob)) return { categoria: "concime", tipo: "liquido" };
  if (/CONCIME|NUTRI|NPK|FERTIL/.test(cat) || /concim|npk|nutri/.test(blob)) {
    return { categoria: "concime", tipo: "concime" };
  }
  return null;
}

function prioritaCatalogo(prodotto, tipo, dataIso) {
  const mese = new Date(`${dataIso}T12:00:00`).getMonth();
  const estivo = mese >= 5 && mese <= 7;
  if (tipo === "liquido" && estivo) return "media";
  if (tipo === "biostimolante" && estivo) return "media";
  if (tipo === "umettante" && estivo) return "media";
  if (isProdottoFitofarmaco(prodotto)) return "bassa";
  return "bassa";
}

function prodottoAmmessoAlCalendario(prodotto, profilo) {
  if (!isProdottoAmmessoConsumer(prodotto)) return false;
  if (!mappaTipoProdotto(prodotto)) return false;
  if (!catalogoAmmessoSenzaFoto(prodotto)) return false;
  if (!concimeAmmessoPerProfilo(prodotto, profilo)) return false;
  return filtraPoolMarca([prodotto]).length > 0;
}

function giaCopertoDaPiano(interventi, prodotto) {
  const n = normalizeNome(prodotto.nome);
  if (!n || n.length < 4) return false;
  return interventi.some((i) => {
    if (i.prodotto_id != null && i.prodotto_id === prodotto.id) return true;
    const blob = normalizeNome(`${i.titolo} ${i.descrizione} ${i.prodotto_nome || ""}`);
    return blob.includes(n);
  });
}

/** Evita più prodotti della stessa macro_categoria nello stesso mese (es. 3 concimi K). */
function giaMacroNelMese(interventi, prodotto, dataIso) {
  const macro = inferMacroCategoriaProdotto(prodotto);
  const mese = (dataIso || "").slice(0, 7);
  if (!mese) return false;
  return interventi.some((i) => {
    const m = (i.data_prevista || "").slice(0, 7);
    if (m !== mese) return false;
    const im =
      i.macro_categoria ||
      (i.prodotto_id === prodotto.id ? macro : inferMacroCategoriaProdotto({ categoria: i.categoria }, i));
    return im === macro;
  });
}

function interventoDaProdotto(prodotto, profilo, oggi) {
  const tipo = mappaTipoProdotto(prodotto);
  if (!tipo) return null;

  const mesi = mesiDaPeriodo(prodotto.periodo_uso);
  const data = primaDataNelPeriodo(oggi, mesi);
  const meseCode = MESI_IT[new Date(`${data}T12:00:00`).getMonth()];
  if (!periodoCompatibile(prodotto.periodo_uso, meseCode)) return null;

  const priorita = prioritaCatalogo(prodotto, tipo.tipo, data);
  const fito = isProdottoFitofarmaco(prodotto);

  let desc = (prodotto.descrizione || prodotto.composizione || "").trim().slice(0, 280);
  if (prodotto.periodo_uso) desc = [desc, `Periodo d'uso indicato: ${prodotto.periodo_uso}.`].filter(Boolean).join(" ");

  const base = {
    titolo: String(prodotto.nome || "Prodotto catalogo").slice(0, 120),
    descrizione: desc || `Applicazione da catalogo (${prodotto.categoria}).`,
    categoria: tipo.categoria,
    priorita,
    data_prevista: data,
    ordine: 5000 + (prodotto.id ?? 0),
    fonte: "calendario_stagionale",
    _catalogo: true,
  };

  return arricchisciInterventoConProdotto(
    { ...base, prodotto_id: prodotto.id, prodotto_nome: prodotto.nome },
    profilo,
    [prodotto],
    null,
  );
}

/**
 * @param {object[]} interventiPiano - già arricchiti da Gemini
 */
export function integraCatalogoNelPiano(interventiPiano, prodotti, profilo, oggi) {
  const cfg = configLivelloImpegno(profilo);
  const eligibili = prodotti.filter((p) => {
    if (!prodottoAmmessoAlCalendario(p, profilo)) return false;
    const tipo = mappaTipoProdotto(p);
    if (!cfg.liquidiMensili && (tipo?.tipo === "liquido" || tipo?.categoria === "umettante")) {
      return false;
    }
    return true;
  });
  const extra = [];

  for (const p of eligibili) {
    if (extra.length >= cfg.maxCatalogo) break;
    if (giaCopertoDaPiano(interventiPiano, p) || giaCopertoDaPiano(extra, p)) continue;

    const row = interventoDaProdotto(p, profilo, oggi);
    if (!row) continue;
    if (giaMacroNelMese([...interventiPiano, ...extra], p, row.data_prevista)) continue;
    extra.push(row);
  }

  const merged = [...interventiPiano, ...extra].sort(
    (a, b) => a.data_prevista.localeCompare(b.data_prevista) || (a.ordine ?? 0) - (b.ordine ?? 0),
  );

  return { interventi: merged, catalogoAggiunti: extra.length };
}
