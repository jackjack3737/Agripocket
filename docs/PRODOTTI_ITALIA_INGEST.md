# Prodotti commerciali Italia — ingest massivo

Obiettivo: popolare `prodotti_mercato` con **tutte le schede prodotto** reperibili dai principali rivenditori italiani di prato/giardino, non solo Bottos.

## Fonti attive (multi-marca Italia)

| Sito | URL schede | Stato |
|------|------------|--------|
| **Best Prato** | 1023 | completato (~1169 inseriti) |
| **Bottos** (web + PDF) | 179 + calendari | completato (~697 PDF + web) |
| **COMPO Expert** | 277 | completato (~224 inseriti) |
| **Padana Sementi** | 271 | ingest in corso |
| **Barenbrug** | 39 | ~37 in DB |
| **Herbatech** | PDF catalogo `libri/faceb*.pdf` | `npm run mine:prodotti:herbatech` |
| **ICL** | sitemap + discover | in corso |
| **Geogreen** (geogreensrl.com) | sitemap | 403 bot — da risolvere |
| **Agrieuro, Zapi, SBM, Bayer, Agraria, Farmalux, Growshop** | discover | in espansione |
| Catalogo legacy (`Prodotti`) | 158 | seed completato |
| **Banca FITO** (registro nazionale) | — | fase 3 (tutti i fitofarmaci IT) |

Config: `crawler/product_sites_italia.yaml`

## Comandi

```powershell
cd web

# Scopri URL (Node + Python per siti difficili)
npm run discover:prodotti
cd ..\crawler
python discover_italia_retailers.py --site all

# Ingest → prodotti_mercato
npm run ingest:prodotti:italia          # Best Prato (+ altri se hanno URL)
npm run ingest:prodotti:padana          # Padana Sementi (271 schede)
npm run ingest:prodotti:marche          # Barenbrug, Geogreen, Herbatech, Padana, ICL
npm run ingest:prodotti:herbatech
npm run ingest:prodotti:extra           # tutti i rivenditori extra
npm run ingest:prodotti:bottos-web

node scripts/status_prodotti_mercato.mjs

# Collegamenti calendario ↔ vetrina (prodotti consigliati per trattamento)
npm run link:prodotti:calendario
# Poi rigenera il calendario in app (dashboard → aggiorna calendario)
```

Log consigliato in background:

```powershell
npm run ingest:prodotti:italia 2>&1 | Tee-Object scripts/ingest_prodotti_italia.log
```

## Fase 2 — altri rivenditori

In `crawler/product_sites_italia.yaml` sono preparati (disabilitati finché non si fa discover):

- Agrieuro (prato/giardino)
- Zapi
- COMPO Italia
- Mann Green / ICL

Attivarli: `enabled: true` + `npm run discover:prodotti` + ingest.

## Matchmaking interventi ↔ prodotti

Modulo: `web/server/link_prodotti_calendario.mjs`

| Regola | Punti |
|--------|-------|
| Macro/categoria compatibile | +50 |
| Esigenza molecolare in composizione/descrizione | +20 ciascuna |
| Parola chiave esigenza nel nome prodotto | +10 |
| Macro incompatibili (es. Diserbante ↔ Biostimolante) | scarto (0) |

- Restituisce **TOP 3** ordinati per `match_score` decrescente.
- Soglia minima **50 punti** — sotto soglia array vuoto (pure agronomy).
- Integrato in `genera-piano` via `trattamentoPipeline` + `rankMercatoPerIntervento`.
- Rigenera link DB template: `npm run link:prodotti:calendario`

## Copertura «tutti i prodotti vendibili in Italia»

Per **fitofarmaci registrati** (lista ufficiale completa) serve integrare la **Banca Dati FITO** (Ministero della Salute) — migliaia di registrazioni nazionali, oltre i cataloghi e-commerce.

I cataloghi web coprono il **retail prato** (Bottos, Best Prato, marchi ZAPI/ICL/COMPO/…). La Banca FITO è il passo successivo per «tutti tutti» sul piano normativo.
