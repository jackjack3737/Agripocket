# Relazione tecnico-funzionale — AgriPocket
## Documento per valutazione critica (Gemini / revisore esterno)

> **Aggiornamento maggio 2026:** documento master → **`docs/RELAZIONE_COMPLETA_GEMINI.md`**. Per revisione critica severa: **`docs/RELAZIONE_CRITICA_GEMINI.md`** + **`docs/PROMPT_GEMINI_REVISIONE.txt`**.

**Versione:** maggio 2026 (archivio; vedi relazione critica per stato corrente)  
**Repository:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app  
**Stack:** React 19 + Vite 6, Supabase (Auth + Postgres + pgvector), Gemini 2.5 Flash, Vercel Serverless

---

## 1. Visione del prodotto

**AgriPocket** è un’applicazione web per **proprietari di prato** (giardino, ornamentale, sportivo) che vogliono:

1. **Capire lo stato del prato** da foto (diagnosi visiva + report agronomico).
2. **Avere un calendario annuale** dei lavori (concimi, taglio, diserbi, trattamenti, arieggiatura, ecc.) personalizzato su località, meteo e profilo.
3. **Monitorare lo “stato di salute”** con un radar esagonale (stile statistiche PES) aggiornato da foto e da adempimento del calendario.
4. **Ricevere suggerimenti prodotto** con **dosi calcolate sui m²** del prato, dal catalogo commerciale (tabella `Prodotti`, ~158 SKU).

Non è un gestionale per greenkeeper professionisti di stadio, ma un **assistente agronomico consumer/prosumer** con knowledge base curata (Bottos, NCSU, blog tecnici, PDF catalogo).

---

## 2. Architettura generale

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                            │
│  /login → /onboarding → /dashboard | /chat                      │
└────────────┬────────────────────────────────────────────────────┘
             │ JWT Supabase
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase                                                       │
│  • Auth (usersagropocket)                                       │
│  • prato_profilo, prato_analisi, prato_interventi               │
│  • Prodotti (catalogo strutturato)                              │
│  • tgif_knowledge_base (~11k chunk, embedding 3072, RAG)        │
│  • RPC match_documenti (HNSW halfvec)                           │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vercel Serverless (cartella web/)                              │
│  • POST /api/analizza-prato  → analizzaPratoCore.mjs            │
│  • POST /api/genera-piano    → pianoStagionale.mjs              │
│  • GET  /api/meteo           → weatherCore.mjs                  │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Google Gemini API                                              │
│  • gemini-2.5-flash (vision + testo + JSON strutturato)         │
│  • gemini-embedding-001 (3072 dim, allineato a KB)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Crawler Python (offline, non in runtime app)                   │
│  Ingest PDF Bottos Drive, Calendario Verde, sitemap, YouTube…   │
│  → popola tgif_knowledge_base                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Dev locale:** `npm run dev` in `web/` → Vite + plugin che espone le stesse API (`vite-plugin-analizza.mjs`).

---

## 3. Percorsi utente (UX)

| Route | Funzione |
|-------|----------|
| `/` | Home, redirect se loggato |
| `/login` | Autenticazione Supabase |
| `/onboarding` | Wizard profilo: uso prato, seme, esposizione, terreno, irrigazione, **mappa/località**, **superficie m²** (poligono) |
| `/dashboard` | Meteo, radar stato prato, profilo, **calendario mese-per-mese** con checkbox completamento |
| `/chat` | Scatta/carica **foto prato** → analisi IA → report Markdown → redirect dashboard |

**Flusso tipico:** onboarding → generazione automatica piano annuale (se calendario vuoto) → uso quotidiano dashboard → foto quando c’è un problema → piano aggiornato.

---

## 4. Modello dati (Supabase)

### 4.1 `usersagropocket`
Utenti app (legati a Supabase Auth).

