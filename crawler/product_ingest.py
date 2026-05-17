#!/usr/bin/env python3
"""Crawl siti produttori (Bottos, ecc.): fungicidi, biologici, concimi prato."""

from __future__ import annotations

import re
from pathlib import Path

import requests
import yaml

from ingest_core import DIR, IngestStats, ingest_testo, normalizza_fonte, setup_clients
from sitemap_ingest import HEADERS, fetch_xml, parse_sitemap_urls
from turf_knowledge_crawler import scarica_pagina, estrai_testo_principale

PRODUCT_KEYWORDS = re.compile(
    r"fungicid|bioattiv|biostimol|trichoderma|bacillus|prodotto|prato|turf|"
    r"erbicid|insettic|concim|micorriz|nematod|patolog|malatt|fitofarm|"
    r"diserbant|antifung|nematocid|micorriz|pythium|fosetyl|azoxystrobin",
    re.I,
)

TURF_IN_PRODUCT_TEXT = re.compile(
    r"prato|tappeto\s*erboso|turfgrass|\bturf\b|erboso|fairway|greens|"
    r"miscuglio|bermuda|fescue|ray\s*grass|dollar\s*spot|brown\s*patch|"
    r"fungicid|malattia|patologia|fitofarm",
    re.I,
)

BEST_PRATO_HUB_PAGES = (
    "cura-e-protezione.html",
    "concimi-prato-erba.html",
    "sementi-prato.html",
    "erbicidi-diserbanti-prato.html",
    "insetticidi-prato.html",
    "biostimolanti-prato.html",
    "sementi-prato-erboso.html",
)

# Best Prato: solo fitofarmaci / concimi / sementi (no attrezzi, tagliaerba, prezzi)
BEST_PRATO_EXCLUDE = (
    "/attrezzi",
    "/tagliaerba",
    "/robot-",
    "/abbigliamento",
    "/carrelli-",
    "/motosega",
    "/motozappe",
    "/wolf-garten",
    "-prezzi.html",
    "/libri-corsi",
    "/siepi-artificiali",
    "/soffiatori",
    "/trattorini",
    "/decespugliator",
    "/forbici-cesoie",
    "/semenzai.html",
    "/strumenti-di-misura",
    "/blackfriday",
    "/premiumcard",
    "/carrello-",
    "/spandiconcime",
    "/irrigazione-",
    "/tagliaerba",
)

BEST_PRATO_ALLOW_SECTIONS = (
    "/cura-e-protezione/",
    "/concimi-prato-erba/",
    "/sementi-prato",
)


def carica_config() -> dict:
    with (DIR / "sources_volume.yaml").open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def url_prodotto_ok(url: str, site_cfg: dict) -> bool:
    u = url.lower()
    domain = (site_cfg.get("domain") or "").lower()
    if domain and domain not in u:
        return False

    skip = site_cfg.get("skip_path", []) + [
        "/cart", "/checkout", "/wp-json", "/feed", "/customer/",
        "/wishlist", "/catalogsearch", "/account/",
    ]
    if any(x in u for x in skip):
        return False

    nome = site_cfg.get("name", "")

    if nome == "bottos":
        if "bottos1848.com" not in u:
            return False
        if any(x in u for x in ("/wp-content/", "/feed/", "/tag/", "/author/")):
            return False
        if "/categorie/" in u:
            return True
        if any(
            x in u
            for x in (
                "fungic", "bioattiv", "prato", "turf", "erbicid", "concim",
                "fitofarm", "tappeto", "malatt", "nematod", "erboso", "sementi",
            )
        ):
            return True
        return False

    if nome == "best_prato":
        if "bestprato.com" not in u:
            return False
        exclude = tuple(site_cfg.get("path_exclude", BEST_PRATO_EXCLUDE)) + (
            "/coltivare-orto/",
            "/orto/",
            "/piante-da-orto",
            "/frutta-",
            "/fiori-",
            "/bonsai",
            "/animali-",
            "/vivaio-",
        )
        if any(x in u for x in exclude):
            return False
        if not u.endswith(".html") or "-prezzi.html" in u:
            return False
        if any(u.rstrip("/").endswith(h) for h in BEST_PRATO_HUB_PAGES):
            return True
        sections = site_cfg.get("path_allow", BEST_PRATO_ALLOW_SECTIONS)
        if any(s in u for s in sections):
            return True
        # erbicidi/insettic/biostimolanti solo se path esplicito prato
        if any(x in u for x in ("erbicid", "insettic", "biostimol", "diserbant")):
            return "prato" in u
        return False

    must = site_cfg.get("path_must_contain") or [
        "/categorie/", "/prodotto", "prato", "turf", "malatt", "fungic",
        "bioattiv", "concim", "/20",
    ]
    if not any(m.lower() in u for m in must):
        if not PRODUCT_KEYWORDS.search(u):
            return False
    return PRODUCT_KEYWORDS.search(u) or any(m.lower() in u for m in must)


