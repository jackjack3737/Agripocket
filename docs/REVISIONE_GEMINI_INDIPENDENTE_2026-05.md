# Revisione critica indipendente — Solum / AgriPocket (maggio 2026)

Documento di riferimento per la revisione esterna (Gemini). Per architettura tecnica vedi `RELAZIONE_COMPLETA_GEMINI.md`.

## Verdetto executive

Piattaforma **tecnicamente avanzata**, **non pronta al lancio senza fix P0**. Punti di forza: serbatoio idrico, cycle-soak, RAG, separazione routine/interventi. Rischi: miopia LLM sul calendario, attrito mappa, timeout job lunghi, compliance fitosanitari.

## Stato remediation (post-revisione)

| ID | Liv | Criticità | Stato nel codice |
|----|-----|-----------|------------------|
| 1 | P0 | N autunnale mancante (LLM) | **Fix:** `ensureMatriceNPKObbligatoria` in `sanitizzaCalendario.mjs` + matrice N-P-K già nel prompt `pianoStagionale.mjs` |
| 2 | P0 | Timeout 120s generazione piano | **Parziale:** job async `prato_jobs` + polling; UX «1-2 min» in calendario |
| 3 | P0 | Esposizione rimossa da onboarding | **Fix:** step `esposizione` ripristinato in `onboardingSteps.js`; fallback in `irrigazioneInput.mjs` |
| 4 | P1 | Fitofarmaci consumer / PAN | **Fix:** `filtraProdottiConsumerStrict` + principio attivo se solo prodotti professionali |
| 5 | P1 | Cycle-soak 15 min fisso | **Aperto:** pendenza/argilla in motore; soglia da tasso infiltrazione |
| 6 | P1 | Kc fisso 0.75 | **Aperto:** lookup mensile microterme |
| 7 | P1 | Vision falsi positivi funghi | **Fix:** `visionMeteoDeclass.mjs` + Open-Meteo 7gg in `analizzaPratoCore.mjs` |
| 8 | P2 | Task scaduti nascosti / Radar | **Fix:** sezione «In sospeso / in ritardo» in `CalendarioLavori.jsx` |
| 9 | P2 | Totale minuti irrigazione | **Fix:** rimosso totale aggregato in `IrrigationWidget.jsx` |
| 10 | P2 | Troppi task (45) | **Fix:** Base `maxInterventi: 15` in `livelloImpegno.mjs` |
| 11 | P2 | Overseeding ombra Sud | **Aperto:** latitudine in `suggestOmbraSeed` |
| 12 | P2 | Solo pioggia senza alert | **Aperto:** alert ET0 cumulato |

## Backlog MoSCoW (4 settimane) — allineamento

### Must (beta)

- [x] Matrice N-P-K: prompt + iniezione deterministica autunno/primavera
- [x] Esposizione prevalente onboarding
- [x] Task scaduti visibili in calendario
- [ ] Limite PFNPO vs professionali per profilo consumer

### Should

- [ ] Tabella infiltrazione per cycle-soak
- [ ] Kc mensile
- [ ] Polling/notifica job piano
- [x] Declassamento funghi se umidità notturna bassa (`visionMeteoDeclass.mjs`)

### Could / Won't

Come da relazione originale (alert dormienza, export centralina; no poligoni getto, no API Hunter).

## Punti di forza confermati

1. Modello serbatoio (deficit cumulato)
2. Cycle-soak da pendenza/argilla
3. UI routine vs interventi strategici
4. RAG su fonti validate
5. Trigger meteo su date (suolo 12°C, ecc.)

---

*Archiviato da revisione Gemini indipendente — maggio 2026.*