### 4.2 `prato_profilo` (1:1 utente)
- `uso`, `tipo_seme`, `marca_seme`, `esposizione`, `tipo_terreno`, `irrigazione`
- **`superficie_mq`** (integer) — usato per calcolo dosi prodotto
- **`localita`** (testo, da geocoding mappa)
- `note`, `onboarding_completato`

### 4.3 `prato_analisi`
Ogni analisi foto: `report_markdown`, **`vision_json`** (JSON strutturato Gemini), `chunks_used`, timestamp.

### 4.4 `prato_interventi`
Calendario lavori:
- `titolo`, `descrizione`, `categoria`, `priorita` (alta/media/bassa)
- `stato`: pianificato | completato
- `data_prevista`, `data_completamento`, `ordine`
- **`fonte`**: `ia_foto` | `calendario_stagionale`
- Opzionale (patch SQL): `prodotto_id`, `prodotto_nome`, `dose_totale`, `dose_unita`, `dose_per_mq`

**Categorie ammesse:** taglio, irrigazione, concime, trattamento, pulizia, diserbo, arieggiatura, biostimolante, umettante, rinnovo, altro.

### 4.5 `Prodotti` (~158 righe)
Catalogo strutturato: nome, categoria (FUNGICIDA, CONCIME GRANULARE, DISERBANTE SELETTIVO…), marca, dose_fogliare/dose_radicale **per m²**, unità (ml/g), periodo_uso, descrizione, prezzo, composizione.

### 4.6 `tgif_knowledge_base`
RAG: `patologia`, `specie`, `soluzione` (testo chunk), `embedding` vector(3072), metadati `tipo` (web | prodotto | calendario), `fonte` URL.

**Indice:** HNSW su `halfvec(3072)` — patch `sql/patch_match_documenti.sql`.

---

## 5. Pipeline intelligenza artificiale

### 5.1 Analisi foto (`analizzaPratoCore.mjs`)

**Step 1 — Vision (multimodale)**  
Input: immagine + profilo + meteo.  
Output JSON: specie probabili (latino), stato_generale, problemi_rilevati, stress_idrici, malattie_sospette, erbette_infestanti, taglio, feltro, query_ricerca_kb.

**Step 2 — RAG**  
Embedding della query → `match_documenti` su KB (soglia ~0.18–0.22, 4–6 chunk).

**Step 3 — Report Markdown**  
Gemini genera report sezionato (diagnosi, piano d’azione, cosa evitare…).

**Step 4 — Interventi urgenti**  
Estrazione JSON 4–8 lavori (`interventiFromReport.mjs`), fonte `ia_foto`.

**Step 5 — Prodotti e dosi**  
Per ogni intervento: scelta da `Prodotti`, dose = **dose/m² × superficie_mq**.  
Regole marca:
- **Solo BOTTOS** per concimi, biostimolanti, sementi, bagnanti, bioattivati.
- **Tutte le marche** per fungicidi, diserbanti, insetticidi.
- Se foto indica funghi/insetti → pool ristretto a FUNGICIDA / INSETTICIDA.

**Step 6 — Integrazione piano stagionale** (`aggiornaPianoDaFoto.mjs`)  
Gemini propone: aggiunte/modifiche/annullamenti su interventi `calendario_stagionale` esistenti (0–5 aggiunte tipiche), con prodotti e dosi.

### 5.2 Piano annuale (`pianoStagionale.mjs`)

- Richiede **località** nel profilo.
- RAG su KB + meteo + profilo.
- Gemini genera **50–90 interventi** con date ISO distribuite su 12 mesi.
- Sostituisce tutti i `calendario_stagionale` pianificati (non tocca completati né `ia_foto`).
- Durata generazione: **1–2 minuti** (timeout API 60s su Vercel).

### 5.3 Radar stato prato (`pratoStats.js` — client)

6 assi 0–100: Idratazione, Nutrizione, Copertura, Salute fogliare, Difesa, Manutenzione.

**Fonti:**
- Ultima `vision_json` (peso decrescente con età analisi)
- Interventi scaduti non completati (penalità per categoria)
- Meteo (solo idratazione)

