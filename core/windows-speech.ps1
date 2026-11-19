[CmdletBinding()]
param(
    [string]$InputPath,
    [string]$Language = 'zh-CN',
    [switch]$List
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
$recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
if ($List) {
    $languages = @($recognizers | ForEach-Object { $_.Culture.Name })
    @{ languages = $languages } | ConvertTo-Json -Compress
    exit 0
}

$selected = $recognizers | Where-Object { $_.Culture.Name -eq $Language } | Select-Object -First 1
if (-not $selected -or -not [IO.File]::Exists($InputPath)) {
    throw 'A matching local speech recognizer and a WAV recording are required.'
}
$engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($selected)
try {
    $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
    $engine.SetInputToWaveFile($InputPath)
    $segments = [System.Collections.Generic.List[string]]::new()
    $scores = [System.Collections.Generic.List[double]]::new()
    while ($true) {
        try { $result = $engine.Recognize() }
        catch {
            if ($segments.Count -gt 0 -and $engine.AudioState -eq [System.Speech.Recognition.AudioState]::Stopped) { break }
            throw
        }
        if ($null -eq $result) { break }
        if ($result.Text.Trim()) {
            $segments.Add($result.Text)
            $scores.Add([double]$result.Confidence)
        }
        if ($segments.Count -ge 30) { break }
    }
    $confidence = if ($scores.Count) { ($scores | Measure-Object -Average).Average } else { 0 }
    @{ text = ($segments -join ' '); confidence = $confidence; language = $Language; source = 'Windows on-device dictation' } | ConvertTo-Json -Compress
}
finally {
    $engine.Dispose()
}
