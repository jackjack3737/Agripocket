#!/usr/bin/env python3
"""Ingest tutti i Calendario Verde Bottos in tgif_knowledge_base."""

from __future__ import annotations

import argparse
import re
from html.parser import HTMLParser

import requests

from ingest_core import (
    IngestStats,
    carica_configurazione,
    ingest_testo,
    setup_clients,
)
from turf_knowledge_crawler import estrai_testo_principale, scarica_pagina

BASE = "https://www.bottos1848.com"
CATEGORY = f"{BASE}/category/archivio-tecnico/blog/calendario-verde/"
POST_SITEMAP = f"{BASE}/post-sitemap.xml"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}

MESI = {
    "gennaio": 1,
    "febbraio": 2,
    "marzo": 3,
    "aprile": 4,
    "maggio": 5,
    "giugno": 6,
    "luglio": 7,
    "agosto": 8,
    "settembre": 9,
    "ottobre": 10,
    "novembre": 11,
    "dicembre": 12,
}

LINK_RE = re.compile(
    r'href="(https://www\.bottos1848\.com/\d{4}/\d{2}/\d{2}/[^"]*calendario-verde[^"]*)"',
    re.I,
)
TITLE_RE = re.compile(
    r"calendario\s+verde\s+(?:di\s+)?([a-zàèéìòù]+(?:\s*[/\-]\s*[a-zàèéìòù]+)?)\s*(\d{2,4})?",
    re.I,
)
SLUG_MESE_RE = re.compile(
    r"calendario-verde[-/](?:di[-/])?([a-z]+)(?:[-/]([a-z]+))?(?:[-/](\d{4}))?",
    re.I,
)


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        if "calendario-verde" in href.lower() and "bottos1848.com" in href:
            self.links.append(href.split("?")[0].rstrip("/"))


def _url_valido(url: str) -> bool:
    if "/category/" in url or "/tag/" in url:
        return False
    return bool(re.search(r"/\d{4}/\d{2}/\d{2}/", url))


def _normalizza_url(url: str) -> str:
    return url.split("?")[0].rstrip("/")


def scopri_da_sitemap() -> list[str]:
    try:
        r = requests.get(POST_SITEMAP, headers=HEADERS, timeout=60)
        r.raise_for_status()
    except Exception as exc:
        print(f"  [WARN] sitemap: {exc}")
        return []
    urls = []
    for loc in re.findall(r"<loc>([^<]+)</loc>", r.text):
        u = _normalizza_url(loc)
        if "calendario-verde" in u.lower() and _url_valido(u):
            urls.append(u)
    return urls


def scopri_da_archivio(max_pagine: int = 15) -> list[str]:
    trovati: set[str] = set()
    fonti = [CATEGORY, f"{BASE}/tag/calendario-verde/"]
    for base_cat in fonti:
        for page in range(1, max_pagine + 1):
            url = base_cat if page == 1 else f"{base_cat}page/{page}/"
            try:
                r = requests.get(url, headers=HEADERS, timeout=45)
                if r.status_code == 404:
                    break
                r.raise_for_status()
            except Exception as exc:
                print(f"  [WARN] {url}: {exc}")
                break
            parser = LinkCollector()
            parser.feed(r.text)
            for m in LINK_RE.finditer(r.text):
                u = _normalizza_url(m.group(1))
                if _url_valido(u):
                    trovati.add(u)
            for link in parser.links:
                u = _normalizza_url(link)
                if _url_valido(u):
                    trovati.add(u)
            if page > 1 and not parser.links and not LINK_RE.search(r.text):
                break
    return sorted(trovati)


def scopri_tutti_url(*, max_pagine: int = 15) -> list[str]:
    trovati: set[str] = set(scopri_da_sitemap())
    trovati.update(scopri_da_archivio(max_pagine=max_pagine))
    return sorted(trovati, key=lambda u: re.search(r"/(\d{4})/(\d{2})/", u).groups() if re.search(r"/(\d{4})/(\d{2})/", u) else ("", ""))


def _anno_da_slug(slug: str, path_year: int | None) -> int | None:
    m = re.search(r"(\d{4})", slug)
    if m:
        return int(m.group(1))
    m2 = re.search(r"[-/](\d{2})(?:/|$)", slug)
    if m2:
        yy = int(m2.group(1))
        return 2000 + yy if yy < 100 else yy
    return path_year


def parse_mese_anno(url: str, html: str) -> str | None:
    for blob in (
        re.search(r"<h1[^>]*>([^<]+)</h1>", html, re.I),
        re.search(r"<title[^>]*>([^<]+)</title>", html, re.I),
    ):
        if blob:
            m = TITLE_RE.search(blob.group(1))
            if m:
                nome = m.group(1).strip().replace("à", "a").title()
                anno = m.group(2)
                if anno and len(anno) == 2:
                    anno = f"20{anno}"
                if anno:
                    return f"{nome} {anno}"
                path_year = re.search(r"bottos1848\.com/(\d{4})/", url)
                if path_year:
                    return f"{nome} {path_year.group(1)}"
                return nome

    slug = url.lower().split("/")[-1]
    path_year_m = re.search(r"bottos1848\.com/(\d{4})/", url.lower())
    path_year = int(path_year_m.group(1)) if path_year_m else None

    sm = SLUG_MESE_RE.search(slug.replace("_", "-"))
    if sm:
        m1 = sm.group(1).lower().replace("à", "a")
        m2 = sm.group(2)
        anno = _anno_da_slug(slug, path_year)
        if m1 in MESI:
            label = m1.capitalize()
            if m2 and m2.lower().replace("à", "a") in MESI:
                label = f"{label}-{m2.capitalize()}"
            return f"{label} {anno}" if anno else label

    for mese in MESI:
        if mese in slug.replace("à", "a"):
            anno = _anno_da_slug(slug, path_year)
            return f"{mese.capitalize()} {anno}" if anno else mese.capitalize()

    if "febbraio" in slug and "marzo" in slug:
        anno = _anno_da_slug(slug, path_year) or path_year
        return f"Febbraio-Marzo {anno}" if anno else "Febbraio-Marzo"
    if "giugno" in slug and "luglio" in slug:
        anno = _anno_da_slug(slug, path_year) or path_year
        return f"Giugno-Luglio {anno}" if anno else "Giugno-Luglio"
    if "aprile" in slug and "maggio" in slug:
        anno = _anno_da_slug(slug, path_year) or path_year
        return f"Aprile-Maggio {anno}" if anno else "Aprile-Maggio"

    return None


