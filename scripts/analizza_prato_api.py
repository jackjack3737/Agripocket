#!/usr/bin/env python3
"""
API locale per analisi foto prato (stessa logica dell'Edge Function).
Avvio: python scripts/analizza_prato_api.py
Vite proxy: /api/analizza-prato → http://127.0.0.1:8788
"""

from __future__ import annotations

import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CRAWLER = ROOT / "crawler"
sys.path.insert(0, str(CRAWLER))

from dotenv import load_dotenv

load_dotenv(CRAWLER / ".env")

import requests
from supabase import create_client

from turf_knowledge_crawler import (
    carica_configurazione,
    genera_embedding,
    inizializza_provider_embedding,
)

PORT = int(os.environ.get("ANALIZZA_PORT", "8788"))
GEMINI_KEY = os.environ.get("API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY = os.environ.get("SUPABASE_KEY", "")
CHAT_MODEL = "gemini-2.5-flash"
_embed_cfg = None


def get_embed_cfg():
    global _embed_cfg
    if _embed_cfg is None:
        _embed_cfg = carica_configurazione()
        inizializza_provider_embedding(_embed_cfg)
    return _embed_cfg


def profile_text(p: dict | None) -> str:
    if not p:
        return "Profilo prato: non compilato."
    parts = [
        p.get("uso") and f"Uso: {p['uso']}",
        p.get("tipo_seme") and f"Tipo erba: {p['tipo_seme']}",
        p.get("marca_seme") and f"Marca: {p['marca_seme']}",
        p.get("esposizione") and f"Esposizione: {p['esposizione']}",
        p.get("tipo_terreno") and f"Terreno: {p['tipo_terreno']}",
        p.get("irrigazione") and f"Irrigazione: {p['irrigazione']}",
        p.get("superficie_mq") and f"Superficie: {p['superficie_mq']} m²",
        p.get("note") and f"Note: {p['note']}",
    ]
    return "\n".join(x for x in parts if x) or "Profilo minimo."


def gemini_generate(parts: list, json_mode: bool = False, max_tokens: int = 8192) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{CHAT_MODEL}"
        f":generateContent?key={GEMINI_KEY}"
    )
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.35,
            "maxOutputTokens": max_tokens,
        },
    }
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    r = requests.post(url, json=body, timeout=120)
    r.raise_for_status()
    data = r.json()
    text = "".join(
        p.get("text", "")
        for p in data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    )
    if not text.strip():
        raise RuntimeError("Risposta Gemini vuota")
    return text


def analizza(image_b64: str, mime: str, user_id: str) -> dict:
    admin = create_client(SUPABASE_URL, SERVICE_KEY)
    prof = admin.table("prato_profilo").select("*").eq("user_id", user_id).execute()
    profilo = prof.data[0] if prof.data else None

    vision_prompt = f"""Sei il miglior agronomo di tappeto erboso al mondo. Analizza questa foto.

Profilo sito:
{profile_text(profilo)}

Rispondi SOLO JSON valido (italiano) con: sintesi_visiva, tipo_erba_stimato, stato_generale,
problemi_rilevati (array), taglio, feltro_thatch, foglie_debris, stress_idrici, malattie_sospette,
erbette_infestanti, query_ricerca_kb. Includi taglio basso, feltro, troppe foglie se visibili."""

    vision_raw = gemini_generate(
        [
            {"text": vision_prompt},
            {"inlineData": {"mimeType": mime, "data": image_b64}},
        ],
        json_mode=True,
        max_tokens=2048,
    )
    try:
        vision = json.loads(re.sub(r"```json|```", "", vision_raw).strip())
    except json.JSONDecodeError:
        vision = {"sintesi_visiva": vision_raw, "query_ricerca_kb": vision_raw[:200]}

    search = "\n".join(
        filter(
            None,
            [
                vision.get("query_ricerca_kb"),
                vision.get("sintesi_visiva"),
                profile_text(profilo),
            ],
        )
    )
    emb = genera_embedding(search[:8000], get_embed_cfg())
    chunks = admin.rpc(
        "match_documenti",
        {"match_count": 14, "match_threshold": 0.2, "query_embedding": emb},
    ).execute()

    kb = ""
    for i, c in enumerate(chunks.data or []):
        sim = c.get("somiglianza")
        s = f" ({sim:.0%})" if sim is not None else ""
        kb += f"[{i+1}]{s}\n{c.get('soluzione','')}\n\n---\n\n"

    report_prompt = f"""Sei il miglior agronomo di tappeto erboso al mondo.

Profilo: {profile_text(profilo)}
Visione: {json.dumps(vision, ensure_ascii=False)}
Knowledge base:
{kb or '(nessun chunk)'}

Scrivi report Markdown in italiano con sezioni ## :
Cosa vedo, Diagnosi, Taglio, Feltro/thatch, Foglie/detriti, Irrigazione, Malattie, Piano d'azione, Cosa evitare, Nota agronomica.
Sii completo e specifico."""

    report = gemini_generate([{"text": report_prompt}], max_tokens=8192)
    return {"report": report, "vision": vision, "chunksUsed": len(chunks.data or [])}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(fmt % args)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path != "/analizza-prato":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        auth = self.headers.get("Authorization", "")
        user_id = body.get("userId")
        if not user_id and auth.startswith("Bearer "):
            try:
                anon = os.environ.get("SUPABASE_ANON_KEY", "")
                client = create_client(SUPABASE_URL, anon)
                user = client.auth.get_user(auth[7:]).user
                user_id = user.id if user else None
            except Exception:
                pass
        if not user_id:
            self._json(401, {"error": "userId o Authorization richiesti"})
            return

        img = re.sub(r"^data:image/\w+;base64,", "", body.get("imageBase64", ""))
        mime = body.get("mimeType", "image/jpeg")
        try:
            out = analizza(img, mime, user_id)
            self._json(200, out)
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")

    def _json(self, code: int, data: dict):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def main():
    if not GEMINI_KEY or not SERVICE_KEY:
        print("Configura crawler/.env (API_KEY, SUPABASE_KEY)")
        sys.exit(1)
    print(f"Analizza prato API http://127.0.0.1:{PORT}/analizza-prato")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
