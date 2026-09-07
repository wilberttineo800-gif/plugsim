# Plugsim — Supply Line

A supply-chain crime sim played on a real map. Pick any city on Earth and the
game surveys the actual buildings around you — real footprints, real street
addresses, real floor areas — and puts them on the market. You buy premises and
decide what runs inside each one, then build the chain: grow, process, store,
move, sell. The geography is real, so distance actually costs you.

## Run it

```sh
./run.sh              # http://localhost:5173
./run.sh 5173 lan     # also reachable from your phone on the same Wi-Fi
```

No build step, no `npm install`, no toolchain. It's native ES modules served
straight to the browser; `run.sh` just starts Python's built-in HTTP server.
(A server is required — `file://` won't load ES modules.)

### Playing on a phone

The LAN mode prints the address to open on your phone. That only works on the
same network — the address is private to your Wi-Fi.

For a link that works anywhere, the game is plain static files that call public
APIs, so it hosts fine on any static host (GitHub Pages, Netlify, a plain
bucket) with no server of its own. For a quick temporary link while your Mac is
awake, an SSH tunnel needs nothing installed:

```sh
ssh -R 80:localhost:5173 nokey@localhost.run
```

That exposes the server to the public internet for as long as it runs.

### Layout

The interface adapts at 780px. Above that it's a dispatch console with a left
rail and a right inspector; below, both become bottom sheets over a full-bleed
map, with a bottom nav bar and larger touch targets. Map hit tolerance is
widened for fingertips and hover tooltips are dropped on touch devices.

## The chain

```
Grow House ─┐
            ├─► Processing Lab ──► Stash House ──► District (customers)
Fruiting ───┘        │
Room                 └──► packaged product, quality-graded

                     Legit Front ──► washes street cash into clean money
```

0. **Buy a building.** Every outline on the map is a real building from
   OpenStreetMap. Zoom in, click one, and you get its type, its footprint and an
   asking price based on size and how expensive the block is. Then you choose
   what runs inside — and the floorplate matters: a 70 m² rowhouse runs a grow
   at ×0.73, a 2,000 m² warehouse runs it at ×2.6.
1. **Grow House / Fruiting Room** run cycles on their own and fill with *raw*
   harvest. Raw sells to nobody.
2. **Processing Lab** converts raw into packaged product. This is usually your
   bottleneck — one lab covers about two grow houses.
3. **Stash House** is optional buffer storage near your customers, so couriers
   drive shorter legs.
4. **Routes + couriers** — nothing moves by itself. Draw a route, assign a
   courier, and they run it on a loop forever.
5. **Districts** absorb packs over game-hours at the street price. They aren't
   drawn as shapes — a grid over real streets was clutter once buildings became
   the thing you click. Block names sit on the map, the **Blocks** tab ranks
   every district by whatever the map is showing, and the overlay (demand,
   price, rival turf) tints the buildings themselves.
6. **Legitimate business** — a corner store, laundromat, auto shop or coffee
   bar. These earn **clean money on their own**, slowly and safely: never
   raided, cooling the block, with takings driven by how wealthy the street is
   and how big the floorplate. They also wash street cash for a cut.

Two currencies, and the split is the whole strategic tension: **street cash**
is fast and large but only pays supplies, wages and upkeep, while **clean
money** buys everything — property, fit-outs, vehicles, muscle. You either
grind it out legally or run the chain and launder.

## What makes it a game

- **Flooding a block tanks the price.** Supply beyond ~8 hours of local demand
  drives the price toward 35% of baseline. Spread the load.
- **Rival crews** already hold most of the good blocks. At full grip they serve
  ~72% of that block's trade, so you barely sell there at all. Trading steadily
  wears their grip down for free — your reputation is the weapon — or you can
  muscle in with clean cash, where your rep on the block sets the odds. Drop
  product on turf they still hold and they'll tax the load.
- **Police pressure** builds where you sell and where you build, scaled by how
  heavily the block is patrolled, and it *bleeds into neighbouring districts* —
  you can't park a grow one hex from your dumping ground and stay clean.
  Contested blocks run hot on their own. There is deliberately **no heat gauge**:
  pressure reaches you as news in the ticker, so when a block gets named, act on
  it. Hot blocks get raided; couriers get pulled over.
- **Premises are a real decision.** Property price scales with footprint, the
  local rent level and what sort of building it is; output scales with the
  square root of floor area. Cheap and cramped starts you moving, but a
  warehouse is what makes an empire.
- **Cheap blocks are cheap for a reason.** Property price scales with local
  rent, but poor districts also pay less at street level. Produce cheap, sell
  rich, and eat the transport cost between them.
- **Payroll is due daily.** Come up short and sites stall — but they recover on
  their own as product moves, and you can always sell a property to get out.

## Real-world data

Everything is free and keyless, and each call degrades gracefully if it fails:

| Service | Used for | Fallback |
|---|---|---|
| CARTO dark tiles | basemap | — |
| Nominatim | city search, reverse geocode | manual map click |
| Overpass | real neighbourhood names (one call per new game) | generated names |
| Overpass | real building footprints, types and addresses | game won't start — retry |
| OSRM | real driving routes for couriers | straight line × 1.35 |

Google Maps can't back this: its JS API needs a billed key, its terms don't
permit this kind of derivative use, and it exposes no queryable building
footprints. OSM gives the geometry and the tags for free.

District character is derived deterministically from true latitude/longitude, so
the same corner of the world always generates the same city.

## Layout

```
src/game/     pure simulation — no DOM, no browser
  constants.js  all tuning lives here
  sim.js        the tick: production, labs, couriers, markets, heat, raids
  economy.js    street pricing
  districts.js  district grid + stats from real coordinates
  lots.js       real OSM buildings as purchasable property
  crews.js      rival crews, turf control, who holds what
  geo.js        distance, routing, OSM services
src/map/      Leaflet layers
src/ui/       HUD, rail panels, inspector
tools/        headless balance + panel-render harnesses
```

## Balance testing

`src/game/` is deliberately free of DOM references, so the whole simulation runs
headless in JavaScriptCore (ships with macOS — no Node needed):

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  -m tools/simtest.js
```

It plays 30 game-days as a competent player — spreading load, washing money,
reinvesting, and fighting for a contested block — then prints a daily P&L, the
chain state, courier activity, top markets, turf erosion and a bottleneck
analysis. Change a number in `constants.js` and re-run to see the effect
immediately.

A second harness renders every UI panel against a real populated game state:

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  -m tools/rendertest.js
```

The panels are pure string builders, so this catches undefined references and
NaNs inside template literals that would otherwise only show up when a player
happened to click that panel.

## Keys

<kbd>Space</kbd> pause · <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> speed ·
<kbd>S</kbd> save · <kbd>Esc</kbd> cancel · <kbd>?</kbd> help

Saves go to `localStorage` and autosave every 60s.

## Not done yet

- Buildings that already have a use, so taking one has consequences
- More products, and product-specific processing chains
- Crews that actively expand and retaliate, rather than only holding ground
- Courier skill/loyalty, and vehicles that can be lost
- A second processing tier (concentrates) off the back of packaged product
