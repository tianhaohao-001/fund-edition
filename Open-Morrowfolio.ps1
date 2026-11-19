[CmdletBinding()]
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$demoHost = 'codex-home'
$demoPort = 3365
$demoUrl = "http://127.0.0.1:$demoPort/"

function Test-Demo {
    try {
        $health = Invoke-RestMethod -UseBasicParsing -Uri "${demoUrl}api/health" -TimeoutSec 2
        return ($health.ok -eq $true -and $health.contractVersion -eq 'fundroom.decision.v1' -and $health.capabilities.concierge -eq 1)
    } catch { return $false }
}

try {
    if (-not (Test-Demo)) {
        $occupied = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
            Where-Object { $_.Port -eq $demoPort }
        if ($occupied) {
            throw "Port $demoPort is already in use and Morrowfolio did not respond. Check your existing SSH window or desktop server, then retry."
        }

        if ($env:COMPUTERNAME -ieq 'desktop-dhgo2co') {
            $program = (Get-Process -Id $PID).Path
            if ($PSVersionTable.PSEdition -eq 'Desktop') {
                $codexPwsh = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
                if (Test-Path -LiteralPath $codexPwsh -PathType Leaf) { $program = $codexPwsh }
            }
            $entry = Join-Path $PSScriptRoot 'dev.ps1'
            $runDir = Join-Path $PSScriptRoot '.fundroom'
            [IO.Directory]::CreateDirectory($runDir) | Out-Null
            $log = Join-Path $runDir 'latest-review.stderr.log'
            $server = Start-Process -FilePath $program -ArgumentList ('-NoProfile -File "' + $entry + '" -LatestReview') `
                -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput (Join-Path $runDir 'latest-review.stdout.log') -RedirectStandardError $log
            $deadline = [DateTime]::UtcNow.AddSeconds(20)
            do {
                Start-Sleep -Milliseconds 400
                $ready = Test-Demo
            } until ($ready -or $server.HasExited -or [DateTime]::UtcNow -ge $deadline)
            if (-not $ready) { throw "Morrowfolio did not start. See $log, or run dev.ps1 -LatestReview in PowerShell." }
        } else {
            $ssh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
            $sshArgs = @('-nNT', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                '-o', 'ConnectTimeout=6', '-o', 'ExitOnForwardFailure=yes',
                '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
                '-L', "127.0.0.1:${demoPort}:127.0.0.1:${demoPort}", $demoHost)
            $tunnel = Start-Process -FilePath $ssh -ArgumentList $sshArgs -WindowStyle Hidden -PassThru
            $deadline = [DateTime]::UtcNow.AddSeconds(15)
            do {
                Start-Sleep -Milliseconds 350
                $ready = Test-Demo
            } until ($ready -or $tunnel.HasExited -or [DateTime]::UtcNow -ge $deadline)
            if (-not $ready) {
                if (-not $tunnel.HasExited) { $tunnel.Kill() }
                throw "Cannot reach Morrowfolio. Check Tailscale, SSH access to $demoHost, and the desktop server on port $demoPort."
            }
        }
    }
    Write-Output "Morrowfolio is ready: $demoUrl"
    if (-not $NoBrowser) { Start-Process $demoUrl }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
