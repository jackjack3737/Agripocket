#!/usr/bin/env python3
"""
Web crawler per estrarre contenuti scientifici/agronomici sulle patologie
dei tappeti erbosi, generare embedding e caricarli su Supabase.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
import trafilatura
from dotenv import load_dotenv
from supabase import Client, create_client

# Provider embedding (caricati dopo load_dotenv)
_openai_client = None
_gemini_client = None


# ---------------------------------------------------------------------------
# Configurazione
# ---------------------------------------------------------------------------

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150
REQUEST_TIMEOUT = 30
REQUEST_DELAY_SEC = 1.0
CRAWLED_LOG = Path(__file__).resolve().parent / "crawled_urls.txt"
# User-Agent da browser: alcuni siti .edu bloccano bot con UA personalizzato
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

HTTP_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
    # Senza "br": alcuni .edu (es. extension.psu.edu) restituiscono HTML tronco
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def carica_configurazione() -> dict:
    """Carica variabili d'ambiente dal file .env nella cartella crawler."""
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(env_path)

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()
    api_key = os.getenv("API_KEY", "").strip()
    provider = os.getenv("EMBEDDING_PROVIDER", "openai").strip().lower()

    mancanti = []
    if not supabase_url:
        mancanti.append("SUPABASE_URL")
    if not supabase_key:
        mancanti.append("SUPABASE_KEY")
    if not api_key:
        mancanti.append("API_KEY")

    if mancanti:
        raise EnvironmentError(
            f"Variabili d'ambiente mancanti: {', '.join(mancanti)}. "
            f"Copia .env.example in .env e compila i valori."
        )

    if provider not in ("openai", "gemini"):
        raise ValueError('EMBEDDING_PROVIDER deve essere "openai" o "gemini"')

    return {
        "supabase_url": supabase_url,
        "supabase_key": supabase_key,
        "api_key": api_key,
        "provider": provider,
        "openai_model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
        "gemini_model": os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001"),
    }


# ---------------------------------------------------------------------------
# Fetch e pulizia del testo
# ---------------------------------------------------------------------------


def _headers_per_url(url: str) -> dict:
    """Header HTTP; Referer sul dominio per siti extension che filtrano i bot."""
    headers = dict(HTTP_HEADERS)
    parsed = urlparse(url)
    if parsed.scheme and parsed.netloc:
        headers["Referer"] = f"{parsed.scheme}://{parsed.netloc}/"
    return headers


def scarica_pagina(url: str) -> str | None:
    """
    Scarica l'HTML della pagina.
    Prova requests con header da browser; se fallisce, usa trafilatura.fetch_url.
    """
    headers = _headers_per_url(url)

    try:
        response = requests.get(
            url,
            timeout=REQUEST_TIMEOUT,
            headers=headers,
            allow_redirects=True,
        )
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        return response.text
    except requests.RequestException as exc:
        # stdout: evita falsi "errori" rossi in PowerShell su 404 attesi
        print(f"  [AVVISO] requests fallito ({exc}); provo trafilatura...")

    try:
        html = trafilatura.fetch_url(url)
        if html:
            return html
    except Exception as exc:
        print(f"  [AVVISO] trafilatura fallito: {exc}")

    print(
        f"  [SALTO] Impossibile scaricare {url} "
        "(403/404: pagina rimossa o bloccata)"
    )
    return None


def estrai_testo_principale(html: str, url: str) -> tuple[str, str | None]:
    """
    Estrae il corpo principale della pagina rimuovendo menu, footer e pubblicità.
    Usa trafilatura (estrazione focalizzata sul contenuto editoriale).

    Restituisce (testo_pulito, titolo_pagina).
    """
    # Estrazione testo con metadati
    risultato = trafilatura.extract(
        html,
        url=url,
        include_comments=False,
        include_tables=True,
        favor_precision=True,
        output_format="json",
    )

    if risultato:
        dati = json.loads(risultato)
        testo = (dati.get("text") or "").strip()
        titolo = dati.get("title")
        if testo:
            return normalizza_spazi(testo), titolo

    # Fallback: estrazione semplice senza metadati
    testo_fallback = trafilatura.extract(
        html,
        url=url,
        include_comments=False,
        favor_precision=True,
    )
    if testo_fallback:
        return normalizza_spazi(testo_fallback.strip()), None

    return "", None


