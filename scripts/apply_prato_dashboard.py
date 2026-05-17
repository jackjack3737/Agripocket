#!/usr/bin/env python3
"""
Crea prato_analisi e prato_interventi su Supabase.

  set SUPABASE_DB_PASSWORD=la_password_di_postgres
  python scripts/apply_prato_dashboard.py

Oppure incolla sql/prato_dashboard.sql nel SQL Editor Supabase.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "sql" / "prato_dashboard.sql"
PROJECT_REF = "azkpckrybldypqwdksjc"


def main() -> int:
    password = os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
    if not password:
        print("Imposta SUPABASE_DB_PASSWORD (Settings -> Database -> password).")
        print(f"In alternativa: Supabase Dashboard -> SQL Editor -> incolla {SQL_FILE}")
        return 1

    try:
        import psycopg2
    except ImportError:
        print("pip install psycopg2-binary")
        return 1

    host = os.environ.get("SUPABASE_DB_HOST", f"db.{PROJECT_REF}.supabase.co")
    sql = SQL_FILE.read_text(encoding="utf-8")

    conn = psycopg2.connect(
        host=host,
        port=int(os.environ.get("SUPABASE_DB_PORT", "5432")),
        dbname=os.environ.get("SUPABASE_DB_NAME", "postgres"),
        user=os.environ.get("SUPABASE_DB_USER", "postgres"),
        password=password,
        sslmode="require",
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("OK: prato_analisi e prato_interventi creati (o gia esistenti).")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
