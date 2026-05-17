#!/usr/bin/env python3
"""
Run continuo fino a TARGET righe in tgif_knowledge_base (default 50_000).
Log: progress_50k.log
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from ingest_core import IngestStats, init_hash_cache, setup_clients

DIR = Path(__file__).resolve().parent
LOG = DIR / "progress_50k.log"
TARGET = int(os.getenv("TARGET_RECORDS", "50000"))


def log(msg: str) -> None:
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def count_db() -> int:
    load_dotenv(DIR / ".env")
    c = create_client(
        os.getenv("SUPABASE_URL", "").strip(),
        os.getenv("SUPABASE_KEY", "").strip(),
    )
    r = c.table("tgif_knowledge_base").select("id", count="exact").limit(1).execute()
    return int(r.count or 0)


def fase(nome: str, fn, **kw) -> IngestStats:
    log(f"=== FASE: {nome} ===")
    try:
        return fn(**kw)
    except Exception as exc:
        log(f"FASE {nome} ERRORE: {exc}")
        return IngestStats()


def main() -> int:
    os.environ.setdefault("VOLUME_CHUNK_SIZE", "350")
    os.environ.setdefault("EMBED_SLEEP", "0.08")

    init_hash_cache()
    start = count_db()
    log(f"Avvio target={TARGET} | DB attuale={start}")

    if start >= TARGET:
        log("Target già raggiunto.")
        return 0

    from product_ingest import run as run_products
    from sitemap_ingest import run as run_sitemap
    from pdf_ingest import run as run_pdf
    from youtube_ingest import run as run_youtube
    from ncsu_bruteforce import run as run_ncsu_bf

    round_num = 0
    while count_db() < TARGET:
        round_num += 1
        rimanenti = TARGET - count_db()
        log(f"--- Round {round_num} | mancano ~{rimanenti} record ---")

        budget = min(rimanenti + 500, 15000)

        fase("Bottos/prodotti", run_products, max_urls=2000, max_chunks=budget // 4)
        if count_db() >= TARGET:
            break

        fase("NCSU bruteforce", run_ncsu_bf, max_chunks=budget // 3)
        if count_db() >= TARGET:
            break

        fase(
            "Sitemap HTML",
            run_sitemap,
            max_urls=min(8000, 2000 + round_num * 500),
            max_chunks=budget // 2,
        )
        if count_db() >= TARGET:
            break

        fase("PDF", run_pdf, max_urls=300 + round_num * 50, max_chunks=budget // 4)
        if count_db() >= TARGET:
            break

        fase("YouTube", run_youtube, max_chunks=min(2000, budget // 5))

        now = count_db()
        log(f"Round {round_num} fine | DB={now}")
        if round_num >= 20:
            log("Stop dopo 20 round (verifica fonti / API quota).")
            break
        time.sleep(2)

    final = count_db()
    log(f"COMPLETATO | DB={final} | +{final - start} in questa sessione")
    return 0 if final >= TARGET else 1


if __name__ == "__main__":
    sys.exit(main())
