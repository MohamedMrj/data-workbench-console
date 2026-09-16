param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectDir,

    [int]$Port = 3000,

    [int]$OldPid = 0
)

$ErrorActionPreference = 'Stop'

$logDir = Join-Path $ProjectDir '.data\logs'
$updateLog = Join-Path $logDir 'data-workbench-update.log'
$serverLog = Join-Path $logDir 'data-workbench-server.log'
$statusPath = Join-Path $ProjectDir '.data\update-status.json'
$commitBefore = ''

function Write-UpdateLog {
    param([string]$Message)
    Add-Content -LiteralPath $updateLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

# The API resets this file to 'pending' before launching this script. Every exit path
# (success, or a caught failure that falls back to restarting the old server) must
# overwrite it, otherwise a silently-failed update leaves the server running again
# with no visible error and the client has no way to tell it apart from a real success.
function Write-UpdateStatus {
    param(
        [string]$Outcome,
        [string]$ErrorMessage = ''
    )
    $commitAfter = ''
    try { $commitAfter = (git rev-parse HEAD 2>$null) } catch {}
    $status = [ordered]@{
        outcome      = $Outcome
        error        = $ErrorMessage
        commitBefore = $commitBefore
        commitAfter  = $commitAfter
        finishedAt   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    try {
        ($status | ConvertTo-Json) | Set-Content -LiteralPath $statusPath -Encoding utf8
    } catch {
        Write-UpdateLog "Could not write update status file: $($_.Exception.Message)"
    }
}

function Get-FileHashOrEmpty {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return ''
    }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Find-NpmCommand {
    $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $command = Get-Command npm -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    throw 'npm was not found in PATH.'
}

function Invoke-LoggedCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    Write-UpdateLog "> $FilePath $($Arguments -join ' ')"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $ProjectDir -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$updateLog.stdout.tmp" -RedirectStandardError "$updateLog.stderr.tmp"

    if (Test-Path -LiteralPath "$updateLog.stdout.tmp") {
        Get-Content -LiteralPath "$updateLog.stdout.tmp" | Add-Content -LiteralPath $updateLog
        Remove-Item -LiteralPath "$updateLog.stdout.tmp" -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath "$updateLog.stderr.tmp") {
        Get-Content -LiteralPath "$updateLog.stderr.tmp" | Add-Content -LiteralPath $updateLog
        Remove-Item -LiteralPath "$updateLog.stderr.tmp" -Force -ErrorAction SilentlyContinue
    }

    if ($process.ExitCode -ne 0) {
        throw "Command failed with exit code $($process.ExitCode): $FilePath $($Arguments -join ' ')"
    }
}

function Stop-WorkbenchServer {
    if ($OldPid -gt 0) {
        $process = Get-Process -Id $OldPid -ErrorAction SilentlyContinue
        if ($process) {
            Write-UpdateLog "Stopping current server process $OldPid."
            Stop-Process -Id $OldPid -Force -ErrorAction SilentlyContinue
        }
    }

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $process) {
            continue
        }

        $commandLine = [string]$process.CommandLine
        if ($commandLine -like "*$ProjectDir*" -and $commandLine -like '*next*' -and $commandLine -like '*start*') {
            Write-UpdateLog "Stopping stale server process $($connection.OwningProcess)."
            Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

function Start-WorkbenchServer {
    $npm = Find-NpmCommand
    Write-UpdateLog 'Starting updated production server.'
    $serverCommand = "`"`"$npm`" run start > `"$serverLog`" 2>&1`""
    Start-Process -WindowStyle Hidden -WorkingDirectory $ProjectDir -FilePath 'cmd.exe' -ArgumentList "/d /s /c $serverCommand"
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Set-Content -LiteralPath $updateLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting Data Workbench self-update."

try {
    Set-Location -LiteralPath $ProjectDir

    if (-not (Test-Path -LiteralPath (Join-Path $ProjectDir '.git'))) {
        throw 'This folder is not a Git checkout. Self-update requires a cloned repository.'
    }

    $commitBefore = (git rev-parse HEAD 2>$null)

    $npm = Find-NpmCommand
    $lockPath = Join-Path $ProjectDir 'package-lock.json'
    $lockBefore = Get-FileHashOrEmpty -Path $lockPath

    Start-Sleep -Seconds 2
    Stop-WorkbenchServer
    Start-Sleep -Seconds 1

    Invoke-LoggedCommand -FilePath 'git' -Arguments @('fetch', 'origin', 'main')
    # Sync the working tree to the fetched remote tip instead of `pull --ff-only`.
    # A fast-forward pull aborts whenever the local checkout has drifted at all
    # (line-ending churn on Windows, a stray edit, an unexpected local commit),
    # and the catch block below would then silently relaunch the OLD build while
    # the update button stayed up. End-user installs are meant to mirror origin
    # exactly, so hard-reset to the fetched commit. Untracked files such as
    # .env and the .data directory are not touched by reset --hard.
    Invoke-LoggedCommand -FilePath 'git' -Arguments @('reset', '--hard', 'origin/main')

    $lockAfter = Get-FileHashOrEmpty -Path $lockPath
    $needsInstall = (-not (Test-Path -LiteralPath (Join-Path $ProjectDir 'node_modules'))) -or ($lockBefore -ne $lockAfter)
    if ($needsInstall) {
        Invoke-LoggedCommand -FilePath $npm -Arguments @('install')
    } else {
        Write-UpdateLog 'Dependencies are current; skipping npm install.'
    }

    Invoke-LoggedCommand -FilePath $npm -Arguments @('run', 'build')
    Write-UpdateStatus -Outcome 'success'
    Start-WorkbenchServer
    Write-UpdateLog 'Data Workbench self-update completed.'
} catch {
    Write-UpdateLog "Update failed: $($_.Exception.Message)"
    Write-UpdateStatus -Outcome 'failed' -ErrorMessage $_.Exception.Message
    try {
        Start-WorkbenchServer
    } catch {
        Write-UpdateLog "Could not restart server after failed update: $($_.Exception.Message)"
    }
}
