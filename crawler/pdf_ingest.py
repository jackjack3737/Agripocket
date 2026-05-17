#!/usr/bin/env python3
"""Scarica PDF (da URL o sitemap) ed estrae testo per embedding."""

from __future__ import annotations

import io
import re
from urllib.parse import urlparse

import requests
import yaml

from ingest_core import DIR, IngestStats, ingest_testo, normalizza_fonte, setup_clients
from sitemap_ingest import carica_config, fetch_xml, parse_sitemap_urls, url_ok

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}


def estrai_testo_pdf(data: bytes) -> str:
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(data))
        parti = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                parti.append(t)
        if parti:
            return "\n\n".join(parti)
    except Exception:
        pass
    try:
        import fitz  # pymupdf

        doc = fitz.open(stream=data, filetype="pdf")
        parti = [page.get_text() for page in doc]
        doc.close()
        return "\n\n".join(p for p in parti if p.strip())
    except Exception as exc:
        raise RuntimeError(f"Estrazione PDF fallita: {exc}") from exc


def raccogli_pdf_urls(cfg: dict, max_urls: int = 300) -> list[str]:
    patterns = [p.lower() for p in cfg.get("pdf_url_patterns", [".pdf"])]
    trovati: list[str] = []
    visti: set[str] = set()
    for sm in cfg.get("sitemaps", []):
        data = fetch_xml(sm)
        if not data:
            continue
        for u in parse_sitemap_urls(data, sm):
            if u in visti:
                continue
            visti.add(u)
            ul = u.lower()
            if any(p in ul for p in patterns) and url_ok(u, cfg):
                trovati.append(u)
                if len(trovati) >= max_urls:
                    return trovati
    return trovati


def elabora_pdf(
    url: str,
    cfg: dict,
    config: dict,
    supabase,
    stats: IngestStats,
    max_chunks: int | None,
) -> None:
    print(f">> PDF {url}")
    try:
        r = requests.get(url, headers=HEADERS, timeout=60)
        r.raise_for_status()
        if "pdf" not in r.headers.get("Content-Type", "").lower() and not url.lower().endswith(
            ".pdf"
        ):
            return
        testo = estrai_testo_pdf(r.content)
    except Exception as exc:
        print(f"  [ERRORE] {exc}")
        stats.errori += 1
        return

    titolo = urlparse(url).path.split("/")[-1].replace(".pdf", "").replace("-", " ")
    ingest_testo(
        testo,
        url,
        config,
        supabase,
        stats,
        tipo="pdf",
        titolo=titolo,
        max_chunks=max_chunks,
        chunk_size=cfg.get("chunk_size", 500),
    )


def run(max_urls: int = 100, max_chunks: int | None = 2000) -> IngestStats:
    cfg = carica_config()
    config, supabase = setup_clients()
    stats = IngestStats()
    urls = raccogli_pdf_urls(cfg, max_urls=max_urls)
    print(f"PDF trovati: {len(urls)}")
    for url in urls:
        if not stats.budget_rimasto(max_chunks):
            break
        elabora_pdf(url, cfg, config, supabase, stats, max_chunks)
    return stats


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--max-urls", type=int, default=50)
    p.add_argument("--max-chunks", type=int, default=1500)
    a = p.parse_args()
    s = run(max_urls=a.max_urls, max_chunks=a.max_chunks)
    print(f"PDF: {s.chunks_inseriti} chunk inseriti")
