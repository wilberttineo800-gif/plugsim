#!/bin/sh
# Resize Safari to a phone, audit every panel, then restore the window.
# Requires a game already running in the front tab, and Safari's
# Develop > "Allow JavaScript from Apple Events".
cd "$(dirname "$0")/.." || exit 1
WIDTH="${1:-392}"

# Resize the window running the game, not whatever happens to be in front.
WIN=$(osascript -e 'tell application "Safari"
  repeat with i from 1 to (count windows)
    try
      if (URL of current tab of window i) contains "localhost:5173" then return i
    end try
  end repeat
  return 0
end tell')
[ "$WIN" = "0" ] && { echo "No Safari window is running the game."; exit 1; }
osascript -e "tell application \"Safari\" to set bounds of window $WIN to {0, 25, $WIDTH, 900}" >/dev/null 2>&1
sleep 2

# Wrapped so the script has a string completion value to hand back, and so a
# thrown error is reported rather than swallowed as empty output.
printf 'try { %s } catch (e) { "THREW: " + e }' "$(cat tools/mobile-check.js)" > /tmp/plugsim-mobile-check.js
./tools/safari-eval.sh /tmp/plugsim-mobile-check.js

osascript -e "tell application \"Safari\" to set bounds of window $WIN to {0, 25, 1440, 900}" >/dev/null 2>&1
