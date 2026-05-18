# AgriPocket — Relazione per revisione critica (Gemini)

**Data:** maggio 2026  
**Repository:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app  
**Stack:** React 19 + Vite 6 · Supabase (Auth, Postgres, pgvector, Storage) · Gemini 2.5 Flash · Vercel Serverless (`web/`)

---

## ISTRUZIONI PER GEMINI (leggere per prime)

Sei un **revisore senior indipendente** con tre competenze obbligatorie: **agronomo turfgrass** (prati da giardino in Italia), **architetto software**, **product manager B2C**.

**Il tuo compito non è incoraggiare il team.** Devi produrre una **relazione critica**, evidence-based, che evidenzi:

- errori agronomici o legali (fitosanitari, dosi, responsabilità);
- incoerenze tra promessa UX e comportamento reale;
- rischi architetturali, costi, timeout, sicurezza;
- debolezze di prodotto che impedirebbero un lancio commerciale.

**Tono:** severo, preciso, costruttivo. Niente frasi generiche (“ottimo lavoro”). Ogni critica deve avere **impatto** e, se possibile, **remediation**.

**Output richiesto (struttura obbligatoria):**

1. **Executive summary** (max 20 righe) — verdetto complessivo: pronto / beta rischiosa / non pronto.
2. **Tabella punteggi 1–10** sulle 20 domande della sezione 10 (con 1 riga di motivazione per voce).
3. **Top 10 criticità** ordinate per gravità (P0/P1/P2).
4. **Incoerenze flusso** foto → vision_json → piano → prodotti → radar → calendario (diagramma testuale dei punti di rottura).
5. **Rischio legale Italia** (fitosanitari, GDPR foto+geolocalizzazione, disclaimer).
6. **Backlog MoSCoW** 4 settimane (max 15 item).
7. **Cosa tenere** (max 5 punti di forza reali, non marketing).

---

## 1. Visione prodotto

**AgriPocket** è un web app per **proprietari di prato** (giardino, ornamentale, sportivo, non stadio professionale) che vogliono:

| Bisogno | Come lo affronta l’app |
|--------|-------------------------|
| Capire lo stato del prato | Foto → vision Gemini → report Markdown + radar esagono 0–100 |
| Sapere cosa fare e quando | Calendario annuale 50–90 lavori + controlli mensili foto |
| Dosare prodotti | Catalogo `Prodotti` (~158 SKU), dose = dose/m² × superficie da mappa |
| Contesto sito | Onboarding (uso, obiettivo, taglio, animali…), mappa Google, zone (ombra, irrigatori, muschio, pendenza) |

**Non è:** gestionale greenkeeper, certificazione fitosanitaria, sostituto obbligo agronomo abilitato.

**Knowledge base offline:** crawler Python → `tgif_knowledge_base` (~11k chunk, embedding 3072, RAG `match_documenti`). Fonti: Bottos (Calendario Verde, PDF catalogo), NCSU, blog tecnici.

---

## 2. Architettura runtime

```
Browser (SPA)
  /login → /onboarding → /dashboard | /chat
       ↓ JWT Supabase
Supabase: prato_profilo, prato_analisi, prato_interventi, prato_jobs, Prodotti, tgif_knowledge_base
       ↓
Vercel (web/api/*): analizza-prato, genera-piano, reset-profilo, job-status, meteo
       ↓
Gemini 2.5 Flash (vision, JSON, report) + gemini-embedding-001 (RAG)
```

**Dev:** `npm run dev` in `web/` — API via `vite-plugin-analizza.mjs`.  
**Deploy:** Vercel root = `web/`; produzione `agripocket-azure.vercel.app`. Push GitHub non sempre triggera deploy → a volte `npx vercel --prod` manuale.

---

## 3. Modello dati essenziale

### `prato_profilo` (1:1 utente)
- Contesto: `uso`, `obiettivo` (estetico/resistente/bassa manutenzione), `frequenza_taglio` (incluso **robot**), `eta_prato`, `animali`, `problemi_noti[]`
- Sito: `localita`, `superficie_mq`, **`prato_zone`** (JSON: poligono prato, layer irrigatori/ombra/muschio/pendenza, `ombra_zone_pct`)
- `onboarding_completato`, `disclaimer_accettato_at`

