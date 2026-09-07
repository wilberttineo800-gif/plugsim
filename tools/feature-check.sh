#!/bin/sh
# Run the end-to-end feature check against the live game session.
#   tools/feature-check.sh           # the published game
#   tools/feature-check.sh --local   # the local dev server
cd "$(dirname "$0")/.." || exit 1
LOCAL=""
[ "$1" = "--local" ] && LOCAL="--local"
printf 'try { %s } catch (e) { "CHECK THREW: " + e + "\\n" + (e.stack||"") }' "$(cat tools/feature-check.js)" \
  > /tmp/plugsim-feature-check.js
./tools/session-probe.sh $LOCAL "$(cat /tmp/plugsim-feature-check.js)"
