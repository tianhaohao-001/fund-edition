[CmdletBinding()]
param([switch]$List, [ValidateSet('en-US','zh-CN')][string]$Language = 'en-US')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $voices = @($speaker.GetInstalledVoices() | Where-Object Enabled | ForEach-Object VoiceInfo)
    if ($List) {
        @{ languages = @($voices | ForEach-Object { $_.Culture.Name } | Select-Object -Unique) } | ConvertTo-Json -Compress
        return
    }
    $voice = $voices | Where-Object { $_.Culture.Name -eq $Language } | Select-Object -First 1
    if (!$voice) { throw 'Voice unavailable' }
    $reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
    $words = $reader.ReadToEnd()
    if (!$words.Trim() -or $words.Length -gt 2400) { throw 'Invalid reply length' }
    $speaker.SelectVoice($voice.Name)
    $stream = [IO.MemoryStream]::new()
    try {
        $speaker.SetOutputToWaveStream($stream)
        $speaker.Speak($words)
        $speaker.SetOutputToNull()
        $stream.Position = 0
        $stream.CopyTo([Console]::OpenStandardOutput())
    } finally { $stream.Dispose() }
} finally { $speaker.Dispose() }
