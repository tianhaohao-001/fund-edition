[CmdletBinding()]
param([int]$Port = 8086, [string]$PrivatePackagerHost = '')

$ErrorActionPreference = 'Stop'
$previousMobilePath = $env:PATH
Push-Location $PSScriptRoot
try {
  $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'Node.js 24+ is required. Open this project in Codex with its Node runtime, or install Node from https://nodejs.org/.' }
    $nodePath = $nodeCommand.Source
  }
  $nodeVersion = & $nodePath --version
  $nodeMajor = $nodeVersion -replace '^v(\d+)\..*$', '$1'
  if ([int]$nodeMajor -lt 24) { throw 'Node.js 24+ is required for this project.' }
  # Only this launch process receives Node in PATH for dependency lifecycle scripts.
  $env:PATH = (Split-Path $nodePath -Parent) + ';' + $env:PATH
  $expo = Join-Path $PSScriptRoot 'node_modules\expo\bin\cli'
  if (-not (Test-Path -LiteralPath $expo)) {
    & $nodePath (Join-Path $PSScriptRoot 'scripts\bootstrap.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'The isolated npm bootstrap did not finish.' }
    $toolchain = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'toolchain-lock.json') -Raw | ConvertFrom-Json
    $npmCli = Join-Path $env:USERPROFILE ('.cache\morrowfolio-mobile\npm-' + $toolchain.npm.version + '\package\bin\npm-cli.js')
    & $nodePath $npmCli ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'The locked mobile dependencies did not install.' }
  }
  $identity = & $nodePath $expo whoami 2>&1
  $loggedIn = $LASTEXITCODE -eq 0 -and ($identity -join '') -notmatch 'Not logged in'
  if (-not $loggedIn) {
    Write-Host 'No Expo session. Opening the official browser login; enter credentials only on the Expo website.'
    & $nodePath $expo login --browser
    if ($LASTEXITCODE -ne 0) { throw 'Expo browser login was not completed.' }
  }
  Write-Host 'Expo login is present. Sign into the SAME account inside Expo Go on the iPhone or iPad.'
  Write-Host 'This starts the JS development server only. Mobile API access still needs the separately configured private HTTPS gateway.'
  $env:EXPO_PUBLIC_PREVIEW = '0'
  $env:EXPO_PUBLIC_ALLOW_LOCAL_HTTP = '0'
  if ($PrivatePackagerHost) {
    $address = $null
    if (-not [Net.IPAddress]::TryParse($PrivatePackagerHost, [ref]$address)) { throw 'PrivatePackagerHost must be an explicit private IPv4 address.' }
    $bytes = $address.GetAddressBytes()
    $private = $bytes.Length -eq 4 -and (($bytes[0] -eq 10) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127))
    if (-not $private) { throw 'Only an explicit LAN or Tailscale address is allowed for the development packager.' }
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $PrivatePackagerHost
  }
  if ($PrivatePackagerHost) { & $nodePath $expo start --go --lan --port $Port }
  else {
    Write-Host 'No private packager address supplied: localhost-only bundle validation. This QR is not reachable from a physical iPhone.'
    & $nodePath $expo start --go --localhost --port $Port
  }
} finally { $env:PATH = $previousMobilePath; Pop-Location }
