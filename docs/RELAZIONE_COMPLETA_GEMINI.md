# AgriPocket / Solum — Relazione completa per Gemini

**Data:** maggio 2026  
**Repository:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app  
**Commit di riferimento:** `4f56304` e successivi (`main`)  
**Stack:** React 19 + Vite 6 · Supabase (Auth, Postgres, Storage, pgvector) · Gemini 2.5 Flash · Open-Meteo · Vercel Serverless (`web/`)

**Documenti di approfondimento modulo:**
- `docs/RELAZIONE_IRRIGAZIONE_GEMINI.md` — motore irrigazione, linee centralina, cycle-soak
- `docs/RELAZIONE_CALENDARIO_GEMINI.md` — piano annuale, fitofarmaci, filtri
- `docs/RELAZIONE_CRITICA_GEMINI.md` — audit P0/P1, rischio legale, backlog
- `docs/PROMPT_GEMINI_REVISIONE.txt` — prompt copia-incolla per revisione severa

---

## ISTRUZIONI PER GEMINI (leggere per prime)

Sei un **revisore senior indipendente** con competenze integrate:

1. **Agronomo turfgrass** — prati da giardino in Italia (non stadio professionale).
2. **Ingegnere software** — architettura SPA, serverless, Supabase, RAG.
3. **Product manager B2C** — onboarding, fiducia, responsabilità legale fitosanitari.

**Obiettivo:** comprendere AgriPocket/Solum **nello stato attuale (maggio 2026)** e produrre una relazione utile al team: cosa funziona, cosa è fragile, cosa manca per un lancio commerciale.

**Tono:** severo ma costruttivo. Ogni critica con **impatto** + **remediation** proposta.

### Output richiesto (struttura obbligatoria)

1. **Executive summary** (max 25 righe) — beta pronta / rischiosa / non pronta.
2. **Mappa moduli** — tabella: modulo | promessa UX | file chiave | dipendenze | rischio.
3. **Coerenza dati** — flusso profilo → mappa → meteo → irrigazione → calendario → radar → stato clinico (punti di rottura).
4. **Top 12 criticità** P0/P1/P2.
5. **Validazione agronomica** — irrigazione per linea, esposizione in mappa, overseeding ombra, fitofarmaci.
6. **Validazione UX** — onboarding, dashboard, calendario separato, widget compatti.
7. **Rischio legale Italia** — GDPR, fitosanitari, disclaimer.
8. **Backlog MoSCoW** 4 settimane (max 15 item).
9. **5 punti di forza reali** (non marketing vuoto).

---

## 1. Visione prodotto

**Solum / AgriPocket** è un assistente agronomico **consumer/prosumer** per chi ha un prato in casa (giardino, ornamentale, sportivo leggero).

