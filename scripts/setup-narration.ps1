[CmdletBinding()]
param([string]$VoiceHome = (Join-Path $env:USERPROFILE '.cache\morrowfolio-voice'))

$ErrorActionPreference = 'Stop'
$modelRoot = Join-Path $VoiceHome 'models'
$packageName = 'kokoro-int8-multi-lang-v1_1.tar.bz2'
$archive = Join-Path $modelRoot $packageName
$digest = '259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c'
New-Item -ItemType Directory -Path $modelRoot -Force | Out-Null
& python -m pip install --only-binary=:all: --disable-pip-version-check --target (Join-Path $VoiceHome 'narration') 'sherpa-onnx==1.13.8' 'numpy==2.2.6'
if ($LASTEXITCODE) { throw 'Speech runtime installation failed.' }
if (!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive).Hash -ne $digest) {
    & curl.exe -fsSL --retry 2 --output $archive "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$packageName"
    if ($LASTEXITCODE) { throw 'Speech model download failed.' }
}
if ((Get-FileHash -LiteralPath $archive).Hash -ne $digest) { throw 'Speech model checksum mismatch.' }
& python -c "import sys,tarfile; a=tarfile.open(sys.argv[1]); a.extractall(sys.argv[2],filter='data')" $archive $modelRoot
if ($LASTEXITCODE) { throw 'Speech model extraction failed.' }
Write-Output 'Maya Chinese and English neural narration is ready.'
