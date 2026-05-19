# AgriPocket — Relazione sul calendario interventi (per revisione Gemini)

**Data:** maggio 2026  
**Repo:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app/dashboard  
**Stack:** React + Supabase + Gemini 2.5 Flash + Vercel serverless (`web/`)

---

## ISTRUZIONI PER GEMINI (leggere per prime)

Sei un **revisore senior** con competenze: **agronomo turfgrass** (prati da giardino in Italia), **architetto software**, **product manager B2C**.

**Obiettivo:** analizzare il **calendario lavori** di AgriPocket — come viene generato, popolato, filtrato, mostrato e aggiornato — e produrre una **relazione critica** con proposte concrete di miglioramento (logica, UX, agronomia, legalità fitosanitari).

**Tono:** severo, preciso, costruttivo. Ogni critica con **impatto** e **remediation** proposta.

**Output richiesto:**

1. **Executive summary** (max 15 righe) — il calendario è utile / sovraccarico / fuorviante?
2. **Diagramma testuale** dei flussi: onboarding → genera piano → foto → aggiornamenti calendario.
3. **Tabella criticità** P0/P1/P2 (max 12 voci) sul calendario.
4. **Valutazione densità:** 28–45 interventi Gemini + max 18 catalogo + 12 controlli mensili — è giusto per un giardiniere B2C?
5. **Coerenza agronomica:** stagionalità, fitofarmaci, dosi, pre-emergenza, zone ombra.
6. **Coerenza UX:** filtri, auto-generazione, scaduti vs futuri, rapporto con esagono stato prato.
7. **Specifica miglioramenti:** pseudocodice o regole business da implementare (non solo opinioni).
8. **3 scenari utente** con input profilo/foto e calendario atteso ideale.

---

## 1. Cosa promette il prodotto (UX)

Sulla **Dashboard** (`/dashboard`), sezione **«Calendario lavori»**:

| Promessa | Testo / comportamento |
|----------|------------------------|
| Piano annuale completo | CTA «Genera piano annuale completo» / «Rigenera piano annuale» |
| Giorno per giorno | Accordion **mese → giorno → lavori** con checkbox completamento |
| Fitofarmaci sicuri | Nessuna dose automatica su diserbi/fungicidi/insetticidi; solo riferimento catalogo + avviso legale |
| Dosi concimi | Solo se `superficie_mq` verificata sulla mappa |
| Foto mensile | Voce «Controllo mensile — foto del prato» ogni mese |
| Urgenze da foto | Sezione «Urgenti dall'analisi foto» separata |
| Filtri | **Tipo:** Tutti / Trattamenti / Lavori in giardino · **Periodo:** Questo mese / Tutto l'anno |
| Pin lavori | «Mantieni al rigenera» su voci `calendario_stagionale` (`manual_override`) |
| Auto-piano | Se profilo ha località ma **nessun** `calendario_stagionale`, parte generazione automatica al primo accesso dashboard |

**Problemi segnalati dagli utenti / audit:**

- Calendario che mostrava **solo** controlli foto mensili (piano non generato o bloccato).
- Troppi lavori (50–90) difficili da gestire; ora prompt ridotto a 28–45 + catalogo max 18.
- Rigenerare piano **cancellava** tutto (ora: delete solo `calendario_stagionale` non pinati e non completati).
- Lavori **scaduti** abbassano l'esagono ma l'utente non capisce il legame.
- Fitofarmaci in calendario senza evidenza da foto (mitigato da `regoleFitofarmaci.mjs`).

---

## 2. Modello dati — `prato_interventi`

Tabella Supabase (vedi `sql/prato_dashboard.sql` + patch).

