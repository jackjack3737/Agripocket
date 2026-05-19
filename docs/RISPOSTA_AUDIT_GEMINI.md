# Risposta all'audit Gemini (maggio 2026)



Documento di allineamento tra la **revisione critica** ricevuta e lo **stato reale** del codice su `main`.



---



## Verdetto audit vs stato attuale



| Criticità audit | Stato | Note |

|-----------------|-------|------|

| P0 Fallback 100 m² dosi | **Risolto** | `mqPrato()` / `calcolaDose()` non usano fallback; senza m² → nessuna dose, solo avviso |

| P0 API sincrone timeout | **Parzialmente risolto** | Job async `prato_jobs` + `waitUntil` su analizza/genera; `maxDuration: 120` su Vercel; serve tabella SQL |

| P0 Prodotti PAN professionali | **Mitigato** | `filtraProdottiConsumer` + `categoria_legale` (SQL) + filtro in `loadProdotti` |

| P0 Foto bucket pubblico | **Mitigato in codice** | Upload senza URL pubblico; signed URL; eseguire `sql/patch_foto_storage_private.sql` |

| P0 Disclaimer insufficiente | **Parzialmente** | Checkbox onboarding; testo aggiornato — da rafforzare con consulente legale |

| P1 Rigenera piano cancella tutto | **Risolto** | `manual_override` + delete solo `calendario_stagionale` non pinati |

| P1 Radar legato a task minori | **Risolto** | Punteggio da **foto**; solo lavori **scaduti** abbassano; futuri ignorati |

| P1 Piano troppo denso (50–90) | **Mitigato** | Prompt 28–45; catalogo auto max 18 voci |

| P1 Rate limit API | **Mitigato** | `rateLimit.mjs` per istanza serverless — Redis/Upstash backlog |

| P1 Genera piano senza m² | **Risolto** | Blocco server se `superficie_mq` assente |

| P2 Meteo senza cache | **Risolto** | Cache `sessionStorage` 1h in `weatherClient.js` |

| P2 GDPR foto/geo | **Parzialmente** | Bucket privato + signed URL; coordinate mappa arrotondate a 4 decimali |

| P2 Notifiche assenti | **Aperto** | Backlog prodotto |

| P2 Transazione analisi | **Mitigato** | Rollback analisi/interventi se persist fallisce a metà |



---



## Cosa è cambiato dopo l'audit (commit recenti)



1. **Radar / esagono** — Base = vision; penalità solo scaduti; futuri ignorati.

2. **Calendario** — Filtri Trattamenti / Giardino / Mese / Anno; fix generazione piano.

3. **Sicurezza prodotti** — PFNPO/BIO; `inferCategoriaLegale`; esclusione `PROFESSIONALE`.

4. **Rate limit** — Limite orario analisi foto e genera piano.

5. **Foto private** — `fotoStorage.mjs`, API `/api/foto-url`, client `createSignedUrl`.

6. **Piano consumer** — Meno interventi Gemini + tetto integrazione catalogo.



---



## SQL da eseguire in Supabase (obbligatorio per foto + prodotti)



1. `sql/patch_foto_storage_private.sql` — bucket `prato-foto` non pubblico.

2. `sql/patch_prodotti_categoria_legale.sql` — colonna `categoria_legale` + backfill.

3. (se non fatto) `sql/patch_sicurezza_beta.sql` — tabella `prato_jobs`.



---



## Backlog ancora MUST



1. Policy GDPR scritta + retention foto (es. 90 giorni) e job di purge.

2. Rate limit distribuito (Redis/Upstash) se traffico reale.

3. Verifica legale testo disclaimer con consulente.

4. Notifiche push/email per lavori scaduti.

5. Conferma deploy automatico GitHub → Vercel.

6. Coda job distribuita (QStash / Inngest) oltre `waitUntil`.



---



## File di revisione per Gemini



- `docs/RELAZIONE_CRITICA_GEMINI.md` — descrizione app + domande audit

- `docs/PROMPT_GEMINI_REVISIONE.txt` — prompt da incollare in Gemini



---



*Aggiornare questo file a ogni sprint di hardening.*

