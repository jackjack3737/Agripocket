#!/usr/bin/env python3
"""Funzioni condivise: chunk, embedding, Supabase, dedup."""

from __future__ import annotations

import hashlib
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import Client, create_client

# Re-export chunking dal crawler esistente
from turf_knowledge_crawler import (
    CHUNK_OVERLAP,
    dividi_in_chunk,
    genera_embedding,
    inizializza_provider_embedding,
    inferisci_metadati,
)

DIR = Path(__file__).resolve().parent
CRAWLED_LOG = DIR / "crawled_urls.txt"
HASH_LOG = DIR / "crawled_hashes.txt"
ENV_PATH = DIR / ".env"

# Chunk più piccoli = più record per stesso testo (target volume 50k+)
VOLUME_CHUNK_SIZE = int(os.getenv("VOLUME_CHUNK_SIZE", "350"))
EMBED_SLEEP = float(os.getenv("EMBED_SLEEP", "0.08"))

# Cache in-memory per run lunghi (evita rilettura file ad ogni chunk)
_HASH_CACHE: set[str] | None = None
_HASH_DIRTY = 0


def carica_configurazione() -> dict:
    load_dotenv(ENV_PATH)
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()
    api_key = os.getenv("API_KEY", "").strip()
    provider = os.getenv("EMBEDDING_PROVIDER", "gemini").strip().lower()
    if not all([supabase_url, supabase_key, api_key]):
        raise EnvironmentError("Mancano SUPABASE_URL, SUPABASE_KEY o API_KEY in .env")
    return {
        "supabase_url": supabase_url,
        "supabase_key": supabase_key,
        "api_key": api_key,
        "provider": provider,
        "openai_model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        "gemini_model": os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
    }


def normalizza_fonte(fonte: str) -> str:
    p = urlparse(fonte.strip())
    if p.scheme in ("http", "https"):
        path = p.path.rstrip("/") or "/"
        return f"{p.scheme}://{p.netloc.lower()}{path}"
    return fonte.strip()


def carica_fonti_viste() -> set[str]:
    if not CRAWLED_LOG.exists():
        return set()
    return {
        normalizza_fonte(l)
        for l in CRAWLED_LOG.read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#")
    }


def carica_hash_visti() -> set[str]:
    global _HASH_CACHE
    if _HASH_CACHE is not None:
        return _HASH_CACHE
    if not HASH_LOG.exists():
        _HASH_CACHE = set()
        return _HASH_CACHE
    _HASH_CACHE = {
        l.strip()
        for l in HASH_LOG.read_text(encoding="utf-8").splitlines()
        if l.strip() and not l.startswith("#")
    }
    return _HASH_CACHE


def init_hash_cache() -> set[str]:
    """Carica hash all'avvio di un run massivo."""
    global _HASH_CACHE
    _HASH_CACHE = carica_hash_visti()
    return _HASH_CACHE


def flush_hash_cache() -> None:
    global _HASH_CACHE, _HASH_DIRTY
    if _HASH_CACHE is None or _HASH_DIRTY == 0:
        return
    with HASH_LOG.open("a", encoding="utf-8") as f:
        pass  # scritture già append in segna_hash
    _HASH_DIRTY = 0


def segna_fonte(fonte: str) -> None:
    with CRAWLED_LOG.open("a", encoding="utf-8") as f:
        f.write(fonte.strip() + "\n")


def segna_hash(testo: str) -> None:
    global _HASH_DIRTY
    h = hashlib.sha256(testo.encode("utf-8")).hexdigest()
    if _HASH_CACHE is not None:
        _HASH_CACHE.add(h)
    with HASH_LOG.open("a", encoding="utf-8") as f:
        f.write(h + "\n")
    _HASH_DIRTY += 1


def formatta_chunk(testo: str, *, tipo: str, fonte: str) -> str:
    """Prefisso strutturato per RAG (tipo + fonte nel testo)."""
    return f"[{tipo}:{fonte}]\n{testo}"


