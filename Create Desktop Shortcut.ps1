$ErrorActionPreference = 'Stop'

$projectDir = $PSScriptRoot
$launcherPath = Join-Path $projectDir 'Start Data Workbench.vbs'
$iconPath = Join-Path $projectDir 'Data Workbench Console.ico'
$desktopDir = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopDir 'Data Workbench Console.lnk'

if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "Could not find launcher: $launcherPath"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = 'Start Data Workbench Console'

if (Test-Path -LiteralPath $iconPath) {
    $shortcut.IconLocation = "$iconPath,0"
}

$shortcut.Save()

Write-Host "Created Desktop shortcut:"
Write-Host $shortcutPath
