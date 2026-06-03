@echo off
setlocal

cd /d "%~dp0"

where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: PowerShell was not found in PATH.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Create Desktop Shortcut.ps1"
if %errorlevel% neq 0 (
    echo Error: Could not create the Desktop shortcut.
    pause
    exit /b %errorlevel%
)

echo.
echo You can now start Data Workbench Console from your Desktop shortcut.
pause
