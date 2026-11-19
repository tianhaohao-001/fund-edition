[CmdletBinding()]
param([switch]$LiveHarness, [switch]$Offline, [switch]$Review, [switch]$CloudReview, [switch]$LatestReview, [switch]$GalleryReview, [switch]$NarrationReview, [switch]$BuffettReview)

$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($node) { $node.Source } else { 'C:\Users\rocks\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw 'Fundroom requires Node.js 24 or newer.'
}

Push-Location -LiteralPath $PSScriptRoot
try {
    $reviewModes = @($Review, $CloudReview, $LatestReview, $GalleryReview, $NarrationReview, $BuffettReview | Where-Object { $_ })
    if ($reviewModes.Count -gt 1) { throw 'Select exactly one review profile.' }
    if ($reviewModes.Count) {
        $env:FUNDROOM_HOST = '127.0.0.1'
        $env:FUNDROOM_PORT = if ($BuffettReview) { '3395' } elseif ($NarrationReview) { '3394' } elseif ($GalleryReview) { '3386' } elseif ($LatestReview) { '3365' } elseif ($CloudReview) { '3347' } else { '3331' }
        $reviewDatabase = if ($BuffettReview) { 'buffett-review.sqlite' } elseif ($NarrationReview) { 'narration-review.sqlite' } elseif ($GalleryReview) { 'review-fund-desk.sqlite' } elseif ($LatestReview) { 'product-review-v16.sqlite' } elseif ($CloudReview) { 'hosted-cloud-review-v14.sqlite' } else { 'web-review-v11.sqlite' }
        $env:FUNDROOM_DB_PATH = Join-Path (Join-Path $PSScriptRoot '.fundroom') $reviewDatabase
        if ($BuffettReview -or $NarrationReview -or $GalleryReview -or $LatestReview) {
            $env:FUNDROOM_PUBLIC_HOSTED = 'false'
            $env:FUNDROOM_PUBLIC_DEMO = 'false'
            $env:FUNDROOM_PUBLIC_ORIGIN = 'http://127.0.0.1:' + $env:FUNDROOM_PORT
        }
        if ($BuffettReview -or $NarrationReview -or $GalleryReview) {
            if ($BuffettReview -or $NarrationReview) { $env:FUNDROOM_PUBLIC_ORIGIN='http://localhost:' + $env:FUNDROOM_PORT }
            $brokerDatabase=if ($BuffettReview) { 'buffett-review-broker.sqlite' } elseif ($NarrationReview) { 'narration-review-broker.sqlite' } else { 'review-fund-desk-broker.sqlite' }
            $env:FUNDROOM_BROKER_DB_PATH = Join-Path (Join-Path $PSScriptRoot '.fundroom') $brokerDatabase
            $env:FUNDROOM_REVIEW_MARKET = 'true'
            $env:FUNDROOM_MEMBERSHIP_SIMULATION = 'true'
        }
        $env:ALPACA_PAPER_TRADING_ENABLED = 'false'
        $env:ALPACA_LIVE_TRADING_ENABLED = 'false'
    }
    $nodeArgs = @()
    $envPath = Join-Path $PSScriptRoot '.env'
    if (Test-Path -LiteralPath $envPath -PathType Leaf) { $nodeArgs += "--env-file=$envPath" }
    $nodeArgs += (Join-Path $PSScriptRoot 'server.mjs')
    if (-not $Offline) {
        $env:FUNDROOM_ENABLE_HARNESS = 'true'
        $env:FUNDROOM_DEFAULT_PROVIDER = 'committee'
        if (-not $env:HARNESSROUTER_MODEL) { $env:HARNESSROUTER_MODEL = 'deepseek-v4.1-flash' }
    } else {
        $env:FUNDROOM_ENABLE_HARNESS = 'false'
    }
    $explicitFileCredentials = $false
    if (Test-Path -LiteralPath $envPath -PathType Leaf) {
        $explicitFileCredentials = [bool](Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*(?:HARNESSROUTER_API_KEY|HR_API_KEY)\s*=\s*[^\s#]+' })
    }
    if (-not $Offline -and -not $explicitFileCredentials -and -not ($env:HARNESSROUTER_API_KEY -or $env:HR_API_KEY) -and $env:OS -eq 'Windows_NT') {
        $python = Get-Command python -ErrorAction Stop
        $launcher = Join-Path $PSScriptRoot 'core/windows-harness.py'
        & $python.Source $launcher -- $nodePath @nodeArgs
    } else {
        & $nodePath @nodeArgs
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}