def etichetta_articolo(url: str, html: str) -> str:
    label = parse_mese_anno(url, html)
    if label:
        return label
    for blob in (
        re.search(r"<h1[^>]*>([^<]+)</h1>", html, re.I),
        re.search(r"<title[^>]*>([^<]+)</title>", html, re.I),
    ):
        if blob:
            t = re.sub(r"\s*[-|].*Bottos.*", "", blob.group(1), flags=re.I).strip()
            if len(t) > 5:
                return t[:100]
    return url.rsplit("/", 1)[-1].replace("-", " ").title()


def scegli_per_mese(urls: list[str]) -> dict[int, tuple[str, str]]:
    """Per ogni mese 1-12: (url, label) preferendo 2026 poi 2025."""
    candidati: dict[int, list[tuple[int, str, str]]] = {i: [] for i in range(1, 13)}

    for url in urls:
        try:
            html = scarica_pagina(url)
        except Exception:
            html = requests.get(url, headers=HEADERS, timeout=45).text
        label = parse_mese_anno(url, html)
        if not label:
            continue
        mese_nome = label.split()[0].split("-")[0].lower()
        if mese_nome not in MESI:
            continue
        anno_m = re.search(r"(\d{4})", label)
        if not anno_m:
            continue
        mese_num = MESI[mese_nome]
        candidati[mese_num].append((int(anno_m.group(1)), label, url))

    scelti: dict[int, tuple[str, str]] = {}
    for mese_num in range(1, 13):
        opts = candidati[mese_num]
        if not opts:
            continue
        for prefer in (2026, 2025, 2024):
            match = [o for o in opts if o[0] == prefer]
            if match:
                _, label, url = sorted(match, key=lambda x: x[2])[-1]
                scelti[mese_num] = (url, label)
                break
        if mese_num not in scelti and opts:
            opts.sort(key=lambda x: x[0], reverse=True)
            _, label, url = opts[0]
            scelti[mese_num] = (url, label)
    return scelti


def arricchisci_testo(mese_label: str, testo: str) -> str:
    return (
        f"CALENDARIO VERDE BOTTOS — {mese_label}\n"
        f"Guida ufficiale mensile Bottos 1848.\n"
        f"Fonte: Bottos 1848\n\n"
        f"{testo}"
    )


def run(
    *,
    max_pagine: int = 15,
    dry_run: bool = False,
    solo_annuale: bool = False,
) -> IngestStats:
    stats = IngestStats()
    print("Scoperta URL Calendario Verde (sitemap + archivio)…")
    urls = scopri_tutti_url(max_pagine=max_pagine)
    print(f"Trovati {len(urls)} articoli\n")

    if solo_annuale:
        per_mese = scegli_per_mese(urls)
        urls_ingest = [per_mese[m][0] for m in sorted(per_mese)]
        print(f"Modalità annuale: {len(urls_ingest)} articoli (2026/2025)\n")
    else:
        urls_ingest = urls

    if dry_run:
        for i, url in enumerate(urls_ingest, 1):
            try:
                html = scarica_pagina(url)
            except Exception:
                html = requests.get(url, headers=HEADERS, timeout=45).text
            label = etichetta_articolo(url, html)
            print(f"  {i:02d}. {label}: {url}")
        return stats

    config = carica_configurazione()
    _, supabase = setup_clients(config)

    for i, url in enumerate(urls_ingest, 1):
        print(f"\n>> [{i}/{len(urls_ingest)}] {url}")
        try:
            html = scarica_pagina(url)
            label = etichetta_articolo(url, html)
            testo, titolo_pagina = estrai_testo_principale(html, url)
            if len(testo.strip()) < 100:
                print(f"  [SKIP] testo troppo corto ({label})")
                continue
            body = arricchisci_testo(label, testo)
            titolo = titolo_pagina or f"Bottos Calendario Verde {label}"
            n = ingest_testo(
                body,
                url,
                config,
                supabase,
                stats,
                tipo="calendario",
                titolo=titolo,
                patologia=f"Bottos Calendario Verde — {label}",
                specie="prato / tappeto erboso",
                max_chunks=None,
                chunk_size=400,
            )
            print(f"  OK {label}: {n} chunk")
        except Exception as exc:
            stats.errori += 1
            print(f"  [ERRORE] {exc}")

    return stats


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Solo elenco URL")
    p.add_argument("--solo-annuale", action="store_true", help="Solo 12 mesi 2026/2025")
    p.add_argument("--max-pagine", type=int, default=15)
    args = p.parse_args()
    s = run(
        max_pagine=args.max_pagine,
        dry_run=args.dry_run,
        solo_annuale=args.solo_annuale,
    )
    if not args.dry_run:
        print(
            f"\nCompletato: {s.chunks_inseriti} chunk, "
            f"{s.chunks_saltati} saltati, {s.errori} errori"
        )