| Bisogno utente | Soluzione nell'app |
|----------------|-------------------|
| Capire com'è il prato | Foto → Gemini Vision → `vision_json` + report Markdown |
| Sapere cosa fare e quando | Calendario annuale (`prato_interventi`) + adattamenti meteo |
| Quanto irrigare oggi | Motore ET0 − pioggia → minuti per **linea centralina** |
| Dove è ombra / sole | Poligoni in mappa (`esposizione`: sole, mezz'ombra, ombra) |
| Quanto seme per zone ombra | `suggestOmbraSeed` da geometria mappa |
| Monitorare salute | Radar esagono 0–100 + **Stato clinico attuale** (semaforo) |

**Non è:** gestionale greenkeeper, certificazione fitosanitaria, collegamento MQTT alla centralina reale, sostituto obbligo agronomo abilitato.

**Knowledge base (offline):** crawler Python → tabella `tgif_knowledge_base` (~11k chunk, embedding 3072, RPC `match_documenti`). Fonti: Bottos (Calendario Verde, catalogo PDF), manuali, blog tecnici.

---

## 2. Architettura runtime

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser — React SPA (web/src/)                                  │
│  / → /login → /onboarding → /dashboard | /chat | /calendario     │
└────────────────────────────┬─────────────────────────────────────┘
                             │ JWT Supabase Auth
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Supabase                                                        │
│  • usersagropocket (profilo app)                                 │
│  • prato_profilo, prato_analisi, prato_interventi, prato_jobs     │
│  • Prodotti (~158 SKU)                                           │
│  • tgif_knowledge_base (RAG, vector 3072, HNSW halfvec)           │
│  • Storage bucket prato-foto                                     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vercel Serverless (web/api/*.js → web/server/*.mjs)             │
│  analizza-prato, genera-piano, irrigazione-giornaliera,          │
│  adatta-calendario-meteo, meteo, chat-zona, raccomandazione-semina│
│  reset-profilo, job-status, foto-url                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     Google Gemini 2.5 Flash          Open-Meteo (+ layer agronomico)
     (vision, JSON, report, embed)     ET0, pioggia, T suolo, GDD
```

**Dev locale:** `cd web && npm run dev` — API esposte da `vite-plugin-analizza.mjs`.  
**Deploy:** directory root Vercel = `web/`; alias produzione `agripocket-azure.vercel.app`. Deploy manuale: `npx vercel --prod` da `web/`.

---

## 3. Percorsi utente e route

| Route | Componente | Funzione |
|-------|------------|----------|
| `/` | `Home.jsx` | Landing; link dashboard se loggato |
| `/login` | `Login.jsx` | Auth Supabase |
| `/onboarding` | `Onboarding.jsx` | Wizard profilo + mappa obbligatoria + disclaimer |
| `/dashboard` | `Dashboard.jsx` | Hub: meteo, irrigazione, stato clinico, radar, mappa, consulente foto |
| `/chat` | `Chat.jsx` | Analisi foto prato |
| `/calendario` | `CalendarioLavori.jsx` | Calendario lavori (pagina dedicata) |

**Gate:** senza `onboarding_completato` e `disclaimer_accettato_at` → redirect `/onboarding`.

**Brand header (dashboard):** logo PNG `/brand/solum-mark.png` (verde allineato a `#2e7d32`), payoff *la scienza sotto il verde* in **Cormorant Garamond corsivo**.

---

## 4. Onboarding (maggio 2026)

File: `web/src/data/onboardingSteps.js`, `web/src/pages/Onboarding.jsx`.

### Step wizard (scelta singola + problemi multi)

1. Uso prato (giardino, ornamentale, sport, professionale)
2. Tipo terreno (sabbioso, medio, argilloso, non_so)
3. Irrigazione (automatica, manuale, pioggia)
4. Età prato, obiettivo, livello impegno
5. Frequenza taglio (incluso **robot**), altezza taglio, animali
6. Problemi noti (multi, opzionale)

**Rimosso dall'onboarding (maggio 2026):**
- Step **«Quanto sole ha il prato?»** (`esposizione`: sole_pieno / mezzombra / ombra)
- Campo avanzato **«Quanta superficie è in ombra?»** (`ombra_zone_pct`)

L'esposizione si disegna **solo in dashboard → Mappa del prato → Sole / ombra**.

### Step finale («Ultimi dettagli»)

- Obbligatori: **località**, **superficie m²** (da poligono Google Maps), **disclaimer legale**
- Opzionali: pendenza, ristagni, pH, note terreno
- Testo: sole/ombra/irrigatori/pendenza si segnano **dopo in Dashboard**

---

## 5. Modello dati Supabase

### 5.1 `prato_profilo` (1:1 utente)

| Gruppo | Campi principali |
|--------|------------------|
| Contesto | `uso`, `obiettivo`, `tipo_terreno`, `irrigazione`, `eta_prato`, `frequenza_taglio`, `altezza_taglio_cm`, `animali`, `problemi_noti[]`, `livello_impegno` |
| Sito | `localita`, `superficie_mq`, **`prato_zone`** (jsonb), `ombra_zone_pct` (legacy, da poligoni) |
| Irrigazione smart | `tipo_irrigatori`, `tempo_irrigazione_base`, `irrigazione_oggi` (jsonb snapshot), `irrigazione_oggi_aggiornato` |
| Legacy | `esposizione` (sole_pieno/mezzombra/ombra) — ancora in DB, non più chiesto in onboarding |
| Legal | `disclaimer_accettato_at`, `onboarding_completato` |

Patch SQL irrigazione: `sql/patch_irrigazione_avanzata.sql`.

### 5.2 `prato_zone` (JSON in profilo)

```json
{
  "version": 1,
  "poligono": [{ "lat": 44.5, "lng": 11.3 }, ...],
  "zone": [
    { "id": "z_...", "tipo": "irrigatore", "lat": 44.5, "lng": 11.3, "modalita": "statico|rotator|dinamico", "linea": 1 },
    { "id": "z_...", "tipo": "esposizione", "livello": "sole|mezzombra|ombra", "path": [...] },
    { "id": "z_...", "tipo": "pendenza", "from": {...}, "to": {...} }
  ]
}
```

**Tipi attivi in UI (mappa dashboard):** `irrigatore`, `esposizione`, `pendenza`.  
**Muschio:** supportato nel modello (`normalizeZone`) e in mappe vecchie, **rimosso dall'editor** maggio 2026.  
**Legacy `tipo: "ombra"`:** migrato a `esposizione` + `livello: "ombra"` in lettura.

File modello: `web/src/lib/pratoZone.js`, `web/server/pratoZone.mjs` (mirror server).

### 5.3 `prato_analisi`

- `vision_json` — JSON strutturato Gemini (specie, stato_generale, problemi, malattie, punteggi assi…)
- `report_markdown` — report discorsivo
- `foto_path` / `foto_url` — storage
- `chunks_used` — metadati RAG

### 5.4 `prato_interventi`

| Campo | Valori / note |
|-------|----------------|
| `categoria` | taglio, irrigazione, concime, trattamento, pulizia, diserbo, arieggiatura, biostimolante, umettante, rinnovo, altro |
| `fonte` | `calendario_stagionale`, `ia_foto`, `controllo_mensile` |
| `stato` | pianificato, completato, (sospeso da adattamento dinamico) |
| `priorita` | alta, media, bassa |
| `manual_override` | pin al rigenera piano |
| `dettaglio_trattamento` | jsonb — fitofarmaco, dosi, adattamento meteo (patch) |

**Nota irrigazione:** il calendario **non** dovrebbe più generare task generici «irrigazione»; la fonte operativa è il widget **Irrigazione di oggi**.

### 5.5 `Prodotti` e RAG

Catalogo commerciale strutturato (dose/m², categorie FITO/CONCIME/SEMENTI…).  
`tgif_knowledge_base` + RPC `match_documenti` per contesto Gemini.

---

## 6. Dashboard — moduli UI

Ordine visivo approssimativo in `Dashboard.jsx`:

### 6.1 Header brand (`DashPageHeader.jsx`)

- Logo Solum, tagline animata, nav: Dashboard / Analisi foto / Calendario
- Rotatore impostazioni profilo (`impostazioniProfilo.js`)

### 6.2 Consulente zona foto (`ConsulenteZonaFoto.jsx`)

Barra stile Google per domande rapide con contesto zona.

### 6.3 Meteo (`WeatherCard.jsx`)

- `GET /api/meteo` via `fetchMeteoForCity`
- Bundle: corrente + `agronomic` (ET0, GDD, T suolo 10 cm, forecast daily)

### 6.4 Irrigazione di oggi (`IrrigationWidget.jsx`)

**Comportamento maggio 2026 — compatto:**

- Vista chiusa: riepilogo **Linea 1 → X min**, **Linea 2 → Y min**, totale
- Click espande: dettagli per linea (mm, cicli, ora 6:30, ombra su testa)
- API: `/api/irrigazione-giornaliera`
- Cache: `sessionStorage` giornaliera; evento `agripocket:refresh-irrigazione`

**Motore** (`motoreIrrigazione.mjs`):

- Bilancio idrico a **serbatoio** (capacità campo × MAD), forecast 7 gg
- `mm_oggi = ET0 × Kc_stagionale × mod_ombra − pioggia_utile`
- Programma per **`linea` centralina (1–8)**, non per tipo irrigatore aggregato
- Ombra: `computeEsposizioneWeightedPct` + peso per testa in poligono
- Pendenza: cycle-soak se testa vicina freccia (~12 m)
- Azioni: `IRRIGA`, `AUMENTA`, `DIMINUISCI`, `MANTIENI`, `SPEGNI`

### 6.5 Stato clinico attuale (`StatoClinicoWidget.jsx`)

**Semaforo** da `calcolaStatoClinico` (`statoClinico.js`):

| Livello | Quando |
|---------|--------|
| grigio | Nessuna foto analizzata |
| verde | Nessuna patologia grave |
| giallo | Stress termico (ET0, GDD, caldo) o patologie medie |
| rosso | Stato critico / patologia alta |

**Alert meteo** (`meteoIrrigazioneAlert.js`):

- Confronto snapshot meteo vs ultimo calcolo irrigazione
- Soglie assolute: caldo secco, pioggia forte, suolo caldo/freddo
- Pulsanti: **Aggiorna irrigazione** (force API + scroll widget), **Aggiorna calendario** (`POST /api/adatta-calendario-meteo` → sposta diserbi/rinnovi per T suolo)

### 6.6 Stato prato — radar (`PratoRadar.jsx`)

- 6 assi da `vision_json` (foto valida 30 gg)
- Media centrale colore **`#2e7d32`** (`.prato-radar__media`)
- Penalità lavori **scaduti** (max −15 pt per asse)

### 6.7 Analisi Gemini espandibile (`StatoClinicoGeminiBar.jsx`)

Sintesi da `vision_json` + `report_markdown`.

### 6.8 Mappa del prato (`PratoZoneEditor.jsx` + `LawnMapModal.jsx`)

Tre funzioni (senza muschio):

| Pulsante | Mappa dedicata | Freccia ▾ riepilogo |
|----------|----------------|---------------------|
| Irrigatori | Tap getto + tipo + **linea** | Conteggio per linea, note cycle-soak |
| Sole / ombra | Poligono → sole / mezz'ombra / ombra | **Seme zone ombra** (miscela, dose g/m², finestre) |
| Pendenza | Freccia direzione acqua | Grado pendenza, teste vicine |

File hint: `web/src/components/zoneMapHints/`.

### 6.9 Analisi suolo (`AnalisiSuoloAlert.jsx`)

Se `vision_json.richiede_analisi_suolo`.

---

## 7. Calendario lavori (`/calendario`)

File: `CalendarioLavori.jsx`, `CalendarioInterventi.jsx`, `TreatmentCard.jsx`.

| Feature | Dettaglio |
|---------|-----------|
| Generazione | `POST /api/genera-piano` → job async `pianoStagionale.mjs` |
| Auto-generazione | Se località ok e nessun `calendario_stagionale` al primo accesso |
| Vista | Accordion mese → giorno; filtri tipo/periodo |
| Fitofarmaci | `regoleFitofarmaci.mjs` — no dose automatica curativa senza evidenza |
| Pin | `manual_override` sopravvive al rigenera |
| Adattamento meteo | `adattaDateCalendarioPerSuolo` (API dedicata o pipeline post-piano) |
| Overseeding ombra | `ensureOmbraOverseedInterventi` se poligoni ombra in mappa |

**Abitudini** (taglio, irrigazione routine): card separata, non nel calendario lavori.

---

## 8. Analisi foto (`/chat`)

Pipeline (`analizzaPratoCore.mjs` e satellite):

1. Upload → Storage
2. Gemini Vision → `vision_json`
3. RAG KB → contesto
4. Report Markdown
5. Interventi urgenti `ia_foto`
6. Arricchimento catalogo prodotti (dosi solo dove ammesso)
7. `aggiornaPianoDaFoto.mjs` — modifica piano esistente
8. Redirect dashboard con banner

---

## 9. API serverless — elenco

| Endpoint | Metodo | Modulo |
|----------|--------|--------|
| `/api/analizza-prato` | POST | Vision + piano |
| `/api/genera-piano` | POST | Piano annuale (job) |
| `/api/irrigazione-giornaliera` | GET/POST | Motore irrigazione |
| `/api/adatta-calendario-meteo` | POST | Sposta date diserbo/rinnovo per T suolo |
| `/api/meteo` | GET | Open-Meteo bundle |
| `/api/chat-zona` | POST | Q&A contestuale zona |
| `/api/raccomandazione-semina` | GET | Essenza / finestra semina |
| `/api/reset-profilo` | POST | Reset utente |
| `/api/job-status` | GET | Poll job async |
| `/api/foto-url` | GET | Signed URL foto |

Auth: header `Authorization: Bearer <supabase_jwt>`.

---

## 10. File chiave (mappa rapida)

| Area | Path |
|------|------|
| Zone / mappa | `web/src/lib/pratoZone.js`, `web/server/pratoZone.mjs` |
| Motore irrigazione | `web/server/motoreIrrigazione.mjs`, `web/server/irrigazioneInput.mjs` |
| Input normalizzazione | `web/server/irrigazioneInput.mjs` → `analizzaContestoIrrigazioneMappa` |
| Piano stagionale | `web/server/pianoStagionale.mjs`, `pianoDaCatalogo.mjs`, `pianoAdattivo.mjs` |
| Fitofarmaci | `web/server/regoleFitofarmaci.mjs`, `bottosFitofarmaci.mjs` |
| Vision foto | `web/server/analizzaPratoCore.mjs` |
| Meteo alert UI | `web/src/lib/meteoIrrigazioneAlert.js`, `StatoClinicoWidget.jsx` |
| Irrigazione UI | `web/src/components/IrrigationWidget.jsx` |
| Onboarding | `web/src/data/onboardingSteps.js` |
| Stili dashboard | `web/src/styles-dashboard.css` |

---

## 11. Formule irrigazione (sintesi per revisore)

```
cap = capacitaCampo(terreno)     // 8 / 14 / 20 mm
MAD = 0.5 × cap
Per giorno in forecast:
  suolo -= ET0 × Kc_stag(mese) × mod_ombra(%)
  suolo += pioggiaEfficace(precip, suolo, cap)
  se suolo ≤ MAD → irriga, mm = cap − suolo

mm_oggi → ripartito per LINEA centralina (non ÷ n_teste)
mod_linea = f(teste in poligoni ombra/mezzombra sulla linea)
minuti = mm_linea / pluviometria_mm_h × 60
cycle-soak se pendenza vicina e minuti > 15
```

Pluviometrie indicative mm/h: statici 35, rotator 15, dinamico 12.

---

## 12. Esposizione e seme ombra

- Poligoni `esposizione` con `livello` e `peso_ombra` (0 / 0.5 / 1)
- `computeOmbraZoneAreas` → m² e % per area
- `suggestOmbraSeed` → miscela (es. Poa supina + Festuca rubra), g/m², finestre marzo-aprile / settembre
- Prompt e piano: `formatOmbraSeedForPrompt`, `ensureOmbraOverseedInterventi`

---

## 13. Limiti noti e debito tecnico

| Area | Limite |
|------|--------|
| Centralina | Nessun comando reale; solo consiglio testuale |
| Copertura irrigatori | Nessun poligono getto; ripartizione equa per linea |
| Kc | RAG opzionale; fallback 0.75 / stagionale in codice |
| Muschio | Rimosso da UI; dati legacy in DB |
| `esposizione` profilo | Campo legacy; mappa ha priorità |
| Timeout | `genera-piano` / `analizza-prato` fino 120 s Vercel |
| Costi | Ogni foto e rigenera piano = chiamate Gemini |
| Legal | Fitofarmaci: riferimenti catalogo, non prescrizione |

---

## 14. Changelog rilevante (maggio 2026)

- Irrigazione: programma per **linea centralina** (1–8), bilancio serbatoio, widget compatto espandibile
- Mappa: **esposizione** sole/mezz'ombra/ombra (poligoni); ombra/pendenza pesano su motore
- Onboarding: **ripristinato** step esposizione prevalente (fallback se mappa vuota)
- Calendario: `ensureMatriceNPKObbligatoria` inietta N autunnale/primaverile se assenti post-LLM
- Calendario UI: sezione «Interventi in sospeso / in ritardo»; livello Base max 15 interventi
- Irrigazione widget: rimosso totale minuti fuorviante tra linee
- Stato clinico: alert meteo + pulsanti aggiorna irrigazione/calendario
- Mappa UI: hint per funzione; muschio rimosso; seme ombra solo in hint esposizione
- Brand: logo Solum PNG verde `#2e7d32`; tagline Cormorant corsivo
- Rimossa card irrigazione sotto mappa (`IrrigationZoneCard`)

---

## 15. Domande per la revisione Gemini (checklist)

1. Il motore irrigazione per **linea** è agronomicamente difendibile senza poligoni di copertura?
2. La rimozione dell'esposizione in onboarding a favore della mappa crea attrito per utenti senza pazienza cartografica?
3. Gli alert meteo nello stato clinico sono troppo sensibili / troppo timidi?
4. Il calendario (28–45 interventi + catalogo) è gestibile per un B2C?
5. Le regole fitofarmaci rispettano il quadro normativo italiano?
6. L'esagono con penalità solo su scaduti è comprensibile per l'utente?
7. L'overseeding ombra da mappa è corretto botanicamente (miscele/dosi)?
8. Il cycle-soak per pendenza è sufficiente su argilla?
9. Quali P0 bloccano un beta test con 50 utenti reali?
10. Cosa manca per integrazione centralina (Rain Bird, Gardena, ecc.) a livello UX?

---

## 16. Come usare questo documento

- **Revisione full-stack:** leggi questo file + `RELAZIONE_CRITICA_GEMINI.md`, poi rispondi con la struttura in cima.
- **Solo irrigazione:** `RELAZIONE_IRRIGAZIONE_GEMINI.md`.
- **Solo calendario:** `RELAZIONE_CALENDARIO_GEMINI.md`.
- **Prompt pronto:** `docs/PROMPT_GEMINI_REVISIONE.txt`.

*Fine relazione — generata per allineamento team e revisori Gemini, maggio 2026.*
