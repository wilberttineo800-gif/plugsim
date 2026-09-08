#!/bin/sh
# Serve the game locally. No build step, no dependencies — ES modules straight
# to the browser. Needs a server (not file://) so module imports resolve.
cd "$(dirname "$0")" || exit 1
PORT="${1:-5173}"
MODE="${2:-local}"

if [ "$MODE" = "lan" ]; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
  echo "Plugsim → http://localhost:$PORT"
  [ -n "$IP" ] && echo "  on your phone (same Wi-Fi) → http://$IP:$PORT"
  echo "  (reachable by anything on your network)"
  exec python3 tools/devserver.py "$PORT" 0.0.0.0
fi

echo "Plugsim → http://localhost:$PORT"
echo "  (this machine only; use './run.sh $PORT lan' for your phone)"
exec python3 tools/devserver.py "$PORT" 127.0.0.1
