# AgriPocket — Relazione sul modulo irrigazione smart (per revisione Gemini)

**Data:** maggio 2026  
**Repo:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app/dashboard  
**Stack:** React + Supabase + Open-Meteo (ET0) + Vercel serverless (`web/`)  
**Commit di riferimento:** `a1ad487`+ — motore riscritto post-revisione Gemini (serbatoio, linee idrauliche, Kc stagionale)

---

## ISTRUZIONI PER GEMINI (leggere per prime)

Sei un **revisore senior** con competenze: **irrigazione tappeti erbosi** (giardino residenziale, Italia), **centraline domestiche**, **architetto software**, **product manager B2C**.

**Obiettivo:** analizzare il modulo **«Irrigazione di oggi»** di AgriPocket — bilancio idrico, traduzione in minuti centralina, frequenza settimanale, programmazione **zona per zona** da mappa — e produrre una **relazione critica** con proposte concrete (agronomia, UX, affidabilità meteo, modellazione impianti misti).

**Tono:** severo, preciso, costruttivo. Ogni critica con **impatto** e **remediation** proposta.

**Output richiesto:**

1. **Executive summary** (max 15 righe) — il consiglio irrigazione è credibile / troppo semplificato / pericoloso?
2. **Diagramma testuale** del flusso: profilo + mappa → meteo → motore → widget dashboard.
3. **Tabella criticità** P0/P1/P2 (max 12 voci) su irrigazione.
4. **Validazione formule:** ET0 × Kc − pioggia → mm → minuti; pluviometrie fisse per tipo; ripartizione per testa in mappa.
5. **Impianti misti:** 2 statici + 1 rotator + N oscillanti — il modello «fabbisogno / n_teste» è accettabile senza poligoni di copertura?
6. **Frequenza settimanale:** ogni giorno / 2 / 3 giorni — regole euristiche vs forecast 7 gg.
7. **Coerenza con calendario:** il piano **non** genera più task «irrigazione generica»; questo modulo è l’unica fonte — OK?
8. **Specifica miglioramenti:** pseudocodice o regole business (es. coefficienti Kc stagionali, sensori pioggia, zone ombra per testa).
9. **3 scenari utente** (estate siccità, settimana piovosa, impianto misto) con output JSON atteso ideale.

---

## 1. Cosa promette il prodotto (UX)

Sulla **Dashboard** (`/dashboard`), card **«Irrigazione di oggi»** (`IrrigationWidget.jsx`):

| Promessa | Comportamento |
|----------|----------------|
| Consiglio giornaliero | Minuti e azione centralina da **ET0 − pioggia** |
| Meteo esplicito | Badge se il calcolo usa dati Open-Meteo (ET0, pioggia) |
| Azione centralina | `AUMENTA` \| `DIMINUISCI` \| `MANTIENI` \| `SPEGNI` (rispetto a `tempo_irrigazione_base`) |
| Programma settimanale | Griglia 7 giorni: irriga / riposo / pioggia; frequenza «ogni giorno», «ogni 2 giorni», ecc. |
| **Zona per zona** | Se irrigatori segnati in mappa: **Zona 1 · Statico**, **Zona 2 · Rotator**, … con minuti, frequenza, ora 6:30 |
| Cycle & soak | Su terreno argilloso / pendenza e minuti > 15: più cicli brevi + pausa 60 min |
| Terreno sabbioso | Frazionamento settimanale (pochi minuti, più passate nella settimana) |
| Solo pioggia | Profilo `irrigazione = pioggia` → stand-by; motore spento salvo siccità prolungata |
| Aggiornamento | Pulsante «Aggiorna calcolo»; cache sessionStorage giornaliera |

**Prerequisiti utente:**

- `localita` nel profilo (geocoding per meteo).
- `irrigazione !== 'pioggia'` per attivare il motore.
- Irrigatori opzionali in `prato_zone` per programma per zona (altrimenti solo riepilogo globale).

**Non coperto (limiti attuali):**

- Nessun collegamento MQTT/Bluetooth alla centralina reale.
- Nessun poligono di **copertura** per singolo irrigatore (ripartizione equa del fabbisogno).
- Nessun sensore pioggia on-site (solo meteo zona).
- Kc da RAG opzionale ma raramente usato in produzione (fallback 0,75).

