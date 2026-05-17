#!/usr/bin/env python3
"""Applica indice HNSW + match_documenti ottimizzato."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "sql" / "patch_match_documenti.sql"
PROJECT_REF = "azkpckrybldypqwdksjc"


def main() -> int:
    password = os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
    if not password:
        print("Imposta SUPABASE_DB_PASSWORD oppure incolla sql/patch_match_documenti.sql nel SQL Editor.")
        return 1
    try:
        import psycopg2
    except ImportError:
        print("pip install psycopg2-binary")
        return 1
    conn = psycopg2.connect(
        host=os.environ.get("SUPABASE_DB_HOST", f"db.{PROJECT_REF}.supabase.co"),
        port=int(os.environ.get("SUPABASE_DB_PORT", "5432")),
        dbname=os.environ.get("SUPABASE_DB_NAME", "postgres"),
        user=os.environ.get("SUPABASE_DB_USER", "postgres"),
        password=password,
        sslmode="require",
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_FILE.read_text(encoding="utf-8"))
        print("OK: patch_match_documenti applicata.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
