#!/usr/bin/env bash
# =============================================================================
#  DCC-MGARCH terminal - start everything (macOS / Linux)
#
#    ./start.sh
#
#  Starts two processes:
#    1. the Python model runner  - http://127.0.0.1:8787
#    2. the Next.js frontend     - http://localhost:3000
#
#  The desk computes on your CPU. Every risk number you see was fitted locally;
#  the timing shown is real wall-clock time, not a canned animation.
#
#  Ctrl-C stops both.
#
#  Windows: use start.bat instead.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT/app"
DEV_PORT=3000
LIVE_PORT=8787

echo
echo "============================================================"
echo "  DCC-MGARCH terminal"
echo "============================================================"
echo

# --- [1/5] Python ------------------------------------------------------------
# Not on PATH is a normal state, not a broken machine: conda installs and
# non-activated pyenv shims are both common. PATH is looked at first, never
# alone. Each candidate is validated by RUNNING the version check — on macOS
# `python3` may be the Command Line Tools shim, which exists and may be too old.
echo "[1/5] Locating Python 3.10+..."

usable() {
  [ -n "$1" ] && command -v "$1" >/dev/null 2>&1 &&
    "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null
}

PY=""
for candidate in \
  "${PYTHON:-}" \
  python3 \
  python \
  "${CONDA_PYTHON_EXE:-}" \
  "$HOME/.pyenv/shims/python3" \
  /opt/homebrew/bin/python3 \
  /usr/local/bin/python3 \
  "$HOME/miniconda3/bin/python" \
  "$HOME/anaconda3/bin/python" \
  "$HOME/miniforge3/bin/python"
do
  if usable "$candidate"; then
    PY="$candidate"
    break
  fi
done

if [ -z "$PY" ]; then
  echo
  echo "  ERROR: no working Python 3.10+ found."
  echo
  echo "  Probed: \$PYTHON, PATH (python3, python), \$CONDA_PYTHON_EXE, the pyenv"
  echo "          shim, Homebrew, /usr/local, and conda/miniforge under \$HOME."
  echo
  echo "  If Python IS installed elsewhere, point at it directly:"
  echo
  echo "      PYTHON=/path/to/python ./start.sh"
  echo
  echo "  Otherwise install 3.10+ from https://www.python.org/downloads/"
  echo "  or your package manager."
  echo
  exit 1
fi
echo "  using: $PY"
echo "  $("$PY" --version)"

# --- [2/5] Node --------------------------------------------------------------
echo "[2/5] Checking Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  ERROR: Node.js not found on PATH."
  echo "  Install Node 18 or newer from https://nodejs.org/"
  echo
  exit 1
fi
echo "  node $(node --version)"

# --- [3/5] Python package ----------------------------------------------------
# Editable, so `python -m dccmgarch.serving.live_server` resolves and edits to
# src/ take effect without reinstalling. Idempotent.
echo "[3/5] Installing the model package (editable)..."
(cd "$ROOT" && "$PY" -m pip install -e . --quiet)
echo "  ok"

# --- [4/5] Frontend dependencies ---------------------------------------------
echo "[4/5] Installing frontend dependencies..."
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "  first run - this takes a minute"
fi
(cd "$APP_DIR" && npm install --no-audit --no-fund)
echo "  ok"

# --- [5/5] Launch ------------------------------------------------------------
echo "[5/5] Starting..."

export NEXT_PUBLIC_DATA_MODE=live
export NEXT_PUBLIC_LIVE_URL="http://127.0.0.1:$LIVE_PORT"

# One trap for both children: Ctrl-C in this terminal stops the whole desk
# rather than orphaning the runner on its port.
pids=()
cleanup() {
  echo
  echo "stopping..."
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "  model runner -> http://127.0.0.1:$LIVE_PORT"
(cd "$ROOT" && "$PY" -m dccmgarch.serving.live_server "$LIVE_PORT") &
pids+=($!)

echo "  frontend     -> http://localhost:$DEV_PORT"
(cd "$APP_DIR" && npm run dev) &
pids+=($!)

echo
echo "============================================================"
echo "  Wait for both to report ready, then open:"
echo "    http://localhost:$DEV_PORT/"
echo
echo "  The first risk figure takes ~10-30 seconds: that is one"
echo "  real GARCH-DCC fit over 30 assets, not a loading bar."
echo
echo "  Ctrl-C stops both."
echo "============================================================"
echo

wait
