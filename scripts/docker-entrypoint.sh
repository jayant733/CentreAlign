#!/bin/bash
# One container, two processes. The web server only queues work; the worker
# executes it. Cases and the sandbox company live in Neon. Invoice PDFs,
# screenshots and the workspace still live under /app/.data.
set -euo pipefail

mkdir -p /app/.data /app/.data/workspace /app/.data/sandbox/invoices /app/public/artifacts

# Hosts like Railway and Render pick the port. The agent's browser runs in
# this same container, so it must dial that port, not a hard-coded 3000.
# Any localhost value is rewritten; a real public URL is left alone.
export PORT="${PORT:-3000}"
case "${PRAXIS_BASE_URL:-}" in
  ""|http://localhost*|http://127.0.0.1*)
    export PRAXIS_BASE_URL="http://127.0.0.1:${PORT}"
    ;;
esac
echo "[praxis] web on port ${PORT}, agent dials ${PRAXIS_BASE_URL}"

npx tsx scripts/seed-if-empty.ts

npx tsx scripts/worker.ts &
worker_pid=$!

npx next start -H 0.0.0.0 -p "${PORT}" &
web_pid=$!

shutdown() {
  kill "$worker_pid" "$web_pid" 2>/dev/null || true
  wait "$worker_pid" "$web_pid" 2>/dev/null || true
}
trap shutdown TERM INT

# If either process exits, stop the container instead of leaving a half-dead app.
wait -n "$worker_pid" "$web_pid"
status=$?
shutdown
exit "$status"
