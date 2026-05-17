# Setup completo AgriPocket: env, verifica DB, avvio dev
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$crawlerEnv = Join-Path $root "crawler\.env"
$webEnv = Join-Path $root "web\.env.local"

if (-not (Test-Path $crawlerEnv)) {
  Write-Error "Manca crawler\.env"
}

$vars = @{}
Get-Content $crawlerEnv | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$mapsKey = $null
if (Test-Path $webEnv) {
  Get-Content $webEnv | ForEach-Object {
    if ($_ -match '^VITE_GOOGLE_MAPS_API_KEY=(.+)$') { $mapsKey = $matches[1].Trim() }
  }
}
if (-not $mapsKey) { $mapsKey = $vars["GOOGLE_MAPS_API_KEY"] }

$lines = @(
  "VITE_SUPABASE_URL=$($vars['SUPABASE_URL'])",
  "VITE_SUPABASE_ANON_KEY=$($vars['SUPABASE_ANON_KEY'])"
)
if ($mapsKey) { $lines += "VITE_GOOGLE_MAPS_API_KEY=$mapsKey" }
$lines | Set-Content -Path $webEnv -Encoding utf8
Write-Host "[ok] web\.env.local"

$fnEnv = Join-Path $root "supabase\functions\.env"
@"
SUPABASE_URL=$($vars['SUPABASE_URL'])
SUPABASE_SERVICE_ROLE_KEY=$($vars['SUPABASE_KEY'])
SUPABASE_ANON_KEY=$($vars['SUPABASE_ANON_KEY'])
GEMINI_API_KEY=$($vars['API_KEY'])
OPENWEATHER_API_KEY=$($vars['OPENWEATHER_API_KEY'])
"@ | Set-Content -Path $fnEnv -Encoding utf8
Write-Host "[ok] supabase\functions\.env"

node (Join-Path $root "scripts\verify-db.mjs")
if ($LASTEXITCODE -ne 0) {
  Write-Host "[!!] Esegui sql/patch_prato_localita.sql nel SQL Editor Supabase"
} else {
  Write-Host "[ok] Database pronto (localita)"
}

Write-Host ""
Write-Host "http://localhost:5173 — API foto: /api/analizza-prato · meteo: /api/meteo"
Set-Location (Join-Path $root "web")
npm run dev
