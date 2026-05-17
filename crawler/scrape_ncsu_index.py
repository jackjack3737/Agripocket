#!/usr/bin/env python3
"""Estrae tutti i link *-in-turf da NCSU e crawl quelli nuovi."""

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests

from turf_knowledge_crawler import carica_url_gia_crawlati, normalizza_url

DIR = Path(__file__).resolve().parent
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}

SEARCH_URLS = [
    "https://content.ces.ncsu.edu/search?keys=turf+disease",
    "https://content.ces.ncsu.edu/search?keys=turfgrass+disease",
    "https://content.ces.ncsu.edu/search?keys=lawn+disease",
]


def main() -> int:
    trovati: set[str] = set()
    for page in SEARCH_URLS:
        try:
            r = requests.get(page, headers=HEADERS, timeout=30)
            if r.status_code != 200:
                continue
            for m in re.finditer(
                r"https://content\.ces\.ncsu\.edu/[a-z0-9-]+-in-turf", r.text, re.I
            ):
                trovati.add(m.group(0).split("?")[0])
            for m in re.finditer(r'href="(/[a-z0-9-]+-in-turf)"', r.text, re.I):
                trovati.add(urljoin("https://content.ces.ncsu.edu", m.group(1)))
        except requests.RequestException:
            pass

    gia = carica_url_gia_crawlati()
    nuovi = sorted(u for u in trovati if normalizza_url(u) not in gia)
    print(f"Link -in-turf trovati: {len(trovati)}, nuovi: {len(nuovi)}")

    if not nuovi:
        return 0

    out = DIR / "urls_ncsu_search.txt"
    out.write_text("\n".join(nuovi) + "\n", encoding="utf-8")
    return subprocess.run(
        [
            sys.executable,
            str(DIR / "turf_knowledge_crawler.py"),
            "-f",
            str(out),
            "--skip-crawled",
        ],
        cwd=DIR,
    ).returncode


if __name__ == "__main__":
    sys.exit(main())
