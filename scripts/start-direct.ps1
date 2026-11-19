[CmdletBinding()]
param([Parameter(Mandatory)][uri]$PublicOrigin)
$ErrorActionPreference = 'Stop'
if ($PublicOrigin.Scheme -ne 'https' -or $PublicOrigin.AbsolutePath -ne '/' -or $PublicOrigin.Query -or $PublicOrigin.Fragment -or $PublicOrigin.UserInfo) { throw 'Supply the assigned product HTTPS origin.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    $env:FUNDROOM_PUBLIC_ORIGIN = $PublicOrigin.GetLeftPart([UriPartial]::Authority)
    $env:FUNDROOM_DIRECT_DB = '.fundroom/direct-public.sqlite'
    $env:FUNDROOM_DIRECT_PORT = '3348'
    $env:ALPACA_PAPER_TRADING_ENABLED = 'false'
    $env:ALPACA_LIVE_TRADING_ENABLED = 'false'
    $node = (Get-Command node -ErrorAction Stop).Source
    & $node hosting/site/build.mjs .fundroom/direct-app --direct
    if ($LASTEXITCODE -ne 0) { throw 'The direct application build failed.' }
    if ($env:HARNESSROUTER_API_KEY) { & $node hosting/site/direct-server.mjs } else { & python core/windows-harness.py -- $node hosting/site/direct-server.mjs }
    exit $LASTEXITCODE
} finally { Pop-Location }
