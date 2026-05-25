/** Applica campi voce Solum (Gemini) nel JSON `dettaglio_trattamento` persistito. */

function clip(s, max) {
  const t = String(s || "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * @param {object[]} interventi
 * @returns {object[]}
 */
export function applicaSolumVoceADettaglio(interventi) {
  return interventi.map((i) => {
    const v = i.solum_voce;
    const hasVoce =
      v ||
      i.titolo_tecnico_solum ||
      i.messaggio_operativo_breve ||
      i.titolo_semplice_azione;

    if (!hasVoce) {
      const { solum_voce, titolo_tecnico_solum, titolo_semplice_azione, messaggio_operativo_breve, ...rest } =
        i;
      return rest;
    }

    const titoloSemplice =
      clip(v?.titolo_semplice_azione || i.titolo_semplice_azione, 80) || i.titolo;
    const messaggioOperativo = clip(
      v?.messaggio_operativo_breve || i.messaggio_operativo_breve || i.messaggio_ux,
      120,
    );
    const titoloTecnico = clip(v?.titolo_tecnico || i.titolo_tecnico_solum, 200);
    const fabbisognoAccademico = String(
      v?.fabbisogno_fisiologico || i.fabbisogno_fisiologico || "",
    ).trim();

    const detBase =
      i.dettaglio_trattamento && typeof i.dettaglio_trattamento === "object"
        ? { ...i.dettaglio_trattamento }
        : {};

    const dettaglio_trattamento = {
      ...detBase,
      tipo_intervento: titoloSemplice || detBase.tipo_intervento,
      titolo_semplice_azione: titoloSemplice,
      messaggio_operativo_breve: messaggioOperativo,
      titolo_tecnico: titoloTecnico || detBase.titolo_tecnico,
      fabbisogno_fisiologico: fabbisognoAccademico || detBase.fabbisogno_fisiologico,
      spiegazione_semplice: messaggioOperativo,
      esigenze_molecolari: i.esigenze_molecolari ?? detBase.esigenze_molecolari ?? [],
      prodotti_consigliati: detBase.prodotti_consigliati ?? [],
      nota_scelta_prodotti: detBase.nota_scelta_prodotti ?? null,
      contesto_meteo: detBase.contesto_meteo ?? null,
      adattamento_dinamico: detBase.adattamento_dinamico ?? i.adattamento_dinamico ?? null,
    };

    const {
      solum_voce,
      titolo_tecnico_solum,
      titolo_semplice_azione: _t,
      messaggio_operativo_breve: _m,
      ...rest
    } = i;

    return {
      ...rest,
      titolo: clip(titoloSemplice, 120) || rest.titolo,
      messaggio_ux: messaggioOperativo || rest.messaggio_ux,
      spiegazione_semplice: messaggioOperativo,
      fabbisogno_fisiologico: fabbisognoAccademico || rest.fabbisogno_fisiologico,
      dettaglio_trattamento,
    };
  });
}
