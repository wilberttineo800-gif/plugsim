---
name: plugsim-verify
description: Run and interpret Plugsim's verification layers. Use before committing, after any change to sim/UI/economy, or when asked whether something works. Explains what each layer catches and the failure modes that have actually shipped.
---

# Verifying Plugsim

Four layers. They catch **disjoint** classes of fault — running one is not
evidence for the others.

```sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
$JSC -m tools/regressions.js    # invariants and mechanics
$JSC -m tools/starter-check.js  # the opening must be winnable
$JSC -m tools/rendertest.js     # every panel's markup
$JSC -m tools/loadcheck.js      # module load + a real bootGame + every tab
$JSC -m tools/simtest.js        # a 30-day economy run; grep for exception/NaN
./tools/feature-check.sh        # live browser, needs a game running
./tools/mobile-check.sh         # phone width, layout overflow
```

## What each one is for

- **regressions** — mechanics and invariants. The main net.
- **starter-check** — a gate, not a report: plays the onboarding from a fresh
  city on the starting bankroll and **fails under $250/day**. Written after a
  playthrough found the opening lost $41/day and could never buy anything.
- **rendertest** — panel markup, headless. Catches template errors.
- **loadcheck** — shims Leaflet and runs `bootGame` for real, then renders every
  tab. Exists because a name used in `bootGame` but never imported only throws
  when it runs; that shipped twice before this gate.
- **simtest** — a long economy run. Grep for `exception` and `NaN`.
- **feature-check / mobile-check** — the real browser. Only these catch layout,
  wiring and CSS.

## Things that have actually gone wrong

- **The dev server used to lie.** `python3 -m http.server` let Safari cache ES
  modules across reloads, so edits appeared to do nothing and checks passed
  against old code. `run.sh` now serves `no-store` via `tools/devserver.py`. If a
  change seems to have no effect, check `performance.getEntriesByType('resource')`
  for `transferSize: 0`.
- **The browser checks are stateful.** A second run on the same session sees a
  world the first run changed. Assertions must be state-aware, and the check is
  expected to pass **twice in a row**.
- **`game.*` wrappers toast, they don't return.** Assert on state, never on a
  wrapper's return value.
- **Section titles render uppercase via CSS.** `innerText` comparisons must be
  case-insensitive.
- **Overpass allows two query slots per IP.** Repeated world loads exhaust the
  user's quota too. Space them out; on 429/504, wait rather than retry hard.

## Before saying something works

Run every layer, and say plainly which ones you ran. If a check fails, find out
whether the fault is the game's or the check's — several "failures" here have
been bad assertions — and say which it was.
