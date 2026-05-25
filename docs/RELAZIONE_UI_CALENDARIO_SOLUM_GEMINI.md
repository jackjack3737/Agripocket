# AgriPocket / Solum — Relazione sulla **UI Calendario Solum** (per revisione Gemini)

**Data:** maggio 2026  
**Repo:** https://github.com/jackjack3737/Agripocket  
**Produzione:** https://agripocket-azure.vercel.app/calendario  
**Stack:** React 19 · Vite 6 · Tailwind CSS v4 (modulo scoped) · Supabase · pipeline calendario esistente (vedi `RELAZIONE_CALENDARIO_GEMINI.md`)  
**Deploy:** root Vercel = `web/` · alias `agripocket-azure.vercel.app`

**Commit di riferimento UI:**

| Commit | Messaggio |
|--------|-----------|
| `8a55b30` | `feat(calendario): UI Solum progressive disclosure, settimana e dispensa` |
| `6a734b2` | `fix(calendario): rimuove sezione Le tue abitudini` |

---

## ISTRUZIONI PER GEMINI (leggere per prime)

Sei un **revisore senior** con competenze: **UX mobile-first (Google / Apple HIG)**, **progressive disclosure**, **copy agronomico per utenti non tecnici**, **accessibilità (WCAG)**, **React 19**.

**Obiettivo:** analizzare il **nuovo modulo Calendario Solum** — non la pipeline di generazione del piano (già documentata in `docs/RELAZIONE_CALENDARIO_GEMINI.md`), ma **come i dati agronomici complessi vengono mostrati** all’utente finale.

**Filosofia prodotto (non negoziabile):**

- Sotto il cofano resta un motore IA + matrice deterministica + vetrina prodotti.
- **In superficie:** zero gergo, azione chiara «cosa fare oggi», scienza dietro un tap («Perché lo facciamo?»).
- **Niente** muro di testo, griglia mensile classica, sezione «abitudini» sul calendario (rimossa su richiesta prodotto).

**Tono revisione:** severo, preciso, costruttivo. Ogni critica con **impatto utente** e **proposta di fix** (copy, layout, dati mancanti).

**Output richiesto:**

1. **Executive summary** (max 15 righe) — la UI è comprensibile per un giardiniere occasional? Cosa confonde ancora?
2. **Diagramma testuale** flusso UI: `prato_interventi` → mapper → tab settimana / dispensa → completamento → Supabase.
3. **Tabella criticità** P0/P1/P2 (max 12 voci) su copy, dati vuoti, accessibilità, mobile.
4. **Progressive disclosure:** l’accordion «Perché lo facciamo?» è sufficiente o serve bottom-sheet?
5. **Mapping dati:** `titolo_semplice` / `fabbisogno_fisiologico` — quali campi DB mancano o sono ridondanti?
6. **Tab Dispensa** (giorni 8–30): la lista acquisti predittiva è utile o fuorviante senza prezzi/link?
7. **Confronto** con `TreatmentCard.jsx` (ancora usata in dashboard?): duplicazione o convergenza?
8. **3 scenari utente** (settimana piena, settimana vuota, solo ritardi) — cosa deve vedere?
9. **Roadmap** 3 sprint (must / should / nice) solo lato UI calendario.

---

## 1. Cosa vede l’utente oggi

| Elemento | Comportamento |
|----------|----------------|
| **Route** | `/calendario` → `CalendarioLavori.jsx` → `CalendarioSolum.jsx` |
| **Header app** | `DashPageHeader` (nav dashboard / calendario / profilo) — invariato |
| **Rimosso** | Sezione «Le tue abitudini» (taglio/irrigazione dal profilo) |
| **Rimosso** | Vista mensile ad accordion, filtri tipo/ambito, timeline bisogni in pagina, `TreatmentCard` inline per ogni riga |
| **Azione admin** | Pulsante «Crea / Aggiorna piano annuale» (chiama `POST /api/genera-piano`, 1–2 min) |
| **Tab 1 — Questa settimana** (default) | Lista verticale 7 giorni (oggi → +6). Sezione **Da recuperare** per date passate non completate. |
| **Tab 2 — La tua dispensa** | Prodotti da `prodotti_consigliati` per interventi tra **giorno 8 e giorno 30**, raggruppati per mese. |
| **Card lavoro** | Icona categoria, titolo semplice, frase breve, «Perché lo facciamo?» → espansione, «Fatto ✓» |

**URL produzione:** https://agripocket-azure.vercel.app/calendario

---

## 2. Principio: Progressive Disclosure

