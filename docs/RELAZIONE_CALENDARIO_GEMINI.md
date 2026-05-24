# AgriPocket / Solum — Relazione sul **Calendario stagionale** (per revisione Gemini)

**Data:** maggio 2026  
**Repo:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app  
**Stack:** React 19 · Vite · Supabase · Gemini 2.5 Flash · Open-Meteo · RAG (`tgif_knowledge_base`)  
**Modulo:** generazione e visualizzazione piano manutenzione prato (12 mesi)

---

## ISTRUZIONI PER GEMINI (leggere per prime)

Sei un **revisore senior** con competenze: **agronomia tappeti erbosi (Italia, giardino / sportivo / green)**, **pianificazione fenologica (GDD, ET0, VPD)**, **fitosanitari e PFNPO**, **architetture LLM ibride (deterministico + LLM narrativo)**.

**Obiettivo:** analizzare il **calendario stagionale Solum** — come nasce, cosa è fisso, cosa fa Gemini, cosa è vietato — e produrre una **relazione critica** con remediation concrete.

**Filosofia prodotto (non negoziabile):**

- Il calendario è **pure agronomy**: molecole, fisiologia, principi attivi generici.
- **Vietati** marchi commerciali, nomi prodotti Bottos, dosi inventate da LLM, date spostate dall’LLM.
- Gemini **non progetta** il piano: **narra** una matrice già calcolata da DB + meteo.

**Output richiesto dalla revisione:**

1. **Executive summary** (max 15 righe) — il calendario è scientificamente coerente / troppo denso / rischioso?
2. **Diagramma testuale** end-to-end: profilo → template → meteo → matrice → Gemini → guardrail → `prato_interventi`.
3. **Tabella criticità** P0/P1/P2 (max 12 voci).
4. **Separazione ruoli:** cosa deve restare deterministico vs cosa può essere LLM.
5. **Copertura geografica:** 4 macro-zone — il proxy `nord_pianura` è accettabile?
6. **Livelli impegno** (base / pro / greenkeeper): il cap a 15/35/50 interventi è equilibrato?
7. **Adattamento meteo** (GDD primavera, ET0 estate): soglie e shift ± giorni sono sensati?
8. **3 mesi campione** (feb, giu, ott) con interventi attesi e molecole — confronto con pratica italiana.
9. **Product mining** (`prodotti_mercato`) vs calendario brand-free: come collegarli senza contaminare i testi?
10. **Roadmap** 3 sprint (must / should / nice).

---

## 1. Cosa vede l’utente (UX)

| Dove | Cosa |
|------|------|
| **Dashboard** `/dashboard` | Lista interventi (`CalendarioInterventi.jsx`), timeline bisogni, checkbox completamento |
| **Onboarding** | Scelta `livello_impegno`: base (~15 interventi strategici/anno), pro (~35), greenkeeper (~50) |
| **API** | `POST /api/genera-piano` → job async (max 120s) → rigenera `prato_interventi` |

**Promessa UX:** piano annuale personalizzato su località, m², specie, livello impegno, meteo live — con spiegazioni biochimiche leggibili, senza pubblicità di prodotti.

**Prerequisiti generazione:**

- `localita` (geocoding / meteo)
- `superficie_mq` verificata (dosi e sicurezza)
- Sessione Supabase valida

---

## 2. Architettura a due livelli (DB-first + voce Gemini)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  prato_profilo (user_id, localita, lat/lon, livello_impegno, uso, m², …)      │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    POST /api/genera-piano.js → generaPianoStagionale()
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
  fetchWeatherBundle          caricaTemplateCalendario    caricaClimaNormale
  (Open-Meteo live)           (Supabase o fallback)       (clima_mese_normale)
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    ▼
              ┌─────────────────────────────────────────────────────┐
              │  LIVELLO 1 — DETERMINISTICO (calendarioBase.mjs)     │
              │  generaCalendarioDeterministico()                    │
              │  • GPS → macro-zona (4 zone Italia)                  │
              │  • Template mese/giorno → data_prevista assoluta     │
              │  • Delta GDD mar-apr → anticipo fino a ±finestra     │
              │  • ET0 picco estate → priorità stress (GABA/prolina)│
              └───────────────────────────┬─────────────────────────┘
                                          │ matrice.interventi[]
                                          ▼
              ┌─────────────────────────────────────────────────────┐
              │  LIVELLO 2 — GEMINI NARRATIVO (pianoStagionale.mjs)  │
              │  arricchisciVoceBiochimica()                          │
              │  • RAG 4 chunk (tgif_knowledge_base)                  │
              │  • SOLO descrizione + timeline_bisogni                │
              │  • date/titolo/molecole INVARIATI                     │
              └───────────────────────────┬─────────────────────────┘
                                          ▼
              ┌─────────────────────────────────────────────────────┐
              │  LIVELLO 3 — GUARDRAIL & ARRICCHIMENTO               │
              │  • arricchisciInterventoEsigenze (molecole derivate) │
              │  • filtraInterventiFitofarmacoCurativo (PFNPO/vision)│
              │  • applicaRegolaTrasemina, ombra/overseed zone        │
              │  • mergeControlliMensili, sanitizzaPianoCompleto     │
              │  • buildTimelineBisogni (UI)                         │
              │  • pipelineAdattamentiPostPiano (focolai, ecc.)      │
              └───────────────────────────┬─────────────────────────┘
                                          ▼
                        persistPianoStagionale → prato_interventi
                        (fonte: calendario_stagionale, stato: pianificato)
