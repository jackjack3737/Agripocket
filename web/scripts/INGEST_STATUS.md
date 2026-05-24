# Stato ingest libri (aggiornato automaticamente)

## 23 mag 2026 — intervento automatico

1. **Fermato** il processo bloccato (PID 6004) che girava in loop su errori 429 Gemini.
2. **Rilanciato** con `npm run ingest:books:no-sanitize` (senza traduzione Flash).
3. **Stop immediato**: anche gli **embedding** sono bloccati — messaggio API:
   > *Your project has exceeded its monthly spending cap*
4. **Watcher attivo**: `npm run ingest:books:watch` controlla la quota ogni ~15 min e riparte da solo quando Gemini torna disponibile.

## Nel database

- Circa **1024 chunk** già presenti in `tgif_knowledge_base` (libri universitari).
- I chunk mancanti verranno inseriti al ripristino quota (stesso comando, salta quelli già presenti).

## Cosa fare tu (quando puoi)

1. Aumenta il **spend cap** su [Google AI Studio → Spend](https://aistudio.google.com/spend) oppure attendi il reset mensile.
2. Se il watcher non è in esecuzione:
   ```powershell
   cd web
   npm run ingest:books:watch
   ```
   Oppure una tantum:
   ```powershell
   npm run ingest:books:no-sanitize
   ```

## Log

- `web/scripts/ingest_books_run.log` — output ingest
- `web/scripts/ingest_watch.log` — tentativi watcher