| Campo | Tipo | Note |
|-------|------|------|
| `id` | uuid | PK |
| `user_id` | uuid | FK utente |
| `analisi_id` | uuid? | Collegamento analisi foto se `fonte = ia_foto` |
| `titolo` | text | max ~120 char in pratica |
| `descrizione` | text | può includere «Alternative catalogo…» |
| `categoria` | enum | taglio, irrigazione, concime, trattamento, pulizia, diserbo, arieggiatura, biostimolante, umettante, rinnovo, altro |
| `priorita` | alta \| media \| bassa | |
| `stato` | pianificato \| completato | |
| `data_prevista` | date | chiave per ordinamento e scadenze |
| `data_completamento` | date? | |
| `ordine` | int | tie-break cronologico |
| **`fonte`** | text | **`calendario_stagionale`** \| **`ia_foto`** \| **`controllo_mensile`** |
| `manual_override` | bool | pin al rigenera piano |
| `prodotto_id`, `prodotto_nome` | | da catalogo `Prodotti` |
| `dose_totale`, `dose_unita`, `dose_per_mq` | | solo concimi/biostimolanti se m² ok |

**RLS:** utente vede/modifica solo i propri interventi.

---

## 3. Le tre fonti (`fonte`)

### 3.1 `calendario_stagionale`

**Come nasce:**

1. Utente clicca «Genera piano annuale» (o auto-trigger dashboard).
2. API `POST /api/genera-piano` → job async `prato_jobs` → `generaPianoStagionale()` in `web/server/pianoStagionale.mjs`.
3. Pipeline server:
   - RAG: embedding query + `match_documenti` (KB turfgrass/Bottos).
   - **Gemini JSON:** 28–45 interventi con `titolo`, `descrizione`, `categoria`, `priorita`, `data_prevista`.
   - Post-processing:
     - `ensurePreEmergenzaAnnuali` (diserbi pre-emergenza setaria/digitaria se meteo OK).
     - `filtraInterventiFitofarmacoCurativo` (niente fungicidi/insetticidi curativi senza evidenza foto/profilo).
     - `ensureOmbraOverseedInterventi` (zone ombra da mappa).
   - `arricchisciInterventoConProdotto` per ogni voce (catalogo Bottos, dosi se ammesse).
   - `integraCatalogoNelPiano` — fino a **18** voci extra «Catalogo — {nome prodotto}» (1 prodotto/idoneo, priorità bassa/media).
   - `mergeControlliMensili` — 12 mesi avanti «Controllo mensile — foto».
4. `persistPianoStagionale`:
   - **DELETE** `prato_interventi` WHERE `fonte = calendario_stagionale` AND `stato = pianificato` AND `manual_override = false`.
   - **INSERT** nuove righe.

**Rigenerazione:** stesso flusso; i lavori con pin (`manual_override = true`) e i **completati** restano.

### 3.2 `ia_foto`

**Come nasce:**

1. Utente carica foto in `/chat` → `POST /api/analizza-prato` (async job).
2. `analizzaPratoCore.mjs`: vision JSON + report Markdown + RAG.
3. `extractInterventiFromReport` — interventi urgenti dal report (con `quando` / `data_suggerita`).
4. `persistAnalisiAndInterventi`:
   - INSERT `prato_analisi`.
   - DELETE precedenti `ia_foto` pianificati.
   - INSERT nuovi urgenti arricchiti con prodotti.
   - Opzionale: `integraFotoNelPiano` (`aggiornaPianoDaFoto.mjs`) — Gemini propone `aggiungi_calendario` / `modifica_calendario` / `rimuovi_ids` sul piano stagionale esistente.

**Nota:** gli urgenti foto **non** vengono cancellati al rigenera piano annuale.

### 3.3 `controllo_mensile`

**Come nasce:**

- Client: `syncControlliMensili()` in `web/src/lib/dashboard.js` alla refresh dashboard.
- Server: anche in `mergeControlliMensili` durante genera piano.
- Una voce al mese (giorno 12), priorità media, categoria `altro`, link a `/chat?controllo={id}`.
- **Non** inclusi nei filtri «Trattamenti» / «Lavori giardino» (solo in «Tutti»).

---

## 4. Diagramma flusso (testuale)

