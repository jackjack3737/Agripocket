# Sincronizza variabili Vercel da crawler/.env + web/.env.local
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$vars = @{}
Get-Content (Join-Path $root "crawler\.env") | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { $vars[$matches[1].Trim()] = $matches[2].Trim() }
}
$local = Join-Path $root "web\.env.local"
if (Test-Path $local) {
  Get-Content $local | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') { $vars[$matches[1].Trim()] = $matches[2].Trim() }
  }
}

$map = @{
  VITE_SUPABASE_URL = $vars["SUPABASE_URL"]
  VITE_SUPABASE_ANON_KEY = $vars["SUPABASE_ANON_KEY"]
  VITE_GOOGLE_MAPS_API_KEY = $vars["VITE_GOOGLE_MAPS_API_KEY"]
  SUPABASE_URL = $vars["SUPABASE_URL"]
  SUPABASE_ANON_KEY = $vars["SUPABASE_ANON_KEY"]
  SUPABASE_SERVICE_ROLE_KEY = $vars["SUPABASE_KEY"]
  GEMINI_API_KEY = $vars["API_KEY"]
  OPENWEATHER_API_KEY = $vars["OPENWEATHER_API_KEY"]
}

Set-Location (Join-Path $root "web")
foreach ($name in $map.Keys) {
  $val = $map[$name]
  if (-not $val) { Write-Host "[skip] $name"; continue }
  Write-Host "[set] $name"
  $val | npx vercel env add $name production --force 2>&1 | Out-Null
  $val | npx vercel env add $name preview --force 2>&1 | Out-Null
}
Write-Host "Fatto. Rideploy: npx vercel --prod --yes (da web/)"
