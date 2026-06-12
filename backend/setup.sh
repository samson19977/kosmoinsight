#!/usr/bin/env bash
# setup.sh — create a virtual-env and install all KosmoInsight dependencies.
# Run once from inside the backend/ folder:
#
#   cd backend
#   bash setup.sh
#
# After this VS Code will detect the venv automatically if you reload the window.

set -e

VENV_DIR="venv"
PYTHON="${PYTHON:-python3}"

echo "==> Using Python: $($PYTHON --version)"

# ── 1. Create virtual environment ─────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating virtual environment in ./$VENV_DIR …"
  $PYTHON -m venv "$VENV_DIR"
else
  echo "==> Virtual environment already exists, skipping creation."
fi

# ── 2. Activate ───────────────────────────────────────────────────────────────
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
echo "==> Activated: $(which python)"

# ── 3. Upgrade pip ────────────────────────────────────────────────────────────
pip install --upgrade pip --quiet

# ── 4. Install dependencies ───────────────────────────────────────────────────
echo "==> Installing requirements …"
pip install -r requirements.txt

echo ""
echo "✅  Setup complete."
echo ""
echo "Next steps:"
echo "  1. In VS Code: Ctrl+Shift+P → 'Python: Select Interpreter' → choose ./venv/bin/python"
echo "  2. Reload VS Code window (Ctrl+Shift+P → 'Developer: Reload Window')"
echo "  3. All 'Import could not be resolved' errors will disappear."
echo ""
echo "To run the server:"
echo "  source venv/bin/activate"
echo "  uvicorn app.main:app --reload"
