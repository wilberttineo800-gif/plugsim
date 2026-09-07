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

# Two ways in: an interactive login, or a token dropped in a file / env var.
if ! "$GH" auth status >/dev/null 2>&1; then
  TOKEN="${GH_TOKEN:-}"
  [ -z "$TOKEN" ] && [ -f "$HOME/.plugsim-token" ] && TOKEN=$(tr -d '[:space:]' < "$HOME/.plugsim-token")
  if [ -n "$TOKEN" ]; then
    echo "$TOKEN" | "$GH" auth login --hostname github.com --git-protocol https --with-token
  else
    echo "Not logged in. Either:" >&2
    echo "  $GH auth login                              (interactive)" >&2
    echo "  echo YOUR_TOKEN > ~/.plugsim-token          (then re-run this)" >&2
    exit 1
  fi
fi
"$GH" auth setup-git >/dev/null 2>&1 || true

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
