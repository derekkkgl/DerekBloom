#!/usr/bin/env bash
# Start The Daily Tape: backend on :8000 and frontend on :3000. Ctrl+C stops both.
# Written for the bash 3.2 that ships with macOS.

set -u
cd "$(dirname "$0")"

BACKEND_PORT=8000
FRONTEND_PORT=3000

fail() {
  echo "start.sh: $1" >&2
  exit 1
}

[[ -x backend/.venv/bin/uvicorn ]] ||
  fail "backend isn't set up. Run: cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt"
[[ -d frontend/node_modules ]] ||
  fail "frontend isn't set up. Run: cd frontend && npm install"

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "port $port is already in use. Stop whatever is running there (lsof -i :$port) and try again."
  fi
done

BACKEND_PID=""
FRONTEND_PID=""

stop() {
  trap - INT TERM EXIT
  echo
  echo "Stopping..."
  # Kill each server's whole process group (npm starts next, which starts workers).
  for pid in $FRONTEND_PID $BACKEND_PID; do
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  echo "Stopped."
  exit 0
}
trap stop INT TERM EXIT

# set -m gives each background job its own process group, so stop() can kill it with its children.
set -m
(cd backend && exec .venv/bin/uvicorn app.main:app --port "$BACKEND_PORT") &
BACKEND_PID=$!
(cd frontend && exec npm run dev -- --port "$FRONTEND_PORT") &
FRONTEND_PID=$!
set +m

echo "The Daily Tape"
echo "  Frontend  http://localhost:$FRONTEND_PORT"
echo "  Backend   http://localhost:$BACKEND_PORT/docs"
echo "Press Ctrl+C to stop both."

# If either server exits on its own, stop the other one too.
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done
echo "start.sh: a server exited; shutting down the other." >&2
