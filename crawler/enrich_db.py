#!/usr/bin/env python3
"""
Scopre fonti .edu, aggiorna urls_pending.txt e lancia il crawler in batch.
Uso: python enrich_db.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent


def main() -> int:
    print("=== 1/2 Scoperta URL ===")
    r1 = subprocess.run([sys.executable, str(DIR / "discover_urls.py")], cwd=DIR)
    if r1.returncode != 0:
        return r1.returncode

    pending = DIR / "urls_pending.txt"
    if not pending.exists() or pending.stat().st_size < 20:
        print("Nessun URL nuovo trovato.")
        return 0

    print("\n=== 2/2 Crawler (skip duplicati) ===")
    r2 = subprocess.run(
        [
            sys.executable,
            str(DIR / "turf_knowledge_crawler.py"),
            "-f",
            str(pending),
            "--skip-crawled",
        ],
        cwd=DIR,
    )
    return r2.returncode


if __name__ == "__main__":
    sys.exit(main())
