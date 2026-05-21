# Manuali Turfgrass (ingest RAG)

Metti qui i 4 PDF universitari, poi dalla cartella `web/`:

```bash
npm install
npm run ingest:books
```

Variabili in `crawler/.env` (o `web/.env.local`): `API_KEY` / `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`.

Opzioni: `--dry-run` | `--book "Fundamentals"` | `--from-chunk 120` | `--force` (sostituisce ingest parallelo)

Prima di ripartire: `npm run kb:libri:prepare` (dedupe + cleanup meta). L'ingest salta i chunk già presenti in DB.