def inferisci_prodotto(testo: str, fonte: str) -> str | None:
    """Estrae nome prodotto commerciale se presente."""
    m = re.search(
        r"\b([A-Z][A-Z0-9\-]{2,}(?:\s+[A-Z0-9\+]+){0,4})\b", testo[:400]
    )
    if m and len(m.group(1)) < 40:
        return m.group(1).strip()
    slug = urlparse(fonte).path.rstrip("/").split("/")[-1]
    if slug and slug not in ("html", "php", "it", "en"):
        return slug.replace("-", " ").title()
    return None


class IngestStats:
    def __init__(self) -> None:
        self.chunks_inseriti = 0
        self.chunks_saltati = 0
        self.fonti_ok = 0
        self.errori = 0

    def budget_rimasto(self, max_chunks: int | None) -> bool:
        return max_chunks is None or self.chunks_inseriti < max_chunks


def inserisci_chunk(
    client: Client,
    *,
    patologia: str | None,
    specie: str | None,
    soluzione: str,
    embedding: list[float],
) -> None:
    client.table("tgif_knowledge_base").insert(
        {
            "patologia": patologia,
            "specie": specie,
            "soluzione": soluzione,
            "embedding": embedding,
        }
    ).execute()


def ingest_testo(
    testo: str,
    fonte: str,
    config: dict,
    supabase: Client,
    stats: IngestStats,
    *,
    tipo: str = "web",
    titolo: str | None = None,
    patologia: str | None = None,
    specie: str | None = None,
    max_chunks: int | None = None,
    chunk_size: int = VOLUME_CHUNK_SIZE,
    segna_fonte_al_termine: bool = True,
) -> int:
    """
    Chunka un testo, genera embedding e carica su Supabase.
    Dedup per hash del chunk. Ritorna chunk inseriti per questa fonte.
    """
    testo = re.sub(r"\n{3,}", "\n\n", testo.strip())
    if len(testo) < 80:
        return 0

    hash_visti = carica_hash_visti()
    chunks = dividi_in_chunk(
        testo, dimensione=chunk_size, sovrapposizione=min(80, CHUNK_OVERLAP)
    )
    inseriti_fonte = 0

    for i, chunk in enumerate(chunks, 1):
        if not stats.budget_rimasto(max_chunks):
            break

        body = formatta_chunk(chunk, tipo=tipo, fonte=fonte)
        h = hashlib.sha256(body.encode("utf-8")).hexdigest()
        if h in hash_visti:
            stats.chunks_saltati += 1
            continue

        pat = patologia
        sp = specie
        if tipo == "prodotto":
            pat = pat or inferisci_prodotto(chunk, fonte)
            sp = sp or "fungicida/bioprodotto"
        elif not pat:
            pat, sp = inferisci_metadati(titolo, fonte, chunk)
            sp = sp or specie

        try:
            emb = genera_embedding(body, config)
            inserisci_chunk(
                supabase,
                patologia=pat,
                specie=sp,
                soluzione=body,
                embedding=emb,
            )
            hash_visti.add(h)
            segna_hash(body)
            stats.chunks_inseriti += 1
            inseriti_fonte += 1
            if i % 5 == 0 or i == len(chunks):
                print(f"    chunk {i}/{len(chunks)} OK (tot {stats.chunks_inseriti})")
            time.sleep(EMBED_SLEEP)
        except Exception as exc:
            stats.errori += 1
            print(f"    [ERRORE] chunk {i}: {exc}", file=sys.stderr)

    if inseriti_fonte and segna_fonte_al_termine:
        segna_fonte(fonte)
        stats.fonti_ok += 1

    return inseriti_fonte


def setup_clients(config: dict | None = None) -> tuple[dict, Client]:
    cfg = config or carica_configurazione()
    inizializza_provider_embedding(cfg)
    sb = create_client(cfg["supabase_url"], cfg["supabase_key"])
    return cfg, sb