**Non ordina** il calendario per priorità: ordine **cronologico** per data.

---

## 6. Knowledge base (contenuti ingeriti)

| Fonte | Tipo | Note |
|-------|------|------|
| bottos1848.com | web, calendario | ~69 Calendario Verde (2015–2026), blog tecnico |
| PDF catalogo Bottos (Google Drive) | prodotto | ~71 PDF, chunk `tipo=prodotto` |
| NCSU TurfFiles, bestprato.com, sitemap | web | Migliaia di URL |
| YouTube (trascrizioni) | web | Volume crawl |

**Script crawler:** `crawler/` (Python), eseguiti offline. Non fanno parte del deploy Vercel.

**Obiettivo storico:** ~50k chunk (run_target_50k.py); stato attuale ~11k righe indicato in patch SQL.

---

## 7. API esposte

| Endpoint | Metodo | Auth | Timeout | Descrizione |
|----------|--------|------|---------|-------------|
| `/api/analizza-prato` | POST | Bearer JWT | 60s | Foto base64 + analisi completa |
| `/api/genera-piano` | POST | Bearer JWT | 60s | Piano annuale |
| `/api/meteo` | GET | — | breve | Open-Meteo / OpenWeather fallback |

**Segreti:** `GEMINI_API_KEY`, `SUPABASE_*`, `OPENWEATHER_API_KEY` (opzionale) in env Vercel / `crawler/.env` per dev.

---

## 8. UI Dashboard (dettaglio)

1. **Card Meteo** — temperatura, consiglio agronomico, storico termico.
2. **Card Stato prato** — radar SVG esagonale + legenda valori; media e etichetta (Ottimo/Buono/…).
3. **Card Profilo** — riepilogo onboarding.
4. **Calendario lavori**
   - Accordion **mese per mese** (mese corrente aperto default).
   - Giorni in ordine cronologico; per giorno lista interventi.
   - Ogni riga: data, categoria, **indicatore importanza** (barra 3 livelli), titolo, **prodotto + dose totale**, checkbox completato.
   - Sezione “Urgenti dall’analisi foto” (se presenti).
   - Pulsante “Genera / Rigenera piano annuale”.

---

## 9. Deploy e operazioni

- **Hosting:** Vercel, root progetto = cartella `web/`.
- **URL produzione:** `agripocket-azure.vercel.app` (non usare `agripocket.vercel.app` — progetto Next.js diverso).
- **GitHub → Vercel:** deploy automatico; root `vercel.json` invalido rimosso; deploy manuale da `web/` se necessario.
- **SQL:** patch da eseguire manualmente in Supabase SQL Editor (non CI):
  - `prato_dashboard.sql`, `prato_profilo.sql`, `patch_interventi_categorie.sql`
  - `patch_match_documenti.sql` (critico per RAG)
  - `patch_interventi_prodotto.sql` (colonne prodotto/dose)
  - `patch_prato_localita.sql`, `patch_ensure_usersagropocket.sql`

---

## 10. Punti di forza (autovalutazione)

1. **RAG reale** su corpus di dominio (non solo prompt generico).
2. **Vision + profilo + meteo** combinati nel report.
3. **Calendario annuale denso** (50–90 interventi) adattato all’Italia.
4. **Chiusura del loop:** foto → aggiorna piano + urgenze + esagono.
5. **Catalogo prodotti strutturato** con matematica dosi su m².
6. **UX calendario** leggibile (mese → giorno → lavoro).

---

## 11. Limiti, rischi e debito tecnico

