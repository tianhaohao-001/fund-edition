[CmdletBinding()]
param([Parameter(Mandatory)][uri]$PublicOrigin)
$ErrorActionPreference = 'Stop'
if ($PublicOrigin.Scheme -ne 'https' -or $PublicOrigin.AbsolutePath -ne '/' -or $PublicOrigin.Query -or $PublicOrigin.Fragment -or $PublicOrigin.UserInfo) {
    throw 'Provide the HTTPS origin assigned to this product.'
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:FUNDROOM_PUBLIC_HOSTED = 'true'
$env:FUNDROOM_PUBLIC_DEMO = 'false'
$env:FUNDROOM_HOST = '127.0.0.1'
$env:FUNDROOM_PORT = '3348'
$env:FUNDROOM_PUBLIC_ORIGIN = $PublicOrigin.GetLeftPart([UriPartial]::Authority)
$env:FUNDROOM_DB_PATH = Join-Path $projectRoot '.fundroom/hosted-public.sqlite'
$env:FUNDROOM_BROKER_DB_PATH = Join-Path $projectRoot '.fundroom/public-disabled-broker.sqlite'
$env:FUNDROOM_HOURLY_AI_TASKS = '20'
$env:FUNDROOM_AI_CONCURRENCY = '2'
$env:ALPACA_PAPER_TRADING_ENABLED = 'false'
$env:ALPACA_LIVE_TRADING_ENABLED = 'false'
& (Join-Path $projectRoot 'dev.ps1')
