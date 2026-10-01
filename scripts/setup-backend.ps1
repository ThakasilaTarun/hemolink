# Links Supabase project and pushes migrations (requires: supabase login, .env filled)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== HEMO LINK backend setup ===" -ForegroundColor Cyan

& "$PSScriptRoot\verify-backend.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ref = $null
Get-Content ".env" | ForEach-Object {
    if ($_ -match 'VITE_SUPABASE_PROJECT_ID\s*=\s*"?([^"#\s]+)"?') { $ref = $Matches[1] }
}

if (-not $ref) {
    Write-Host "VITE_SUPABASE_PROJECT_ID not found in .env" -ForegroundColor Red
    exit 1
}

Write-Host "Linking project ref: $ref" -ForegroundColor Cyan
npx supabase link --project-ref $ref
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: npx supabase login" -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Write-Host "Pushing database migrations..." -ForegroundColor Cyan
npx supabase db push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying edge functions..." -ForegroundColor Cyan
npx supabase functions deploy chat generate-certificate suggest-donors send-donor-alerts delete-user

Write-Host "Done. Set HEMO_AI_API_KEY in Supabase Dashboard for AI features." -ForegroundColor Green
