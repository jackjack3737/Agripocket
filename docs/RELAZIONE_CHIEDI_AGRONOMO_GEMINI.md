# AgriPocket — Relazione sul modulo «Chiedi all'agronomo» (per revisione Gemini)

**Data:** maggio 2026  
**Repo:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app/dashboard  
**Stack:** React 19 + Vite · Supabase · Gemini 2.5 Flash · Open-Meteo · RAG (`tgif_knowledge_base`)  
**Deploy:** root Vercel = `web/` · alias `agripocket-azure.vercel.app`

---

## ISTRUZIONI PER GEMINI (leggere per prime)

Sei un **revisore senior** con competenze: **agronomia tappeti erbosi (Italia, giardino residenziale)**, **RAG / LLM in produzione**, **UX conversazionale**, **privacy e fitosanitari (PAN)**.

**Obiettivo:** analizzare il modulo **«Chiedi all'agronomo»** — barra domanda + foto opzionale + dettatura vocale sulla dashboard, chat testuale RAG, analisi foto macchia — e produrre una **relazione critica** con remediation concrete.

**Tono:** severo, preciso, costruttivo. Ogni critica con **impatto utente** e **proposta di fix**.

**Output richiesto:**

1. **Executive summary** (max 15 righe) — il consulente è affidabile / troppo generico / rischioso legalmente?
2. **Diagramma testuale** del flusso: input utente → API → contesto → Gemini → verifica → UI.
3. **Tabella criticità** P0/P1/P2 (max 12 voci).
4. **Confronto** con pagina `/chat` (analisi foto full prato): quando usare quale percorso?
5. **RAG e guardrail:** soglie chunk, verifica risposta, messaggio «dati insufficienti» — sono adeguati?
6. **Voce (Web Speech API):** limiti browser, privacy, qualità italiano, fallback.
7. **Foto macchia vs solo testo:** coerenza vision + nota utente + `modalita: macchia_zona`.
8. **3 scenari utente** con domanda esempio e risposta ideale (irrigazione estate, macchia gialla, overseeding ombra).
9. **Roadmap** 3 sprint (must / should / nice).

---

## 1. Cosa promette il prodotto (UX)

### 1.1 Posizione in app

| Dove | Componente | Variante |
|------|------------|----------|
| **Dashboard** `/dashboard` | `ConsulenteZonaFoto` | `variant="google"` — barra stile Google sotto header |
| (legacy / altre zone) | `ConsulenteZonaFoto` | `variant="card"` — card con titolo |
| `/chat` | `Chat.jsx` | Solo **foto full prato** + report lungo (non è la stessa barra testuale) |

La dashboard è il punto principale per **domande rapide** e **foto di macchia** senza uscire dal cruscotto.

### 1.2 Promesse UX (barra «Chiedi all'agronomo»)

| Azione | Comportamento |
|--------|----------------|
| **Testo** | Domanda libera → `POST /api/chat-zona` → risposta max ~12 righe |
| **Microfono** | Web Speech API (`it-IT`): dettatura nel campo testo; tap di nuovo per fermare |
| **Foto (+)** | Allegato opzionale → `POST /api/analizza-prato` con `modalita: macchia_zona` |
| **Invio** | Se c’è foto → vision + report; se solo testo → chat RAG |
| **Prerequisito** | `localita` in profilo (meteo e geocoding) |

**Placeholder:** «Chiedi all'agronomo (foto opzionale)».

### 1.3 Differenza da «Analisi foto» (`/chat`)

| | Chiedi all'agronomo (dashboard) | Analisi foto (`/chat`) |
|--|--------------------------------|-------------------------|
| Input | Testo ± foto macchia | Solo foto prato intero |
| Output testo | Breve (chat) o blocchi sintesi vision | Report markdown lungo |
| Calendario | Non rigenera piano automaticamente | Può aggiornare interventi post-analisi |
| Job async | Chat sincrona 60s; analisi foto può essere async job | Job fino 120s |

---

