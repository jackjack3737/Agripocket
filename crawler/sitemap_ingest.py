#!/usr/bin/env python3
"""Scopre URL da sitemap XML e le passa al crawler HTML."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import requests
import yaml

from ingest_core import (
    DIR,
    IngestStats,
    carica_fonti_viste,
    ingest_testo,
    normalizza_fonte,
    setup_clients,
)
from turf_knowledge_crawler import scarica_pagina, estrai_testo_principale

NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}


def carica_config() -> dict:
    path = DIR / "sources_volume.yaml"
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


# Keyword "forti": una sola basta (turf / malattie / fitofarmaci prato)
STRONG_KEYWORDS_DEFAULT = (
    "turf",
    "lawn",
    "prato",
    "grass",
    "disease",
    "fungic",
    "pathol",
    "patch",
    "pythium",
    "anthracnose",
    "nematod",
    "fairway",
    "greens",
    "putting",
    "sod",
    "turfgrass",
    "in-turf",
)

# Nel testo serve almeno un termine turf/prato (non basta "disease" generico)
TURF_REQUIRED = re.compile(
    r"turf|lawn|grass|prato|erboso|fairway|turfgrass|bermudagrass|zoysiagrass|"
    r"fescue|centipedegrass|st\.?\s*augustine|putting green|athletic field|sod",
    re.I,
)
TURF_AGRONOMIC = re.compile(
    r"fungic|pathol|pythium|anthracnose|nematod|dollar spot|brown patch|"
    r"patch disease|rust|mildew|ipm|herbic|irrigation|mowing|pest management",
    re.I,
)


def url_ok(url: str, cfg: dict) -> bool:
    u = url.lower()
    path = urlparse(url).path.lower()
    if any(x in u for x in cfg.get("exclude_path_fragments", [])):
        return False
    strong = tuple(cfg.get("strong_keywords", STRONG_KEYWORDS_DEFAULT))
    if any(k in path for k in strong):
        return True
    keys = cfg.get("include_keywords", [])
    # Keyword generiche solo nel path (non nel dominio, es. yardandgarden)
    hits = sum(1 for k in keys if k in path)
    return hits >= 2


TEXT_EXCLUDE = re.compile(
    r"asparagus production|honey bee|blueberry|christmas tree|"
    r"home vegetable garden|mummy berry|ornamental herbicide ii|"
    r"japanese stiltgrass|controlling sedges in landscape|"
    r"growing orchids indoors|growing succulents indoors|"
    r"diagnosing houseplant",
    re.I,
)


def testo_web_valido(testo: str, url: str = "") -> bool:
    """Scarta pagine senza riferimento esplicito a tappeto erboso / lawn."""
    u = url.lower()
    min_len = 120 if any(k in u for k in ("turf", "lawn", "grass", "prato")) else 200
    if len(testo) < min_len:
        return False
    if not TURF_REQUIRED.search(testo):
        return False
    if TEXT_EXCLUDE.search(testo):
        occ = testo.lower().count("turf") + testo.lower().count("lawn")
        if occ < 4:
            return False
    # Calendari/manuali turf: basta TURF_REQUIRED; guide malattie anche termine fito
    if TURF_AGRONOMIC.search(testo):
        return True
    return len(testo) >= 400 and testo.lower().count("turf") + testo.lower().count("lawn") >= 3


def url_score(url: str, cfg: dict) -> str:
    u = url.lower()
    strong = tuple(cfg.get("strong_keywords", STRONG_KEYWORDS_DEFAULT))
    if any(k in u for k in strong):
        return "alta"
    return "media"


def fetch_xml(url: str) -> bytes | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=45)
        r.raise_for_status()
        return r.content
    except requests.RequestException as exc:
        print(f"  [ERRORE] sitemap {url}: {exc}")
        return None


def _is_nested_sitemap_url(url: str) -> bool:
    """Sitemap figlia (.xml, .xml.gz o paginata tipo sitemap.xml?page=1)."""
    u = url.lower().strip()
    if u.endswith(".xml") or u.endswith(".xml.gz"):
        return True
    path = urlparse(u).path.lower()
    return "sitemap" in path


def parse_sitemap_urls(xml_bytes: bytes, source_url: str) -> list[str]:
    """Estrae <loc> da urlset o segue sitemap index."""
    urls: list[str] = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return urls

    tag = root.tag.lower()
    if tag.endswith("sitemapindex"):
        for loc in root.findall(".//sm:loc", NS) + root.findall(".//{*}loc"):
            child = (loc.text or "").strip()
            if child and _is_nested_sitemap_url(child):
                data = fetch_xml(child)
                if data:
                    urls.extend(parse_sitemap_urls(data, child))
        return urls

    for loc in root.findall(".//sm:loc", NS) + root.findall(".//{*}loc"):
        u = (loc.text or "").strip()
        if u and not u.endswith(".xml"):
            urls.append(u)
    return urls


def raccogli_da_sitemaps(
    cfg: dict,
    max_urls: int | None = None,
    max_per_sitemap: int | None = None,
    only_sitemap: str | None = None,
) -> list[str]:
    visti: set[str] = set()
    out: list[str] = []
    for sm in cfg.get("sitemaps", []):
        if only_sitemap and sm != only_sitemap:
            continue
        print(f"Sitemap: {sm}")
        data = fetch_xml(sm)
        if not data:
            continue
        per_sm = 0
        for u in parse_sitemap_urls(data, sm):
            if u in visti:
                continue
            visti.add(u)
            if url_ok(u, cfg):
                out.append(u)
                per_sm += 1
                if max_per_sitemap and per_sm >= max_per_sitemap:
                    break
    order = {"alta": 0, "media": 1}
    turf_markers = ("turf", "lawn", "prato", "grass", "fairway", "turfgrass", "erboso")
    article_markers = (
        "turfgrass-diseases", "causal-fungus", "-on-turfgrass",
        "dollar-spot", "brown-patch", "red-thread", "pythium", "gray-leaf",
        "summer-patch", "large-patch", "rust-on",
    )
    hub_markers = (
        "/see-all-", "/experts/", "optimize-your-business",
        "market-trends", "getting-started", "keep-up-with-regulations",
        "latest-research", "common-problems/",
    )

    def _sort_key(u: str) -> tuple:
        ul = u.lower()
        path = urlparse(u).path.strip("/")
        is_article = any(m in ul for m in article_markers) or (
            path.count("/") == 0 and path.count("-") >= 3
        )
        is_hub = any(m in ul for m in hub_markers) or ul.endswith(
            ("/trees-lawns-and-landscaping/", "/turfgrass-and-lawn-care/")
        )
        return (
            order.get(url_score(u, cfg), 2),
            0 if is_article else 1,
            0 if any(k in ul for k in turf_markers) else 1,
            1 if is_hub else 0,
            -len(path),
        )

    out.sort(key=_sort_key)
    if max_urls:
        out = out[:max_urls]
    print(f"URL filtrate dalle sitemap: {len(out)}")
    return out


def preview_urls(
    max_urls: int = 80,
    *,
    max_per_sitemap: int | None = None,
    only_sitemap: str | None = None,
) -> None:
    """Mostra campione URL senza scaricare né caricare su DB."""
    cfg = carica_config()
    urls = raccogli_da_sitemaps(
        cfg,
        max_urls=max_urls * 3,
        max_per_sitemap=max_per_sitemap,
        only_sitemap=only_sitemap,
    )
    viste = carica_fonti_viste()
    nuove = [u for u in urls if normalizza_fonte(u) not in viste]

    print("\n=== ANTEPRIMA SITEMAP (nessun upload) ===")
    print(f"URL che passano filtro: {len(urls)} | Non ancora crawl: {len(nuove)}")

    domini = Counter(urlparse(u).netloc for u in urls)
    print("\nPer dominio:")
    for dom, n in domini.most_common(15):
        print(f"  {n:4d}  {dom}")

    score_cnt = Counter(url_score(u, cfg) for u in urls)
    print(f"\nRilevanza URL: alta={score_cnt['alta']} media={score_cnt['media']}")

    print("\nCampione (prime 25 nuove):")
    for u in nuove[:25]:
        print(f"  [{url_score(u, cfg)}] {u}")

    sospette = [
        u
        for u in urls
        if url_score(u, cfg) == "media"
        and not any(
            x in u.lower()
            for x in ("turf", "lawn", "prato", "grass", "disease", "fungic")
        )
    ]
    if sospette:
        print(f"\nAttenzione: {len(sospette)} URL solo keyword generiche (es. garden+plant)")
        for u in sospette[:8]:
            print(f"  [?] {u}")


def elabora_html_url(
    url: str,
    cfg: dict,
    config: dict,
    supabase,
    stats: IngestStats,
    max_chunks: int | None,
    *,
    force: bool = False,
) -> None:
    if not force and normalizza_fonte(url) in carica_fonti_viste():
        return
    print(f">> {url}")
    html = scarica_pagina(url)
    if not html:
        return
    testo, titolo = estrai_testo_principale(html, url)
    if not testo:
        print("  (nessun testo)")
        return
    if not testo_web_valido(testo, url):
        print(f"  [SALTO] testo non turf/agronomico ({len(testo)} char)")
        return
    titolo_breve = (titolo or "")[:60]
    print(f"  OK titolo: {titolo_breve} | {len(testo)} char")
    ingest_testo(
        testo,
        url,
        config,
        supabase,
        stats,
        tipo="web",
        titolo=titolo,
        max_chunks=max_chunks,
        chunk_size=cfg.get("chunk_size", 500),
    )


def carica_url_da_file(path: str) -> list[str]:
    p = DIR / path if not Path(path).is_absolute() else Path(path)
    urls: list[str] = []
    for line in p.read_text(encoding="utf-8").splitlines():
        u = line.strip()
        if u and not u.startswith("#"):
            urls.append(u)
    return urls


def run_from_url_file(
    path: str,
    *,
    max_chunks: int | None = 5000,
    force: bool = False,
) -> IngestStats:
    cfg = carica_config()
    config, supabase = setup_clients()
    stats = IngestStats()
    urls = carica_url_da_file(path)
    print(f"URL da file: {len(urls)}")
    for url in urls:
        if not stats.budget_rimasto(max_chunks):
            break
        try:
            elabora_html_url(
                url, cfg, config, supabase, stats, max_chunks, force=force
            )
        except Exception as exc:
            stats.errori += 1
            print(f"  [ERRORE] {url}: {exc}")
    return stats


def run(
    *,
    max_urls: int = 500,
    max_chunks: int | None = 5000,
    max_per_sitemap: int | None = None,
    only_sitemap: str | None = None,
) -> IngestStats:
    cfg = carica_config()
    config, supabase = setup_clients()
    stats = IngestStats()
    urls = raccogli_da_sitemaps(
        cfg,
        max_urls=max_urls,
        max_per_sitemap=max_per_sitemap,
        only_sitemap=only_sitemap,
    )
    for url in urls:
        if not stats.budget_rimasto(max_chunks):
            break
        try:
            elabora_html_url(url, cfg, config, supabase, stats, max_chunks)
        except Exception as exc:
            stats.errori += 1
            print(f"  [ERRORE] {url}: {exc}")
    return stats


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Ingest da sitemap XML")
    p.add_argument("--max-urls", type=int, default=200)
    p.add_argument("--max-chunks", type=int, default=3000)
    p.add_argument(
        "--max-per-sitemap",
        type=int,
        default=None,
        help="Limite URL per singola sitemap (default: tutte)",
    )
    p.add_argument(
        "--preview",
        action="store_true",
        help="Solo elenco URL filtrate, senza ingest",
    )
    p.add_argument(
        "--preview-limit",
        type=int,
        default=80,
        help="Quante URL mostrare in anteprima",
    )
    p.add_argument(
        "--only-sitemap",
        type=str,
        default=None,
        help="URL esatta sitemap da sources_volume.yaml (es. Purdue index)",
    )
    p.add_argument(
        "--url-file",
        type=str,
        default=None,
        help="File con URL (una per riga), es. urls_usa_finish.txt",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Ignora crawled_urls.txt (re-ingest URL gia loggate)",
    )
    args = p.parse_args()
    if args.url_file:
        s = run_from_url_file(
            args.url_file, max_chunks=args.max_chunks, force=args.force
        )
        print(
            f"Fine: {s.chunks_inseriti} chunk, {s.fonti_ok} fonti, "
            f"{s.chunks_saltati} saltati, {s.errori} errori"
        )
        raise SystemExit(0)
    if args.preview:
        preview_urls(
            max_urls=args.preview_limit,
            max_per_sitemap=args.max_per_sitemap,
            only_sitemap=args.only_sitemap,
        )
        raise SystemExit(0)
    s = run(
        max_urls=args.max_urls,
        max_chunks=args.max_chunks,
        max_per_sitemap=args.max_per_sitemap,
        only_sitemap=args.only_sitemap,
    )
    print(
        f"Fine: {s.chunks_inseriti} chunk, {s.fonti_ok} fonti, "
        f"{s.chunks_saltati} saltati, {s.errori} errori"
    )
