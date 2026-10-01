# Verifies .env Supabase settings and API reachability
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

if (-not (Test-Path $envFile)) {
    Write-Host "Missing .env - copy .env.example to .env and add your Supabase credentials." -ForegroundColor Red
    exit 1
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*VITE_SUPABASE_(\w+)\s*=\s*(.+)$') {
        $vars[$Matches[1]] = $Matches[2].Trim().Trim('"')
    }
}

$url = $vars["URL"]
$key = $vars["PUBLISHABLE_KEY"]
if (-not $key) { $key = $vars["ANON_KEY"] }

if (-not $url -or $url -match "your-project") {
    Write-Host "Set VITE_SUPABASE_URL in .env (see FINAL_SETUP.md)" -ForegroundColor Yellow
    exit 1
}

if (-not $key -or $key -match "your-anon") {
    Write-Host "Set VITE_SUPABASE_PUBLISHABLE_KEY in .env" -ForegroundColor Yellow
    exit 1
}

try {
    $headers = @{
        apikey        = $key
        Authorization = "Bearer $key"
    }
    $response = Invoke-WebRequest -Uri "$url/auth/v1/health" -Headers $headers -Method GET -TimeoutSec 20 -UseBasicParsing
    Write-Host "Backend OK: $url (HTTP $($response.StatusCode))" -ForegroundColor Green
    if ($vars["PROJECT_ID"]) { Write-Host "Project ref: $($vars['PROJECT_ID'])" }
    exit 0
}
catch {
    Write-Host "Cannot reach Supabase at $url" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
