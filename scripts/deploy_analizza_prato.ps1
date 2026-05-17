# Deploy Edge Function analizza-prato + secrets (legge crawler/.env)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $root "crawler\.env"

if (-not (Test-Path $envFile)) {
  Write-Error "Manca crawler\.env"
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "Serve access token Supabase:"
  Write-Host "  npx supabase login"
  Write-Host "  oppure: `$env:SUPABASE_ACCESS_TOKEN = '...' (Dashboard → Account → Access Tokens)"
  exit 1
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$gemini = $vars["API_KEY"]
$service = $vars["SUPABASE_KEY"]
$anon = $vars["SUPABASE_ANON_KEY"]
$url = $vars["SUPABASE_URL"]
$owm = $vars["OPENWEATHER_API_KEY"]

if (-not $gemini -or -not $service -or -not $anon) {
  Write-Error "crawler\.env deve avere API_KEY, SUPABASE_KEY, SUPABASE_ANON_KEY"
}

$fnEnv = Join-Path $root "supabase\functions\.env"
@"
SUPABASE_URL=$url
SUPABASE_SERVICE_ROLE_KEY=$service
SUPABASE_ANON_KEY=$anon
GEMINI_API_KEY=$gemini
OPENWEATHER_API_KEY=$owm
"@ | Set-Content -Path $fnEnv -Encoding utf8
Write-Host "Scritto supabase\functions\.env"

function Invoke-Supabase([string[]]$Args) {
  & npx supabase @Args --project-ref azkpckrybldypqwdksjc
  if ($LASTEXITCODE -ne 0) { throw "Comando fallito: supabase $($Args -join ' ')" }
}

Set-Location $root
Invoke-Supabase @("secrets", "set", "GEMINI_API_KEY=$gemini")
Invoke-Supabase @("secrets", "set", "SUPABASE_SERVICE_ROLE_KEY=$service")
Invoke-Supabase @("secrets", "set", "SUPABASE_ANON_KEY=$anon")
Invoke-Supabase @("secrets", "set", "SUPABASE_URL=$url")
if ($owm) { Invoke-Supabase @("secrets", "set", "OPENWEATHER_API_KEY=$owm") }
Invoke-Supabase @("functions", "deploy", "analizza-prato")

Write-Host "Deploy completato."
