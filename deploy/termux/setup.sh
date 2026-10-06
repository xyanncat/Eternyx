#!/data/data/com.termux/files/usr/bin/sh
# One-time Termux provisioning for the Eternyx bot (plan §9).
# Run inside Termux:  sh deploy/termux/setup.sh
set -e

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
echo "[1/6] Installing packages…"
pkg update -y
pkg install -y nodejs-lts git termux-services termux-api sqlite cronie

echo "[2/6] Installing dependencies (exact versions from the lockfile)…"
cd "$REPO_DIR"
npm ci --omit=dev || npm install --omit=dev
mkdir -p logs data backups

echo "[3/6] Creating the bot service (auto-restart via runit)…"
mkdir -p "$PREFIX/var/service/bot"
cat > "$PREFIX/var/service/bot/run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
cd "$REPO_DIR"
# Heap cap protects the 6GB phone: if the heap ever blows past 256MB the
# process dies and runit restarts it, instead of MIUI killing all of Termux.
# wake-lock is a separate statement: it must NOT be exec'd (it would replace
# this script and node would never start).
termux-wake-lock >/dev/null 2>&1 || true
exec node --max-old-space-size=256 src/index.js 2>> logs/err.log
EOF
chmod +x "$PREFIX/var/service/bot/run"

echo "[4/6] Installing the one-command starter + boot hook (Termux-only recovery)…"
# Canonical starter: a self-contained copy at ~/start-eternyx.sh so the boot
# path never depends on repo files (bot updates ship src/+assets/ only).
cp "$REPO_DIR/deploy/termux/start-local.sh" "$HOME/start-eternyx.sh"
chmod +x "$HOME/start-eternyx.sh"
# One-tap widget button (lights up if the Termux:Widget app is installed).
mkdir -p "$HOME/.shortcuts"
cp "$REPO_DIR/deploy/termux/start-local.sh" "$HOME/.shortcuts/eternyx-online.sh"
chmod +x "$HOME/.shortcuts/eternyx-online.sh"
# Boot hook stays tiny and delegates — the boot context is fragile
# (no profile, no SVDIR); all logic lives in start-eternyx.sh.
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/start-services.sh" <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
# Termux:Boot hook — delegates to the canonical bring-online script.
sh "$HOME/start-eternyx.sh" >>"$HOME/eternyx-boot.log" 2>&1
EOF
chmod +x "$HOME/.termux/boot/start-services.sh"

echo "[5/6] Nightly 03:15 case-database backup (7-day retention)…"
mkdir -p "$PREFIX/var/service/crond"
cat > "$PREFIX/var/service/crond/run" <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
exec crond -n
EOF
chmod +x "$PREFIX/var/service/crond/run"
( crontab -l 2>/dev/null | grep -vF "$REPO_DIR/deploy/termux/backup.sh" ;
  echo "15 3 * * * $REPO_DIR/deploy/termux/backup.sh" ) | crontab -

echo "[6/6] Done. NOW DO THE MIUI PART — this is what kills bots:"
cat <<'EOF'

  1. Settings → Apps → Manage apps → Termux → Battery saver: "No restrictions"
  2. Same screen → Autostart: ON
  3. Recents screen → long-press the Termux card → lock (pin it)
  4. Security app → Boost speed → exclude Termux from cleanup/acceleration
  5. Wi-Fi → Advanced → keep Wi-Fi on during sleep
  6. Put the phone on a dedicated charger, decent ventilation, screen off is fine

Next steps:
  cp .env.example .env   # fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID, OWNER_IDS
  npm run deploy-commands
  sv up bot              # start;  sv status bot;  sv restart bot

After ANY reboot, no PC needed — in Termux run:
  sh ~/start-eternyx.sh  # brings bot+web+tunnel online, prints public URL
(Or tap the Eternyx Online widget button if Termux:Widget is installed.)
EOF
