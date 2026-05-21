@echo off
echo Starting Data Workbench Console...

:: Check if Node is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in your system PATH. Please ask your colleague to install Node.js first.
    pause
    exit /b
)

:: Navigate to the app directory
cd /d "%~dp0data-workbench-console-source-patched-responsive-v2\data-workbench-console"
if %errorlevel% neq 0 (
    echo Error: Could not find the app folder. Make sure the 'data-workbench-console-source-patched-responsive-v2' folder is exactly on your Desktop next to this bat file.
    pause
    exit /b
)

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo Installing dependencies for the first time... This may take a minute.
    call npm install
)

start cmd /k "npm run dev"
echo Waiting for server to start...
timeout /t 8 /nobreak > nul
start http://localhost:3000
exit
