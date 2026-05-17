#!/usr/bin/env python3
"""Prova molte URL extension e crawl quelle nuove e raggiungibili."""

import subprocess
import sys
from pathlib import Path

import requests

from turf_knowledge_crawler import carica_url_gia_crawlati, normalizza_url

DIR = Path(__file__).resolve().parent
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html",
}

CANDIDATES = [
    # Iowa State (yardandgarden + turfgrass blog)
    "https://yardandgarden.extension.iastate.edu/encyclopedia/brown-patch-turfgrass",
    "https://yardandgarden.extension.iastate.edu/how-to/how-prevent-turfgrass-diseases",
    "https://yardandgarden.extension.iastate.edu/article/2025/08/whats-wrong-my-lawn-lawn-diseases-prominent-year",
    "https://www.extension.iastate.edu/turfgrass/blog/summer-turf-diseases-home-lawns",
    "https://www.extension.iastate.edu/news/dollar-spot-turfgrass",
    "https://hortnews.extension.iastate.edu/2014/7-9/dollarspot",
    "https://hortnews.extension.iastate.edu/2013/6-19/brownpatch",
    # Rutgers
    "https://njaes.rutgers.edu/pubs/fs1239/",
    "https://njaes.rutgers.edu/pubs/fs386/",
    "https://njaes.rutgers.edu/pubs/fs384/",
    # Cornell turf
    "https://blogs.cornell.edu/turf/2010/07/12/dollar-spot/",
    "https://blogs.cornell.edu/turf/2009/06/15/brown-patch/",
    # Ohio State
    "https://bygl.osu.edu/node/855",
    "https://bygl.osu.edu/index.php/node/1685",
    # UGA
    "https://extension.uga.edu/publications/detail.html?number=C1087-4",
    "https://extension.uga.edu/publications/detail.html?number=B1233",
    # Texas A&M
    "https://aggieturf.tamu.edu/turfgrass-weeds/diseases/",
    "https://aggieturf.tamu.edu/turfgrass-weeds/diseases/dollar-spot/",
    "https://aggieturf.tamu.edu/turfgrass-weeds/diseases/brown-patch/",
]


def main() -> int:
    gia = carica_url_gia_crawlati()
    ok: list[str] = []
    for url in CANDIDATES:
        if normalizza_url(url) in gia:
            continue
        try:
            r = requests.get(url, headers=HEADERS, timeout=25, allow_redirects=True)
            if r.status_code == 200 and len(r.text) > 700:
                t = r.text.lower()
                if any(k in t for k in ("turf", "lawn", "disease", "patch", "grass")):
                    ok.append(url)
                    print("OK", url)
                else:
                    print("skip content", url)
            else:
                print(r.status_code, url)
        except requests.RequestException as e:
            print("ERR", url, e)

    if not ok:
        print("Nessuna nuova fonte.")
        return 0

    out = DIR / "urls_probe_all.txt"
    out.write_text("\n".join(ok) + "\n", encoding="utf-8")
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
