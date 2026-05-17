"""
Registrazione e login AgriPocket via Supabase Auth (email + password).

Le password sono gestite da Supabase in auth.users.
Il profilo viene creato automaticamente in public.usersagropocket (trigger SQL).

Variabili .env (cartella auth/ o crawler/):
  SUPABASE_URL
  SUPABASE_ANON_KEY   ← chiave pubblica per login dall'app (NON service_role)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

_ENV_DIRS = (Path(__file__).resolve().parent, Path(__file__).resolve().parent.parent / "crawler")


def _load_env() -> None:
    for d in _ENV_DIRS:
        p = d / ".env"
        if p.is_file():
            load_dotenv(p)
            return
    load_dotenv()


def get_auth_client() -> Client:
    _load_env()
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not url:
        raise EnvironmentError("Manca SUPABASE_URL in crawler/.env o auth/.env")
    if not key:
        raise EnvironmentError(
            "Manca SUPABASE_ANON_KEY in crawler/.env\n\n"
            "1. Supabase Dashboard → Settings → API\n"
            "2. Copia la chiave «anon» «public» (inizia di solito con eyJ...)\n"
            "3. Aggiungi in crawler/.env:\n"
            "   SUPABASE_ANON_KEY=eyJ...\n\n"
            "NON usare SUPABASE_KEY (service_role / sb_secret_...) per registrazione e login."
        )
    if key.startswith("sb_secret_") or "service_role" in key.lower():
        raise EnvironmentError(
            "SUPABASE_ANON_KEY non deve essere la service_role (sb_secret_...). "
            "Usa la chiave publishable/anon dalla Dashboard."
        )
    if not (key.startswith("eyJ") or key.startswith("sb_publishable_")):
        raise EnvironmentError(
            "SUPABASE_ANON_KEY non sembra valida: attesa eyJ... (anon) o sb_publishable_..."
        )
    return create_client(url, key)


def sign_up(email: str, password: str, *, display_name: str | None = None) -> dict:
    """Registra utente; il trigger SQL popola usersagropocket."""
    sb = get_auth_client()
    meta = {}
    if display_name:
        meta["display_name"] = display_name.strip()
    res = sb.auth.sign_up(
        {
            "email": email.strip().lower(),
            "password": password,
            "options": {"data": meta} if meta else {},
        }
    )
    user = res.user
    session = res.session
    return {
        "user_id": str(user.id) if user else None,
        "email": user.email if user else email,
        "session": bool(session),
        "message": "Controlla la email di conferma, se richiesta dal progetto Supabase.",
    }


def sign_in(email: str, password: str) -> dict:
    """Login email/password; aggiorna last_login_at sul profilo."""
    sb = get_auth_client()
    res = sb.auth.sign_in_with_password(
        {"email": email.strip().lower(), "password": password}
    )
    user = res.user
    session = res.session
    if user:
        try:
            from datetime import datetime, timezone
            sb.table("usersagropocket").update(
                {"last_login_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", str(user.id)).execute()
        except Exception:
            pass
    return {
        "user_id": str(user.id) if user else None,
        "email": user.email if user else None,
        "access_token": session.access_token if session else None,
        "refresh_token": session.refresh_token if session else None,
    }


def sign_out() -> None:
    get_auth_client().auth.sign_out()


def get_profile() -> dict | None:
    """Profilo dell'utente loggato (richiede sessione attiva sul client)."""
    sb = get_auth_client()
    uid = sb.auth.get_user()
    if not uid or not uid.user:
        return None
    row = (
        sb.table("usersagropocket")
        .select("id, email, display_name, role, locale, created_at, last_login_at")
        .eq("id", uid.user.id)
        .maybe_single()
        .execute()
    )
    return row.data


def update_profile(*, display_name: str | None = None, phone: str | None = None, locale: str | None = None) -> dict | None:
    sb = get_auth_client()
    uid = sb.auth.get_user()
    if not uid or not uid.user:
        raise PermissionError("Devi essere loggato.")
    patch = {k: v for k, v in {
        "display_name": display_name,
        "phone": phone,
        "locale": locale,
    }.items() if v is not None}
    if not patch:
        return get_profile()
    res = sb.table("usersagropocket").update(patch).eq("id", str(uid.user.id)).execute()
    return res.data[0] if res.data else None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test login AgriPocket")
    sub = parser.add_subparsers(dest="cmd", required=True)
    reg = sub.add_parser("register", help="Crea account")
    reg.add_argument("email")
    reg.add_argument("password")
    reg.add_argument("--name", default=None)
    log = sub.add_parser("login", help="Accedi")
    log.add_argument("email")
    log.add_argument("password")
    sub.add_parser("profile", help="Mostra profilo (sessione salvata nel client)")
    sub.add_parser("logout", help="Esci")

    args = parser.parse_args()
    if args.cmd == "register":
        print(sign_up(args.email, args.password, display_name=args.name))
    elif args.cmd == "login":
        print(sign_in(args.email, args.password))
    elif args.cmd == "profile":
        print(get_profile())
    elif args.cmd == "logout":
        sign_out()
        print("Logout OK")
