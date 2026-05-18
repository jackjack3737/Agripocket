# Risposta all'audit Gemini (maggio 2026)

Documento di allineamento tra la **revisione critica** ricevuta e lo **stato reale** del codice su `main`.

---

## Verdetto audit vs stato attuale

| Criticità audit | Stato | Note |
|-----------------|-------|------|
| P0 Fallback 100 m² dosi | **Risolto** | `mqPrato()` / `calcolaDose()` non usano fallback; senza m² → nessuna dose, solo avviso |
| P0 API sincrone timeout | **Parzialmente risolto** | Job async `prato_jobs` + `waitUntil` su analizza/genera; `maxDuration: 120` su Vercel; serve tabella SQL |
| P0 Prodotti PAN professionali | **Mitigato** | Filtro `filtraProdottiConsumer`: solo PFNPO/BIO/pre-emergenza in catalogo fitofarmaci |
| P0 Disclaimer insufficiente | **Parzialmente** | Checkbox obbligatoria onboarding; testo in `sicurezzaClient.js` — da rafforzare legalmente |
| P1 Rigenera piano cancella tutto | **Risolto** | `manual_override` + delete solo `calendario_stagionale` non pinati |
| P1 Radar legato a task minori | **Risolto** | Punteggio da **foto**; solo lavori **scaduti** abbassano; futuri ignorati |
| P1 Rate limit API | **Mitigato** | `rateLimit.mjs` su analizza/genera (per istanza serverless) |
| P2 Meteo senza cache | **Risolto** | Cache `sessionStorage` 1h in `weatherClient.js` |
| P2 GDPR foto/geo | **Aperto** | Serve policy retention + arrotondamento coordinate (backlog) |
| P2 Notifiche assenti | **Aperto** | Backlog prodotto |

---

## Cosa è cambiato dopo l'audit (commit recenti)

1. **Radar / esagono** — Logica riscritta: base = vision; penalità solo `data_prevista < oggi`; lavori futuri non alterano il voto.
2. **Calendario** — Filtri Trattamenti / Giardino / Mese / Anno; fix generazione piano bloccata dai controlli foto mensili.
3. **Sicurezza prodotti** — Nessun fitofarmaco consumer fuori categorie PFNPO/BIO; riferimenti senza dose automatica.
4. **Rate limit** — Limite orario analisi foto e genera piano per utente.

---

## Backlog ancora MUST (4 settimane)

1. Policy GDPR scritta + retention foto (es. 90 giorni) e opt-in esplicito.
2. Rate limit distribuito (Redis/Upstash) se traffico reale.
3. Verifica legale testo disclaimer con consulente.
4. Notifiche push/email per lavori scaduti.
5. Campo DB `categoria_legale` su `Prodotti` (migrazione da euristica).
6. Conferma deploy automatico GitHub → Vercel.

---

## File di revisione per Gemini

- `docs/RELAZIONE_CRITICA_GEMINI.md` — descrizione app + domande audit
- `docs/PROMPT_GEMINI_REVISIONE.txt` — prompt da incollare in Gemini

---

*Aggiornare questo file a ogni sprint di hardening.*
