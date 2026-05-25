#!/usr/bin/env python3
"""Scopre URL prodotto su rivenditori italiani (prato/giardino/fito)."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

DIR = Path(__file__).resolve().parent
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}

SITES = {
    "zapi": {
        "seeds": [
            "https://www.zapi.it/",
            "https://www.zapi.it/it/",
        ],
        "domain": "zapi.it",
        "ok": lambda u: (
            "zapi.it" in u
            and "/it/" in u
            and any(x in u.lower() for x in ("prato", "diserb", "concim", "fungic", "insettic", "prodott", "nutriz", "giardin"))
            and u.endswith(".html")
        ),
        "follow": lambda u: "zapi.it" in u and ("/it/" in u or u.rstrip("/").endswith("zapi.it")),
        "max_visit": 100,
    },
    "compo_expert": {
        "seeds": [
            "https://compo-expert.com/it-IT/colture/tappeti-erbosi-manutenzione-del-verde",
            "https://compo-expert.com/it-IT/gruppi-di-prodotti",
        ],
        "domain": "compo-expert.com",
        "ok": lambda u: "compo-expert.com/it-IT" in u and len(u) > 45,
        "follow": lambda u: "compo-expert.com/it-IT" in u,
        "max_visit": 120,
    },
    "agrieuro_prato": {
        "seeds": ["https://www.agrieuro.com/"],
        "domain": "agrieuro.com",
        "ok": lambda u: (
            "agrieuro.com" in u
            and re.search(r"/\d{3,}-[a-z0-9-]+\.html", u, re.I)
        ),
        "follow": lambda u: "agrieuro.com" in u and ("categoria" in u or "prato" in u or "giardin" in u or "concim" in u),
        "max_visit": 150,
    },
    "biogarden": {
        "seeds": ["https://www.garden.bayer.it/"],
        "domain": "bayer.it",
        "ok": lambda u: "bayer.it" in u and len(urlparse(u).path) > 8,
        "follow": lambda u: "bayer.it" in u or "garden.bayer" in u,
        "max_visit": 100,
    },
    "icl_grow": {
        "seeds": [
            "https://icl-growingsolutions.com/it-it/turf-landscape/",
            "https://icl-growingsolutions.com/it-it/turf-landscape/products/",
        ],
        "domain": "icl-growingsolutions.com",
        "ok": lambda u: "icl-growingsolutions.com" in u and "/products/" in u,
        "follow": lambda u: "icl-growingsolutions.com" in u and "turf-landscape" in u,
        "max_visit": 150,
    },
    "barenbrug": {
        "seeds": [
            "https://www.barenbrug.it/",
            "https://www.barenbrug.it/tappeto-erboso",
            "https://www.barenbrug.it/tappeto-erboso/products",
        ],
        "domain": "barenbrug.it",
        "ok": lambda u: "barenbrug.it" in u and ("/products/" in u or "/tappeto-erboso/products" in u),
        "follow": lambda u: "barenbrug.it" in u and ("tappeto-erboso" in u or "/products" in u),
        "max_visit": 150,
    },
    "geogreen": {
        "seeds": [
            "https://www.geogreensrl.com/",
            "https://www.geogreensrl.com/tappeti-erbosi/",
            "https://www.geogreensrl.com/prodotti/",
        ],
        "domain": "geogreensrl.com",
        "ok": lambda u: "geogreensrl.com/prodotti/" in u and len(urlparse(u).path) > 12,
        "follow": lambda u: "geogreensrl.com" in u,
        "max_visit": 150,
    },
    "herbatech": {
        "seeds": [
            "https://www.herbatech.com/",
            "https://www.herbatech.com/prodotti/miscugli-di-semi-per-prato",
            "https://www.herbatech.com/prodotti/concimi-granulari-microgranulari-per-prato",
        ],
        "domain": "herbatech.com",
        "ok": lambda u: (
            "herbatech.com" in u
            and (
                "/prodotti-speciali/" in u
                or ("/prodotti/" in u and len(urlparse(u).path.split("/")) >= 4)
            )
            and "herbatech.com/prodotti$" not in u.replace("https://", "").replace("http://", "")
        ),
        "follow": lambda u: "herbatech.com" in u,
        "max_visit": 200,
    },
    "padana_sementi": {
        "seeds": [
            "https://www.padanasementi.com/",
            "https://www.padanasementi.com/categoria-prodotto/sementi-per-lagricoltura/miscugli-prato-stabile/",
        ],
        "domain": "padanasementi.com",
        "ok": lambda u: "padanasementi.com/prodotto/" in u,
        "follow": lambda u: "padanasementi.com" in u and ("prodotto" in u or "categoria-prodotto" in u),
        "max_visit": 150,
    },
    "icl_everis": {
        "seeds": ["https://www.everis.it/"],
        "domain": "everis.it",
        "ok": lambda u: "everis.it" in u and len(urlparse(u).path) > 3,
        "follow": lambda u: "everis.it" in u,
        "max_visit": 80,
    },
}


def estrai_link(html: str, base: str, domain: str) -> set[str]:
    out: set[str] = set()
    for m in re.finditer(r'href=["\']([^"\']+)["\']', html, re.I):
        href = m.group(1).strip()
        if href.startswith("#") or href.startswith("mailto:"):
            continue
        if href.startswith("//"):
            href = "https:" + href
        elif href.startswith("/"):
            href = urljoin(base, href)
        if domain not in href:
            continue
        out.add(href.split("#")[0].split("?")[0])
    return out


def crawl_site(site_id: str, cfg: dict) -> list[str]:
    trovati: set[str] = set()
    visitati: set[str] = set()
    coda = list(cfg["seeds"])
    max_visit = cfg.get("max_visit", 100)
    ok_fn = cfg["ok"]
    follow_fn = cfg["follow"]
    domain = cfg["domain"]

    while coda and len(visitati) < max_visit:
        url = coda.pop(0)
        if url in visitati:
            continue
        visitati.add(url)
        try:
            r = requests.get(url, headers=HEADERS, timeout=35)
            if r.status_code != 200:
                print(f"  {r.status_code} {url[:70]}")
                continue
            links = estrai_link(r.text, url, domain)
            prima = len(trovati)
            for u in links:
                if ok_fn(u):
                    trovati.add(u)
                if follow_fn(u) and u not in visitati and len(coda) < max_visit * 2:
                    coda.append(u)
            print(f"  {url[:65]}… +{len(trovati) - prima} (tot {len(trovati)})")
        except Exception as e:
            print(f"  ERR {url[:50]}… {e}")

    return sorted(trovati)


def main() -> None:
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--site", default="all", help="id sito o 'all'")
    args = p.parse_args()

    ids = list(SITES.keys()) if args.site == "all" else [args.site]
    for sid in ids:
        if sid not in SITES:
            print(f"Sito sconosciuto: {sid}")
            continue
        print(f"\n=== {sid} ===")
        urls = crawl_site(sid, SITES[sid])
        out = DIR / f"urls_{sid}.txt"
        out.write_text("\n".join(urls) + "\n", encoding="utf-8")
        print(f"-> {out} ({len(urls)} URL)")


if __name__ == "__main__":
    main()
