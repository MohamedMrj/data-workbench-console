$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$launcherTitle = 'Data Workbench Console'
$baseDir = $PSScriptRoot

function Test-AppHealth {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/' -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Test-BuildCurrent {
    $buildIdPath = Join-Path $projectDir '.next\BUILD_ID'
    if (-not (Test-Path -LiteralPath $buildIdPath)) {
        return $false
    }

    $buildTime = (Get-Item -LiteralPath $buildIdPath).LastWriteTimeUtc
    $sourceRoots = @(
        (Join-Path $projectDir 'app'),
        (Join-Path $projectDir 'lib'),
        (Join-Path $projectDir 'public'),
        (Join-Path $projectDir 'scripts')
    )
    $sourceFiles = @(
        (Join-Path $projectDir 'package.json'),
        (Join-Path $projectDir 'package-lock.json'),
        (Join-Path $projectDir 'next.config.mjs')
    )

    foreach ($sourceFile in $sourceFiles) {
        if ((Test-Path -LiteralPath $sourceFile) -and ((Get-Item -LiteralPath $sourceFile).LastWriteTimeUtc -gt $buildTime)) {
            return $false
        }
    }

    foreach ($sourceRoot in $sourceRoots) {
        if (-not (Test-Path -LiteralPath $sourceRoot)) {
            continue
        }

        $newerFile = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTimeUtc -gt $buildTime } |
            Select-Object -First 1

        if ($newerFile) {
            return $false
        }
    }

    return $true
}

function Stop-ProjectServer {
    $connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
        if (-not $process) {
            continue
        }

        $commandLine = [string]$process.CommandLine
        if ($commandLine -like "*$projectDir*" -and $commandLine -like '*next*' -and $commandLine -like '*start*') {
            Add-Content -LiteralPath $launchLog -Value "Stopping stale server process $($connection.OwningProcess)."
            Stop-Process -Id $connection.OwningProcess -Force
        }
    }

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 250
        if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
            return
        }
    }
}

function Resolve-ProjectDirectory {
    if (Test-Path -LiteralPath (Join-Path $baseDir 'package.json')) {
        return $baseDir
    }
    if (Test-Path -LiteralPath (Join-Path $baseDir 'data-workbench-console\package.json')) {
        return Join-Path $baseDir 'data-workbench-console'
    }

    [System.Windows.Forms.MessageBox]::Show(
        'Could not find the app folder. Put this launcher either inside the app folder or on the Desktop next to the data-workbench-console folder.',
        $launcherTitle,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

$projectDir = Resolve-ProjectDirectory
$logDir = Join-Path $projectDir '.data\logs'
$launchLog = Join-Path $logDir 'data-workbench-launcher.log'
$serverLog = Join-Path $logDir 'data-workbench-server.log'
$iconPath = Join-Path $projectDir 'Data Workbench Console.ico'

function New-LauncherForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = $launcherTitle
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ClientSize = New-Object System.Drawing.Size(460, 190)
    $form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

    if (Test-Path -LiteralPath $iconPath) {
        $form.Icon = New-Object System.Drawing.Icon($iconPath)
    }

    $title = New-Object System.Windows.Forms.Label
    $title.Text = $launcherTitle
    $title.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 14)
    $title.ForeColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
    $title.AutoSize = $true
    $title.Location = New-Object System.Drawing.Point(24, 22)
    $form.Controls.Add($title)

    $subtitle = New-Object System.Windows.Forms.Label
    $subtitle.Text = 'Starting the local production server'
    $subtitle.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
    $subtitle.AutoSize = $true
    $subtitle.Location = New-Object System.Drawing.Point(26, 55)
    $form.Controls.Add($subtitle)

    $status = New-Object System.Windows.Forms.Label
    $status.Text = 'Preparing...'
    $status.ForeColor = [System.Drawing.Color]::FromArgb(30, 41, 59)
    $status.AutoSize = $false
    $status.Size = New-Object System.Drawing.Size(320, 24)
    $status.Location = New-Object System.Drawing.Point(26, 92)
    $form.Controls.Add($status)

    $percent = New-Object System.Windows.Forms.Label
    $percent.Text = '0%'
    $percent.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)
    $percent.ForeColor = [System.Drawing.Color]::FromArgb(14, 116, 144)
    $percent.TextAlign = 'MiddleRight'
    $percent.Size = New-Object System.Drawing.Size(70, 24)
    $percent.Location = New-Object System.Drawing.Point(360, 92)
    $form.Controls.Add($percent)

    $progress = New-Object System.Windows.Forms.ProgressBar
    $progress.Minimum = 0
    $progress.Maximum = 100
    $progress.Value = 0
    $progress.Style = 'Continuous'
    $progress.Size = New-Object System.Drawing.Size(404, 18)
    $progress.Location = New-Object System.Drawing.Point(28, 124)
    $form.Controls.Add($progress)

    $detail = New-Object System.Windows.Forms.Label
    $detail.Text = 'This window closes when the app is ready.'
    $detail.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
    $detail.AutoSize = $false
    $detail.Size = New-Object System.Drawing.Size(404, 22)
    $detail.Location = New-Object System.Drawing.Point(28, 154)
    $form.Controls.Add($detail)

    return @{
        Form = $form
        Status = $status
        Percent = $percent
        Progress = $progress
        Detail = $detail
    }
}

