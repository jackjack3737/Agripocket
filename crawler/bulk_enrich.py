#!/usr/bin/env python3
"""
Arricchimento massivo: valida URL da bulk_sources.txt, discover_urls,
poi lancia il crawler fino a esaurire le fonti nuove.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import requests

from turf_knowledge_crawler import (
    carica_url_gia_crawlati,
    carica_url_da_file,
    normalizza_url,
)

DIR = Path(__file__).resolve().parent
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
}


def verifica(url: str) -> bool:
    try:
        r = requests.get(url, headers=HEADERS, timeout=25, allow_redirects=True)
        if r.status_code != 200 or len(r.text) < 600:
            return False
        t = r.text.lower()
        return "turf" in t or "lawn" in t or "disease" in t or "patch" in t
    except requests.RequestException:
        return False


def raccogli_candidati() -> list[str]:
    files = [
        DIR / "bulk_sources.txt",
        DIR / "urls_pending.txt",
    ]
    candidati: list[str] = []
    for f in files:
        if f.exists():
            candidati.extend(carica_url_da_file(f))

    # discover
    subprocess.run([sys.executable, str(DIR / "discover_urls.py")], cwd=DIR, check=False)
    pending = DIR / "urls_pending.txt"
    if pending.exists():
        candidati.extend(carica_url_da_file(pending))

    # dedup preservando ordine
    visti: set[str] = set()
    unici: list[str] = []
    for u in candidati:
        k = normalizza_url(u)
        if k not in visti:
            visti.add(k)
            unici.append(u.strip())
    return unici


def main() -> int:
    gia = carica_url_gia_crawlati()
    candidati = raccogli_candidati()
    nuovi = [u for u in candidati if normalizza_url(u) not in gia]

    print(f"Candidati totali: {len(candidati)}")
    print(f"Già crawlati: {len(gia)}")
    print(f"Da verificare: {len(nuovi)}")

    ok: list[str] = []
    for i, url in enumerate(nuovi, 1):
        if verifica(url):
            ok.append(url)
            print(f"  OK [{i}/{len(nuovi)}] {url}")
        else:
            print(f"  -- [{i}/{len(nuovi)}] {url}")

    if not ok:
        print("Nessuna nuova fonte raggiungibile.")
        return 0

    out = DIR / "urls_bulk_run.txt"
    out.write_text("\n".join(ok) + "\n", encoding="utf-8")
    print(f"\nAvvio crawler su {len(ok)} URL -> {out.name}")

    return subprocess.run(
        [
            sys.executable,
            str(DIR / "turf_knowledge_crawler.py"),
            "-f",
            str(out),
            "--skip-crawled",
            "--delay",
            "0.5",
        ],
        cwd=DIR,
    ).returncode


if __name__ == "__main__":
    sys.exit(main())
