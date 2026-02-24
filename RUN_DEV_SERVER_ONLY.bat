@echo off
cd /d "%~dp0"

REM Find Node.js
set "NODEEXE="
if exist "C:\Program Files\nodejs\node.exe" set "NODEEXE=C:\Program Files\nodejs\node.exe"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODEEXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODEEXE=C:\Program Files (x86)\nodejs\node.exe"

if "%NODEEXE%"=="" (
    echo Node.js not found. Install from https://nodejs.org/
    pause
    exit /b 1
)

echo Starting dev server in THIS window - you will see any errors here.
echo Open browser to: http://localhost:5173
echo Press Ctrl+C to stop.
echo.
"%NODEEXE%" node_modules\vite\bin\vite.js
pause
