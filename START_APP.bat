@echo off
cd /d "%~dp0"
REM Use Node from default install path if present (helps when PATH not updated yet)
if exist "C:\Program Files\nodejs\npm.cmd" set "PATH=C:\Program Files\nodejs;%PATH%"
echo.
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo.
    echo ERROR: npm not found. Install Node.js from https://nodejs.org/ then try again.
    pause
    exit /b 1
)
echo.
echo Starting dev server (keep that window open)...
start "Dev Server" cmd /k "npm run dev"
echo Waiting for server to start...
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo Browser should open. If you see "connection refused", wait a few seconds and refresh.
echo App URL:  http://localhost:5173
pause