---

## 2. Modello dati

### 2.1 `prato_profilo` (patch SQL)

File: `sql/patch_irrigazione_avanzata.sql`

| Campo | Tipo | Note |
|-------|------|------|
| `tipo_irrigatori` | text | `statici`, `dinamici`, `testine_rotator`, `ala_gocciolante` |
| `tempo_irrigazione_base` | int 1–180 | Minuti attuali sulla centralina (riferimento AUMENTA/DIMINUISCI) |
| `irrigazione_oggi` | jsonb | Ultimo output motore (snapshot) |
| `irrigazione_oggi_aggiornato` | timestamptz | |

Altri campi usati dal motore (già in profilo):

- `localita`, `irrigazione` (`manuale` \| `automatica` \| `pioggia`)
- `tipo_terreno`, `pendenza`, `esposizione`, `ombra_zone_pct`
- `prato_zone` (jsonb): poligono prato + zone irrigatori/ombra/…
- `superficie_mq` (indiretto, per suggerimenti legacy in `suggestIrrigation`)

### 2.2 Irrigatori in mappa (`prato_zone.zone`)

Ogni irrigatore è un punto `{ id, tipo: "irrigatore", lat, lng, modalita }`.

| `modalita` (mappa UI) | Etichetta | Motore `tipo_irrigatore` | Pluviometria mm/h |
|----------------------|-----------|--------------------------|-------------------|
| `statico` | Statico | `statici` | 35 |
| `rotator` | Rotator | `testine_rotator` | 15 |
| `dinamico` | Oscillante | `dinamici` | 12 |

Legacy: vecchi punti `dinamico` = oscillante; `rotator` introdotto maggio 2026.

Ordine uscite centralina nel programma: **statici → rotator → oscillanti** (ordinamento stabile per `id`).

### 2.3 Output JSON motore (API)

Endpoint: `GET|POST /api/irrigazione-giornaliera`  
Persistenza opzionale: `irrigazione_oggi` su profilo.

```json
{
  "azione_irrigazione": "AUMENTA|MANTIENI|DIMINUISCI|SPEGNI",
  "dati_tecnici": {
    "fabbisogno_calcolato_mm": 2.4,
    "minuti_totali_consigliati": 18,
    "et0_mm": 4.1,
    "precipitazioni_mm": 0.5,
    "pluviometria_mm_ora": 35,
    "kc": 0.75,
    "modificatore_ombra": 1
  },
  "dati_centralina": {
    "cicli_consigliati": 2,
    "minuti_per_ciclo": 9,
    "pausa_tra_cicli_min": 60,
    "tempo_base_minuti": 15,
    "tipo_irrigatori": "statici"
  },
  "schema_settimanale": {
    "frequenza": { "intervallo_giorni": 2, "label": "Ogni 2 giorni", "passate_settimana": 4, "minuti_per_passata": 9 },
    "giorni": [{ "iso": "2026-05-21", "nome": "Mer", "irriga": true, "minuti": 9, "nota": "9 min" }],
    "riepilogo_ux": "...",
    "impostazione_centralina": "...",
    "oggi_irriga": true
  },
  "programma_zone": {
    "numero_zone": 4,
    "zone": [{
      "zona_numero": 1,
      "etichetta": "Zona 1 · Statico 1",
      "modalita": "statico",
      "minuti_per_ciclo": 5,
      "cicli": 2,
      "frequenza_label": "Ogni 2 giorni",
      "giorni_settimana": ["Mer", "Ven", "Dom"],
      "orario_consigliato": "06:30",
      "attiva_oggi": true,
      "impostazione": "Zona 1 · Statico 1: 2 partenze × 5 min, ogni 2 giorni, ore 6:30."
    }],
    "minuti_totali_zone": 42,
    "sintesi": "4 zone in mappa ..."
  },
  "messaggio_ux": "Testo discorsivo per l'utente...",
  "meteo_utilizzato": true,
  "meteo": { "et0_mm": 4.1, "precipitazioni_mm": 0.5, "pioggia_in_corso": false },
  "calcolato_il": "ISO-8601",
  "data_consiglio": "YYYY-MM-DD"
}
```