def urls_da_sito(site: dict, limite: int = 400) -> list[str]:
    urls: list[str] = []
    visti: set[str] = set()

    list_file = site.get("url_list_file")
    if list_file:
        path = DIR / list_file if not Path(list_file).is_absolute() else Path(list_file)
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                u = line.strip()
                if u and not u.startswith("#") and url_prodotto_ok(u, site):
                    if u not in visti:
                        visti.add(u)
                        urls.append(u)
                        if limite and len(urls) >= limite:
                            break

    for seed in site.get("seed_urls", []):
        if seed not in visti:
            visti.add(seed)
            urls.append(seed)
    sm = site.get("sitemap")
    if sm:
        data = fetch_xml(sm)
        if data:
            for u in parse_sitemap_urls(data, sm):
                if u in visti:
                    continue
                if url_prodotto_ok(u, site):
                    visti.add(u)
                    urls.append(u)
                    if len(urls) >= limite:
                        break
    if site.get("name") == "best_prato":

        def _bp_sort(u: str) -> tuple:
            ul = u.lower()
            if "/cura-e-protezione/" in ul or "fungicid" in ul or "antifung" in ul:
                return (0, u)
            if "/sementi-prato" in ul:
                return (1, u)
            return (2, u)

        urls.sort(key=_bp_sort)
    if limite:
        urls = urls[:limite]
    return urls


def testo_prodotto_valido(testo: str, url: str = "") -> bool:
    """Scarta cataloghi e-commerce senza contesto prato/turf."""
    if not PRODUCT_KEYWORDS.search(testo):
        return False
    t = testo.lower()
    if t.count("prezzo di listino") >= 2:
        return False
    if t.count("iva compresa") >= 4 and len(testo) < 2500:
        return False
    if "bestprato.com" in url.lower():
        if "/coltivare-orto/" in url.lower():
            return False
        in_prato_section = any(
            s in url.lower()
            for s in ("/concimi-prato-erba/", "/cura-e-protezione/", "/sementi-prato")
        )
        if not TURF_IN_PRODUCT_TEXT.search(testo):
            if not (in_prato_section and len(testo) >= 500):
                return False
            if not re.search(
                r"npk|azoto|fosforo|potassio|micorriz|trichoderma|bacillus|"
                r"applicaz|dosagg|ettar|kg/ha|prato|erboso",
                testo,
                re.I,
            ):
                return False
        if t.count("aggiungi al carrello") >= 6 and len(testo) < 900:
            return False
        if any(
            x in url.lower()
            for x in (
                "orchidee", "bonsai", "gerani", "agrumi", "acidofile",
                "rose", "ortensie", "cycas", "olivo", "petunie", "piante-fiori",
            )
        ):
            return False
    return True