### `prato_interventi`
- `categoria`: taglio, irrigazione, concime, trattamento, pulizia, diserbo, arieggiatura, biostimolante, umettante, rinnovo, altro
- `fonte`: `calendario_stagionale` | `ia_foto` | `controllo_mensile`
- `priorita`, `stato`, `data_prevista`, `manual_override` (pin al rigenera piano)
- Opzionale: `prodotto_*`, `dose_*`

### `prato_analisi`
- `vision_json` (stato_generale, specie, problemi, stress, malattie…)
- `report_markdown`, `foto_url` (storage `prato-foto`)

---

## 4. Pipeline IA (dettaglio)

### 4.1 Analisi foto (`analizzaPratoCore.mjs`)
1. Vision multimodale → JSON strutturato (specie latino, stato_generale ottimo/buono/discreto/critico)
2. RAG su KB (embedding query)
3. Report Markdown agronomico
4. Interventi urgenti → `fonte: ia_foto` (`interventiFromReport.mjs`)
5. Arricchimento prodotti + dosi (`prodottiCatalogo.mjs`)
6. Integrazione nel piano stagionale esistente (`aggiornaPianoDaFoto.mjs`)

**Regole fitofarmaci** (`regoleFitofarmaci.mjs`, `bottosFitofarmaci.mjs`):
- Fungicidi/insetticidi/diserbi **curativi** solo con evidenza foto o profilo
- Pre-emergenza / antigerminanti ammessi senza foto
- Preferenza prodotti **Bottos** (Fly, Trichoderma, ecc.)

### 4.2 Piano annuale (`pianoStagionale.mjs`)
- Input: profilo + meteo + RAG + `livelloConcimi` da obiettivo/uso/frequenza taglio
- Output: 50–90 interventi datati, merge catalogo, filtro fitofarmaci, controlli mensili foto in memoria
- Persist: cancella `calendario_stagionale` pianificati non pinati
- Durata: 1–2 min (job async `prato_jobs` se tabella presente)

**Bug storico corretto:** i controlli mensili foto venivano creati prima del piano e bloccavano la generazione automatica; ora si usa `haCalendarioStagionale()` invece di `interventi.length > 0`.

### 4.3 Zone ombra (`pratoZone.mjs`)
- Calcolo % area ombra da poligoni mappa
- Suggerimento seme overseeding + interventi calendario (`ensureOmbraOverseedInterventi`)

### 4.4 Radar stato prato (`pratoStats.js`, client)
6 assi 0–100: idratazione, nutrizione, copertura, salute_fogliare, difesa, manutenzione.

Fonti: `vision_json` (peso per freschezza foto), interventi urgenti scaduti (non tutto il piano stagionale), meteo (idratazione).

**Problema segnalato dagli utenti:** prato “bellissimo” ma media ~62. Mitigazioni recenti: prompt vision meno pessimista, pavimento minimo media se stato ottimo/buono, peso calendario ridotto se vision alta.

---

## 5. UX attuale (maggio 2026)

| Route | Funzione |
|-------|----------|
| `/onboarding` | Wizard + mappa hero; **esci senza salvare** se profilo già completo |
| `/dashboard` | Meteo, radar, mappa profilo, zone editor, calendario con **filtri** (Tutti / Trattamenti / Lavori giardino × Mese / Anno), reset profilo |
| `/chat` | Foto prato → analisi |

**Calendario:** accordion mese → giorno → lavori; checkbox completamento; pin “mantieni al rigenera”; CTA foto per `controllo_mensile`.

**Sicurezza UX fitofarmaci:** dosi non automatiche su diserbi/fungicidi/insetticidi in UI; avvisi legali.

---

## 6. API serverless

| Endpoint | Ruolo |
|----------|--------|
| `POST /api/analizza-prato` | Pipeline foto completa |
| `POST /api/genera-piano` | Piano annuale (async job) |
| `POST /api/reset-profilo` | Cancella interventi, analisi, foto storage, azzera profilo (service role) |
| `GET /api/job-status` | Poll job |
| `GET /api/meteo?city=` | Bundle meteo |