def normalizza_spazi(testo: str) -> str:
    """Riduce spazi multipli e righe vuote eccessive."""
    testo = re.sub(r"[ \t]+", " ", testo)
    testo = re.sub(r"\n{3,}", "\n\n", testo)
    return testo.strip()


# ---------------------------------------------------------------------------
# Chunking con sovrapposizione
# ---------------------------------------------------------------------------


def dividi_in_chunk(
    testo: str,
    dimensione: int = CHUNK_SIZE,
    sovrapposizione: int = CHUNK_OVERLAP,
) -> list[str]:
    """
    Divide il testo in blocchi da ~dimensione caratteri.
    Cerca di tagliare ai confini di paragrafo; mantiene sovrapposizione tra blocchi.
    """
    if not testo:
        return []

    if len(testo) <= dimensione:
        return [testo]

    paragrafi = [p.strip() for p in re.split(r"\n\s*\n", testo) if p.strip()]
    chunk_corrente: list[str] = []
    lunghezza_corrente = 0
    chunks: list[str] = []

    def flush_chunk() -> None:
        nonlocal chunk_corrente, lunghezza_corrente
        if chunk_corrente:
            chunks.append("\n\n".join(chunk_corrente))
            chunk_corrente = []
            lunghezza_corrente = 0

    for paragrafo in paragrafi:
        # Paragrafo troppo lungo: spezzatura forzata con overlap
        if len(paragrafo) > dimensione:
            flush_chunk()
            chunks.extend(_spezza_testo_lungo(paragrafo, dimensione, sovrapposizione))
            continue

        extra = 2 if chunk_corrente else 0  # "\n\n" tra paragrafi
        if lunghezza_corrente + len(paragrafo) + extra > dimensione:
            flush_chunk()
            # Sovrapposizione: riporta gli ultimi caratteri del chunk precedente
            if chunks and sovrapposizione > 0:
                coda = chunks[-1][-sovrapposizione:]
                # Taglia a inizio frase se possibile
                spazio = coda.find(" ")
                if spazio > 0:
                    coda = coda[spazio + 1 :]
                if coda.strip():
                    chunk_corrente = [coda.strip()]
                    lunghezza_corrente = len(chunk_corrente[0])

        chunk_corrente.append(paragrafo)
        lunghezza_corrente += len(paragrafo) + (2 if len(chunk_corrente) > 1 else 0)

    flush_chunk()
    return chunks


def _spezza_testo_lungo(
    testo: str, dimensione: int, sovrapposizione: int
) -> list[str]:
    """Spezza un singolo blocco di testo molto lungo con overlap."""
    parti: list[str] = []
    inizio = 0
    while inizio < len(testo):
        fine = min(inizio + dimensione, len(testo))
        # Preferisce taglio su spazio o punto
        if fine < len(testo):
            taglio = testo.rfind(" ", inizio, fine)
            if taglio <= inizio:
                taglio = testo.rfind(".", inizio, fine)
            if taglio > inizio:
                fine = taglio + 1
        parti.append(testo[inizio:fine].strip())
        if fine >= len(testo):
            break
        inizio = max(fine - sovrapposizione, inizio + 1)
    return [p for p in parti if p]


# ---------------------------------------------------------------------------
# Euristiche per patologia / specie (da titolo e URL)
# ---------------------------------------------------------------------------

# Parole chiave comuni nelle pagine universitarie sulle malattie del tappeto
PATTERN_PATOLOGIA = re.compile(
    r"\b("
    r"dollar spot|brown patch|pythium|fusarium|rust|mildew|"
    r"anthracnose|snow mold|fairy ring|leaf spot|summer patch|"
    r"take-all|yellow patch|gray leaf spot|"
    r"macchia|oidio|ruggine|antracnosi|fusariosi|"
    r"patologia|malattia|disease"
    r")\b",
    re.IGNORECASE,
)

