#!/usr/bin/env python3
"""Ingest catalogo Bottos (PDF Drive) in tgif_knowledge_base — prodotti e soluzioni."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from ingest_core import IngestStats, carica_configurazione, ingest_testo, setup_clients
from pdf_ingest import estrai_testo_pdf

BOTOS_DIR = Path(__file__).resolve().parent / "sources_drive" / "bottos"
FONTE_PREFIX = "https://catalogo.bottos.agripocket/"

SPECIE_KW = {
    "bermuda": "Cynodon dactylon",
    "bermudagrass": "Cynodon dactylon",
    "kikuyu": "Pennisetum clandestinum",
    "festuca": "Festuca",
    "lolium": "Lolium perenne",
    "ray grass": "Lolium perenne",
    "poa": "Poa pratensis",
    "agrostide": "Agrostis",
    "dicondra": "Dichondra",
    "gramigna": "Cynodon",
}

CATEGORIA_RULES = [
    (re.compile(r"overseed|rinnova|rinnovaprato|macroseeding|nasceprato", re.I), "Rinnovo e overseeding"),
    (re.compile(r"seme|seed|blend|royal|fighter|duraprato|verdeprato|smeraldo|giada|olimpia", re.I), "Miscuglio / seme prato"),
    (re.compile(r"concim|nutri|nutra|fertil|npk|green-up|slow|sprint|start-life|soil-life", re.I), "Concime e nutrizione"),
    (re.compile(r"iron|ferro|micronutrient", re.I), "Correttivo ferro / microelementi"),
    (re.compile(r"fungicid|bioattiv|trichoderma|myko|shield|safe|stress", re.I), "Difesa e biostimolazione"),
    (re.compile(r"irrig|water", re.I), "Gestione idrica"),
]


def nome_prodotto(path: Path) -> str:
    return path.stem.replace("-", " ").replace("_", " ").strip()


def categoria_prodotto(path: Path, testo: str) -> str:
    nome = path.stem
    blob = f"{nome} {testo[:800]}"
    for rx, cat in CATEGORIA_RULES:
        if rx.search(blob):
            return cat
    return "Prodotto Bottos prato"


def specie_da_testo(testo: str) -> str | None:
    low = testo.lower()[:3000]
    found = []
    for kw, lat in SPECIE_KW.items():
        if kw in low and lat not in found:
            found.append(lat)
    return ", ".join(found[:4]) if found else "prato / tappeto erboso"


def arricchisci_testo(path: Path, testo: str) -> str:
    nome = nome_prodotto(path)
    cat = categoria_prodotto(path, testo)
    sp = specie_da_testo(testo)
    header = (
        f"PRODOTTO COMMERCIALE BOTTOS: {nome}\n"
        f"Categoria: {cat}\n"
        f"Specie / uso: {sp}\n"
        f"Fonte catalogo: Bottos Drive\n\n"
    )
    return header + testo


def ingest_file(path: Path, config: dict, supabase, stats: IngestStats, max_chunks: int | None) -> None:
    rel = path.relative_to(BOTOS_DIR).as_posix()
    fonte = FONTE_PREFIX + rel
    nome = nome_prodotto(path)
    print(f">> {nome} ({rel})")

    try:
        raw = estrai_testo_pdf(path.read_bytes())
    except Exception as exc:
        print(f"  [ERRORE] {exc}")
        stats.errori += 1
        return

    if len(raw.strip()) < 60:
        print("  [SKIP] testo troppo corto")
        return

    testo = arricchisci_testo(path, raw)
    cat = categoria_prodotto(path, raw)

    ingest_testo(
        testo,
        fonte,
        config,
        supabase,
        stats,
        tipo="prodotto",
        titolo=f"Bottos {nome}",
        patologia=f"Bottos — {cat} — {nome}",
        specie=specie_da_testo(raw),
        max_chunks=max_chunks,
        chunk_size=380,
    )


def run(max_files: int | None = None, max_chunks: int | None = None) -> IngestStats:
    if not BOTOS_DIR.exists():
        raise FileNotFoundError(
            f"Manca {BOTOS_DIR}. Esegui: python download_bottos_drive.py --fresh"
        )

    pdfs = sorted(BOTOS_DIR.rglob("*.pdf"))
    if max_files:
        pdfs = pdfs[:max_files]

    if not pdfs:
        raise FileNotFoundError("Nessun PDF in sources_drive/bottos")

    config = carica_configurazione()
    _, supabase = setup_clients(config)
    stats = IngestStats()

    print(f"Ingest Bottos -> tgif_knowledge_base: {len(pdfs)} PDF")
    for path in pdfs:
        if not stats.budget_rimasto(max_chunks):
            print("Budget chunk raggiunto.")
            break
        ingest_file(path, config, supabase, stats, max_chunks)

    return stats


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--max-files", type=int, default=None)
    p.add_argument("--max-chunks", type=int, default=None, help="Default: tutti i chunk necessari")
    args = p.parse_args()
    s = run(max_files=args.max_files, max_chunks=args.max_chunks)
    print(f"Completato: {s.chunks_inseriti} chunk inseriti, {s.chunks_saltati} saltati, {s.errori} errori")
