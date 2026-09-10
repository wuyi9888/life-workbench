@echo off
rem ============================================
rem  Life Workbench - local launcher
rem  Double-click this file to open the workbench
rem ============================================
set "PY_DIR=C:\Users\22727\.workbuddy\binaries\python\versions"
set "PY_EXE="
for /f "delims=" %%i in ('dir /b /ad /o-n "%PY_DIR%" 2^>nul') do (
  if not defined PY_EXE if exist "%PY_DIR%\%%i\python.exe" set "PY_EXE=%PY_DIR%\%%i\python.exe"
)
if not defined PY_EXE set "PY_EXE=python"
cd /d "%~dp0"
start "workbench-server" /min "%PY_EXE%" -m http.server 8765 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/index.html"
exit