## 2. Architettura tecnica

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard — ConsulenteZonaFoto.jsx                              │
│  [input testo] [mic] [+] [invio]                                 │
└────────────┬───────────────────────────────┬────────────────────┘
             │ solo testo                    │ con foto base64
             ▼                               ▼
    analizzaPrato.chiediAgronomoTesto   analizzaMacchiaZona
             │                               │
             ▼                               ▼
    POST /api/chat-zona.js            POST /api/analizza-prato
             │                               │
             ▼                               ▼
    chatZonaRAG.rispondiChatZona      analizzaPratoCore (vision)
             │                               │
             ├─ loadContestoZona              ├─ profilo + meteo
             ├─ gemini-embedding-001         ├─ RAG KB
             ├─ match_documenti (Supabase)   └─ report + vision JSON
             ├─ gemini-2.5-flash (bozza)
             └─ verificaRispostaRAG (JSON)
```

### 2.1 File principali

| File | Ruolo |
|------|--------|
| `web/src/components/ConsulenteZonaFoto.jsx` | UI barra, mic, foto, risultati |
| `web/src/lib/useSpeechInput.js` | Hook dettatura `SpeechRecognition` / `webkitSpeechRecognition` |
| `web/src/lib/analizzaPrato.js` | Client `chiediAgronomoTesto`, `analizzaMacchiaZona` |
| `web/api/chat-zona.js` | Handler Vercel, auth Supabase |
| `web/server/chatZonaRAG.mjs` | RAG + prompt + verifica |
| `web/server/analizzaPratoCore.mjs` | Vision macchia / prato (condiviso con `/chat`) |

### 2.2 API `POST /api/chat-zona`

**Body:** `{ domanda: string, zonaId?: uuid }`  
**Auth:** Bearer JWT Supabase  
**Timeout:** 60s (`vercel.json`)

**Response:**

```json
{
  "risposta": "testo in italiano",
  "fonte": "rag_verificato | profilo_meteo_verificato | profilo_meteo | rag | kb_insufficiente",
  "chunksUsed": 6,
  "zona": { "id", "nome_zona", ... }
}
```

---

## 3. Motore RAG (`chatZonaRAG.mjs`)

### 3.1 Contesto caricato (`loadContestoZona`)

- Zona attiva: `zone_prato` (default `is_default` o `zonaId` passato)
- Profilo `prato_profilo` completo
- Meteo: `fetchWeatherBundle(localita, gps zona)` → ET0, pioggia, GDD in prompt
- Mappa: `formatZonesForPrompt`, `formatIrrigationForPrompt`, `formatOmbraSeedForPrompt`
- Storico: ultime 3–5 analisi `prato_analisi` filtrate per `zona_id`
- Ultima vision JSON dalla foto precedente (se pertinente)
- Focolai regionali (`buildFocolaiPromptBlock`) se disponibili

### 3.2 Ricerca knowledge base

1. `buildSearchQuery(domanda, ctx)` — arricchisce con profilo, vision, problemi noti  
2. `gemini-embedding-001` su testo (max ~6000 char)  
3. `queryKnowledgeBasePrioritized` — soglia min sim ~0.26, min 3 chunk  
4. Se chunk < 3: fallback solo se `contestoSufficienteSenzaFoto` (profilo + meteo/mappa)

### 3.3 Generazione e verifica (doppio passaggio Gemini)

1. **Bozza:** `gemini-2.5-flash`, temperature 0.2, regole: no dosi inventate, no patologie senza fonte, max 12 righe  
2. **Verifica:** secondo prompt JSON `{ ok, risposta_finale }` — rigetta allucinazioni  

Messaggio standard se insufficiente:

> «I dati non sono sufficienti per una diagnosi certa. È richiesto l'intervento in loco di un agronomo o un'analisi del suolo.»

### 3.4 Fonti esposte in UI

L’utente vede in meta: `Knowledge base (verificata)`, `Profilo, mappa e meteo`, `Dati insufficienti`, ecc. + numero estratti.

---

## 4. Percorso foto macchia

Se l’utente allega foto **prima** dell’invio:

- `analizzaMacchiaZona` → stessa pipeline vision del prato con extra:
  - `modalita: "macchia_zona"`
  - `zonaId`, `zonaNome`
  - `notaUtente`: testo nel campo domanda (contesto aggiuntivo)
- UI: `SintesiAnalisiBlocks` (vision JSON + report markdown)
- Callback `onAnalisiComplete` sulla dashboard → refresh ultima analisi / radar

**Nota:** con foto attiva, la **domanda testuale non** passa da `chat-zona` nello stesso invio; è solo nota per vision.

---

## 5. Dettatura vocale (microfono)

### 5.1 Implementazione

- Hook `useSpeechInput.js`
- API browser: `SpeechRecognition` / `webkitSpeechRecognition`
- Lingua: `it-IT`
- Tap microfono → start; tap di nuovo o fine frase → stop; testo **accodato** al campo domanda
- Stati UI: pulsante rosso pulsante + «In ascolto…»
- Errori: permesso negato, no-speech, browser non supportato (messaggio: usare Chrome/Edge)

### 5.2 Limiti noti

| Limite | Impatto |
|--------|---------|
| Safari iOS | Supporto parziale / assente per Web Speech API |
| Firefox | Variabile |
| HTTPS obbligatorio | OK su Vercel |
| Nessun invio automatico | L’utente deve premere Invio dopo la dettatura |
| Privacy | Audio elaborato dal motore del browser/OS, non inviato a AgriPocket finché non si invia la domanda |

---

## 6. Modello dati e zone

- **Profilo:** `prato_profilo` (località, irrigazione, terreno, `prato_zone` JSONB, ecc.)
- **Zone:** tabella `zone_prato` — `is_default`, `nome_zona`, `metri_quadri`, `coordinate_gps`, eventuale `prato_zone` per zona
- Dashboard passa `zonaDefault` da hook zone utente

Chat usa zona default se `zonaId` omesso.

---

## 7. Sicurezza e compliance

| Tema | Stato |
|------|--------|
| Auth | JWT obbligatorio su API |
| Fitofarmaci | Prompt vieta dosi/prodotti non in KB; disclaimer app globale |
| Dati GPS | `prato_zone` anonimizzato in salvataggio (~11 m) |
| Foto | Upload opzionale bucket post-analisi |
| Voce | Solo client-side fino all’invio testo |

---

## 8. Metriche e osservabilità (gap)

- Nessun log strutturato latenza chat-zona in UI
- `fonte` e `chunksUsed` solo in risposta client
- Suggerimento: evento analytics `agronomo_ask` con `{ tipo: testo|foto|voce, fonte, chunks, ms }`

---

## 9. Test manuali consigliati (per Gemini o QA)

1. **Solo testo:** «Quanto devo irrigare in agosto?» con profilo + irrigatori in mappa → risposta con ET0/meteo.  
2. **Voce:** dettare domanda, verificare testo in campo, inviare.  
3. **Foto macchia:** erba gialla + nota «da 2 settimane» → vision + sintesi.  
4. **KB vuota / domanda oscura:** risposta insufficiente, no allucinazione prodotto.  
5. **Senza località:** errore con link onboarding.

---

## 10. Roadmap suggerita (per discussione)

| Priorità | Voce |
|----------|------|
| P0 | Deploy automatico GitHub → Vercel (`web/`) |
| P1 | Invio vocale «detta e invia» opzionale |
| P1 | Unificare `ChatZonaPanel` legacy con `ConsulenteZonaFoto` |
| P2 | Streaming risposta chat (SSE) |
| P2 | Cronologia domande/risposte in DB |
| P3 | Whisper API fallback per Safari |

---

## 11. Riferimenti incrociati

- `docs/RELAZIONE_COMPLETA_GEMINI.md` — panoramica app  
- `docs/RELAZIONE_IRRIGAZIONE_GEMINI.md` — motore irrigazione (contesto in chat)  
- `docs/RELAZIONE_CALENDARIO_GEMINI.md` — piano lavori (separato da chat)  
- `sql/` — schema `prato_profilo`, `zone_prato`, `prato_analisi`

---

*Documento generato per revisione indipendente Gemini — modulo Chiedi all'agronomo + dettatura vocale maggio 2026.*