def elabora_pagina_prodotto(
    url: str,
    config: dict,
    supabase,
    stats: IngestStats,
    max_chunks: int | None,
    marca: str,
) -> None:
    print(f">> [{marca}] {url}")
    html = scarica_pagina(url)
    if not html:
        return
    testo, titolo = estrai_testo_principale(html, url)
    if not testo or len(testo) < 100:
        return
    if not testo_prodotto_valido(testo, url):
        print("  [SALTO] contenuto non agronomico / catalogo prezzi / fuori prato")
        return
    # Arricchisce contesto commerciale
    testo = f"Marca: {marca}\n{titolo or ''}\n\n{testo}"
    ingest_testo(
        testo,
        url,
        config,
        supabase,
        stats,
        tipo="prodotto",
        titolo=titolo,
        specie="prodotto commerciale",
        max_chunks=max_chunks,
    )


def preview_sito(solo_sito: str, limite: int = 60) -> None:
    cfg = carica_config()
    siti = [s for s in cfg.get("product_sites", []) if s.get("name") == solo_sito]
    if not siti:
        print(f"Sito '{solo_sito}' non trovato")
        return
    urls = urls_da_sito(siti[0], limite=limite * 3)
    from ingest_core import carica_fonti_viste, normalizza_fonte

    viste = carica_fonti_viste()
    nuove = [u for u in urls if normalizza_fonte(u) not in viste]
    print(f"\n=== ANTEPRIMA {solo_sito}: {len(urls)} URL filtrate, {len(nuove)} nuove ===")
    for u in nuove[:limite]:
        print(f"  {u}")
    if len(nuove) > limite:
        print(f"  ... e altre {len(nuove) - limite}")


def run(
    max_urls: int = 300,
    max_chunks: int | None = 5000,
    solo_sito: str | None = None,
    url_file: str | None = None,
) -> IngestStats:
    cfg = carica_config()
    config, supabase = setup_clients()
    stats = IngestStats()

    siti = cfg.get("product_sites", [])
    if solo_sito:
        siti = [s for s in siti if s.get("name") == solo_sito]
        if not siti:
            print(f"Sito '{solo_sito}' non trovato in sources_volume.yaml")
            return stats

    for site in siti:
        marca = site.get("name", "sconosciuto")
        if url_file:
            path = DIR / url_file if not Path(url_file).is_absolute() else Path(url_file)
            urls = [
                u.strip()
                for u in path.read_text(encoding="utf-8").splitlines()
                if u.strip() and not u.startswith("#") and url_prodotto_ok(u.strip(), site)
            ][:max_urls]
        else:
            urls = urls_da_sito(site, limite=max_urls)
        print(f"=== {marca}: {len(urls)} pagine ===")
        for url in urls:
            if not stats.budget_rimasto(max_chunks):
                return stats
            try:
                elabora_pagina_prodotto(
                    url, config, supabase, stats, max_chunks, marca
                )
            except Exception as exc:
                stats.errori += 1
                print(f"  [ERRORE] {exc}")
    return stats


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--max-urls", type=int, default=200)
    p.add_argument("--max-chunks", type=int, default=4000)
    p.add_argument(
        "--site",
        help="Solo questo marchio (es. best_prato, bottos)",
    )
    p.add_argument(
        "--preview",
        action="store_true",
        help="Elenco URL senza upload",
    )
    p.add_argument("--preview-limit", type=int, default=40)
    p.add_argument(
        "--url-file",
        help="File URL (es. urls_bestprato_fito.txt) al posto della lista default",
    )
    a = p.parse_args()
    if a.preview:
        if not a.site:
            raise SystemExit("--preview richiede --site best_prato")
        preview_sito(a.site, limite=a.preview_limit)
        raise SystemExit(0)
    s = run(
        max_urls=a.max_urls,
        max_chunks=a.max_chunks,
        solo_sito=a.site,
        url_file=a.url_file,
    )
    print(f"Prodotti: {s.chunks_inseriti} chunk, {s.fonti_ok} pagine")
