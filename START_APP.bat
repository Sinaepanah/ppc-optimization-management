@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM Get project folder without trailing backslash (for child process)
for %%I in ("%~dp0.") do set "PROJDIR=%%~fI"

REM Find Node.js - try common install locations (no PATH needed)
set "NODEEXE="
if exist "C:\Program Files\nodejs\node.exe" set "NODEEXE=C:\Program Files\nodejs\node.exe"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODEEXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODEEXE=C:\Program Files (x86)\nodejs\node.exe"

if "%NODEEXE%"=="" (
    echo.
    echo   *** NODE.JS NOT FOUND ***
    echo.
    echo   This app needs Node.js. Install it once:
    echo   1. Open https://nodejs.org/
    echo   2. Download the LTS version and install it
    echo   3. Run this file again: START_APP.bat
    echo.
    start "" "https://nodejs.org/"
    start "" "%~dp0INSTALL_NODE_FIRST.html"
    pause
    exit /b 1
)

for %%I in ("%NODEEXE%") do set "NODEDIR=%%~dpI"
if "%NODEDIR:~-1%"=="\" set "NODEDIR=%NODEDIR:~0,-1%"
set "NPMCMD=%NODEDIR%\npm.cmd"

echo.
echo Found Node: %NODEEXE%
echo.
echo Installing frontend dependencies...
"%NPMCMD%" install
if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo Installing server dependencies...
cd server
"%NPMCMD%" install
cd ..
if errorlevel 1 (
    echo WARNING: Server deps failed. Frontend will still run.
)

echo.
echo ========================================
echo   DO NOT CLOSE THE "Dev Server" WINDOW
echo   Closing it will stop the app.
echo ========================================
echo.
echo Starting dev server...
start "Dev Server" cmd /k "cd /d ""%PROJDIR%"" && ""%NODEEXE%"" node_modules\vite\bin\vite.js"
echo.
echo Waiting for server to start...
timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo App should open in your browser.
echo If you see "connection refused", wait 15 seconds and click Reload.
echo.
echo URL: http://localhost:5173
echo.
pause