```

---

## 3. Database (Supabase)

### 3.1 Template «anno normale»

| Tabella | Scopo |
|---------|--------|
| `clima_mese_normale` | GDD, ET0, pioggia, Kc per mese × 4 macro-zone |
| `calendario_base_intervento` | Interventi template: `mese`, `giorno_mese`, `categoria`, `titolo`, `fabbisogno_fisiologico`, `esigenze_molecolari[]`, `macro_categoria`, `livello_impegno`, `finestra_shift_giorni` |

**Patch SQL:** `sql/patch_calendario_base.sql`  
**Seed:** `node server/scripts/seed_calendario_base.mjs` (da `web/`)

**Macro-zone** (assegnazione da coordinate, non da comune):

| `zona_climatica` | Area indicativa |
|------------------|-----------------|
| `nord_pianura` | Pianura padana, Nord-Est |
| `centro_tirrenico` | Centro Italia tirrenico |
| `sud_isole_arido` | Sud peninsulare, Sicilia, Sardegna |
| `alpino_appenninico` | Alpi, Appennino |

Se manca seed per una zona → **proxy** da `nord_pianura` (nota in `adattamento_dinamico`).

### 3.2 Piano utente

| Tabella | Scopo |
|---------|--------|
| `prato_interventi` | Istanze utente: `data_prevista`, `titolo`, `descrizione`, `categoria`, `priorita`, `fonte`, `manual_override`, campi prodotto/dose opzionali |

Alla rigenerazione: delete righe `fonte=calendario_stagionale`, `stato=pianificato`, `manual_override=false`.

### 3.3 Product mining (separato dal calendario)

| Tabella | Scopo |
|---------|--------|
| `prodotti_mercato` | Etichette commerciali estratte (PDF/OCR + Gemini) |
| `prodotti_mercato_intervento` | N:N verso `calendario_base_intervento` (match molecolare) |

**Patch:** `sql/patch_prodotti_mercato.sql` · **Script:** `server/scripts/data/product_miner.mjs`

I nomi commerciali **non** entrano nei testi del calendario deterministico; il mining alimenta un catalogo parallelo per suggerimenti futuri.

---

## 4. Template interventi (nord_pianura)

**File:** `web/server/scripts/data/interventi_nord_pianura.mjs`  
**Volume:** 59 interventi (9 base / 18 pro / 32 greenkeeper)

### 4.1 Struttura record template

```javascript
{
  livello_impegno: "base" | "pro" | "greenkeeper",
  mese: 2,                    // 1–12
  giorno_mese: 12,            // 1–28 (cap SQL)
  categoria: "concime" | "trattamento" | "diserbo" | "arieggiatura" |
             "biostimolante" | "umettante" | "rinnovo" | "pulizia" | "altro",
  priorita: "alta" | "media" | "bassa",
  titolo: "…",
  fabbisogno_fisiologico: "OBIETTIVO: … 💡 LA SCIENZA: …",
  esigenze_molecolari: ["Ferro chelato Fe-EDDHA …", "…"],
  macro_categoria: "N" | "P" | "K" | "Biostimolante" | "Correttivo" | …,
  finestra_shift_giorni: 7,   // max anticipo/rinvio meteo
  ordine: 100,
}
```

### 4.2 Livelli impegno (runtime)

| Livello | Max interventi strategici/anno (Gemini) | Template inclusi |
|---------|----------------------------------------|------------------|
| `base` | 15 | solo `base` |
| `pro` | 35 | `base` + `pro` |
| `greenkeeper` | 50 | `base` + `pro` + `greenkeeper` |

Config: `web/server/livelloImpegno.mjs`

### 4.3 Temi «magie» integrate (greenkeeper / pro)

Esempi presenti nel seed (da KB OpenAlex, linguaggio divulgativo):

- Silicio / fitoliti, Epichloë endofiti, fitomelatonina  
- Stress memory / HSP, nano-Se, crosstalk etilene–citochinine  
- PGPR / biofilm EPS, poliammine, rete PA–GABA–prolina  
- ISR fosfiti, spoon-feeding, carbohydrate loading, epigenetica rizosfera  
- GABA / prolina / ROS, fluidità membrane, allelopatia  

**Nessun brand** nei testi template.

---

## 5. Motore deterministico (`calendarioBase.mjs`)

### 5.1 Flusso

1. `mapZonaClimaticaFromCoords(lat, lon)` → una delle 4 zone  
2. `livelliImpegnoPerQuery(livello_impegno)` → filtro template  
3. `caricaTemplateCalendario` → Supabase, fallback `INTERVENTI_NORD_PIANURA`  
4. `caricaClimaNormale` → DB o `calendarioBaseData.mjs`  
5. `calcolaDeltaMeteo(meteoBundle, climaNormale)`  
6. Per ogni template: `istanziaIntervento` → `data_prevista`, note `adattamento_dinamico`  
7. Filtra interventi con `data_prevista` ∈ [oggi, fine anno]

### 5.2 Regole adattamento meteo

| Segnale | Soglia | Effetto |
|---------|--------|---------|
| GDD primavera (mar–apr) | live > normale + **15%** | Anticipo date template mar/apr (max `finestra_shift_giorni`, cap 14 g) |
| ET0 estate | live ≥ normale × **1.15** | Interventi stress (GABA, prolina, osmoprotezione…) → `priorita: alta` + nota ET0 |

Campi output utili per UI e prompt Gemini:

- `delta_meteo.gdd_primavera_delta_pct`  
- `delta_meteo.et0_picco_estivo`  
- `adattamento_dinamico` (stringa umana)

---

## 6. Ruolo di Gemini (`arricchisciVoceBiochimica`)

**Modello:** `gemini-2.5-flash` · **Temperatura:** ~0.2 · **Output:** JSON

### 6.1 Cosa Gemini DEVE fare

- Scrivere `descrizione` (2–4 frasi accademiche) per ogni riga della matrice  
- Produrre `timeline_bisogni`: `oggi`, `prossimo_mese`, `finestre_stagionali[]`  
- Usare chunk RAG (max 4) solo come **contesto**, senza inventare interventi

### 6.2 Cosa Gemini NON DEVE fare (vincoli in prompt)

| Vietato | Motivo |
|---------|--------|
| Cambiare `data_prevista` | Le date sono contratto deterministico |
| Cambiare `titolo`, `fabbisogno_fisiologico`, `esigenze_molecolari` | Contenuto scientifico curato / seed |
| Inventare dosi o prodotti | Legalità PFNPO + filosofia Solum |
| Inserire marchi | Pure agronomy |

Se il JSON Gemini è malformato → fallback: `descrizione = fabbisogno_fisiologico`.

### 6.3 Prompt (estratto concettuale)

```
NON inventare interventi, date, dosi o prodotti commerciali.
Ricevi una MATRICE DETERMINISTICA già calcolata da Solum (DB + adattamento meteo).
Ogni data_prevista nell'output DEVE essere IDENTICA all'input.
```

---

## 7. Pipeline post-Gemini

| Step | Modulo | Funzione |
|------|--------|----------|
| Esigenze | `esigenzeAgronomiche.mjs` | `arricchisciInterventoEsigenze`, `buildTimelineBisogni` |
| Fitofarmaci | `regoleFitofarmaci.mjs` | Filtra curativi se utente non PFNPO / vision critica |
| Trasemina | `sanitizzaCalendario.mjs` | Regole finestra semina |
| Zone ombra | `pratoZone.mjs` | Overseed mirato |
| Controlli | `controlliMensili.mjs` | Voci mensili tipo «controllo feltro» |
| Sanitizzazione | `sanitizzaCalendario.mjs` | `sanitizzaPianoCompleto(..., pureAgronomy: true)` |
| Adattamenti | `pianoAdattivo.mjs` | Focolai regionali, ecc. |
| Pre-emergenza | `preEmergenzaAnnuali.mjs` | Da bundle meteo annuale |

**Persistenza:** `persistPianoStagionale` → `prato_interventi`, `fonte: calendario_stagionale`.

---

## 8. Armeria biochimica dinamica (stato: preparata, non in runtime)

**File:** `web/server/scripts/data/armeria_biochimica_dinamica.mjs`  
**Contenuto:** ~25 interventi **tattici** con `trigger_condizione` (VPD, ET0, patogeni, gelo, idrofobia…)

**Nota architetturale:** non sono nel calendario base annuale; il design prevede inserimento **on-demand** quando il trigger è vero (meteo live, vision, storico). **Oggi non sono ancora collegati** a `generaCalendarioDeterministico` né a `pipelineAdattamentiPostPiano`.

---

## 9. Product mining e calendario

```
Etichetta PDF/JPG → product_miner.mjs → prodotti_mercato
                                              │
                                              ▼
                              prodotti_mercato_intervento
                              (match_score vs calendario_base_intervento)
