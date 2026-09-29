#!/data/data/com.termux/files/usr/bin/sh
# Nightly case-database backup with 7-day retention (plan §9.3).
# Installed into crontab by setup.sh.
set -e
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_DIR"
mkdir -p backups
sqlite3 data/eternyx.db ".backup 'backups/daily-$(date +%F).db'"
find backups -name 'daily-*.db' -mtime +7 -delete
