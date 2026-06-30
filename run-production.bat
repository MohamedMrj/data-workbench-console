@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js and try again.
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
)

if not exist ".next\BUILD_ID" (
  echo Building production bundle...
  call npm run build
  if errorlevel 1 exit /b %errorlevel%
) else (
  echo Existing build found. Skipping build step.
  echo Run "npm run build" manually to rebuild.
)

echo Starting production server on http://127.0.0.1:3000
call npm run start
