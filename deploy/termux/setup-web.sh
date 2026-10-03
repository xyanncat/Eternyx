#!/data/data/com.termux/files/usr/bin/sh
# Phone-side web hosting for the Eternyx dashboard (plan: phone-only hosting).
# Run inside Termux AFTER ship-web.sh has delivered the bundle:
#   sh ~/eternyx-bot/deploy/termux/setup-web.sh
# What this sets up:
#   ~/eternyx-web/            standalone Next.js server (shipped from the PC)
#   ~/eternyx-web/.env.web    keys + STORE_BACKEND=file (you fill in once)
#   runit service `web`       node server.js on 127.0.0.1:3000 (auto-restart)
#   runit service `tunnel`    cloudflared quick-tunnel → public https URL
set -e

WEB_DIR="$HOME/eternyx-web"

echo "[1/4] Installing cloudflared (public URL without port forwarding)…"
pkg update -y
pkg install -y cloudflared

echo "[2/4] Web directory + env template…"
mkdir -p "$WEB_DIR/data"
if [ ! -f "$WEB_DIR/.env.web" ]; then
  cp "$WEB_DIR/.env.web.example" "$WEB_DIR/.env.web"
  echo "Created $WEB_DIR/.env.web — FILL IN the two keys before starting."
fi

echo "[3/4] Creating the web service (auto-restart via runit)…"
mkdir -p "$PREFIX/var/service/web"
cat > "$PREFIX/var/service/web/run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
cd "$WEB_DIR"
set -a
. "$WEB_DIR/.env.web"
set +a
export PORT=3000 HOSTNAME=127.0.0.1 STORE_BACKEND=file DATA_DIR="\$HOME/eternyx-web/data"
# Heap cap like the bot: a runaway page render kills only this process,
# runit restarts it in seconds. wake-lock is NOT exec'd (see bot gotcha).
termux-wake-lock >/dev/null 2>&1 || true
exec node --max-old-space-size=256 server.js 2>> "$WEB_DIR/err.log"
EOF
chmod +x "$PREFIX/var/service/web/run"

echo "[4/4] Creating the tunnel service (public https URL)…"
mkdir -p "$PREFIX/var/service/tunnel"
cat > "$PREFIX/var/service/tunnel/run" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
# Quick tunnel: free, no Cloudflare account, URL changes on restart.
# Current URL is always at the tail of tunnel.log (grep trycloudflare.com).
exec cloudflared tunnel --url http://127.0.0.1:3000 >>"$WEB_DIR/tunnel.log" 2>&1
EOF
chmod +x "$PREFIX/var/service/tunnel/run"

cat <<'EOF'

Next steps (one time):
  1. Edit ~/eternyx-web/.env.web — set DASHBOARD_ACCESS_KEY (your login)
     and DASHBOARD_INGEST_KEY (MUST match the bot's key in ~/eternyx-bot/.env).
  2. On the bot side, point it at the local web (same device, no meters):
       DASHBOARD_URL=http://127.0.0.1:3000
     then:  SVDIR=$PREFIX/var/service sv restart bot
  3. Start everything:
       SVDIR=$PREFIX/var/service sv up web tunnel
  4. Get the public URL:
       grep -o 'https://[^ ]*trycloudflare.com' ~/eternyx-web/tunnel.log | tail -1

Control:  sv status web tunnel · sv restart web · sv down tunnel
Logs:     ~/eternyx-web/err.log (web) · ~/eternyx-web/tunnel.log (tunnel URL)
EOF
