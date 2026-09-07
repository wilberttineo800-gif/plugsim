#!/bin/sh
# Evaluate a JavaScript file in the front Safari tab and print the result.
#   tools/safari-eval.sh script.js
# Requires Safari > Develop > "Allow JavaScript from Apple Events".
[ -z "$1" ] && { echo "usage: safari-eval.sh <file.js>"; exit 1; }
python3 - "$1" <<'PY'
import subprocess, sys
js = open(sys.argv[1]).read()
# AppleScript string literal: escape backslashes then double quotes.
esc = js.replace('\\', '\\\\').replace('"', '\\"')
script = (
    'tell application "Safari"\n'
    f'  do JavaScript "{esc}" in current tab of window 1\n'
    'end tell'
)
r = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
sys.stdout.write(r.stdout)
if r.returncode != 0:
    sys.stderr.write(r.stderr)
    sys.exit(r.returncode)
PY