---

## 7. SQL patch (da applicare manualmente su Supabase)

`prato_profilo.sql`, `prato_dashboard.sql`, `patch_interventi_categorie.sql`, `patch_match_documenti.sql`, `patch_prato_zone.sql`, `patch_profilo_contesto.sql`, `patch_frequenza_robot.sql`, `patch_foto_analisi.sql`, `patch_sicurezza_beta.sql`, `patch_ensure_usersagropocket.sql`

---

## 8. Punti di forza (da verificare critcamente)

1. RAG su corpus dominio reale (non solo prompt).
2. Loop chiuso foto → calendario → radar.
3. Personalizzazione profilo + mappa + zone.
4. Regole commerciali/tecniche Bottos codificate.
5. Calendario denso e filtrabile.

*Gemini: per ogni punto, indica se è **dimostrato** o **marketing non sostenuto**.*

---

## 9. Limiti e debito tecnico (auto-dichiarati)

| Area | Problema |
|------|----------|
| Timeout Vercel | Analisi/piano al limite; job async parziale |
| Costi Gemini | Multi-call per foto + piano grande |
| Accuratezza IA | Nessuna validazione umana; specie/diagnosi possono errare |
| Deploy | GitHub→Vercel non sempre automatico |
| Test | Nessuna suite automatizzata |
| GDPR | Foto giardino + geolocalizzazione |
| Responsabilità fitosanitari | Utente finale applica prodotti |
| m² default | Fallback se mappa non completata |
| Rigenera piano | Cancella lavori stagionali non pinati |

---

## 10. Domande per valutazione (rispondere tutte, 1–10)

### A. Agronomia e sicurezza
1. Il flusso vision → interventi → prodotti è agronomicamente difendibile in Italia?
2. Le regole “fitofarmaco solo con foto” sono sufficienti o troppo permissive?
3. Il piano stagionale 50–90 interventi è realistico o sovraccarica l’utente?
4. L’ombra → overseeding è corretto senza analisi su specie in miscuglio?
5. Il radar 0–100 può indurre falsi sicuri / falsi allarmi?

### B. Architettura
6. Serverless + Supabase + Gemini scala a 1k utenti attivi?
7. RAG 3072 halfvec HNSW è configurazione sensata?
8. Service role su reset/calendar è audit-safe?
9. Manca queue/worker robusta per job lunghi?

### C. Prodotto e UX
10. Onboarding è troppo lungo / troppo corto?
11. Filtri calendario coprono i bisogni reali?
12. Manca notifiche, export PDF, storico confronto foto?
13. Il prodotto è distinguibile da “ChatGPT + calendario Google”?

### D. Legal/compliance
14. Disclaimer attuale basta per beta pubblica?
15. Conservazione foto in bucket public: rischio privacy?

### E. Strategia
16. Modello di ricavo plausibile (freemium, affiliate Bottos)?
17. Dipendenza da un solo fornitore KB (Bottos) è rischio?
18. Cosa blocca un MVP in 30 giorni?
19. Top 3 cause di churn prevedibili.
20. Verdetto: investire altri 3 mesi dev — sì/no e perché.

---

## 11. File codice di riferimento

| File | Ruolo |
|------|--------|
| `web/server/analizzaPratoCore.mjs` | Orchestrazione foto |
| `web/server/pianoStagionale.mjs` | Piano annuale |
| `web/server/regoleFitofarmaci.mjs` | Filtri fitofarmaci |
| `web/server/livelloConcimi.mjs` | Tier concimi per obiettivo |
| `web/server/profileContext.mjs` | Profilo nel prompt |
| `web/src/lib/pratoStats.js` | Radar/esagono |
| `web/src/lib/dashboard.js` | Calendario, filtri, sync controlli mensili |
| `web/src/pages/Dashboard.jsx` | UI principale |
| `web/src/pages/Onboarding.jsx` | Wizard |
| `web/src/lib/pratoZone.js` | Zone mappa |

---

*Documento per revisione esterna critica — AgriPocket. Non considerare questo testo come approvazione agronomica o legale.*
