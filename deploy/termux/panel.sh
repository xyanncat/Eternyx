#!/data/data/com.termux/files/usr/bin/sh
# Eternyx live usage panel — run inside Termux on the bot phone:
#   sh ~/eternyx-bot/deploy/termux/panel.sh        (refreshes every 5s)
#   sh ~/eternyx-bot/deploy/termux/panel.sh --once (single frame)
set -u
export TERM="${TERM:-xterm}"
export SVDIR="/data/data/com.termux/files/usr/var/service"
BOT_DIR="$HOME/eternyx-bot"
DB="$BOT_DIR/data/eternyx.db"

G="\033[1;32m"; Y="\033[1;33m"; R="\033[1;31m"; C="\033[1;36m"; D="\033[2m"; N="\033[0m"

render() {
  printf "${C}┌─────────────────────────────────────────────┐${N}\n"
  printf "${C}│  ETERNYX — LIVE PANEL  ${D}$(date '+%H:%M:%S')${N}${C}          │${N}\n"
  printf "${C}└─────────────────────────────────────────────┘${N}\n"

  # --- service & process ---
  STATUS=$(sv status bot 2>/dev/null | awk '{print $1}')
  STATUS=${STATUS%:} # sv prints "run:"/"fail:"/"down:" with a trailing colon
  PID=$(pgrep -f "node --max-old-space-size" | head -1)
  if [ "$STATUS" = "run" ] && [ -n "$PID" ]; then
    RSS=$(awk '/VmRSS/ {print int($2/1024)" MB"}' "/proc/$PID/status" 2>/dev/null)
    printf " ${G}● bot RUNNING${N} (pid $PID) — memory: ${Y}${RSS:-?}${N} / 256 MB cap\n"
  else
    printf " ${R}● bot DOWN${N} — restart: ${D}SVDIR=\$PREFIX/var/service sv up bot${N}\n"
  fi

  # --- battery (needs the Termux:API add-on app; timeout guards the hang) ---
  BAT_JSON=$(timeout 3 termux-battery-status 2>/dev/null || true)
  BAT=$(printf '%s' "$BAT_JSON" | grep -o '"percentage": *[0-9]*' | grep -o '[0-9]*')
  BATS=$(printf '%s' "$BAT_JSON" | grep -o '"status": *"[A-Z]*"' | cut -d'"' -f4)
  printf " battery: ${Y}${BAT:-n/a}%%${N} ${D}(${BATS:-install Termux:API app})${N}\n"

  # --- command usage ---
  printf "\n ${G}COMMAND USAGE${N} ${D}(all time)${N}\n"
  USAGE=$(sqlite3 "$DB" "SELECT printf('  %-12s %5d x   last %4d min ago', name, count, CAST(($(date +%s)*1000 - last_used)/60000 AS INT)) FROM command_stats ORDER BY count DESC LIMIT 8;" 2>/dev/null)
  printf '%b\n' "${USAGE:-  ${D}no commands used yet — they appear here live${N}}"

  # --- recent cases ---
  printf "\n ${G}RECENT CASES${N}\n"
  CASES=$(sqlite3 "$DB" "SELECT printf('  #%-4d %-8s <@%s>  %s', id, type, user_id, substr(reason,1,30)) FROM cases ORDER BY id DESC LIMIT 5;" 2>/dev/null)
  printf '%b\n' "${CASES:-  ${D}none yet${N}}"

  # --- security events ---
  printf "\n ${G}SECURITY EVENTS${N}\n"
  EVENTS=$(sqlite3 "$DB" "SELECT printf('  %-22s %6d min ago', kind, CAST(($(date +%s)*1000 - created_at)/60000 AS INT)) FROM events ORDER BY id DESC LIMIT 5;" 2>/dev/null)
  printf '%b\n' "${EVENTS:-  ${D}none — all quiet${N}}"

  printf "\n ${D}refresh 5s · Ctrl+C exit · log: ~/eternyx-bot/logs/bot.log${N}\n"
}

while :; do
  clear
  render
  [ "${1:-}" = "--once" ] && break
  sleep 5
done
