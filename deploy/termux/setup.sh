#!/data/data/com.termux/files/usr/bin/sh
# One-time Termux provisioning for the Eternyx bot (plan §9).
# Run inside Termux:  sh deploy/termux/setup.sh
set -e

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
echo "[1/6] Installing packages…"
pkg update -y
pkg install -y nodejs-lts git termux-services termux-api sqlite

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
exec termux-wake-lock node --max-old-space-size=256 src/index.js 2>> logs/err.log
EOF
chmod +x "$PREFIX/var/service/bot/run"

echo "[4/6] Creating the boot hook (starts the bot after phone reboot)…"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/start-services.sh" <<'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sv up bot
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
EOF