Se **nessun** irrigatore in mappa: `programma_zone` può essere `null`; restano `schema_settimanale` e totali globali.

---

## 3. Flusso end-to-end

```
Dashboard mount
  → IrrigationWidget
  → fetchIrrigazioneGiornaliera() [Bearer Supabase]
  → /api/irrigazione-giornaliera
       → load profilo (service role)
       → centroid poligono prato → lat/lon per meteo fine-grained
       → fetchWeatherBundle(localita, gps)
       → calcolaIrrigazioneGiornalieraAsync(profilo, weatherBundle)
            → [opz.] kcDaKnowledgeBase (RAG Kc, fallback 0.75)
            → calcolaIrrigazioneGiornaliera()
       → UPDATE prato_profilo.irrigazione_oggi
  → UI: azione, zone, settimana, messaggio
```

**Dev locale:** route registrata in `web/vite-plugin-analizza.mjs` (proxy `/api/irrigazione-giornaliera`).

**Cache client:** `sessionStorage` chiave giornaliera; `force: true` su «Aggiorna calcolo».

---

## 4. Motore irrigazione (`web/server/motoreIrrigazione.mjs`)

### 4.1 Bilancio idrico (serbatoio — post-fix maggio 2026)

**Non** si divide più il fabbisogno per il numero di teste in mappa.

```
cap = capacitaCampo(tipo_terreno)   // sabbioso 8, medio 14, argilloso 20 mm
MAD = cap × 0.5
suolo ← parte da ~0.75 × cap

Per ogni giorno (forecast 7 gg):
  suolo -= ET0 × Kc_stagionale × mod_ombra
  suolo += pioggiaEfficace(precip, suolo, cap)   // max riempimento fino a cap
  se suolo ≤ MAD e precip < 8 mm:
    irriga = true
    mm_necessari = cap − suolo
    suolo = cap

fabbisogno_oggi = mm_necessari del giorno 0
```

`Kc_stagionale`: giu–ago 0.82; mar–mag, set–ott 0.65; inverno 0.58.

Se suolo saturo (pioggia ≥ 8 mm) o `fabbisogno_oggi = 0` → `SPEGNI`.

### 4.2 Minuti (impianto omogeneo)

```
minuti_totali = (fabbisogno_mm / pluviometria_mm_ora) × 60
```

Pluviometrie tabellari (`PLUVIOMETRIA_MM_H`): statici 35, dinamici 12, rotator 15, ala_gocciolante 20 mm/h.

`tipo_irrigatori` profilo: se assente, **inferito** da conteggio mappa (`irrigazioneInput.mjs`).

### 4.3 Azione vs tempo base

Confronto `minuti_totali` con `tempo_irrigazione_base` (default 15):

| Condizione | Azione |
|------------|--------|
| fabbisogno ≤ 0 o pioggia | SPEGNI |
| minuti > base × 1.2 | AUMENTA |
| minuti < base × 0.55 | DIMINUISCI |
| altrimenti | MANTIENI |

### 4.4 Cycle & soak (`calcolaCicli`)

| Condizione | Comportamento |
|------------|----------------|
| Terreno sabbioso, minuti > 10 | 1 ciclo ≤ 12 min; `frazionamento_settimanale: true` |
| Argilloso o pendenza media/forte, minuti > 15 | 2–3 cicli, pausa 60 min |
| Default | 1 ciclo, tutti i minuti |

### 4.5 Schema settimanale (`calcolaSchemaSettimanale`)

- Costruisce **7 giorni** da `forecast_daily` / serie GDD.
- Per ogni giorno: `fabbisogno` da ET0/pioggia giornaliera; `irriga` se fabbisogno > 0.4 e rispetta `intervallo_giorni` (1, 2 o 3).
- Giorno con precip ≥ 5 mm → «Pioggia», no irrigazione.
- `intervallo_giorni` euristico: ET0 alto / estate → ogni giorno; medio → ogni 2; basso → ogni 3; sabbioso → tendenza ogni 2.

### 4.6 Programma per linea idraulica (`calcolaProgrammaZoneCentralina`)

**Solo se** ci sono irrigatori in mappa.

