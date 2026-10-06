#!/data/data/com.termux/files/usr/bin/sh
# Eternyx — one-command bring-online. Run directly in Termux after a reboot:
#   sh ~/start-eternyx.sh
# No PC, no USB, no SSH needed. Idempotent: safe to run any time.
# Order: wake-lock -> runsvdir -> sshd -> sv up bot web tunnel crond ->
# settle -> verify -> print tunnel URL + next steps.
# Gotchas honored: SVDIR exported explicitly (boot/SSH skip profile.d);
# wake-lock is one-shot, never exec'd; no `which`, no /tmp, POSIX sh only.
set -u
export SVDIR="${SVDIR:-/data/data/com.termux/files/usr/var/service}"
BOT_DIR="$HOME/eternyx-bot"
WEB_DIR="$HOME/eternyx-web"

say() { printf '%s\n' "$1"; }
ok() { printf '  [ok] %s\n' "$1"; }
warn() { printf '  [!!] %s\n' "$1"; }

say "Eternyx bring-online — $(date '+%F %T')"

# 1. Stay awake while starting (one-shot; must NOT replace this script).
termux-wake-lock >/dev/null 2>&1 || true

# 2. Process supervisor — everything else depends on it.
if pgrep -x runsvdir >/dev/null 2>&1; then
  ok "supervisor already running"
else
  warn "supervisor not running — starting it"
  setsid runsvdir "$SVDIR" >/dev/null 2>&1 &
  sleep 3
  if pgrep -x runsvdir >/dev/null 2>&1; then
    ok "supervisor started"
  else
    warn "supervisor FAILED — close and reopen the Termux app, then retry"
  fi
fi

# 3. SSH daemon for future PC access (harmless locally).
# The runit sshd service fails on this phone — plain daemon is proven.
if pgrep -x sshd >/dev/null 2>&1; then
  ok "sshd already running"
else
  sshd >/dev/null 2>&1 || true
  sleep 1
  if pgrep -x sshd >/dev/null 2>&1; then
    ok "sshd started (PC access ready)"
  else
    warn "sshd not started — PC access unavailable until you run: sshd"
  fi
fi

# 4. Bring up every installed service (missing ones are skipped, not errors).
for SVC in bot web tunnel crond; do
  if [ -d "$SVDIR/$SVC" ]; then
    sv up "$SVC" >/dev/null 2>&1 || true
    ok "service $SVC -> $(sv status "$SVC" 2>/dev/null | head -1)"
  else
    warn "service $SVC not installed — skipping (run setup first)"
  fi
done

say "waiting 10s for processes to settle…"
sleep 10

# 5. Verify.
say "--- status ---"
for SVC in bot web tunnel; do
  if [ -d "$SVDIR/$SVC" ]; then
    sv status "$SVC" 2>/dev/null || warn "$SVC status unknown"
  fi
done

if [ -f "$BOT_DIR/logs/bot.log" ]; then
  say "--- bot log (last 3 lines) ---"
  tail -3 "$BOT_DIR/logs/bot.log" 2>/dev/null || true
else
  warn "no bot log yet at $BOT_DIR/logs/bot.log"
fi

if [ -f "$WEB_DIR/data/snapshot.bin" ]; then
  NOW=$(date +%s)
  MTIME=$(stat -c %Y "$WEB_DIR/data/snapshot.bin" 2>/dev/null || echo 0)
  AGE=$((NOW - MTIME))
  if [ "$AGE" -lt 180 ]; then
    ok "bot snapshot fresh (${AGE}s old) — bot is pushing"
  else
    warn "bot snapshot is ${AGE}s old — bot may still be logging in, wait 1 min"
  fi
fi

WEB_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/ 2>/dev/null || printf '000')
if [ "$WEB_CODE" = "200" ]; then
  ok "local dashboard responds (HTTP 200)"
else
  warn "local dashboard HTTP $WEB_CODE — inspect: tail -5 ~/eternyx-web/err.log"
fi

if [ -f "$WEB_DIR/tunnel.log" ]; then
  TUNNEL_URL=$(tr ' ' '\n' < "$WEB_DIR/tunnel.log" 2>/dev/null | sed -n 's|.*\(https://[a-zA-Z0-9.-]*trycloudflare.com\).*|\1|p' | tail -1)
  if [ -n "$TUNNEL_URL" ]; then
    ok "public dashboard: $TUNNEL_URL"
  else
    warn "tunnel URL not in log yet — wait 30s, then: tail -5 ~/eternyx-web/tunnel.log"
  fi
else
  warn "no tunnel log yet — cloudflared may still be connecting"
fi

say "--- done ---"
say "Next: in Discord run /botstatus (bot alive), then open the public URL."
