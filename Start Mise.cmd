@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Restore the Python environment using the setup instructions in README.md.
  pause
  exit /b 1
)
if not exist "frontend\dist\index.html" (
  echo Build the frontend using the setup instructions in README.md.
  pause
  exit /b 1
)
set "TEMP=%CD%\runtime\tmp"
set "TMP=%TEMP%"
set "NUMBA_CACHE_DIR=%CD%\runtime\cache\numba"
".venv\Scripts\python.exe" launch.py
if errorlevel 1 pause

