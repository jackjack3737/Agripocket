#!/usr/bin/env python3
"""Download file pubblici Google Drive (fallback se gdown e' in rate limit)."""

from __future__ import annotations

import re
from pathlib import Path

import requests

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
)


def _confirm_token(html: str) -> str | None:
    m = re.search(r"confirm=([0-9A-Za-z_]+)", html)
    if m:
        return m.group(1)
    m = re.search(r'name="confirm"\s+value="([^"]+)"', html)
    if m:
        return m.group(1)
    return None


def download_drive_file(file_id: str, dest: Path, timeout: int = 120) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    base = "https://drive.google.com/uc?export=download"
    url = f"{base}&id={file_id}"

    with SESSION.get(url, stream=True, timeout=timeout) as r:
        r.raise_for_status()
        ct = (r.headers.get("Content-Type") or "").lower()

        if "text/html" in ct:
            html = r.text
            token = _confirm_token(html)
            if not token:
                return False
            url2 = f"{base}&id={file_id}&confirm={token}"
            with SESSION.get(url2, stream=True, timeout=timeout) as r2:
                r2.raise_for_status()
                return _save_stream(r2, dest)

        return _save_stream(r, dest)


def _save_stream(response: requests.Response, dest: Path) -> bool:
    data = response.content
    if len(data) < 2048:
        return False
    if data[:15].lower().startswith(b"<!doctype") or data[:5].lower() == b"<html":
        return False
    dest.write_bytes(data)
    return dest.stat().st_size >= 2048
