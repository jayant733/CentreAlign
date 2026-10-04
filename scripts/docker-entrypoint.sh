#!/bin/bash
# One container, two processes. The web server only queues work; the worker
# executes it. Cases and the sandbox company live in Neon. Invoice PDFs,
# screenshots and the workspace still live under /app/.data.
set -euo pipefail

mkdir -p /app/.data /app/.data/workspace /app/.data/sandbox/invoices /app/public/artifacts

npx tsx scripts/seed-if-empty.ts

npx tsx scripts/worker.ts &
worker_pid=$!

npx next start -H 0.0.0.0 -p "${PORT:-3000}" &
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