SPECIE_ERBOSE = re.compile(
    r"\b("
    r"lolium|poa|festuca|agrostis|cynodon|zoysia|"
    r"perenne|pratense|stolonifera|"
    r"tappeto erboso|turfgrass|lawn grass"
    r")\b",
    re.IGNORECASE,
)


def inferisci_metadati(
    titolo: str | None, url: str, chunk: str
) -> tuple[str | None, str | None]:
    """
    Tenta di dedurre patologia e specie da titolo, URL e contenuto del blocco.
    I campi possono restare None se non rilevati.
    """
    contesto = " ".join(filter(None, [titolo or "", url, chunk[:500]]))

    pat_match = PATTERN_PATOLOGIA.search(contesto)
    spec_match = SPECIE_ERBOSE.search(contesto)

    patologia = pat_match.group(1).strip() if pat_match else None
    specie = spec_match.group(1).strip() if spec_match else None
    return patologia, specie


# ---------------------------------------------------------------------------
# Embedding (OpenAI o Gemini)
# ---------------------------------------------------------------------------


def inizializza_provider_embedding(config: dict) -> None:
    """Configura il client per il provider scelto."""
    global _openai_client, _gemini_client

    if config["provider"] == "openai":
        from openai import OpenAI

        _openai_client = OpenAI(api_key=config["api_key"])
    else:
        from google import genai

        _gemini_client = genai.Client(api_key=config["api_key"])


def genera_embedding(testo: str, config: dict) -> list[float]:
    """Genera il vettore embedding per un blocco di testo."""
    if config["provider"] == "openai":
        if _openai_client is None:
            raise RuntimeError("Client OpenAI non inizializzato")
        risposta = _openai_client.embeddings.create(
            model=config["openai_model"],
            input=testo,
        )
        return risposta.data[0].embedding

    if _gemini_client is None:
        raise RuntimeError("Client Gemini non inizializzato")

    risultato = _gemini_client.models.embed_content(
        model=config["gemini_model"],
        contents=testo,
    )
    return list(risultato.embeddings[0].values)


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------


def crea_client_supabase(url: str, key: str) -> Client:
    """Crea il client Supabase."""
    return create_client(url, key)


def inserisci_chunk(
    client: Client,
    *,
    patologia: str | None,
    specie: str | None,
    soluzione: str,
    embedding: list[float],
) -> None:
    """
    Inserisce un record in tgif_knowledge_base.
    Il campo 'soluzione' contiene il testo del chunk (contenuto per RAG).
    """
    record = {
        "patologia": patologia,
        "specie": specie,
        "soluzione": soluzione,
        "embedding": embedding,
    }
    client.table("tgif_knowledge_base").insert(record).execute()


# ---------------------------------------------------------------------------
# Pipeline principale
# ---------------------------------------------------------------------------


def elabora_url(
    url: str,
    config: dict,
    supabase: Client,
    *,
    dry_run: bool = False,
) -> int:
    """
    Elabora un singolo URL: scarica, estrae, chunka, embedda, carica.
    Restituisce il numero di chunk inseriti.
    """
    print(f"\n>> {url}")
    html = scarica_pagina(url)
    if not html:
        return 0

    testo, titolo = estrai_testo_principale(html, url)
    if not testo:
        print("  [AVVISO] Nessun testo principale estratto.")
        return 0

    print(f"  Titolo: {titolo or '(non disponibile)'}")
    print(f"  Caratteri estratti: {len(testo)}")

    chunks = dividi_in_chunk(testo)
    print(f"  Chunk generati: {len(chunks)}")

    inseriti = 0
    for i, chunk in enumerate(chunks, start=1):
        patologia, specie = inferisci_metadati(titolo, url, chunk)

        if dry_run:
            print(
                f"  [DRY-RUN] Chunk {i}/{len(chunks)} "
                f"({len(chunk)} car.) patologia={patologia!r} specie={specie!r}"
            )
            inseriti += 1
            continue

        try:
            embedding = genera_embedding(chunk, config)
        except Exception as exc:
            print(f"  [ERRORE] Embedding chunk {i}: {exc}", file=sys.stderr)
            continue

        try:
            inserisci_chunk(
                supabase,
                patologia=patologia,
                specie=specie,
                soluzione=chunk,
                embedding=embedding,
            )
            inseriti += 1
            print(f"  OK Chunk {i}/{len(chunks)} caricato su Supabase")
        except Exception as exc:
            print(f"  [ERRORE] Inserimento chunk {i}: {exc}", file=sys.stderr)

        # Rate limiting leggero tra chiamate API
        time.sleep(0.3)

    return inseriti


