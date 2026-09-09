---
name: plugsim-content
description: Add a building, product, vehicle or system to Plugsim end to end. Use when adding content so nothing is left half-wired. Covers the full checklist including the save migration and the "fields that do nothing" trap.
---

# Adding something to Plugsim

The trap here is a change that looks complete and isn't. A building with a field
nothing reads is decoration; a new product with no chain is an orphan.

## The checklist

1. **`src/game/constants.js`** — the definition. Buildings need `kind`,
   `minAreaM2` **and** `maxAreaM2`, `referenceAreaM2`, `areaExponent`,
   `upkeepPerDay`, `heatPerDay`, and an `unlock` if it isn't a starter.
2. **Wire every field you invent.** If you add `yieldBonus`, something in
   `sim.js` must read it. Three fields shipped as decoration once —
   `yieldBonus`, `stopResist`, `fittingDiscount` — and had to be wired after.
   Grep for the field name; if only `constants.js` matches, it does nothing.
3. **A new product needs a full chain.** A producer (`kind: 'production'` with
   `product:`) and a finisher (`kind: 'processing'` with `handles: [...]`).
   Regression 25 fails on an orphan. A second finisher is allowed only if it is
   a real alternative — premium (higher `qualityBonus`) or a shortcut (negative
   `qualityBonus` plus `yieldBonus` > 1).
4. **Artwork** — see the `plugsim-art` skill. Products, guns and vehicles are
   all drawn.
5. **Save migration** in `src/game/state.js`: bump `SAVE_VERSION` and add a
   `if (data.version < N)` block. New products must be filled into every product
   map — district `supply`/`supplyQuality`/`demandPerHour`, building
   `raw`/`packs`/`rawQuality`/`packQuality`, courier `cargo`/`cargoQuality`,
   `stats.packsSold`, `priceHistory`. **Migrate, never discard** — a player has a
   run in progress.
6. **UI** — the build menu filters on real size fit, so check the thing is
   actually offered somewhere.
7. **A regression** proving the new thing does what it claims.
8. **Verify and publish** — see `plugsim-verify`.

## Size ranges are real

Every operation has a floor **and** a ceiling taken from how the thing is
actually run: a closet grow is 13–35 m² because it is a tent in a room. The
build menu lists only what fits, so a wrong `maxAreaM2` makes something
unbuildable rather than merely odd.

## Naming and voice

Places, guns and businesses are written as somebody would speak about them, not
as database rows. Blurbs are one or two sentences, concrete, no marketing. Look
up how the real thing works before writing it — the user is happy for you to
search, and it shows.
