#!/bin/sh
# PC-side ship script: build the dashboard standalone bundle and deliver it
# to the phone over the SSH workflow (memory: adb forward + Termux sshd).
# Usage (git-bash / WSL / Linux):
#   sh deploy/termux/ship-web.sh
# Prerequisites: phone USB-connected, Termux sshd running (see memory for the
# adb forward + ssh pattern). Env knobs: PHONE_SSH_KEY, PHONE_SSH_PORT.
set -e

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
KEY="${PHONE_SSH_KEY:-$HOME/.ssh/eternyx_phone}"
PORT="${PHONE_SSH_PORT:-8022}"
WEB_DIR="$HOME/eternyx-web"
STAGE="$(mktemp -d)"

echo "[1/4] Building standalone bundle…"
cd "$REPO_DIR/dashboard"
npm ci
npm run build

echo "[2/4] Staging bundle (standalone server + static assets)…"
mkdir -p "$STAGE/web"
cp -r .next/standalone/. "$STAGE/web/"
mkdir -p "$STAGE/web/.next"
cp -r .next/static "$STAGE/web/.next/static"
cp -r public "$STAGE/web/public" 2>/dev/null || true
cp ../dashboard/.env.web.example "$STAGE/web/"
cp ../deploy/termux/setup-web.sh "$STAGE/"

echo "[3/4] Shipping to phone…"
tar -czf "$STAGE/web.tgz" -C "$STAGE/web" .
scp -i "$KEY" -P "$PORT" "$STAGE/web.tgz" "$STAGE/setup-web.sh" localhost:~/

echo "[4/4] Installing on phone…"
ssh -i "$KEY" -p "$PORT" localhost "
  set -e
  mkdir -p $WEB_DIR
  tar -xzf ~/web.tgz -C $WEB_DIR
  cp -n $WEB_DIR/.env.web.example $WEB_DIR/.env.web 2>/dev/null || true
  rm -f ~/web.tgz
  echo '--- bundle in place; now run: sh ~/eternyx-bot/deploy/termux/setup-web.sh ---'
"
rm -rf "$STAGE"
echo "Done."
