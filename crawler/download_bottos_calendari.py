#!/usr/bin/env python3
"""
Scarica i PDF protocollo Master Green (Calendario Verde) da bottos1848.com.

I PDF NON sono a URL fissi tipo /2025/05/MAG-2025.pdf: la cartella upload segue
la data di pubblicazione del post (es. Calendario di settembre → .../2025/08/SET-2025.pdf).

Metodo affidabile: scopri i post «calendario-verde» e estrai il link .pdf da ogni pagina.
"""

from __future__ import annotations

import argparse
import os
import re
import time
from urllib.parse import unquote, urlparse

import requests

from ingest_calendario_verde import scopri_tutti_url

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
}

PDF_RE = re.compile(r"https?://[^\s\"'<>]+\.pdf[^\s\"'<>]*", re.I)
DROPBOX_RE = re.compile(r"https?://[^\s\"'<>]*dropbox\.com[^\s\"'<>]*\.pdf[^\s\"'<>]*", re.I)
JPG_CAL_RE = re.compile(
    r"https?://www\.bottos1848\.com/wp-content/uploads/\d{4}/\d{2}/(?:[A-Z]{3}-\d{4}|calendario-verde[^\s\"'<>]*)\.jpg",
    re.I,
)


def cartella_default() -> str:
    return os.path.join(os.path.dirname(__file__), "bottos_calendari_raw")


def nome_file_da_url(asset_url: str, kind: str) -> str:
    name = os.path.basename(unquote(urlparse(asset_url).path))
    if not name:
        return f"documento.{kind}"
    if kind == "pdf" and not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name


def _normalizza_download_url(url: str) -> str:
    url = url.split("#")[0].strip()
    if "dropbox.com" in url.lower() and "dl=" not in url.lower():
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}dl=1"
    if "dropbox.com" in url.lower():
        return url.replace("dl=0", "dl=1")
    return url


def estrai_asset_da_pagina(post_url: str, session: requests.Session) -> tuple[str | None, str]:
    """Ritorna (url, tipo) con tipo in pdf | jpg."""
    r = session.get(post_url, timeout=30)
    r.raise_for_status()
    html = r.text

    for url in PDF_RE.findall(html):
        u = _normalizza_download_url(url)
        if "bottos1848.com" in u.lower() and "wp-content/uploads" in u.lower():
            return u, "pdf"

    for url in DROPBOX_RE.findall(html):
        return _normalizza_download_url(url), "pdf"

    # Fallback 2020: solo immagini full-size del calendario (no thumbnail -724x)
    jpg_candidates = []
    for url in JPG_CAL_RE.findall(html):
        if re.search(r"-\d+x\d+\.", url, re.I):
            continue
        jpg_candidates.append(url)
    if jpg_candidates:
        jpg_candidates.sort(key=len, reverse=True)
        return jpg_candidates[0], "jpg"

    return None, ""


def scarica_pdf(pdf_url: str, dest: str, session: requests.Session) -> bool:
    if os.path.isfile(dest) and os.path.getsize(dest) > 1000:
        return True
    r = session.get(pdf_url, stream=True, timeout=60)
    if r.status_code != 200:
        return False
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
    return os.path.getsize(dest) > 500


def main() -> None:
    parser = argparse.ArgumentParser(description="Scarica PDF Calendario Verde Bottos")
    parser.add_argument(
        "-o",
        "--output",
        default=cartella_default(),
        help="Cartella destinazione (default: crawler/bottos_calendari_raw)",
    )
    parser.add_argument("--max-pagine-archivio", type=int, default=15)
    parser.add_argument("--pausa", type=float, default=0.8, help="Secondi tra una richiesta e l'altra")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)
    session = requests.Session()
    session.headers.update(HEADERS)

    print("Scoperta post Calendario Verde (sitemap + archivio)...")
    post_urls = scopri_tutti_url(max_pagine=args.max_pagine_archivio)
    print(f"Trovati {len(post_urls)} post.\n")

    ok = 0
    skip = 0
    fail = 0

    for i, post_url in enumerate(post_urls, 1):
        try:
            asset_url, kind = estrai_asset_da_pagina(post_url, session)
            if not asset_url:
                print(f"[{i}/{len(post_urls)}] WARN nessun asset: {post_url}")
                fail += 1
                time.sleep(args.pausa)
                continue

            fname = nome_file_da_url(asset_url, kind)
            dest = os.path.join(args.output, fname)

            if os.path.isfile(dest) and os.path.getsize(dest) > 1000:
                print(f"[{i}/{len(post_urls)}] SKIP gia presente: {fname}")
                skip += 1
            elif scarica_pdf(asset_url, dest, session):
                tag = "PDF" if kind == "pdf" else "JPG"
                print(f"[{i}/{len(post_urls)}] OK [{tag}] {fname} <- {post_url}")
                ok += 1
            else:
                print(f"[{i}/{len(post_urls)}] FAIL download: {asset_url}")
                fail += 1
        except requests.RequestException as e:
            print(f"[{i}/{len(post_urls)}] ERR {post_url} - {e}")
            fail += 1

        time.sleep(args.pausa)

    print(f"\nCompletato: {ok} scaricati, {skip} già presenti, {fail} senza PDF/errore.")
    print(f"Cartella: {args.output}")


if __name__ == "__main__":
    main()
