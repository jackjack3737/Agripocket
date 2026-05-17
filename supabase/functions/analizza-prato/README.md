# analizza-prato

Edge Function: foto del prato → Gemini Vision → RAG su `tgif_knowledge_base` → report agronomico.

## Deploy (una volta)

```bash
cd c:\Users\jackj\Desktop\App\AgriPocket
supabase login
supabase link --project-ref azkpckrybldypqwdksjc

supabase secrets set GEMINI_API_KEY=la_tua_chiave_google_ai
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
supabase secrets set SUPABASE_ANON_KEY=sb_publishable_...

supabase functions deploy analizza-prato
```

Usa la stessa `API_KEY` / Google AI del crawler (`crawler/.env`).

La knowledge base usa già `match_documenti` (vettori 3072, `gemini-embedding-001`).
