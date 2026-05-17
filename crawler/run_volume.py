#!/usr/bin/env python3
"""
Pipeline volume AgriPocket: sitemap + PDF + YouTube + prodotti (Bottos).

Esempio (primo run, ~5k chunk):
  python run_volume.py --max-chunks 5000

Run lungo verso 50k+:
  python run_volume.py --max-chunks 50000 --max-urls 2000
"""

from __future__ import annotations

import argparse
import sys

from ingest_core import IngestStats


def main() -> int:
    p = argparse.ArgumentParser(description="Pipeline ingest volume")
    p.add_argument(
        "--max-chunks",
        type=int,
        default=5000,
        help="Limite chunk totali per questa esecuzione",
    )
    p.add_argument(
        "--max-urls",
        type=int,
        default=400,
        help="Limite URL HTML per sitemap",
    )
    p.add_argument(
        "--max-pdf",
        type=int,
        default=80,
        help="Limite PDF",
    )
    p.add_argument(
        "--skip-sitemap",
        action="store_true",
    )
    p.add_argument(
        "--skip-pdf",
        action="store_true",
    )
    p.add_argument(
        "--skip-youtube",
        action="store_true",
    )
    p.add_argument(
        "--skip-products",
        action="store_true",
    )
    p.add_argument(
        "--only",
        choices=["sitemap", "pdf", "youtube", "products"],
        help="Esegui solo un modulo",
    )
    args = p.parse_args()

    totale = IngestStats()
    budget = args.max_chunks

    def rimanente() -> int:
        return max(0, budget - totale.chunks_inseriti)

    def merge(s: IngestStats) -> None:
        totale.chunks_inseriti += s.chunks_inseriti
        totale.chunks_saltati += s.chunks_saltati
        totale.fonti_ok += s.fonti_ok
        totale.errori += s.errori

    def run_mod(name: str, fn, **kw) -> None:
        if rimanente() <= 0:
            return
        print(f"\n{'='*60}\nMODULO: {name}\n{'='*60}")
        kw["max_chunks"] = rimanente()
        merge(fn(**kw))

    only = args.only
    if only in (None, "products") and not args.skip_products:
        from product_ingest import run as run_products

        run_mod(
            "Prodotti (Bottos)",
            run_products,
            max_urls=min(args.max_urls, 250),
        )
    if only in (None, "sitemap") and not args.skip_sitemap:
        from sitemap_ingest import run as run_sitemap

        run_mod(
            "Sitemap HTML",
            run_sitemap,
            max_urls=args.max_urls,
        )
    if only in (None, "pdf") and not args.skip_pdf:
        from pdf_ingest import run as run_pdf

        run_mod("PDF", run_pdf, max_urls=args.max_pdf)
    if only in (None, "youtube") and not args.skip_youtube:
        from youtube_ingest import run as run_yt

        run_mod("YouTube", run_yt)

    print(
        f"\n=== TOTALE PIPELINE ===\n"
        f"Chunk inseriti: {totale.chunks_inseriti}\n"
        f"Fonti OK: {totale.fonti_ok}\n"
        f"Chunk saltati (dup): {totale.chunks_saltati}\n"
        f"Errori: {totale.errori}\n"
        f"Budget era: {budget}"
    )
    return 0 if totale.errori == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