def normalizza_url(url: str) -> str:
    """URL canonica per confronto (senza frammento, slash finale opzionale)."""
    p = urlparse(url.strip())
    path = p.path.rstrip("/") or "/"
    return f"{p.scheme}://{p.netloc.lower()}{path}"


def carica_url_gia_crawlati() -> set[str]:
    """Legge l'elenco URL già indicizzati da crawled_urls.txt."""
    if not CRAWLED_LOG.exists():
        return set()
    visti: set[str] = set()
    with CRAWLED_LOG.open(encoding="utf-8") as f:
        for riga in f:
            riga = riga.strip()
            if riga and not riga.startswith("#"):
                visti.add(normalizza_url(riga))
    return visti


def segna_url_crawlata(url: str) -> None:
    """Registra un URL come completato per evitare duplicati nei run successivi."""
    with CRAWLED_LOG.open("a", encoding="utf-8") as f:
        f.write(url.strip() + "\n")


def carica_url_da_file(percorso: Path) -> list[str]:
    """Legge URL da file di testo (uno per riga, # per commenti)."""
    urls: list[str] = []
    with percorso.open(encoding="utf-8") as f:
        for riga in f:
            riga = riga.strip()
            if not riga or riga.startswith("#"):
                continue
            urls.append(riga)
    return urls


def valida_url(url: str) -> bool:
    """Verifica che l'URL abbia schema http/https."""
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crawler patologie tappeto erboso → embedding → Supabase"
    )
    parser.add_argument(
        "urls",
        nargs="*",
        help="URL di partenza (estensioni .edu, .gov, enti tecnici consigliati)",
    )
    parser.add_argument(
        "-f",
        "--file",
        type=Path,
        help="File con lista URL (una per riga)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Estrae e chunka senza chiamare API né Supabase",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=REQUEST_DELAY_SEC,
        help=f"Pausa tra una pagina e l'altra (default {REQUEST_DELAY_SEC}s)",
    )
    parser.add_argument(
        "--skip-crawled",
        action="store_true",
        help="Salta URL già presenti in crawled_urls.txt",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    tutti_url: list[str] = list(args.urls)
    if args.file:
        if not args.file.exists():
            print(f"File non trovato: {args.file}", file=sys.stderr)
            return 1
        tutti_url.extend(carica_url_da_file(args.file))

    tutti_url = [u for u in dict.fromkeys(tutti_url) if valida_url(u)]

    if args.skip_crawled:
        gia_fatti = carica_url_gia_crawlati()
        prima = len(tutti_url)
        tutti_url = [u for u in tutti_url if normalizza_url(u) not in gia_fatti]
        saltati = prima - len(tutti_url)
        if saltati:
            print(f"Saltati {saltati} URL già in crawled_urls.txt")

    if not tutti_url:
        print(
            "Nessun URL valido. Passa URL come argomenti o usa -f urls.txt\n"
            "Esempio: python turf_knowledge_crawler.py -f urls.txt",
            file=sys.stderr,
        )
        return 1

    try:
        config = carica_configurazione()
    except (EnvironmentError, ValueError) as exc:
        if args.dry_run:
            config = {"provider": "openai"}  # dry-run non richiede API
        else:
            print(exc, file=sys.stderr)
            return 1

    supabase: Client | None = None
    if not args.dry_run:
        inizializza_provider_embedding(config)
        supabase = crea_client_supabase(config["supabase_url"], config["supabase_key"])

    totale_chunk = 0
    for url in tutti_url:
        n = elabora_url(url, config, supabase, dry_run=args.dry_run)
        totale_chunk += n
        if n > 0 and not args.dry_run:
            segna_url_crawlata(url)
        time.sleep(args.delay)

    print(f"\nCompletato: {totale_chunk} chunk elaborati da {len(tutti_url)} URL.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
