@echo off
setlocal
echo Starting Data Workbench Console...

:: Check if Node is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in your system PATH. Please ask your colleague to install Node.js first.
    pause
    exit /b
)

:: Navigate to the app directory
if exist "%~dp0package.json" (
    cd /d "%~dp0"
) else if exist "%~dp0data-workbench-console\package.json" (
    cd /d "%~dp0data-workbench-console"
) else (
    echo Error: Could not find the app folder. Make sure this file is either inside the app folder or on your Desktop next to the 'data-workbench-console' folder.
    pause
    exit /b
)

:: If the app is already running, just open it
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/api/health' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel% equ 0 (
    start http://localhost:3000
    exit
)

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo Installing dependencies for the first time... This may take a minute.
    call npm install
    if %errorlevel% neq 0 (
        echo Error: npm install failed.
        pause
        exit /b
    )
)

echo Building production version...
call npm run build
if %errorlevel% neq 0 (
    echo Error: Production build failed.
    pause
    exit /b
)

echo Starting production server in the background...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -WindowStyle Hidden -WorkingDirectory '%CD%' -FilePath 'cmd.exe' -ArgumentList '/c npm run start > data-workbench-server.log 2>&1'"
if %errorlevel% neq 0 (
    echo Error: Could not start the production server.
    pause
    exit /b
)

echo Waiting for server to start...
timeout /t 8 /nobreak > nul
start http://localhost:3000
exit
