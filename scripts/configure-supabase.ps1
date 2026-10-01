# Usage: .\scripts\configure-supabase.ps1 -Url "https://xxx.supabase.co" -AnonKey "eyJ..."
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$AnonKey
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

$Url = $Url.Trim().TrimEnd("/")
if ($Url -notmatch "^https://[a-z0-9-]+\.supabase\.co$") {
  throw "Invalid URL. Expected https://YOUR_REF.supabase.co"
}

$ref = ($Url -replace "^https://", "" -replace "\.supabase\.co$", "")

$content = @"
VITE_SUPABASE_PROJECT_ID=$ref
VITE_SUPABASE_PUBLISHABLE_KEY=$AnonKey
VITE_SUPABASE_URL=$Url
"@

Set-Content -Path $envFile -Value $content -Encoding utf8
Write-Host "Updated $envFile" -ForegroundColor Green
Write-Host "Restart the dev server: npm run dev"
