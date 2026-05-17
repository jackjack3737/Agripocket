#!/usr/bin/env python3
"""Genera e prova URL NCSU *-in-turf per massimizzare pagine univoche."""

from __future__ import annotations

import requests

from ingest_core import IngestStats, carica_fonti_viste, ingest_testo, normalizza_fonte, setup_clients
from turf_knowledge_crawler import scarica_pagina, estrai_testo_principale

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}

SLUGS = [
    "anthracnose", "brown-patch", "dollar-spot", "large-patch", "summer-patch",
    "yellow-patch", "red-thread", "rust", "gray-leaf-spot", "pythium-blight",
    "pythium-root-rot", "fairy-ring", "snow-mold", "gray-snow-mold", "pink-snow-mold",
    "leaf-spot", "melting-out", "take-all-patch", "spring-dead-spot", "copper-spot",
    "yellow-tuft", "slime-mold", "algae", "nematode", "weed-control", "moss",
    "helminthosporium-leaf-spot", "drechslera-leaf-spot", "necrotic-ring-spot",
    "leaf-and-sheath-spot", "powdery-mildew", "gray-leaf-spot", "rhizoctonia",
    "cultural-practices-to-prevent-turfgrass-diseases",
    "fungicides-for-turfgrass-disease-control",
    "managing-turfgrass-diseases", "turfgrass-disease-identification",
    "establishing-turfgrass", "renovating-turfgrass", "mowing-turfgrass",
    "irrigation-turfgrass", "fertilizing-turfgrass", "aerating-turfgrass",
    "overseeding-turfgrass", "weed-management-turfgrass", "insect-management-turfgrass",
]


def run(max_chunks: int | None = 8000) -> IngestStats:
    config, supabase = setup_clients()
    stats = IngestStats()
    visti = carica_fonti_viste()

    for slug in SLUGS:
        if not stats.budget_rimasto(max_chunks):
            break
        url = f"https://content.ces.ncsu.edu/{slug}-in-turf"
        if normalizza_fonte(url) in visti:
            continue
        try:
            r = requests.head(url, headers=HEADERS, timeout=15, allow_redirects=True)
            if r.status_code not in (200, 405):
                r = requests.get(url, headers=HEADERS, timeout=20)
            if r.status_code != 200:
                continue
        except requests.RequestException:
            continue

        print(f">> NCSU {slug}")
        html = scarica_pagina(url)
        if not html:
            continue
        testo, titolo = estrai_testo_principale(html, url)
        if testo:
            ingest_testo(
                testo, url, config, supabase, stats,
                tipo="web", titolo=titolo, max_chunks=max_chunks,
            )
    return stats


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--max-chunks", type=int, default=5000)
    s = run(max_chunks=p.parse_args().max_chunks)
    print(s.chunks_inseriti, "chunk")
