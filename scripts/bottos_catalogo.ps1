# Catalogo Bottos: download Drive + ingest tgif_knowledge_base
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot ".." "crawler")

Write-Host "=== Download PDF (solo mancanti, pausa 15s) ===" -ForegroundColor Cyan
python -u download_bottos_drive.py --only-missing --delay 15

Write-Host "=== Ingest in Supabase ===" -ForegroundColor Cyan
python -u ingest_bottos_drive.py

Write-Host "Fatto." -ForegroundColor Green
