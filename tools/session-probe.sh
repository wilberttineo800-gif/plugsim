#!/bin/sh
# Read diagnostics out of a running game session without disturbing it.
#
#   tools/session-probe.sh            # full fault report
#   tools/session-probe.sh state      # what the session is doing right now
#   tools/session-probe.sh <js>       # evaluate anything in that tab
#
# Finds the Safari tab showing the game by URL, in any window, so the player's
# window can be left alone and in front.
# Which session to talk to. Default is the published game — the one the player
# is actually using — so a local dev tab open at the same time is never hit by
# accident. That mix-up silently split a test across two tabs once.
TARGET="${PLUGSIM_TARGET:-github.io/plugsim}"
[ "$1" = "--local" ] && { TARGET="localhost:5173"; shift; }

MODE="${1:-report}"
case "$MODE" in
  report) JS="window.plugsimDiag ? window.plugsimDiag.report() : 'diagnostics not loaded'" ;;
  state)  JS="(function(){var g=window.plugsim; if(!g||!g.state) return 'no game running'; var s=g.state; return ['city: '+s.cityName+' (day '+(Math.floor(s.minutes/1440)+1)+')','cash: clean \$'+Math.round(s.cash.clean)+'  street \$'+Math.round(s.cash.dirty),'property: '+s.lots.filter(function(l){return l.owned;}).length+' owned of '+s.lots.length+' surveyed','buildings: '+s.buildings.map(function(b){return b.name;}).join(', ')||'none','couriers: '+s.couriers.length+'  routes: '+s.routes.length,'speed: '+s.speedIndex+'  zoom: '+g.map.getZoom(),'faults: '+(window.plugsimDiag?window.plugsimDiag.summary().faults:'?')].join('\n');})()" ;;
  *)      JS="$MODE" ;;
esac

python3 - "$JS" "$TARGET" <<'PY'
import subprocess, sys
js, target = sys.argv[1], sys.argv[2]
esc = js.replace('\\', '\\\\').replace('"', '\\"')
script = f'''
tell application "Safari"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t as string) contains "TARGET_PLACEHOLDER" then
        return (do JavaScript "{esc}" in t)
      end if
    end repeat
  end repeat
  return "no tab matching TARGET_PLACEHOLDER"
end tell
'''
script = script.replace('TARGET_PLACEHOLDER', target)
r = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
sys.stdout.write(r.stdout or r.stderr)
PY