1. **Raggruppa** per `modalita` (= linea centralina tipica: tutti gli statici sulla stessa uscita).
2. Ogni linea riceve l’intero `mm_da_evadere` (deficit oggi), **non** diviso per teste.
3. `minuti_linea = (mm / pluviometria_linea) × 60`.
4. Più teste sulla stessa linea → una sola scheda «Linea 1 · Statico (2 teste)».

**Esempio:** 2 statici + 1 rotator + 1 oscillante, deficit 6 mm oggi:

- Linea 1 Statici (2 teste): 6 mm → ~10 min @ 35 mm/h
- Linea 2 Rotator: 6 mm → ~24 min @ 15 mm/h
- Linea 3 Oscillante: 6 mm → ~30 min @ 12 mm/h

(Limitazione nota: senza poligoni di copertura si assume che ogni linea bagni il suo settore quando gira; non si modellano linee parallele sullo stesso prato.)

---

## 5. Input e mappa (`irrigazioneInput.mjs`, `pratoZone.js`)

- **Ombra:** da poligoni ombra in mappa (`computeOmbraZonePct`) o da profilo `esposizione` / `ombra_zone_pct`.
- **Inferenza tipo impianto:** maggioranza modalità in mappa; rotator vince se ≥ statici e ≥ dinamici.
- **`suggestIrrigation` (client/server):** suggerimenti stagionali statici per `IrrigationZoneCard` (legacy, non sostituisce il motore ET0).

**UI mappa:** `LawnMapModal.jsx` — scelta statico / rotator / oscillante; GPS; footer fisso mobile.

---

## 6. Meteo (`weatherCore.mjs`, `agronomicMeteo.mjs`)

- Provider: **Open-Meteo** (gratuito, no API key obbligatoria per irrigazione).
- `fetchWeatherBundle(localita, key, { lat, lon })` → `current` + `agronomic` (ET0 FAO, T suolo 10 cm, GDD, `forecast_daily`).
- `estraiMeteoIrrigazione`: ET0 oggi, pioggia oggi/ieri, flag pioggia in corso da codice meteo corrente.

**Nota:** ET0 e pioggia possono provenire da serie storiche/forecast accorciate a 7 giorni — coerenza con «oggi» da verificare in revisione.

---

## 7. Integrazione calendario e trattamenti

| Modulo | Rapporto con irrigazione |
|--------|-------------------------|
| **Calendario** (`pianoStagionale.mjs`) | Prompt vieta task generici «irrigazione» / taglio ricorrenti; irrigazione gestita da questo motore |
| **TreatmentCard** | Trattamenti con badge **«Meteo nel calcolo»** se `contesto_meteo.utilizzato_nel_calcolo` (`meteoConsiglio.mjs`, `trattamentoPipeline.mjs`) — **separato** dal widget irrigazione |
| **pratoStats / esagono** | Penalità idratazione su interventi categoria irrigazione **scaduti** in calendario, non sul widget ET0 |

---

## 8. UI componenti

| File | Ruolo |
|------|--------|
| `web/src/components/IrrigationWidget.jsx` | Widget dashboard: azione, zone, settimana, messaggio |
| `web/src/lib/irrigazioneClient.js` | Fetch API + cache + label azioni |
| `web/src/styles-irrigation-widget.css` | Stili griglia settimanale e card zone |
| `web/src/components/IrrigationZoneCard.jsx` | Suggerimenti legacy da mappa (profilo impostazioni) |
| `web/src/components/LawnMapModal.jsx` | Segna irrigatori + GPS |

---

## 9. File server chiave

| File | Ruolo |
|------|--------|
| `web/server/motoreIrrigazione.mjs` | Calcolo completo + schema settimanale + programma zone |
| `web/server/irrigazioneInput.mjs` | Normalizzazione profilo → input motore |
| `web/server/pratoZone.mjs` | Zone, conteggi, `suggestIrrigation` |
| `web/api/irrigazione-giornaliera.js` | API autenticata + persist snapshot |
| `web/server/weatherCore.mjs` | Bundle meteo |
| `web/server/agronomicMeteo.mjs` | ET0, GDD, forecast |
| `web/server/meteoConsiglio.mjs` | Testi badge meteo (trattamenti) |
| `sql/patch_irrigazione_avanzata.sql` | Colonne DB |

