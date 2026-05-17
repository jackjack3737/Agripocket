#!/usr/bin/env python3
"""Scopre URL extension .edu per patologie turf e verifica che rispondano 200."""

import re
import sys
from urllib.parse import urljoin, urlparse

import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
}

SEED_PAGES = [
    "https://turf.purdue.edu/disease/",
    "https://turf.purdue.edu/extpub/turfgrass-disease-profiles-turf-disease-identification/",
    "https://extension.umd.edu/resources/yard-garden/lawns/lawn-diseases",
]

MANUAL_CANDIDATES = [
    "https://turf.purdue.edu/tool/brown-patch/",
    "https://turf.purdue.edu/tool/dollar-spot/",
    "https://turf.purdue.edu/tool/red-thread/",
    "https://turf.purdue.edu/tool/rust/",
    "https://turf.purdue.edu/tool/pythium-blight/",
    "https://turf.purdue.edu/tool/gray-leaf-spot/",
    "https://turf.purdue.edu/tool/large-patch/",
    "https://turf.purdue.edu/tool/summer-patch/",
    "https://turf.purdue.edu/tool/fairy-ring/",
    "https://turf.purdue.edu/tool/snow-molds/",
    "https://turf.purdue.edu/tool/leaf-spot-melting-out/",
    "https://turf.purdue.edu/tool/anthracnose/",
    "https://turf.purdue.edu/tool/yellow-patch/",
    "https://turf.purdue.edu/tool/take-all-patch/",
    "https://turf.purdue.edu/tool/pink-snow-mold/",
    "https://turf.purdue.edu/tool/gray-snow-mold/",
    "https://extension.umd.edu/resource/diseases-home-lawns/",
    "https://extension.umd.edu/resource/turfgrass-diseases-dollar-spot-fs-2023-0665",
    "https://extension.umd.edu/resources/yard-garden/lawns/lawn-diseases",
    "https://www.extension.iastate.edu/news/dollar-spot-turfgrass",
    "https://extension.umd.edu/resource/turfgrass-diseases-brown-patch",
    "https://extension.umd.edu/resource/red-thread-lawns",
    "https://extension.umd.edu/resource/rust-lawns",
    "https://extension.umd.edu/resource/pythium-blight-lawns",
    "https://extension.umd.edu/resource/gray-leaf-spot-lawns",
    "https://extension.umd.edu/resource/summer-patch-lawns",
    "https://extension.umd.edu/resource/large-patch-lawns",
    "https://extension.umd.edu/resource/powdery-mildew-lawns",
    "https://extension.umd.edu/resource/slime-molds-lawns",
    "https://extension.umd.edu/resource/fairy-ring-lawns",
    "https://turf.purdue.edu/attention-to-summer-disease-prevention/",
    "https://turf.purdue.edu/turf-disease-prediction-tool/",
]


def estrai_link(html: str, base: str) -> set[str]:
    trovati = set(re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I))
    out: set[str] = set()
    for href in trovati:
        url = urljoin(base, href.split("#")[0])
        p = urlparse(url)
        if p.scheme not in ("http", "https"):
            continue
        if not any(
            d in p.netloc
            for d in (
                "turf.purdue.edu",
                "extension.umd.edu",
                "extension.psu.edu",
                "extension.iastate.edu",
                "extension.umn.edu",
                "hgic.clemson.edu",
                "content.ces.ncsu.edu",
            )
        ):
            continue
        path = (p.path or "").lower()
        if any(
            x in path
            for x in (
                "/wp-content/",
                ".css",
                ".js",
                ".pdf",
                "/flash/",
                "social-media",
                "pubcat/",
                "tag/",
                "category/",
                "disease-report-",
            )
        ):
            continue
        if any(
            k in path
            for k in (
                "disease",
                "turf",
                "lawn",
                "patch",
                "spot",
                "rust",
                "mildew",
                "pythium",
                "tool/",
                "resource/",
            )
        ):
            out.add(url.split("?")[0].rstrip("/") + "/")
    return out


def verifica(url: str) -> bool:
    try:
        r = requests.get(
            url, headers=HEADERS, timeout=25, allow_redirects=True
        )
        if r.status_code != 200:
            return False
        testo = r.text.lower()
        return len(r.text) > 800 and (
            "turf" in testo or "lawn" in testo or "disease" in testo
        )
    except requests.RequestException:
        return False


def main() -> int:
    candidati: set[str] = set(MANUAL_CANDIDATES)

    for seed in SEED_PAGES:
        try:
            r = requests.get(seed, headers=HEADERS, timeout=25)
            if r.status_code == 200:
                candidati |= estrai_link(r.text, seed)
        except requests.RequestException:
            pass

    ok = sorted(u for u in candidati if verifica(u))
    out = __file__.replace("discover_urls.py", "urls_pending.txt")
    with open(out, "w", encoding="utf-8") as f:
        f.write("# URL verificate automaticamente\n")
        for u in ok:
            f.write(u + "\n")

    print(f"Verificate {len(candidati)} candidati, OK: {len(ok)}")
    print(f"Scritte in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
