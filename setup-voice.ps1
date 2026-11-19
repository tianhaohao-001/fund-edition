[CmdletBinding()]
param(
    [string]$VoiceHome = (Join-Path $env:USERPROFILE '.cache\morrowfolio-voice')
)

$ErrorActionPreference = 'Stop'
$python = Get-Command python -ErrorAction Stop
$runtime = Join-Path $VoiceHome 'python'
$models = Join-Path $VoiceHome 'models\small'
New-Item -ItemType Directory -Path $runtime, $models -Force | Out-Null
& $python.Source -m pip install --target $runtime --disable-pip-version-check 'faster-whisper==1.2.1'
if ($LASTEXITCODE -ne 0) { throw 'The local speech runtime could not be installed.' }
$env:MORROWFOLIO_VOICE_RUNTIME = $runtime
$env:MORROWFOLIO_VOICE_MODEL = $models
try {
    @'
import os
import sys
sys.path.insert(0, os.environ['MORROWFOLIO_VOICE_RUNTIME'])
from huggingface_hub import snapshot_download
snapshot_download('Systran/faster-whisper-small', local_dir=os.environ['MORROWFOLIO_VOICE_MODEL'], allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.*', 'preprocessor_config.json'])
print('Local multilingual Whisper small is ready. Recordings stay on this computer.')
'@ | & $python.Source -
    if ($LASTEXITCODE -ne 0) { throw 'The official Systran Whisper model download did not finish.' }
}
finally {
    Remove-Item Env:MORROWFOLIO_VOICE_RUNTIME, Env:MORROWFOLIO_VOICE_MODEL -ErrorAction SilentlyContinue
}