$ui = New-LauncherForm
$ui.Form.Show()
$ui.Form.Activate()

function Update-Progress {
    param(
        [string]$Status,
        [int]$Value,
        [string]$Detail
    )

    $safeValue = [Math]::Max(0, [Math]::Min(100, $Value))
    $ui.Status.Text = $Status
    $ui.Percent.Text = "$safeValue%"
    $ui.Progress.Value = $safeValue
    if ($Detail) {
        $ui.Detail.Text = $Detail
    }
    [System.Windows.Forms.Application]::DoEvents()
}

function Fail-Launch {
    param(
        [string]$Message,
        [string]$LogPath
    )

    if ($LogPath) {
        Add-Content -LiteralPath $LogPath -Value ''
        Add-Content -LiteralPath $LogPath -Value "ERROR: $Message"
        $Message = "$Message`n`nDetails were written to:`n$LogPath"
    }

    Update-Progress -Status 'Startup failed' -Value 100 -Detail 'See the error message for details.'
    [System.Windows.Forms.MessageBox]::Show(
        $Message,
        $launcherTitle,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
}

function Get-NpmCommand {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
    }
    if (-not $npm) {
        Fail-Launch -Message 'Node.js/npm was not found in PATH. Install Node.js and try again.' -LogPath $launchLog
    }
    return $npm.Source
}

function Invoke-LoggedCommand {
    param(
        [string]$FilePath,
        [string]$Arguments,
        [string]$Status,
        [int]$StartPercent,
        [int]$EndPercent,
        [string]$FailureMessage
    )

    Add-Content -LiteralPath $launchLog -Value $Status
    Update-Progress -Status $Status -Value $StartPercent -Detail 'Working...'

    $command = "`"`"$FilePath`" $Arguments >> `"$launchLog`" 2>&1`""
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList "/d /s /c $command" -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru
    $current = $StartPercent
    $limit = [Math]::Max($StartPercent, $EndPercent - 2)

    while (-not $process.HasExited) {
        if ($current -lt $limit) {
            $current++
        }
        Update-Progress -Status $Status -Value $current -Detail 'Working...'
        Start-Sleep -Milliseconds 450
    }

    if ($process.ExitCode -ne 0) {
        Fail-Launch -Message $FailureMessage -LogPath $launchLog
    }

    Update-Progress -Status $Status -Value $EndPercent -Detail 'Done.'
}

try {
    if (-not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }

    Set-Content -LiteralPath $launchLog -Value "Starting Data Workbench Console at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

    $buildCurrent = Test-BuildCurrent
    Update-Progress -Status 'Checking existing server' -Value 5 -Detail 'Looking for an already running app.'
    if ((Test-AppHealth) -and $buildCurrent) {
        Update-Progress -Status 'App is already running' -Value 100 -Detail 'Opening browser.'
        Start-Process 'http://localhost:3000'
        Start-Sleep -Milliseconds 500
        exit 0
    }

    if (-not $buildCurrent) {
        Add-Content -LiteralPath $launchLog -Value 'Production build is missing or older than source files.'
        Update-Progress -Status 'Refreshing local build' -Value 8 -Detail 'Stopping stale server if needed.'
        Stop-ProjectServer
    }

    $npm = Get-NpmCommand

    Push-Location $projectDir

    if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules'))) {
        Invoke-LoggedCommand -FilePath $npm -Arguments 'install' -Status 'Installing dependencies' -StartPercent 10 -EndPercent 35 -FailureMessage 'Dependency installation failed.'
    } else {
        Update-Progress -Status 'Dependencies found' -Value 35 -Detail 'Skipping npm install.'
    }

    Invoke-LoggedCommand -FilePath $npm -Arguments 'run build' -Status 'Building production version' -StartPercent 40 -EndPercent 75 -FailureMessage 'Production build failed.'

    Update-Progress -Status 'Starting production server' -Value 82 -Detail 'Launching hidden Node.js process.'
    Add-Content -LiteralPath $launchLog -Value 'Starting hidden production server...'
    $serverCommand = "`"`"$npm`" run start > `"$serverLog`" 2>&1`""
    Start-Process -WindowStyle Hidden -WorkingDirectory $projectDir -FilePath 'cmd.exe' -ArgumentList "/d /s /c $serverCommand"

    for ($i = 0; $i -lt 60; $i++) {
        $percent = 83 + [Math]::Min(16, [Math]::Floor($i / 4))
        Update-Progress -Status 'Waiting for server' -Value $percent -Detail 'Checking http://localhost:3000'
        Start-Sleep -Seconds 1
        if (Test-AppHealth) {
            Update-Progress -Status 'Ready' -Value 100 -Detail 'Opening browser.'
            Start-Process 'http://localhost:3000'
            Start-Sleep -Milliseconds 500
            exit 0
        }
    }

    Fail-Launch -Message 'The server was started, but it did not respond on http://localhost:3000 within 60 seconds.' -LogPath $serverLog
} catch {
    Fail-Launch -Message $_.Exception.Message -LogPath $launchLog
} finally {
    Pop-Location -ErrorAction SilentlyContinue
    if ($ui -and $ui.Form) {
        $ui.Form.Close()
        $ui.Form.Dispose()
    }
}
