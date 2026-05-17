#!/usr/bin/env python3
"""Scopre URL prodotto su bestprato.com."""
import re
import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0"}

SEEDS = [
    "https://www.bestprato.com/",
    "https://www.bestprato.com/cura-e-protezione/antifungini-fungicidi-prato.html",
    "https://www.bestprato.com/cura-e-protezione.html",
    "https://www.bestprato.com/concimi-prato-erba.html",
    "https://www.bestprato.com/sementi-prato.html",
    "https://www.bestprato.com/erbicidi-diserbanti-prato.html",
    "https://www.bestprato.com/insetticidi-prato.html",
    "https://www.bestprato.com/biostimolanti-prato.html",
    "https://www.bestprato.com/sementi-prato-erboso.html",
]

SKIP = ("checkout", "customer", "cart", "wishlist", "login", "account", "catalogsearch")

EXCLUDE_PATH = (
    "/attrezzi",
    "/tagliaerba",
    "/robot-",
    "/abbigliamento",
    "-prezzi.html",
    "/wolf-garten",
)

ALLOW_PATH = (
    "/cura-e-protezione/",
    "/concimi-prato-erba/",
    "/sementi-prato",
)

EXCLUDE_EXTRA = ("/coltivare-orto/", "/orto/")


def url_ok(u: str) -> bool:
    ul = u.lower()
    if any(s in ul for s in SKIP):
        return False
    if any(s in ul for s in EXCLUDE_PATH + EXCLUDE_EXTRA):
        return False
    if not ul.endswith(".html") or "-prezzi.html" in ul:
        return False
    if any(ul.rstrip("/").endswith(h) for h in (
        "cura-e-protezione.html",
        "concimi-prato-erba.html",
        "sementi-prato.html",
        "erbicidi-diserbanti-prato.html",
        "insetticidi-prato.html",
        "biostimolanti-prato.html",
    )):
        return True
    if any(s in ul for s in ALLOW_PATH):
        return True
    if any(x in ul for x in ("erbicid", "insettic", "biostimol")) and "prato" in ul:
        return True
    return False


def estrai_da_html(html: str, trovati: set[str]) -> None:
    for m in re.finditer(r'href="(https://www\.bestprato\.com/[^"]+)"', html):
        u = m.group(1).split("?")[0]
        if url_ok(u):
            trovati.add(u)


def main():
    trovati: set[str] = set()
    coda = list(SEEDS)
    visitati: set[str] = set()

    while coda and len(visitati) < 80:
        seed = coda.pop(0)
        if seed in visitati:
            continue
        visitati.add(seed)
        try:
            r = requests.get(seed, headers=HEADERS, timeout=30)
            if r.status_code != 200:
                print(seed, r.status_code)
                continue
            prima = len(trovati)
            estrai_da_html(r.text, trovati)
            # Segui categorie per trovare tutti i prodotti
            for u in list(trovati):
                if u not in visitati and url_ok(u):
                    if len(coda) < 100:
                        coda.append(u)
            print(seed, "+", len(trovati) - prima, "tot", len(trovati))
        except Exception as e:
            print(seed, e)

    out = __file__.replace("discover_bestprato.py", "urls_bestprato.txt")
    with open(out, "w", encoding="utf-8") as f:
        for u in sorted(trovati):
            f.write(u + "\n")
    print(len(trovati), "URL ->", out)


if __name__ == "__main__":
    main()