---

## 10. Diagramma flusso (testuale)

```
[Profilo utente]
    localita, irrigazione, terreno, pendenza, tempo_base, tipo_irrigatori?
    prato_zone { poligono, zone[ irrigatori S/R/O ] }
           │
           ▼
[Open-Meteo] ──► ET0, pioggia, forecast 7d
           │
           ▼
[motoreIrrigazione]
    fabbisogno_mm ──┬──► minuti globali + azione AUMENTA/...
                    ├──► schema_settimanale (frequenza + griglia)
                    └──► programma_zone (se n_irrigatori > 0)
           │
           ▼
[Dashboard IrrigationWidget]
    "Zona 1 · Statico: 8 min, ogni 2 giorni, 6:30"
```

---

## 11. Domande specifiche per la revisione

1. **Kc = 0,75 fisso:** va bene tutto l’anno per miscuglio prato da giardino in Italia? Serve tabella stagionale (0,65 inverno – 0,85 estate)?
2. **Pluviometrie fisse** (35/15/12 mm/h): come calibrarle con marca/modello o portata reale misurata?
3. **Ripartizione fabbisogno / n_teste:** errore sistematico su prati grandi con 1 oscillante che copre metà superficie?
4. **Mancanza poligoni di getto:** priorità per MVP vs accuratezza?
5. **Schema settimanale vs centralina reale:** molte centraline usano «giorni dispari» o % umidità — il testo è sufficiente?
6. **Pioggia meteo vs sensore:** rischio SPEGNI mentre il prato è secco (microclima)?
7. **Profilo «solo pioggia»:** soglia ET0 < 2 per stand-by è troppo permissiva?
8. **Coerenza minuti somma zone vs totale globale:** con tipi misti la somma zone ≠ minuti globali (pluv diverse) — confonde l’utente?
9. **Integrazione calendario:** serve un promemoria mensile «verifica programma irrigazione»?
10. **RAG Kc:** vale la pena mantenerlo o è rumore?

---

## 12. Scenari di test suggeriti

### Scenario A — Estate siccità, 3 statici in mappa

- Input: ET0 = 5 mm, pioggia = 0, ombra 10%, terreno medio, base 15 min.
- Atteso: AUMENTA, ogni giorno, statici ~6–7 min/testa (×3), messaggio mattina presto.

### Scenario B — Settimana piovosa

- Input: precip 8 mm oggi, ET0 basso.
- Atteso: SPEGNI, griglia tutta «Pioggia»/riposo, zone OFF.

### Scenario C — Impianto misto (2S + 1R + 1O)

- Verificare ordine zone 1–4, minuti rotator > statici a parità fabbisogno/testa, oscillante spesso 1 ciclo lungo.
- Critica attesa: senza mappe di copertura, rotator e statici sullo stesso prato 200 m² potrebbero essere sovra/sotto irrigati.

---

## 13. Vincoli e disclaimer

- Consiglio **indicativo**, non sostituisce portata misurata, leggi idriche locali, né manutenzione impianto.
- Nessuna integrazione hardware centralina.
- Dati meteo da stazione/modello a distanza; errori possibili in costa/montagna.

---

## 14. Stato deploy (maggio 2026)

- Produzione: https://agripocket-azure.vercel.app
- Patch SQL: `patch_irrigazione_avanzata.sql` da eseguire su Supabase se non già fatto.
- Deploy Vercel: commit `a1ad487` (irrigazione per zona, meteo trattamenti, GPS mappa).

---

## 15. Prompt operativo breve (incollabile in chat Gemini)

```
Analizza il modulo irrigazione AgriPocket descritto in RELAZIONE_IRRIGAZIONE_GEMINI.md.
Focus: correttezza agronomica ET0×Kc, impianti misti statico/rotator/oscillante,
programma zona-per-zona senza poligoni di copertura, UX frequenza settimanale.
Output: executive summary, tabella P0-P1-P2, 3 miglioramenti con pseudocodice.
```

---

*Per il calendario interventi vedi `docs/RELAZIONE_CALENDARIO_GEMINI.md`. Per trattamenti Educazione→Soluzione vedi pipeline in `web/server/trattamentoPipeline.mjs`.*
