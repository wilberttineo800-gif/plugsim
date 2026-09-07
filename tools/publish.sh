#!/bin/sh
# Publish the game to GitHub Pages. Run once to create the repo and turn Pages
# on; run again any time to push updates — Pages rebuilds on its own.
#
# Requires a one-time interactive login first:
#   gh auth login
set -e
cd "$(dirname "$0")/.." || exit 1

GH="${GH:-$HOME/.local/bin/gh}"
REPO="${1:-plugsim}"
[ -x "$GH" ] || GH=gh

if ! "$GH" auth status >/dev/null 2>&1; then
  echo "Not logged in. Run:  $GH auth login" >&2
  exit 1
fi

USER=$("$GH" api user --jq .login)

if ! "$GH" repo view "$USER/$REPO" >/dev/null 2>&1; then
  echo "Creating $USER/$REPO…"
  "$GH" repo create "$REPO" --public --source=. --remote=origin \
    --description "Supply-chain crime sim played on a real map"
else
  git remote get-url origin >/dev/null 2>&1 || \
    git remote add origin "https://github.com/$USER/$REPO.git"
fi

git add -A
git diff --cached --quiet || git commit -q -m "Update"
git branch -M main
git push -u origin main

# Serve straight from the repo root on main — no build, so no Actions needed.
echo "Enabling Pages…"
"$GH" api -X POST "repos/$USER/$REPO/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || "$GH" api -X PUT "repos/$USER/$REPO/pages" \
       -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "  (Pages already configured)"

echo ""
echo "Live in a minute or two at:"
echo "  https://$USER.github.io/$REPO/"
