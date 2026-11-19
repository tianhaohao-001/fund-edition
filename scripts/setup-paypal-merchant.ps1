param([Parameter(Mandatory=$true)][ValidateSet('sandbox','live')][string]$Mode)
$ErrorActionPreference='Stop'
$cli=Join-Path $env:LOCALAPPDATA 'FundroomTools\Railway\v5.75.0\railway.exe'
if (!(Test-Path -LiteralPath $cli)) { $cli=(Get-Command railway -ErrorAction Stop).Source }
$node=(Get-Command node -ErrorAction Stop).Source
Write-Host "PayPal $Mode | Fund Edition | Railway production. This prepares plans, a webhook, and private variables without deploying."
$appId=Read-Host 'PayPal Client ID (hidden)' -AsSecureString
$appSecret=Read-Host 'PayPal Client Secret (hidden)' -AsSecureString
$processInfo=New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName=$node
$processInfo.Arguments='"'+(Join-Path $PSScriptRoot 'setup-paypal-merchant.mjs')+'"'
$processInfo.UseShellExecute=$false
$processInfo.EnvironmentVariables['FUNDROOM_PAYPAL_MODE']=$Mode
$processInfo.EnvironmentVariables['FUNDROOM_RAILWAY_CLI']=$cli
try {
  foreach($entry in @(@('PAYPAL_CLIENT_ID',$appId),@('PAYPAL_CLIENT_SECRET',$appSecret))){
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($entry[1])
    try { $processInfo.EnvironmentVariables[$entry[0]]=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  }
  $child=[Diagnostics.Process]::Start($processInfo)
  $child.WaitForExit()
  if($child.ExitCode -ne 0){throw 'PayPal merchant preparation did not finish. See the status above.'}
} finally {
  $processInfo.EnvironmentVariables.Remove('PAYPAL_CLIENT_ID')
  $processInfo.EnvironmentVariables.Remove('PAYPAL_CLIENT_SECRET')
  $appId.Dispose();$appSecret.Dispose()
}
