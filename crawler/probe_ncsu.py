#!/usr/bin/env python3
"""Trova pagine NCSU *-in-turf non ancora crawlati."""

import subprocess
import sys
from pathlib import Path

import requests

from turf_knowledge_crawler import carica_url_gia_crawlati, normalizza_url

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}

SLUGS = [
    "take-all-patch", "melting-out", "pink-snow-mold", "snow-mold",
    "necrotic-ring-spot", "leaf-and-sheath-spot", "rhizoctonia-brown-patch",
    "anthracnose", "helminthosporium-leaf-spot", "drechslera-leaf-spot",
    "copper-spot", "gray-leaf-spot", "dollar-spot", "brown-patch",
    "large-patch", "yellow-tuft", "yellow-patch", "red-thread", "rust",
    "fairy-ring", "mushroom", "algae", "moss", "nematode", "weed-control",
    "turfgrass-disease-identification", "cultural-practices-to-prevent-turfgrass-diseases",
    "fungicides-for-turfgrass-disease-control", "managing-turfgrass-diseases",
    "turfgrass-ipm", "turfgrass-fertility", "establishing-turfgrass",
]

DIR = Path(__file__).resolve().parent


def main() -> int:
    gia = carica_url_gia_crawlati()
    ok: list[str] = []
    for slug in SLUGS:
        url = f"https://content.ces.ncsu.edu/{slug}-in-turf"
        if normalizza_url(url) in gia:
            continue
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code == 200 and len(r.text) > 800:
                ok.append(url)
                print("OK", url)
        except requests.RequestException:
            pass
    if not ok:
        print("Nessun nuovo URL NCSU.")
        return 0
    out = DIR / "urls_ncsu_extra.txt"
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
