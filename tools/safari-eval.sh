#!/bin/sh
# Evaluate a JavaScript file in the Safari window running the game.
#   tools/safari-eval.sh script.js
# Requires Safari > Develop > "Allow JavaScript from Apple Events".
#
# It finds the window by URL rather than using the frontmost one. That is not
# fussiness: the frontmost window is whatever the person at the keyboard last
# clicked on, so a probe aimed at "window 1" will happily read and script
# somebody's bank tab. Set PLUGSIM_URL to match something else.
[ -z "$1" ] && { echo "usage: safari-eval.sh <file.js>"; exit 1; }
MATCH="${PLUGSIM_URL:-localhost:5173}"
python3 - "$1" "$MATCH" <<'PY'
import subprocess, sys
js = open(sys.argv[1]).read()
match = sys.argv[2]
esc = js.replace('\\', '\\\\').replace('"', '\\"')
match_esc = match.replace('\\', '\\\\').replace('"', '\\"')
script = f'''
tell application "Safari"
  set target to missing value
  repeat with w in windows
    try
      if (URL of current tab of w) contains "{match_esc}" then
        set target to w
        exit repeat
      end if
    end try
  end repeat
  if target is missing value then
    return "NO WINDOW MATCHING {match_esc}"
  end if
  do JavaScript "{esc}" in current tab of target
end tell
'''
r = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
sys.stdout.write(r.stdout)
if r.returncode != 0:
    sys.stderr.write(r.stderr)
    sys.exit(r.returncode)
PY
