$ErrorActionPreference = 'Stop'

$launcherTitle = 'Data Workbench Console'
$baseDir = $PSScriptRoot

function Show-Message {
    param(
        [string]$Message,
        [int]$Icon = 64,
        [int]$Seconds = 0
    )

    $shell = New-Object -ComObject WScript.Shell
    $null = $shell.Popup($Message, $Seconds, $launcherTitle, $Icon)
}

function Fail-Launch {
    param(
        [string]$Message,
        [string]$LogPath
    )

    if ($LogPath) {
        Add-Content -LiteralPath $LogPath -Value ""
        Add-Content -LiteralPath $LogPath -Value "ERROR: $Message"
        $Message = "$Message`n`nDetails were written to:`n$LogPath"
    }

    Show-Message -Message $Message -Icon 16
    exit 1
}

function Test-AppHealth {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (Test-Path -LiteralPath (Join-Path $baseDir 'package.json')) {
    $projectDir = $baseDir
} elseif (Test-Path -LiteralPath (Join-Path $baseDir 'data-workbench-console\package.json')) {
    $projectDir = Join-Path $baseDir 'data-workbench-console'
} else {
    Fail-Launch -Message "Could not find the app folder. Put this launcher either inside the app folder or on the Desktop next to the data-workbench-console folder."
}

$launchLog = Join-Path $projectDir 'data-workbench-launcher.log'
$serverLog = Join-Path $projectDir 'data-workbench-server.log'

Set-Content -LiteralPath $launchLog -Value "Starting Data Workbench Console at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

if (Test-AppHealth) {
    Start-Process 'http://localhost:3000'
    exit 0
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
    Fail-Launch -Message 'Node.js/npm was not found in PATH. Install Node.js and try again.' -LogPath $launchLog
}

try {
    Push-Location $projectDir

    if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules'))) {
        Add-Content -LiteralPath $launchLog -Value 'Installing dependencies...'
        & $npm.Source install *>> $launchLog
        if ($LASTEXITCODE -ne 0) {
            Fail-Launch -Message 'Dependency installation failed.' -LogPath $launchLog
        }
    }

    Add-Content -LiteralPath $launchLog -Value 'Building production version...'
    & $npm.Source run build *>> $launchLog
    if ($LASTEXITCODE -ne 0) {
        Fail-Launch -Message 'Production build failed.' -LogPath $launchLog
    }

    Add-Content -LiteralPath $launchLog -Value 'Starting hidden production server...'
    Start-Process -WindowStyle Hidden -WorkingDirectory $projectDir -FilePath 'cmd.exe' -ArgumentList "/c npm run start > `"$serverLog`" 2>&1"

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-AppHealth) {
            Start-Process 'http://localhost:3000'
            exit 0
        }
    }

    Fail-Launch -Message 'The server was started, but it did not respond on http://localhost:3000 within 30 seconds.' -LogPath $serverLog
} catch {
    Fail-Launch -Message $_.Exception.Message -LogPath $launchLog
} finally {
    Pop-Location -ErrorAction SilentlyContinue
}