```
[Onboarding profilo + mappa m²/località]
        │
        ▼
[Dashboard load] ──► syncControlliMensili (client)
        │
        ├─ ha calendario_stagionale? ──NO──► auto generaPianoAnnuale (1×)
        │
        ▼
[Genera piano] ──► Gemini 28-45 lavori
        │              + catalogo ≤18
        │              + fitofarmaci filtrati
        │              + pre-emergenza meteo
        │              + overseed ombra
        ▼
[persistPianoStagionale] ──► DB prato_interventi

[Chat foto] ──► vision + report
        │
        ├─► ia_foto urgenti (replace pianificati ia_foto)
        └─► integraFotoNelPiano (aggiungi/modifica calendario_stagionale)

[UI Dashboard]
        │
        ├─ filtri tipo/ambito
        ├─ groupInterventiPerMese (solo data >= oggi nel timeline!)
        ├─ sezione Urgenti ia_foto
        └─ checkbox completato / pin manual_override
```

**Punto di rottura noto (storico):** `hasPiano` era `interventi.length > 0` → i soli controlli mensili bloccavano l'auto-generazione. **Fix attuale:** `haCalendarioStagionale(interventi)` — conta solo `fonte === calendario_stagionale`.

**Altro punto:** `groupInterventiPerGiorno` **esclude** `data_prevista < oggi` dalla timeline mese-per-mese → i lavori scaduti **non appaiono** nell'accordion (ma restano in DB e penalizzano l'esagono).

---

## 5. Arricchimento prodotti e dosi

File: `web/server/prodottiCatalogo.mjs`, `web/server/sicurezzaProdotti.mjs`

| Regola | Comportamento |
|--------|----------------|
| Dosi | `dose_per_mq` da DB × `superficie_mq` — **nessun fallback 100 m²** |
| Fitofarmaci | Nessuna dose; `AVVISO_FITOFARMACO` in UI |
| Catalogo consumer | `filtraProdottiConsumer` + `categoria_legale` (PFNPO vs PROFESSIONALE) |
| Marca | Preferenza Bottos; opzione tutte le marche da profilo |
| Livello concimi | `livelloConcimi.mjs` filtra concimi troppo «professionali» per obiettivo estetico/bassa manutenzione |

Voci catalogo automatiche: titolo `Catalogo — {nome}`, `ordine` alto (~5000), priorità bassa, una data nel periodo d'uso del prodotto.

---

## 6. Regole fitofarmaci nel calendario

File: `web/server/regoleFitofarmaci.mjs`

- **Pre-emergenza** (diserbi annuali): ammessi nel piano stagionale; finestre meteo da OpenWeather.
- **Curativi** (fungicidi, insetticidi, diserbo post-emergenza): solo se `visioneMostraDifetti(vision)` OR problemi dichiarati in profilo (`problemi_noti`).
- Prompt Gemini include `REGOLE_FITOFARMACI_PROMPT` in `pianoStagionale.mjs`.

---

## 7. UI calendario (Dashboard)

File: `web/src/pages/Dashboard.jsx`, `web/src/lib/dashboard.js`

### Visualizzazione

| Sezione | Contenuto |
|---------|-----------|
| Urgenti dall'analisi foto | `fonte === ia_foto`, solo se filtro «Tutti» |
| Piano mese per mese | `groupInterventiPerMese` dopo filtri |
| Prossimi lavori | fallback se timeline vuota |
| Completati | sempre in fondo |

### Filtri (`filtraInterventiPerCalendario`)

| Tipo | Categorie incluse | Esclude |
|------|-------------------|---------|
| tutti | tutto | — |
| trattamenti | concime, biostimolante, umettante, rinnovo, trattamento, diserbo | controllo_mensile |
| giardino | taglio, arieggiatura, pulizia, irrigazione | controllo_mensile |

| Ambito | Effetto |
|--------|---------|
| mese | `data_prevista` nel mese corrente |
| anno | nessun filtro data |

**Conteggi chip:** solo lavori **futuri** (`data_prevista >= oggi`, pianificati).

### Azioni utente

- **Checkbox:** `setInterventoCompletato` → stato + `data_completamento`.
- **Pin:** `setInterventoManualOverride` solo su `calendario_stagionale`.
- **CTA foto mensile:** link Chat con `?controllo=id`.

---

## 8. API e async

