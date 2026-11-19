[CmdletBinding()]
param([int]$Port = 3318)

$ErrorActionPreference = 'Stop'
$bytes = New-Object byte[] 18
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$code = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$env:FUNDROOM_MOBILE_ENABLED = 'true'
$env:FUNDROOM_MOBILE_PAIR_CODE = $code
$env:FUNDROOM_HOST = '127.0.0.1'
$env:FUNDROOM_PORT = [string]$Port
$env:FUNDROOM_PUBLIC_DEMO = 'false'
Write-Host "Morrowfolio mobile backend: http://127.0.0.1:$Port"
Write-Host "One-time pairing code (5 minutes): $code"
Write-Host 'iPhone/iPad need a reachable private HTTPS mobile-only gateway; this localhost address is not a phone URL.'
Write-Host 'The paired mobile session expires in 12 hours. This window must stay open.'
& (Join-Path $PSScriptRoot '..\dev.ps1')
