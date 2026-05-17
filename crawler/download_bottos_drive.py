#!/usr/bin/env python3
"""Scarica catalogo PDF Bottos da Google Drive (uno per uno, evita rate limit)."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import gdown

from drive_download import download_drive_file

MANIFEST = Path(__file__).resolve().parent / "bottos_pdfs.json"
BOTOS_DIR = Path(__file__).resolve().parent / "sources_drive" / "bottos"
MIN_BYTES = 2048


def load_manifest() -> list[dict]:
    with MANIFEST.open(encoding="utf-8") as f:
        return json.load(f)


def download_one(entry: dict, delay: float, retries: int) -> bool:
    dest = BOTOS_DIR / entry["folder"] / entry["name"]
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.is_file() and dest.stat().st_size >= MIN_BYTES:
        return True

    fid = entry["id"]
    for attempt in range(1, retries + 2):
        try:
            if download_drive_file(fid, dest):
                return True
        except Exception as exc:
            print(f"    tentativo {attempt}: {exc}", flush=True)
        if dest.is_file():
            dest.unlink(missing_ok=True)
        time.sleep(delay * attempt)
    return False


def download_all(
    *, delay: float = 5.0, retries: int = 4, only_missing: bool = False
) -> tuple[int, int]:
    entries = load_manifest()
    if only_missing:
        entries = [
            e
            for e in entries
            if not (BOTOS_DIR / e["folder"] / e["name"]).is_file()
            or (BOTOS_DIR / e["folder"] / e["name"]).stat().st_size < MIN_BYTES
        ]
        print(f"Solo mancanti: {len(entries)} file", flush=True)
    BOTOS_DIR.mkdir(parents=True, exist_ok=True)
    ok = fail = 0

    for i, entry in enumerate(entries, 1):
        print(f"[{i}/{len(entries)}] {entry['name']}", flush=True)
        if download_one(entry, delay, retries):
            ok += 1
        else:
            fail += 1
            print(f"  FALLITO: {entry['name']}")
        time.sleep(delay)

    print(f"Completato: {ok} OK, {fail} falliti -> {BOTOS_DIR}")
    return ok, fail


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--delay", type=float, default=5.0, help="Secondi tra un file e l'altro")
    p.add_argument("--retries", type=int, default=4)
    p.add_argument(
        "--only-missing",
        action="store_true",
        help="Scarica solo PDF assenti o corrotti",
    )
    args = p.parse_args()
    download_all(
        delay=args.delay, retries=args.retries, only_missing=args.only_missing
    )