| Area | Problema |
|------|----------|
| **Timeout** | Piano annuale e analisi foto al limite 60s Vercel; utenti con connessione lenta possono fallire. |
| **Costi API** | Ogni foto = 3+ chiamate Gemini + embedding; piano annuale = 1 chiamata molto grande. |
| **Accuratezza IA** | Specie da foto e diagnosi non sostituiscono agronomo; nessuna validazione umana. |
| **Prodotti** | Scelta euristica + Gemini; possibili abbinamenti subottimali; prezzi non mostrati in UI. |
| **RLS** | Service role server-side bypassa RLS per scritture; corretto ma da auditare. |
| **m² mancanti** | Fallback 100 m² se superficie non impostata. |
| **Rigenera piano** | Cancella tutto il calendario stagionale pianificato (perdita personalizzazioni manuali future). |
| **Test** | Nessuna suite test automatizzata documentata. |
| **i18n** | Solo italiano. |
| **Mobile** | UI responsive base, non PWA nativa. |
| **Tabella Prodotti** | Nome case-sensitive `Prodotti`; non in migration SQL repo. |

---

## 12. File chiave del codice

| Percorso | Ruolo |
|----------|--------|
| `web/src/pages/Dashboard.jsx` | UI dashboard, radar, calendario |
| `web/src/pages/Chat.jsx` | Upload foto, report |
| `web/src/lib/pratoStats.js` | Calcolo esagono |
| `web/server/analizzaPratoCore.mjs` | Orchestrazione analisi foto |
| `web/server/pianoStagionale.mjs` | Generazione piano annuale |
| `web/server/prodottiCatalogo.mjs` | Scelta prodotto + dose/m² |
| `web/server/aggiornaPianoDaFoto.mjs` | Modifica calendario post-foto |
| `web/server/interventiFromReport.mjs` | Persist interventi |
| `web/server/weatherCore.mjs` | Meteo Open-Meteo |
| `crawler/ingest_calendario_verde.py` | Ingest Calendario Verde |
| `crawler/ingest_bottos_drive.py` | Ingest PDF catalogo |
| `sql/*.sql` | Schema e patch DB |

---

## 13. Domande per la valutazione Gemini

Si chiede al revisore di analizzare e rispondere (con punteggio 1–10 e motivazione) su:

### A. Qualità agronomica
1. Il flusso vision → report → interventi è coerente per un giardiniere italiano?
2. Le categorie di intervento e la stagionalità del piano annuale sono realistiche?
3. La regola prodotti (Bottos vs fitofarmaci) è sensata commercialmente e tecnicamente?
4. Il calcolo dose/m² è presentato in modo chiaro e sicuro (risk: sottodosaggio/sovradosaggio)?

### B. Architettura software
5. La separazione SPA / API serverless / Supabase è appropriata per scalare a 1000 utenti?
6. Il RAG (3072 dim, HNSW halfvec) è configurato correttamente? Alternative?
7. Manca caching, code async o job per piano annuale?

### C. UX e prodotto
8. Il radar esagono comunica davvero lo “stato prato” o è gimmick?
9. Il calendario mese-per-mese è la migliore UX vs vista settimana/lista?
10. Cosa manca per un MVP vendibile (paywall, notifiche, storico foto, export PDF)?

### D. Sicurezza e compliance
11. Rischi GDPR (foto giardino, geolocalizzazione, profilo)?
12. Disclaimer medico/agronomico sufficiente?

### E. Roadmap prioritaria
13. Top 5 miglioramenti a massimo impatto con minimo sforzo.
14. Top 3 rischi che potrebbero far fallire il prodotto in beta.

---

## 14. Prompt suggerito per avviare la revisione

```
Sei un revisore senior: agronomo turfgrass + architect software + product manager.

Leggi la relazione AgriPocket allegata. Produci:

1. Executive summary (max 15 righe)
2. Tabella punteggi 1–10 sulle 14 domande della sezione 13
3. Bug logici o incoerenze nel flusso foto → piano → prodotti
4. Proposta architettura migliorata (diagramma testuale)
5. Copy UX per disclaimer e messaggi errore critici
6. Backlog prioritizzato (MoSCoW) per 4 settimane di sviluppo

Sii critico e specifico. Cita rischi di dosaggio fitosanitario e responsabilità legale in Italia.
```

---

*Documento generato per review esterna — AgriPocket, maggio 2026.*