| Endpoint | Durata | Job |
|----------|--------|-----|
| `POST /api/genera-piano` | max 120s Vercel | `prato_jobs.tipo = genera_piano` |
| `POST /api/analizza-prato` | max 120s | `analizza_foto` |

Client: `pollJobUntilDone` fino 180s. Rate limit per utente (`rateLimit.mjs`).

**Prerequisiti genera piano:**

- `localita` nel profilo.
- `superficie_mq` verificata (blocco server se assente).

---

## 9. Integrazione con esagono «Stato prato»

File: `web/src/lib/pratoStats.js`

- L'esagono **non** usa i filtri calendario UI.
- Penalizza solo lavori **scaduti** (`data_prevista < oggi`, pianificati), esclusi controllo_mensile, priorità bassa, «Catalogo —».
- Cap **−15 punti per asse** (non legato al numero di voci in UI).

**Incoerenza UX:** scaduti possono essere **invisibili** nella timeline (filtro `data >= oggi`) ma influenzano ancora l'esagono.

---

## 10. File chiave da leggere nel repo

| File | Ruolo |
|------|--------|
| `web/src/lib/dashboard.js` | load, filtri, gruppi, controlli mensili |
| `web/src/pages/Dashboard.jsx` | UI calendario, auto-piano, CTA |
| `web/server/pianoStagionale.mjs` | Generazione piano Gemini + persist |
| `web/server/pianoDaCatalogo.mjs` | Integrazione catalogo (max 18) |
| `web/server/interventiFromReport.mjs` | Urgenti da foto |
| `web/server/aggiornaPianoDaFoto.mjs` | Modifiche piano post-foto |
| `web/server/regoleFitofarmaci.mjs` | Filtro fitofarmaci curativi |
| `web/server/controlliMensili.mjs` | Voci mensili |
| `web/server/prodottiCatalogo.mjs` | Prodotti, dosi, match |
| `web/server/preEmergenzaAnnuali.mjs` | Diserbi pre-emergenza |
| `web/server/pratoZone.mjs` | Overseed zone ombra |
| `web/api/genera-piano.js` | API + job |
| `sql/prato_dashboard.sql` | Schema base |
| `sql/patch_interventi_*.sql` | Categorie, prodotti, manual_override |

---

## 11. Domande specifiche per la revisione

1. **Densità:** 28–45 + 18 catalogo + 12 foto/mese ≈ 58–75 voci/anno — troppo per B2C? Quale target ideale?
2. **Scaduti invisibili:** è corretto nasconderli dalla timeline? Come gestire «in ritardo» in UX?
3. **Auto-generazione** al primo accesso: rischio timeout / abbandono? Meglio opt-in?
4. **Catalogo automatico** vs lavori Gemini: duplicazioni semantiche? Regole anti-duplicato sufficienti?
5. **integraFotoNelPiano:** Gemini modifica il piano in modo affidabile? Serve validazione strutturata?
6. **Stagionalità Italia:** le date Gemini sono realistiche per Nord/Centro/Sud? Serve vincolo per `localita`?
7. **Robot taglio:** il profilo `frequenza_taglio = robot` è riflesso abbastanza nel piano?
8. **Fitofarmaci:** il filtro «solo con evidenza» è troppo restrittivo o ancora permissivo?
9. **Rigenera piano:** cosa dovrebbe succedere a `ia_foto` e `controllo_mensile`? (oggi: non toccati)
10. **Notifiche:** senza push/email il calendario è inutile? Priorità backlog?

---

## 12. Vincoli legali / sicurezza (Italia)

- D.Lgs. 150/2012 (PAN): fitofarmaci senza dose automatica; PFNPO in B2C.
- Disclaimer onboarding obbligatorio.
- Dosi solo concimi/biostimolanti con m² verificati.

---

## 13. Stato deploy (maggio 2026)

- Piano prompt: **28–45** interventi (non più 50–90).
- Catalogo: **max 18** extra.
- Genera piano: richiede **m²** sulla mappa.
- `manual_override` su rigenera.
- Job async + rate limit.

---

*Allegare a Gemini i file sopra o incollare `docs/PROMPT_GEMINI_CALENDARIO.txt` per il prompt operativo.*
