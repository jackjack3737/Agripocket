#!/usr/bin/env python3
"""Trascrizioni YouTube -> chunk -> Supabase."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from ingest_core import DIR, IngestStats, carica_fonti_viste, ingest_testo, setup_clients

YOUTUBE_SEEDS = DIR / "youtube_seeds.txt"


def carica_video_ids() -> list[str]:
    cfg_path = DIR / "sources_volume.yaml"
    ids: list[str] = []
    if cfg_path.exists():
        with cfg_path.open(encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        yt = cfg.get("youtube", {}) or {}
        ids.extend(yt.get("seed_videos", []) or [])
        for url in yt.get("video_urls", []) or []:
            m = re.search(
                r"(?:v=|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})", url
            )
            if m:
                ids.append(m.group(1))
    if YOUTUBE_SEEDS.exists():
        for line in YOUTUBE_SEEDS.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "youtube" in line or "youtu.be" in line:
                m = re.search(r"([a-zA-Z0-9_-]{11})", line)
                if m:
                    ids.append(m.group(1))
            elif len(line) == 11:
                ids.append(line)
    # dedup, escludi placeholder
    out = []
    for i in dict.fromkeys(ids):
        if i and i != "dQw4w9WgXcQ" and "placeholder" not in i.lower():
            out.append(i)
    return out


def scarica_trascrizione(video_id: str) -> tuple[str, str] | None:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        ytt = YouTubeTranscriptApi()
        # API v1.x
        try:
            fetched = ytt.fetch(video_id, languages=["it", "en", "en-US", "en-GB"])
            linee = [s.text for s in fetched.snippets]
            titolo = video_id
            return "\n".join(linee), titolo
        except AttributeError:
            tr = YouTubeTranscriptApi.get_transcript(
                video_id, languages=["it", "en", "en-US"]
            )
            return "\n".join(t["text"] for t in tr), video_id
    except Exception as exc:
        print(f"  [ERRORE] transcript {video_id}: {exc}")
        return None


def run(max_chunks: int | None = 3000) -> IngestStats:
    ids = carica_video_ids()
    if not ids:
        print(
            "Nessun video ID. Aggiungi in crawler/youtube_seeds.txt "
            "(un ID o URL per riga)."
        )
        return IngestStats()

    config, supabase = setup_clients()
    stats = IngestStats()
    visti = carica_fonti_viste()

    for vid in ids:
        if not stats.budget_rimasto(max_chunks):
            break
        fonte = f"https://www.youtube.com/watch?v={vid}"
        if fonte in visti:
            continue
        print(f">> YouTube {vid}")
        ris = scarica_trascrizione(vid)
        if not ris:
            stats.errori += 1
            continue
        testo, titolo = ris
        ingest_testo(
            testo,
            fonte,
            config,
            supabase,
            stats,
            tipo="youtube",
            titolo=titolo,
            max_chunks=max_chunks,
        )
    return stats


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--max-chunks", type=int, default=2000)
    a = p.parse_args()
    s = run(max_chunks=a.max_chunks)
    print(f"YouTube: {s.chunks_inseriti} chunk")