```

**Principio:** il calendario utente resta brand-free; il catalogo commerciale è **parallelo** per:

- Suggerimenti prodotto in UI (`TreatmentCard`, dose da catalogo legacy `"Prodotti"`)  
- Match per `esigenze_molecolari` / `macro_categoria` / token fisiologici  

**Rischio da valutare:** leakage di brand da `prodotti_mercato` nei testi Gemini — oggi il prompt calendario vieta marchi; eventuali link prodotto vanno solo in campi UI dedicati (`prodotto_nome`, `dettaglio_trattamento`).

---

## 10. File sorgente (mappa rapida)

| File | Ruolo |
|------|--------|
| `web/server/calendarioBase.mjs` | Motore deterministico |
| `web/server/calendarioBaseData.mjs` | Clima anno tipo (no shebang — bundle Vite-safe) |
| `web/server/pianoStagionale.mjs` | Orchestrazione + Gemini narrativo |
| `web/server/scripts/seed_calendario_base.mjs` | Seed Supabase (CLI) |
| `web/server/scripts/data/interventi_nord_pianura.mjs` | 59 template nord_pianura |
| `web/server/scripts/data/armeria_biochimica_dinamica.mjs` | Trigger tattici (futuro) |
| `web/server/scripts/data/product_miner.mjs` | Mining etichette |
| `web/server/esigenzeAgronomiche.mjs` | Molecole generiche, timeline |
| `web/server/livelloImpegno.mjs` | Cap interventi per livello |
| `web/api/genera-piano.js` | Endpoint Vercel |
| `web/src/components/calendario/CalendarioInterventi.jsx` | UI lista |
| `sql/patch_calendario_base.sql` | DDL template |
| `sql/patch_prodotti_mercato.sql` | DDL mining |

---

## 11. API e job

| Endpoint | Durata max | Comportamento |
|----------|------------|---------------|
| `POST /api/genera-piano` | 120s | Job async: cancella piano precedente non pinato, rigenera |

**Env server:** `GEMINI_API_KEY`, `SUPABASE_*`, `OPENWEATHER_API_KEY` (meteo).

---

## 12. Checklist operativa (umano / DevOps)

- [ ] Eseguito `sql/patch_calendario_base.sql` in Supabase  
- [ ] Eseguito seed: `npm run seed:calendario-base` (da `web/`)  
- [ ] (Opzionale) `sql/patch_prodotti_mercato.sql` + mining etichette  
- [ ] Vercel Root Directory = `web/` (deploy Git)  
- [ ] Profilo utente con `localita` + `superficie_mq`

---

## 13. Domande aperte per la revisione Gemini

1. **Proxy climatico:** le altre 3 zone usano template padani fino a seed dedicati — bias accettabile o da bloccare in UI?  
2. **Densità greenkeeper:** 50 interventi + testi lunghi — rischio overload utente giardino?  
3. **Gemini temperature 0.2:** sufficiente a evitare deriva su `descrizione`? Serve validazione automatica campo-per-campo?  
4. **Wiring armeria dinamica:** priorità P0 per estate 2026 o rimandare?  
5. **Integrazione vision:** ultima `prato_analisi.vision_json` influenza filtro fitofarmaci ma non sposta date — è sufficiente?  
6. **Confronto Bottos:** il vecchio calendario brand-centric è deprecato — cosa migrare senza perdere valore agronomico?

---

## 14. Riferimenti incrociati

- Chat agronomo (modulo separato): `docs/RELAZIONE_CHIEDI_AGRONOMO_GEMINI.md`  
- Knowledge base RAG: `tgif_knowledge_base`, harvest `cacciatore_scienza.mjs` / `iniettore_scienza.mjs`  
- Guardrail PFNPO: `web/server/regoleFitofarmaci.mjs`, `web/server/agronomicGuardrails.mjs`

---

*Documento generato per audit interno e prompt di revisione esterna Gemini. Aggiornare quando cambiano soglie meteo, seed interventi o vincoli LLM.*
