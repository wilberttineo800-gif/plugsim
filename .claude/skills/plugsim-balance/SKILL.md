---
name: plugsim-balance
description: Change Plugsim's economy safely — prices, yields, costs, demand, difficulty. Use before touching any number in constants.js or the sim's maths. Lists the specific balance faults that have shipped and how each was caught.
---

# Changing the economy

Every number here is load-bearing. Four separate balance faults have shipped in
this project and each was invisible until measured.

## Always

1. **Measure before and after.** `tools/starter-check.js` prints the opening's
   net per day and **fails under $250**. `tools/simtest.js` prints a 30-day run.
   Quote real numbers, never "should be fine".
2. **Ask what the change does to a new player**, not to a mature empire. The
   opening is the fragile part.
3. **Run the full suite** — see the `plugsim-verify` skill.

## The rules that exist for a reason

- **Anything that redistributes must normalise to 1.0.** `src/game/rhythm.js`
  moves demand by hour, weekday and payday, and every curve is normalised so a
  full 210-day cycle averages exactly 1.000 per product. It changes *when* the
  city buys, never how much. The payday curve computes its own base from its
  shape, so tuning the amplitude can't silently shift the economy.
- **Cost must scale the same way output does.** A ×0.70 grow paid a full room's
  supply cost for 70% of a room's yield, which made the cheapest starter grow
  structurally unprofitable. If output scales with `sizeScale`, so must inputs.
- **Capacity stays on baseline demand; only selling follows the clock.** Tying a
  block's capacity to the live hour meant you couldn't stock a corner on Thursday
  for Friday night. It cost the opening $1,150/day and broke it outright.
- **A block will only hold about two days of its own demand** (`MARKET.glutCap`).
  Before this, one line could pile a fortnight of stock on one corner and pin its
  price at the floor permanently.
- **Compare accumulated progress with a tolerance.** `24 × (0.25/6)` is
  `0.9999999999999999`, so a six-hour cycle caught up in quarter-hour slices
  never completed. `DONE = 1 - 1e-9` in `sim.js`.

## Faults worth remembering

| What was wrong | How it showed up |
|---|---|
| Supply cost didn't scale with size | opening lost $41/day, stalled on day 3 |
| Cycle stalled at 0.99999… | offline catch-up produced **zero** |
| Height multiplier not normalised | simtest earned **$0** over 30 days |
| Courier could bury a block | 1,595 packs on a corner that moves 5/hour |

## Never

Don't tune a number to make a test pass. Find out why it's wrong first — several
"balance problems" here turned out to be bad assertions.