```
┌─────────────────────────────────────────────────────────────┐
│  LIVELLO 0 (sempre visibile)                                 │
│  • Icona (💧 ✂️ 🧪 …)                                        │
│  • titolo_semplice (es. «Nutrizione autunnale»)              │
│  • descrizione_semplice (prima frase, max ~160 caratteri)    │
│  • Pulsante «Fatto ✓»                                        │
└───────────────────────────┬─────────────────────────────────┘
                            │ tap «Perché lo facciamo?»
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  LIVELLO 1 (accordion CSS, grid 0fr → 1fr)                   │
│  • titolo_tecnico (serif, es. prima esigenza molecolare)      │
│  • fabbisogno_fisiologico (testo lungo + esigenze elenco)    │
│  • Box grigio chiaro, rounded-2xl                            │
└─────────────────────────────────────────────────────────────┘
```

**Non mostrato in superficie (by design):** dose dettagliata, confronto 3 prodotti, nota PFNPO fitofarmaci, pin «mantieni al rigenera», importanza a barre, categorie pill.

**Implicazione per Gemini (backend):** i testi in `dettaglio_trattamento` devono avere **`spiegazione_semplice`** breve e **`fabbisogno_fisiologico`** ricco; se mancano, l’UI degrada su `messaggio_ux` / `titolo` grezzo.

---

## 3. Architettura file (frontend)

```
web/src/
├── pages/CalendarioLavori.jsx          # fetch interventi, genera piano, toggle completato
├── components/calendario/
│   ├── CalendarioSolum.jsx             # shell 2 tab + loading
│   ├── solum/
│   │   ├── TaskCard.jsx                # card + accordion scienza
│   │   ├── ScienzaPanel.jsx            # pannello espandibile
│   │   ├── WeeklyView.jsx              # 7 giorni + ritardi
│   │   └── DispensaView.jsx            # lista spesa per mese
│   ├── CalendarioInterventi.jsx        # LEGACY — ancora usabile altrove (dashboard?)
│   └── TreatmentCard.jsx               # LEGACY — treatmentFromIntervento() riusato dal mapper
├── lib/mapInterventoSolum.js           # interventoToSolum, gruppiSettimana, dispensa, ritardi
└── styles/calendario-solum.css         # Tailwind v4 scoped (@source solo cartella solum)
```

**Tailwind:** plugin `@tailwindcss/vite`, `preflight: false` (non rompe CSS dashboard esistente). Colore brand `--color-solum-green: #2d6a4f`.

---

## 4. Mapping dati: `prato_interventi` → modello UI

Funzione centrale: `interventoToSolum(item)` in `mapInterventoSolum.js`. Usa `treatmentFromIntervento(item)` da `TreatmentCard.jsx`.

| Campo UI | Origine (priorità) |
|----------|-------------------|
| `titolo_semplice` | `dettaglio_trattamento.tipo_intervento` → `item.titolo` |
| `descrizione_semplice` | Prima frase di `spiegazione_semplice` → `messaggio_ux` |
| `titolo_tecnico` | Prima `esigenze_molecolari[]` → `item.titolo` |
| `fabbisogno_fisiologico` | `fabbisogno_fisiologico` + `spiegazione_semplice` + elenco esigenze |
| `data_prevista` | `item.data_prevista` |
| `stato` | `completato` \| `da fare` (da `item.stato`) |
| `icona` | Mappa `categoria` → emoji |
| `prodotti[]` | `dettaglio_trattamento.prodotti_consigliati` (max 3 in pipeline) |

**Filtro pagina:** `filtraInterventiPerCalendario(interventi, { tipo: "tutti", ambito: "anno" })` — stesso set del piano annuale, poi slice temporale in UI.

**Settimana:** `data_prevista` ∈ [oggi, oggi+6], `stato === pianificato`.

**Ritardi:** `data_prevista < oggi`, `stato === pianificato`.

**Dispensa:** `data_prevista` ∈ [oggi+8, oggi+30]; deduplica prodotti per `marca|nome`.

---

## 5. Flusso completamento

```
Utente tap «Fatto ✓»
    → CalendarioSolum.handleComplete(id)
    → CalendarioLavori.toggleIntervento(id, true)
    → setInterventoCompletato(id) su Supabase
    → stato locale: stato = "completato", data_completamento = oggi
```

La card completata resta visibile nella settimana corrente con opacità ridotta e testo barrato (non scompare subito).

---

## 6. Cosa NON fa questa UI (gap noti)

