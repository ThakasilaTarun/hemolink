# Deploy HEMO LINK AI edge functions to Supabase
# Prerequisites:
#   1. npx supabase login   (one time — opens browser)
#   2. Add HEMO_AI_API_KEY in Supabase Dashboard → Edge Functions → Secrets
#
# Usage (if npx fails in PowerShell, use npx.cmd or run from CMD):
#   .\scripts\deploy-ai-functions.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Windows PowerShell blocks npx.ps1 — use npx.cmd instead
$npx = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) { "npx.cmd" } else { "npx" }

$projectRef = "rktxgqukqglwynezerpy"
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*VITE_SUPABASE_PROJECT_ID\s*=\s*(.+)$') {
            $projectRef = $Matches[1].Trim().Trim('"')
        }
    }
}

Write-Host "`n=== HEMO LINK — Deploy AI Edge Functions ===" -ForegroundColor Cyan
Write-Host "Project: $projectRef`n"

Write-Host "Step 1: Linking project (skip if already linked)..." -ForegroundColor Yellow
& $npx supabase link --project-ref $projectRef

Write-Host "`nStep 2: Deploying functions..." -ForegroundColor Yellow
& $npx supabase functions deploy chat generate-certificate suggest-donors send-donor-alerts delete-user

Write-Host "`nStep 3: Testing chat endpoint..." -ForegroundColor Yellow
$url = "https://$projectRef.supabase.co"
$key = $null
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(.+)$') { $key = $Matches[1].Trim().Trim('"') }
        if (-not $key -and $_ -match '^\s*VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$') { $key = $Matches[1].Trim().Trim('"') }
    }
}

if ($key) {
    try {
        $body = '{"messages":[{"role":"user","content":"Hello"}]}'
        $resp = Invoke-WebRequest -Uri "$url/functions/v1/chat" -Method POST `
            -Headers @{ Authorization = "Bearer $key"; "Content-Type" = "application/json" } `
            -Body $body -TimeoutSec 30 -UseBasicParsing
        Write-Host "Chat endpoint: HTTP $($resp.StatusCode) — deployed!" -ForegroundColor Green
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 404) {
            Write-Host "Chat still returns 404 — redeploy failed or wait 1 minute and retry." -ForegroundColor Red
        }
        elseif ($status -eq 500) {
            Write-Host "Chat deployed but needs HEMO_AI_API_KEY secret in Supabase Dashboard." -ForegroundColor Yellow
            Write-Host "  Dashboard → Edge Functions → Secrets → Add HEMO_AI_API_KEY" -ForegroundColor Yellow
        }
        else {
            Write-Host "Chat test: HTTP $status (function may still be starting)" -ForegroundColor Yellow
        }
    }
}

Write-Host @"

=== Done ===
Next:
  1. Supabase Dashboard → Edge Functions → Secrets
     Add: HEMO_AI_API_KEY = your OpenAI or Gemini API key
     Optional: AI_PROVIDER = openai | google | anthropic
  2. Refresh the app → Hospital/Donor → AI Assistant tab
  3. Offline badge should disappear when AI responds

See API_KEY_SETUP.md for getting a free Gemini or OpenAI key.
"@ -ForegroundColor Cyan
