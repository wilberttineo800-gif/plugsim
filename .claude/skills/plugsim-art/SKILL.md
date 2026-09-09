---
name: plugsim-art
description: Draw or change artwork in Plugsim — guns, vehicles, goods, attachments. Use when adding a new drawn thing or fixing one that looks wrong. Covers the SVG conventions, how to preview without a screen, and the geometry gate.
---

# Drawing things in Plugsim

All artwork lives in `src/ui/art.js` as **inline SVG path data**. Not images:
the content-security rules block outside images, the game must work offline, and
a player on a phone shouldn't wait on a sprite sheet.

## The conventions

- **Field is `0 0 64 32`** for anything in profile (guns, vehicles), `0 0 32 32`
  for goods. Side profile is what makes a shotgun read as a shotgun at 40px.
- **Filled by default**; set `stroked: true` for line work (bicycles, drones,
  glassware). Stroke width 1.4–1.6.
- **Colour comes from the caller** — always `currentColor` or a passed value, so
  one drawing works on a card, a map marker and a dark panel.
- **Road vehicles sit on a common ground line with real wheels.** Without wheels
  a silhouette is just a lump; this was the single biggest fix to the fleet.
- **Attachments composite** onto guns in the same 64×32 field, so an optic sits
  where an optic sits. The viewBox widens to `-8 0 72 32` when something hangs
  off the muzzle.

## Previewing without a screen

The machine sleeps and locks, and `screencapture` then returns black or the
lock screen. Don't fight it — **render straight to an image**:

```sh
# Build a standalone SVG contact sheet with a throwaway harness…
$JSC -m tools/_sheet.js > /tmp/sheet.svg
# …then rasterise it with Quick Look. No browser, no screen, no unlock.
qlmanage -t -s 1500 -o /tmp/out /tmp/sheet.svg
```

Then `Read` the PNG. This is how the missing wheels, the rifle with no
buttstock, and the clipped handgun were all found.

## The geometry gate

`tools/feature-check.js` measures **every drawing's bounding box against its own
viewBox** and fails on anything clipped. A cut-off muzzle is invisible in the
markup and obvious on screen, so this is the only automated defence. It has
caught three real clips.

## When drawing something real

Look up what actually distinguishes it before drawing — the user is happy for
you to search. A curved magazine and gas tube is what makes an AK read as an AK;
a flat-top rail and in-line stock is what makes an AR read as an AR. Invent the
names, not the shapes.