| Funzionalità | Stato | Nota |
|--------------|-------|------|
| Vista mese per mese | Rimossa | Utenti «power» non hanno più accordion mensile |
| Filtri trattamenti / giardino | Rimossi | Tutto passa da filtro `tutti` + anno |
| `TreatmentCard` con 3 prodotti e dosi | Non in tab settimana | Solo nomi in Dispensa (giorni 8–30) |
| Pin «Mantieni al rigenera» | Non esposto | API `setInterventoManualOverride` esiste ancora |
| Avviso fitofarmaco PFNPO | Non in TaskCard | Rischio compliance se titolo sembra «spruzza X» |
| Timeline bisogni molecolari | Non in pagina | Salvata in localStorage ma non renderizzata |
| Rigenera da meteo | Evento `CALENDARIO_REFRESH_EVENT` — refresh lista OK | |

---

## 7. Generazione piano (invariata lato backend)

La UI chiama ancora `generaPianoAnnuale()` → `POST /api/genera-piano`.

- Auto-generazione al primo accesso se `localita` ok e nessun `calendario_stagionale`.
- Banner stato analisi foto da `location.state`.

**Per approfondimento pipeline:** `docs/RELAZIONE_CALENDARIO_GEMINI.md` (matrice DB, Gemini narratore, guardrail, `prodotti_mercato`).

**Collegamento vetrina prodotti:** dopo `link_prodotti_calendario.mjs`, `prodotti_consigliati` popola la Dispensa; se link assenti, messaggio «senza prodotti in vetrina».

---

## 8. Stati vuoti (copy attuale)

| Condizione | Messaggio UI |
|------------|----------------|
| Settimana senza lavori | «Settimana tranquilla» + invito a Dispensa |
| Dispensa vuota | «Dispensa vuota per ora» (finestra 8–30 gg) |
| Solo controlli foto, no piano | Warning: usare «Crea piano annuale» |
| Caricamento / generazione | «Caricamento…» / «Generazione… (1–2 min)» |

---

## 9. Accessibilità e animazioni

- Tab con `role="tablist"` / `role="tabpanel"`.
- Accordion: `aria-expanded`, `aria-controls`; animazione `grid-template-rows` + `prefers-reduced-motion: reduce` disabilita transizione.
- **Non** usato Framer Motion (solo CSS nativo, bundle più leggero).

---

## 10. Domande aperte per la revisione Gemini

1. **`titolo_semplice` vs `tipo_intervento`:** il backend produce già linguaggio semplice o serve un campo dedicato `titolo_semplice` in `dettaglio_trattamento`?
2. **Dispensa 8–30 giorni:** finestra corretta per acquisti anticipati in Italia (Bottos / garden center)?
3. **Fitofarmaci:** come mostrare avviso legale senza rompere minimalismo (icona ⚠️ + link PAN)?
4. **Settimana vuota ma piano pieno:** mostrare teaser «prossimo lavoro tra X giorni»?
5. **Ripristino vista annuale:** serve link «Vedi tutto l’anno» per greenkeeper?

---

## 11. Roadmap suggerita (solo UI — da validare)

| Sprint | Must | Should | Nice |
|--------|------|--------|------|
| **S1** | Campi DB `titolo_semplice` / `descrizione_semplice` in seed Gemini | Bottom-sheet scienza su mobile | Animazione check completato |
| **S2** | Avviso fitofarmaco discreto in TaskCard | Link acquisto / scheda prodotto in Dispensa | Pull-to-refresh |
| **S3** | Teaser prossimo intervento se settimana vuota | Vista annuale collassabile | Notifiche push «lavoro di domani» |

---

## 12. Verifica manuale (test plan)

1. Accedi a https://agripocket-azure.vercel.app/calendario con account che ha piano generato.
2. Tab **Questa settimana**: verifica card con icona, «Perché lo facciamo?», espansione testo lungo.
3. Segna **Fatto ✓** → ricarica pagina → stato completato persistente.
4. Tab **La tua dispensa**: verifica raggruppamento mese e nomi prodotto (se link calendario↔vetrina eseguito).
5. Account senza piano: solo warning + pulsante crea piano (no abitudini).
6. Intervento in ritardo: compare in **Da recuperare** sopra i giorni della settimana.

---

## 13. Riferimenti incrociati documentazione

| Documento | Contenuto |
|-----------|-----------|
| `docs/RELAZIONE_CALENDARIO_GEMINI.md` | Pipeline generazione piano, guardrail, meteo, DB |
| `docs/PRODOTTI_ITALIA_INGEST.md` | Vetrina `prodotti_mercato` e link a interventi |
| `docs/RELAZIONE_AGRIPOCKET_GEMINI.md` | Panoramica app e deploy |

---

*Fine relazione UI Calendario Solum — maggio 2026*
