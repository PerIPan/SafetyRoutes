#!/usr/bin/env bash
# SafetyRoutes — Trivy collector
# ------------------------------------------------------------------------------
# Run this on a SERVER YOU OWN, on a schedule (cron / launchd / systemd timer).
# It runs Trivy against the host filesystem and PUSHES the JSON report to
# SafetyRoutes, so a fresh report is already "waiting" when someone runs the
# wizard — no manual command, no manual upload.
#
# Security hygiene (do NOT shortcut these):
#   • The token is a STANDING secret. Keep it in a 0600 file owned by the user
#     that runs this script — never inline in crontab, never in the URL (it would
#     show up in `ps`, shell history, and proxy/access logs).
#   • Sent in the Authorization header (Bearer), never the query string.
#   • Use HTTPS for any non-loopback hop. Plain http:// is only OK for 127.0.0.1.
#
# Setup (once):
#   sudo mkdir -p /etc/safetyroutes
#   printf '%s' 'YOUR-INGEST-TOKEN' | sudo tee /etc/safetyroutes/ingest.token >/dev/null
#   sudo chmod 600 /etc/safetyroutes/ingest.token
#   # then test:  SR_ENDPOINT=http://localhost:3000/api/ingest/trivy ./sr-trivy-collector.sh
#
# Schedule (weekly, Mondays 03:00) — crontab -e:
#   0 3 * * 1  SR_ENDPOINT=http://localhost:3000/api/ingest/trivy /opt/safetyroutes/sr-trivy-collector.sh >> /var/log/sr-collector.log 2>&1
# ------------------------------------------------------------------------------
set -euo pipefail

ENDPOINT="${SR_ENDPOINT:-http://localhost:3000/api/ingest/trivy}"
TOKEN_FILE="${SR_TOKEN_FILE:-/etc/safetyroutes/ingest.token}"
SCAN_TARGET="${SR_SCAN_TARGET:-/}"
HOST="${SR_SOURCE_HOST:-$(hostname)}"

if [ ! -r "$TOKEN_FILE" ]; then
  echo "sr-collector: token file not readable: $TOKEN_FILE" >&2
  echo "  create it: printf '%s' 'YOUR-TOKEN' | sudo tee $TOKEN_FILE >/dev/null && sudo chmod 600 $TOKEN_FILE" >&2
  exit 1
fi
TOKEN="$(cat "$TOKEN_FILE")"

# Produce the Trivy report. Prefer a native `trivy`; fall back to the official Docker image so a
# host with only Docker still works (mounts the filesystem read-only).
run_trivy() {
  if command -v trivy >/dev/null 2>&1; then
    trivy fs --scanners vuln --format json --ignore-unfixed "$SCAN_TARGET"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "$SCAN_TARGET":/scanroot:ro \
      -v sr-trivy-cache:/tmp/trivy-cache -e TRIVY_CACHE_DIR=/tmp/trivy-cache \
      aquasec/trivy:0.55.2 \
      fs --scanners vuln --format json --ignore-unfixed /scanroot
  else
    echo "sr-collector: neither 'trivy' nor 'docker' found on PATH" >&2
    exit 1
  fi
}

echo "sr-collector: scanning $SCAN_TARGET → $ENDPOINT (host=$HOST)" >&2
run_trivy \
  | curl -sf --max-time 120 \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -H "X-Source-Host: $HOST" \
      --data-binary @- \
      "$ENDPOINT"
echo >&2
echo "sr-collector: done" >&2
