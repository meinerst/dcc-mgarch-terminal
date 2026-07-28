@echo off
REM ============================================================================
REM  DCC-MGARCH terminal - start everything (Windows)
REM
REM  Double-click this file, or run it from a terminal. It starts two processes
REM  in their own windows:
REM
REM    1. the Python model runner  - http://127.0.0.1:8787
REM    2. the Next.js frontend     - http://localhost:3000
REM
REM  The desk computes on your CPU. Every risk number you see was fitted locally;
REM  the timing shown is real wall-clock time, not a canned animation.
REM
REM  macOS / Linux: use ./start.sh instead.
REM ============================================================================
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "APP_DIR=%ROOT%\app"
set "DEV_PORT=3000"
set "LIVE_PORT=8787"

echo.
echo ============================================================
echo   DCC-MGARCH terminal
echo ============================================================
echo.

REM --- [1/5] Python ----------------------------------------------------------
REM Not on PATH is the NORMAL case, not a broken machine: Anaconda deliberately
REM does not add itself, and the python.org installer only does when the box is
REM ticked. So PATH is the first place looked, never the only one.
REM
REM Every candidate is validated by RUNNING the version check, not by finding a
REM file. That is what rejects the Microsoft Store alias stub, which exists on
REM PATH, answers `where python`, and is not an interpreter.
echo [1/5] Locating Python 3.10+...
set "PY="
if defined PYTHON call :probe "%PYTHON%"
if not defined PY call :probe python
REM The py launcher ships with every python.org install and works even when the
REM interpreter itself was kept off PATH.
if not defined PY call :probe py -3
if not defined PY call :probe python3
REM conda sets this in shells where it has not touched PATH at all.
if not defined PY if defined CONDA_PYTHON_EXE call :probe "%CONDA_PYTHON_EXE%"
if not defined PY call :probe_known_dirs
if not defined PY goto :no_python
echo   using: !PY!
!PY! --version

REM --- [2/5] Node ------------------------------------------------------------
echo [2/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo   ERROR: Node.js not found on PATH.
  echo   Install Node 18 or newer from https://nodejs.org/
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do echo   node %%v

REM --- [3/5] Python package --------------------------------------------------
REM Editable install, so `python -m dccmgarch.serving.live_server` resolves and
REM edits to src/ take effect without reinstalling. Idempotent.
echo [3/5] Installing the model package (editable)...
pushd "%ROOT%"
!PY! -m pip install -e . --quiet
if errorlevel 1 (
  echo   ERROR: pip install failed. Scroll up for the reason.
  popd
  pause
  exit /b 1
)
popd
echo   ok

REM --- [4/5] Frontend dependencies -------------------------------------------
echo [4/5] Installing frontend dependencies...
pushd "%APP_DIR%"
if not exist "node_modules" (
  echo   first run - this takes a minute
) else (
  echo   already present - checking they are current
)
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo   ERROR: npm install failed. Scroll up for the reason.
  popd
  pause
  exit /b 1
)
popd
echo   ok

REM --- [5/5] Launch ----------------------------------------------------------
REM Ports are freed first so a previous run that was closed by the window's X
REM (leaving the process alive) does not make this one fail confusingly.
echo [5/5] Starting...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%DEV_PORT%" ^| findstr "LISTENING"') do (
  echo   freeing port %DEV_PORT% ^(pid %%p^)
  taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%LIVE_PORT%" ^| findstr "LISTENING"') do (
  echo   freeing port %LIVE_PORT% ^(pid %%p^)
  taskkill /F /PID %%p >nul 2>&1
)

set "NEXT_PUBLIC_DATA_MODE=live"
set "NEXT_PUBLIC_LIVE_URL=http://127.0.0.1:%LIVE_PORT%"

REM `start /D` sets each child's working directory, and `cmd /S /K "<one string>"`
REM strips only the outer quotes and runs the rest verbatim — so an interpreter
REM path containing spaces survives into the child window. Building the command
REM with `cd /d %ROOT% &&` instead breaks on the first space in the path.
set "RUN_MODEL=!PY! -m dccmgarch.serving.live_server %LIVE_PORT%"

echo   model runner -^> http://127.0.0.1:%LIVE_PORT%
start "DCC-MGARCH model runner" /D "%ROOT%" cmd /s /k "!RUN_MODEL!"

echo   frontend     -^> http://localhost:%DEV_PORT%
start "DCC-MGARCH terminal" /D "%APP_DIR%" cmd /s /k "npm run dev"

echo.
echo ============================================================
echo   Two windows are starting. Wait for BOTH to report ready,
echo   then open:  http://localhost:%DEV_PORT%/
echo.
echo   The first risk figure takes ~10-30 seconds: that is one
echo   real GARCH-DCC fit over 30 assets, not a loading bar.
echo.
echo   Close both windows to stop.
echo ============================================================
echo.
pause
endlocal
exit /b 0


REM ============================================================================
REM  Python resolution
REM ============================================================================

REM Run a candidate invocation. %* is the whole thing, so a quoted path with
REM spaces and a two-token form like `py -3` are both passed through intact.
:probe
%* -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 set "PY=%*"
exit /b 0

REM Where the common installers put an interpreter that never reached PATH.
REM Newest version directory first, so a machine with several picks the latest.
:probe_known_dirs
for /f "delims=" %%d in ('dir /b /ad /o-n "%LOCALAPPDATA%\Programs\Python\Python3*" 2^>nul') do (
  if not defined PY call :probe "%LOCALAPPDATA%\Programs\Python\%%d\python.exe"
)
for /f "delims=" %%d in ('dir /b /ad /o-n "C:\Python3*" 2^>nul') do (
  if not defined PY call :probe "C:\%%d\python.exe"
)
for %%p in (
  "%USERPROFILE%\anaconda3\python.exe"
  "%USERPROFILE%\miniconda3\python.exe"
  "%USERPROFILE%\AppData\Local\anaconda3\python.exe"
  "%ProgramData%\anaconda3\python.exe"
  "%ProgramData%\miniconda3\python.exe"
  "%ProgramFiles%\Python312\python.exe"
  "%ProgramFiles%\Python311\python.exe"
) do (
  if not defined PY call :probe %%p
)
exit /b 0

:no_python
echo.
echo   ERROR: no working Python 3.10+ found.
echo.
echo   Probed: the PYTHON variable, PATH ^(python, py -3, python3^),
echo           CONDA_PYTHON_EXE, and the usual install directories
echo           ^(%%LOCALAPPDATA%%\Programs\Python, anaconda3, miniconda3^).
echo.
echo   If Python IS installed somewhere else, point at it directly:
echo.
echo       set PYTHON=C:\path\to\python.exe
echo       start.bat
echo.
echo   Otherwise install 3.10 or newer from https://www.python.org/downloads/
echo   and tick "Add python.exe to PATH" in the installer.
echo.
pause
exit /b 1
