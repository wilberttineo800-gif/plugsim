// Real buildings, standing up, on the real map.
//
// Every lot the game already generates carries its true OpenStreetMap
// footprint and, for anything tall, a surveyed height in metres. That is
// exactly what an extruder wants, so this needs no new data and no new
// request: it is a renderer for numbers the survey already put in `state.lots`.
//
// The file is deliberately two halves with a hard seam between them, the same
// way `src/ui/isoart.js` splits geometry from paint:
//
//   Half one (top)  — PURE. No `document`, no `window`, no `L`, no canvas.
//                     Numbers in, numbers out. Runs under `jsc`.
//   Half two (end)  — `Buildings3DLayer`, the thin Leaflet binding that owns a
//                     pane, a canvas and the event wiring.
//
// Importing this module does nothing. No Leaflet class is subclassed at module
// scope (which would need `L` to exist at import time and would break
// `tools/loadcheck.js`), no pane is created, no listener is attached. `L` is
// touched for the first time inside the layer's constructor.
//
// The design note this implements is /tmp/plugsim-3d-design.md §1.2–1.3 and
// §5; where the two disagree, the comments here say so and why.

import {
  STOREY_M, liftedHeight, heightMetres, paletteFor,
} from '../ui/isoart.js';

export { STOREY_M, liftedHeight, heightMetres, paletteFor };

// ---------------------------------------------------------------------------
// 1. Web Mercator, at zoom 0
// ---------------------------------------------------------------------------

/** Leaflet's `SphericalMercator` constants, so the two cannot drift apart. */
const EARTH_R = 6378137;
const MAX_LAT = 85.0511287798;
/** The circumference at the equator: 2 * PI * EARTH_R. One Leaflet world at z0
 *  is 256 px, so this is the number that converts metres to pixels. */
export const EARTH_CIRCUM = 2 * Math.PI * EARTH_R; // 40075016.6855...
const TILE = 256;
const DEG = Math.PI / 180;

/**
 * A lat/lng as pixels in Leaflet's zoom-0 world (256 x 256, origin top-left).
 *
 * This is `map.project(latlng, 0)` written out, and it is written out on
 * purpose rather than called: precomputing every footprint in zoom-0
 * coordinates is what makes a redraw two multiplies per vertex instead of a
 * trig call per vertex (design §1.2 step 2), and a pure function is what lets
 * `jsc` assert the arithmetic without a browser. `prototype/buildings3d.html`
 * checks it against the live Leaflet at startup and prints the delta, so if
 * Leaflet ever changes its projection this stops being a claim and starts
 * being a failure.
 */
export function projectWorld(lat, lng, out) {
  const clamped = lat > MAX_LAT ? MAX_LAT : (lat < -MAX_LAT ? -MAX_LAT : lat);
  const sinLat = Math.sin(clamped * DEG);
  const x = TILE * (0.5 + lng / 360);
  const y = TILE * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI));
  if (out) { out.x = x; out.y = y; return out; }
  return { x, y };
}

/**
 * Screen pixels per ground metre, at a latitude and zoom.
 *
 * Web Mercator pixels are isotropic, so one scalar covers both axes, and the
 * only thing latitude does is stretch the scale by 1/cos(phi). Across one
 * `LOTS.tileDeg` tile (0.012 deg, ~1.3 km) cos(phi) varies by under 0.02% —
 * far below a pixel — so this is computed ONCE per redraw at the viewport
 * centre, never per building.
 *
 *   phi=40N:  z17 -> 0.915 m/px,  z18 -> 0.457,  z19 -> 0.229,  z20 -> 0.114
 */
export function pxPerMetreAt(lat, zoom) {
  return (TILE * Math.pow(2, zoom)) / (EARTH_CIRCUM * Math.cos(lat * DEG));
}

/** The inverse, for anyone who wants to think in metres per pixel. */
export function mPerPixelAt(lat, zoom) {
  return 1 / pxPerMetreAt(lat, zoom);
}

// ---------------------------------------------------------------------------
// 2. How tall to draw a building
// ---------------------------------------------------------------------------

/**
 * Drawn height in metres.
 *
 * `heightMetres()` from isoart is the read order that matters and it is
 * imported rather than re-implemented: surveyed `heightM` first, then
 * `levels x STOREY_M`, then a two-storey default. Reading levels first is
 * precisely how a 381 m tower comes out as a generic twelve-storey block, and
 * `lots.js:136-157` is explicit that levels must not be derived from height in
 * the other direction either, because levels is what prices the building.
 *
 * Two adjustments on top, both inherited from isoart because both were
 * arrived at by looking at the result:
 *
 *   - the readability lift, a fixed few metres ADDED and decaying with height,
 *     so a six-metre rowhouse reads as a house while the Empire State stays
 *     the Empire State. `lift: false` turns it off, which is the only honest
 *     way to check it is not lying.
 *   - car parks are tarmac, not premises. A surveyed "height" on a car park is
 *     usually the barrier or a lighting column.
 */
export function massingHeightM(lot, { lift = true } = {}) {
  const real = heightMetres(lot);
  if (lot.kind === 'parking') return Math.max(3, real * 0.3);
  return lift ? liftedHeight(real) : real;
}

// ---------------------------------------------------------------------------
// 3. Precomputed geometry, one allocation per lot for the lot's whole life
// ---------------------------------------------------------------------------

/**
 * A footprint, ready to draw, in zoom-0 world pixels.
 *
 * MUST be Float64Array, not Float32Array. At z20 the Leaflet world is
 * 2.68e8 px wide and float32 carries about 1.7e7 of integer precision, so
 * world coordinates would quantise to roughly 16-pixel steps and every
 * building on screen would visibly snap to a grid. Float32 is fine for the
 * screen-space scratch below, where it saves nothing worth having.
 *
 * `heightM` is baked in here rather than read per frame because it is a
 * property of the building, not of the camera, and because `heightMetres()`
 * does string parsing that has no business in a redraw loop.
 */
export function prepareLot(lot, opts) {
  const ring = lot.polygon;
  if (!ring || ring.length < 3) return null;

  // Duplicate consecutive points are common in OSM (and the closing point of a
  // way repeats the first). A zero-length edge produces a zero-area wall quad
  // and a divide-by-zero in the normal, so they are dropped once, here, rather
  // than tested for on every frame forever.
  const xs = [];
  const ys = [];
  const p = { x: 0, y: 0 };
  for (let i = 0; i < ring.length; i++) {
    projectWorld(ring[i].lat, ring[i].lng, p);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const n = xs.length;
    if (n && Math.abs(xs[n - 1] - p.x) < 1e-12 && Math.abs(ys[n - 1] - p.y) < 1e-12) continue;
    xs.push(p.x);
    ys.push(p.y);
  }
  // ...including the wrap-around pair, which is the one everybody forgets.
  while (xs.length > 1
    && Math.abs(xs[0] - xs[xs.length - 1]) < 1e-12
    && Math.abs(ys[0] - ys[ys.length - 1]) < 1e-12) {
    xs.pop();
    ys.pop();
  }
  if (xs.length < 3) return null;

  const n = xs.length;
  const world = new Float64Array(n * 2);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    world[2 * i] = xs[i];
    world[2 * i + 1] = ys[i];
    cx += xs[i];
    cy += ys[i];
  }

  return {
    id: lot.id,
    lot,
    world,
    n,
    // Vertex-average, not the area centroid. It is the painter's-order sort key
    // and a cheap approximation is the right trade: an area centroid costs a
    // second pass for a difference that is a few pixels on a convex block.
    cx: cx / n,
    cy: cy / n,
    heightM: massingHeightM(lot, opts),
    kind: lot.kind,
  };
}

/**
 * Keep one prepared record per lot id, forever, and APPEND.
 *
 * `loadTiles` streams roughly 1200 lots at a time and a player panning at z17
 * keeps triggering sweeps. Rebuilding the whole table per arriving tile would
 * reproject tens of thousands of vertices for the sake of a few hundred new
 * ones; keying by `lot.id` makes an arriving tile cost only itself.
 */
export function prepareInto(table, lots, opts) {
  let added = 0;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (table.has(lot.id)) {
      // The lot object itself is replaced on reload/undo, and the layer reads
      // `owned`/`buildingId` off it for tinting, so keep the pointer fresh.
      table.get(lot.id).lot = lot;
      continue;
    }
    const prep = prepareLot(lot, opts);
    if (prep) { table.set(lot.id, prep); added++; }
  }
  return added;
}

// ---------------------------------------------------------------------------
// 4. The camera
// ---------------------------------------------------------------------------

/**
 * The camera model, and why it is not a camera.
 *
 * The ground plane is NOT ours to foreshorten. Leaflet draws the basemap flat
 * and north-up, and the Esri World Imagery that `attachImagery()` fades in
 * from z16.4 is orthorectified — straight down. So the model is: an
 * orthographic top-down ground plane, which is Leaflet's and which we do not
 * touch, plus a virtual pinhole above it that ONLY the vertical extrusion
 * sees. That is exactly how buildings lean in a real aerial photograph, which
 * is why the massing registers with the photography underneath instead of
 * sliding off it.
 *
 * The nadir `N` — the point on the ground directly under the virtual camera —
 * is placed BELOW the bottom of the viewport. If it sat inside the viewport,
 * the building under it would show no walls at all, which reads as a bug. With
 * N below, a building at the horizontal centre leans straight up and one at
 * the left edge leans up-and-left, and every building shows wall.
 *
 * ---------------------------------------------------------------------------
 * BOTH OF THOSE ARE MEASURED IN GROUND METRES, AND THE FIRST VERSION OF THIS
 * FILE MEASURED THEM IN VIEWPORT HEIGHTS. That was a real bug and it is worth
 * writing down, because the design note it came from has it too and anybody
 * re-deriving this from the note will reintroduce it.
 *
 * A viewport height in ground metres HALVES with every zoom step. So a camera
 * altitude of "2.4 viewport heights" is a camera that dives towards the ground
 * as you zoom in. Measured on the real sample:
 *
 *     z17  camera 2242 m   Empire State roof at screen y 105   (correct)
 *     z18  camera  961 m   roof at  -505                       (off the top)
 *     z19  camera  400 m   roof at -2689
 *     z20  camera  160 m   roof at -2865
 *
 * By z19 the virtual camera is INSIDE the Empire State Building. `m = A/(A-h)`
 * then runs to infinity, the `h <= 0.75A` clamp catches it and pins every tall
 * building at exactly `m = 4`, and the result is that centring on the tower at
 * z19 shows its bare photographed rooftop with the massing flung off the top
 * of the screen — and every building over ~120 m leaning by the identical
 * saturated amount.
 *
 * So both quantities are now in metres and neither depends on the viewport:
 *
 *   NADIR_OFFSET_M   how far SOUTH of the viewport centre N sits, in metres
 *   cameraAltitudeFor(zoom) -> metres above the ground
 *
 * Two consequences worth understanding before retuning them.
 *
 * FIRST, the floor on the altitude is not taste, it is a hard constraint.
 * `heightMetresOf` caps a surveyed height at 830 m, so the camera must stay
 * above 830 m or the singularity comes straight back. The floor is 1200 m,
 * which leaves `m` at most 1200/370 = 3.24 and means the 0.75 clamp below
 * never fires on real data — it is now a guard, not a mechanism.
 *
 * SECOND, easing the altitude with zoom is what makes the ladder work, and it
 * has to be done in metres to be meaningful. With a camera at a FIXED altitude
 * the lean-to-width ratio is constant at every zoom — which is correct physics
 * (perspective is a function of where the camera is, not of the focal length;
 * zooming a lens does not change how a building leans) and is not the look the
 * zoom ladder wants. Dropping the camera from 4000 m to 1200 m across z17-z20
 * is the flight, and the flight is what tilts the view in:
 *
 *   a 10 m rowhouse, lifted to 14 m, at the screen centre
 *     z17   2.3 px of lean on an  11 px footprint   (flat: a textured map)
 *     z18   6.0 px            on a  22 px footprint
 *     z19  17.3 px            on a  44 px footprint  (a model)
 *     z20  62.0 px            on an 88 px footprint  (a place)
 *
 *   the Empire State, 443 m surveyed, at z17: 82 px of lean. Drawn, on its
 *   own footprint, on screen — which is the whole point.
 */

/**
 * How far south of the viewport centre the nadir sits, in ground metres.
 *
 * Large enough that N is below the bottom of the viewport at z17 on a phone
 * (600 m x 1.09 px/m = 656 px below centre, against a 422 px half-screen), and
 * it only moves further down as you zoom in. Raising it makes every building
 * lean more and makes the leans more parallel; lowering it eventually puts N
 * on screen, where the building beneath it loses its walls.
 */
export const NADIR_OFFSET_M = 600;

/** Retired: the old viewport-relative nadir. Kept exported so that anything
 *  still importing it links rather than failing at module load. Do not use. */
export const NADIR_BIAS = 0.85;

export const CAM_ALT_HIGH_M = 4000;   // at z17 and below
export const CAM_ALT_LOW_M = 1200;    // at z20 and above; must exceed the 830 m cap

/** The camera's altitude above the ground, in METRES, at a given zoom. */
export function cameraAltitudeFor(zoom) {
  const t = (zoom - 17) / 3;
  const k = t < 0 ? 0 : (t > 1 ? 1 : t);
  return CAM_ALT_HIGH_M + (CAM_ALT_LOW_M - CAM_ALT_HIGH_M) * k;
}

/**
 * Build the per-redraw camera record.
 *
 * `offX`/`offY` fold three things into one subtraction: the zoom scale factor
 * applied to the zoom-0 world coordinate, Leaflet's pixel origin, and where
 * the canvas element itself sits inside the map pane. Per vertex that leaves
 * one multiply and one subtract per axis, no trig and no allocation, which is
 * the entire reason the geometry was precomputed at zoom 0.
 *
 *   screenX = world[2i]   * scale - offX
 *   screenY = world[2i+1] * scale - offY
 */
export function makeCamera({
  zoom, centreLat, width, height,
  pixelOriginX = 0, pixelOriginY = 0, canvasOriginX = 0, canvasOriginY = 0,
  // Both in GROUND METRES. `camAlt` used to mean viewport heights; if you are
  // updating a caller, 2.4 does not mean "a bit flatter" any more, it means a
  // camera 2.4 metres off the pavement.
  nadirOffsetM = NADIR_OFFSET_M, camAlt = null, lift = true,
}) {
  // 2^zoom, NOT 256 * 2^zoom, and the difference is a 256x error that puts
  // every building somewhere off the coast. Leaflet has two "scales" and they
  // are easy to mix up: `crs.scale(z)` is 256 * 2^z, the width of the whole
  // world in pixels at that zoom, and it is what `pxPerMetreAt` wants. But
  // `projectWorld` already returns coordinates in that 256-pixel zoom-0 world,
  // and `project(ll, z) === project(ll, 0) * 2^z`, so the multiplier here is
  // the bare power of two. The headless check catches this by asserting a
  // known point lands where Leaflet would put it.
  const scale = Math.pow(2, zoom);
  // Never let a caller put the camera inside the building stock, whatever it
  // passes. 830 m is the cap `heightMetresOf` applies to a surveyed height, so
  // anything at or below that is a singularity waiting for the one tower that
  // reaches it.
  const wanted = camAlt == null ? cameraAltitudeFor(zoom) : camAlt;
  const camAltM = Math.max(900, wanted);
  const pxPerMetre = pxPerMetreAt(centreLat, zoom);
  return {
    zoom,
    scale,
    offX: pixelOriginX + canvasOriginX,
    offY: pixelOriginY + canvasOriginY,
    pxPerMetre,
    width,
    height,
    nadirX: width / 2,
    // Anchored to the viewport CENTRE — which is the map centre, a real point
    // on the ground — and pushed south by a fixed number of metres. Anchoring
    // it to the bottom EDGE, as the first version did, ties the geometry to
    // the window size: the same city on a tablet would lean differently from
    // the same city on a phone, and resizing the window would change the
    // projection rather than just showing more of it.
    nadirY: height / 2 + nadirOffsetM * pxPerMetre,
    camAltM,
    nadirOffsetM,
    // Kept for the shadow maths and for anything that wants the altitude in
    // the same units as the screen. The magnification itself is computed in
    // metres, where it is exactly zoom-invariant.
    camAltPx: camAltM * pxPerMetre,
    lift,
  };
}

// ---------------------------------------------------------------------------
// 5. The sun
// ---------------------------------------------------------------------------

/**
 * Where the sun is, from an in-game hour.
 *
 * Kept as a parameter rather than a constant so the game clock can drive it:
 * `src/game/rhythm.js` already owns `darkness` and the in-game hour, and the
 * intended wiring is `sunFromHour(state.minutes / 60)` once per redraw.
 *
 * A crude solar model on purpose — an equinox day at a mid latitude, sun in
 * the east at 06:00, due south at 12:00, west at 18:00. A real solar position
 * needs the date and the latitude and would move the shadows by a few degrees
 * for something nobody is checking against an almanac. What matters for the
 * look is that morning and evening light comes from opposite sides and rakes
 * low, and that at night there is no sun at all.
 *
 *   azimuth   compass bearing of the sun, degrees clockwise from north
 *   altitude  degrees above the horizon; negative means it is down
 */
export function sunFromHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  // Noon at 12, one full sweep east-to-west across the daylight hours.
  const t = (h - 6) / 12;              // 0 at sunrise, 1 at sunset
  const azimuth = 90 + t * 180;        // 90 (E) -> 180 (S) -> 270 (W)
  const altitude = Math.sin(t * Math.PI) * 58;
  return { azimuth, altitude, up: altitude > 0 };
}

/**
 * The sun as screen-space vectors, precomputed once per redraw.
 *
 * Screen x runs east, screen y runs SOUTH (down the page), because that is
 * what Leaflet hands us and inverting it here is how the shadows end up on the
 * wrong side of every building.
 */
export function sunVectors(sun) {
  const az = sun.azimuth * DEG;
  const alt = sun.altitude * DEG;
  const cosAlt = Math.cos(alt);
  const sinAlt = Math.sin(alt);
  return {
    // Horizontal unit vector pointing TOWARD the sun.
    tx: Math.sin(az),
    ty: -Math.cos(az),
    cosAlt,
    sinAlt,
    up: sun.altitude > 0,
    // How far a shadow runs per metre of height. Clamped: at sunrise the true
    // answer is several kilometres, which is not a shadow, it is a stripe
    // across the borough.
    shadowPerPx: sun.altitude > 3 ? Math.min(3.2, cosAlt / sinAlt) : 0,
  };
}

// ---------------------------------------------------------------------------
// 6. Scratch — the only memory this renderer uses per frame
// ---------------------------------------------------------------------------

/**
 * Reusable buffers, grown to the largest ring ever seen and never shrunk.
 *
 * The thing that kills a canvas renderer on a phone is not fill rate, it is
 * the garbage collector: 1700 buildings x ~9 vertices x an `{x, y}` object per
 * projected point is 15000 objects per redraw, and the resulting GC pauses
 * present as exactly the stutter people complain about. So: no objects, no
 * arrays, no template literals inside a redraw. One `Scratch` per layer, held
 * for the life of the layer.
 *
 * Float64, not Float32, and it is worth saying why the obvious saving is not
 * taken. The world coordinates in `prepareLot` MUST be Float64 — at z20 the
 * Leaflet world is 2.68e8 px wide and float32 carries about 1.7e7 of integer
 * precision, so every building would visibly snap to a 16-pixel grid. The
 * screen-space scratch is a different argument: screen coordinates are small,
 * so float32 is accurate to about 1e-4 px there and nobody could see the
 * difference. It is still float64, for two reasons. The buffers are 64 to 1024
 * elements and live in L1 for the whole redraw, so the halved bandwidth buys
 * nothing measurable (checked: the 1700-building redraw time did not move).
 * And float32 puts a precision CLIFF in the middle of the module — a camera
 * built with a zero pixel origin, which is exactly what a test or a headless
 * caller will hand it, produces coordinates near 4e7 where float32 quantises
 * to steps of 4. That turns an exact similarity transform into a visibly
 * asymmetric one and costs more in confusion than the bytes are worth.
 */
export function makeScratch(capacity = 64) {
  return {
    gx: new Float64Array(capacity),
    gy: new Float64Array(capacity),
    rx: new Float64Array(capacity),
    ry: new Float64Array(capacity),
    vis: new Uint8Array(capacity),
    cap: capacity,
    // Draw order, as indices into the prepared array. An Int32Array sorted by
    // a key array beats sorting an array of objects by a comparator, but
    // TypedArray.sort() cannot take a comparator that reads a second array, so
    // this is a plain Array of ints reused in place — still zero allocation
    // after the first few frames, since Array keeps its backing store.
    order: [],
    key: new Float64Array(2048),
  };
}

function growScratch(s, need) {
  if (need <= s.cap) return;
  let cap = s.cap;
  while (cap < need) cap *= 2;
  s.gx = new Float64Array(cap);
  s.gy = new Float64Array(cap);
  s.rx = new Float64Array(cap);
  s.ry = new Float64Array(cap);
  s.vis = new Uint8Array(cap);
  s.cap = cap;
}

// ---------------------------------------------------------------------------
// 7. Cull and sort
// ---------------------------------------------------------------------------

/**
 * Which buildings are worth drawing, furthest from the camera first.
 *
 * Two separate jobs, done in one pass because they share the same projection
 * of the centroid.
 *
 * CULL. A building whose footprint is off screen still has to be tested, but a
 * test is a handful of arithmetic and a fill is a scan conversion, so the
 * ratio is worth it every time. The cull box is asymmetric and that is not a
 * detail: the lean draws a roof far ABOVE its footprint, so a tower standing
 * one viewport BELOW the screen can still have its roof on screen. The box
 * therefore extends downward in screen y by a whole extra viewport height,
 * and only by a modest pad in the other three directions. Getting this
 * backwards makes tall buildings pop in late and visibly, which is the exact
 * artifact that reads as "the 3D is broken".
 *
 * Also: the box is in CSS pixels, not device pixels. `prototype/iso.html:126`
 * already records this bug once — culling against `canvas.width` on a retina
 * screen makes the box twice too wide and costs fill time for faces nobody can
 * see. Paid for once; not paying again.
 *
 * SORT. The camera is above the nadir N, so a building nearer N is nearer the
 * camera and occludes one further out. Draw furthest first. Squared distance,
 * no sqrt. Because N sits ~1.85 viewport-heights below the screen, the y term
 * dominates and this degenerates almost exactly into "top of the screen
 * first" — the classic back-to-front order for a north-up oblique view, but
 * derived rather than guessed, so it stays correct if `nadirBias` is retuned.
 *
 * Known limit, stated rather than hidden: centroid order is exact for convex,
 * similarly-sized, non-interpenetrating masses. A long building whose far end
 * sits behind a short one its centroid is in front of will overlap wrongly, as
 * will a courtyard building enclosing another. Each is one wrong region and
 * neither is worth a depth buffer here.
 */
/**
 * Sort `a[0..n)` so that `key[a[i]]` runs from largest to smallest, in place
 * and without allocating a byte.
 *
 * An introsort-shaped quicksort: median-of-three pivot, recurse into the
 * smaller side and loop on the larger so the call depth stays O(log n), and
 * hand anything under sixteen elements to insertion sort, which beats
 * quicksort at that size and is what makes the whole thing fast rather than
 * merely tidy.
 *
 * There is no comparator parameter. A comparator is a closure, a closure over
 * `key` is an allocation, and the entire point of this function is that it
 * makes none.
 */
export function sortByKeyDesc(a, n, key) {
  let lo = 0;
  let hi = n - 1;
  // An explicit stack of pending ranges, sized for the worst case of the
  // recurse-into-smaller-half rule: 2 * log2(2^31) is comfortably under 64.
  const stack = SORT_STACK;
  let sp = 0;
  for (;;) {
    if (hi - lo < 16) {
      for (let i = lo + 1; i <= hi; i++) {
        const v = a[i];
        const kv = key[v];
        let j = i - 1;
        while (j >= lo && key[a[j]] < kv) { a[j + 1] = a[j]; j--; }
        a[j + 1] = v;
      }
      if (sp === 0) return a;
      hi = stack[--sp];
      lo = stack[--sp];
      continue;
    }
    // Median of three, moved to lo+1, which also sentinels both ends.
    const mid = (lo + hi) >> 1;
    if (key[a[mid]] > key[a[lo]]) { const t = a[mid]; a[mid] = a[lo]; a[lo] = t; }
    if (key[a[lo]] < key[a[hi]]) { const t = a[lo]; a[lo] = a[hi]; a[hi] = t; }
    if (key[a[mid]] > key[a[lo]]) { const t = a[mid]; a[mid] = a[lo]; a[lo] = t; }
    const pivot = key[a[lo]];
    let i = lo;
    let j = hi + 1;
    for (;;) {
      do { i++; } while (i <= hi && key[a[i]] > pivot);
      do { j--; } while (key[a[j]] < pivot);
      if (i >= j) break;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    const t = a[lo]; a[lo] = a[j]; a[j] = t;
    // Push the larger half, loop on the smaller.
    if (j - lo > hi - j) {
      stack[sp++] = lo; stack[sp++] = j - 1;
      lo = j + 1;
    } else {
      stack[sp++] = j + 1; stack[sp++] = hi;
      hi = j - 1;
    }
  }
}
// Module-level and reused: one 64-slot stack for the life of the page, shared
// because the sort is never re-entered (it calls nothing).
const SORT_STACK = new Int32Array(64);

export function orderVisible(prepared, cam, scratch, { pad = 64 } = {}) {
  const order = scratch.order;
  order.length = 0;
  if (scratch.key.length < prepared.length) {
    scratch.key = new Float64Array(Math.max(prepared.length, scratch.key.length * 2));
  }
  const key = scratch.key;

  const s = cam.scale;
  const ox = cam.offX;
  const oy = cam.offY;
  const nx = cam.nadirX;
  const ny = cam.nadirY;
  // Downward pad: one viewport plus the pad. Upward: just the pad, because
  // nothing leans downward.
  const top = -pad;
  const bottom = cam.height + pad + cam.height;
  const left = -pad;
  const right = cam.width + pad;

  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    const cx = p.cx * s - ox;
    const cy = p.cy * s - oy;
    // A footprint's own extent, generously: a building whose centroid is just
    // off screen can still have half of itself on it. `heightM * pxPerMetre`
    // covers the lean.
    const slack = 48 + p.heightM * cam.pxPerMetre;
    if (cx < left - slack || cx > right + slack) continue;
    if (cy < top - slack || cy > bottom + slack) continue;
    const dx = cx - nx;
    const dy = cy - ny;
    key[i] = dx * dx + dy * dy;
    order.push(i);
  }
  // Furthest first — and sorted by hand, because `Array.prototype.sort` with a
  // comparator is the single largest allocation in this renderer.
  //
  // Measured, not assumed: before this change a 1700-building redraw grew the
  // JS heap by 13981 bytes, of which ~600 was the per-redraw camera and sun
  // records and the rest was 7.9 bytes per building — a 1700-element temporary
  // that V8's sort allocates to hold the run it is merging. Afterwards the
  // same redraw is flat. It never mattered for smoothness, because the layer
  // redraws once per gesture and not once per frame; it mattered because the
  // budget says zero and a number that is nearly zero invites the next person
  // to add "just a small array" to a hot path.
  sortByKeyDesc(order, order.length, key);
  return order;
}

// ---------------------------------------------------------------------------
// 8. One building: project, lift, cull its back faces
// ---------------------------------------------------------------------------

/**
 * Project one footprint to the screen, twice: once on the ground and once at
 * roof height, and mark which walls face the camera.
 *
 * THE ROOF IS THE FOOTPRINT, SCALED ABOUT THE NADIR. That is the whole
 * projection, and it falls straight out of the pinhole:
 *
 *   m = A / (A - h)                  magnification of a point h above ground
 *   R = N + (P - N) * m
 *
 * A pure similarity transform, no shear, which is exactly why roofs stay the
 * right shape and why a rectangle on the ground is still a rectangle on top.
 * Two multiplies and two adds per vertex on top of the world-to-screen
 * transform. `m` is clamped by capping `h` at three quarters of the camera
 * altitude, because as h approaches A the magnification runs to infinity and a
 * 443 m tower at z20 would otherwise reach the moon.
 *
 * BACK-FACE CULL. OSM ways come wound both ways round — `isoart.js:172-180`
 * records exactly this bug, where testing screen-space x instead of the
 * winding kept the wrong half of the walls on every clockwise footprint and
 * buildings had faces standing up behind their own roofs. So the winding is
 * measured from the signed area in screen space, and an edge's wall is visible
 * iff its outward normal points AWAY from the nadir — the facade on the far
 * side from N is the one the camera can see past the roof. A 40-node footprint
 * emits about 20 walls instead of 40.
 *
 * Returns the number of vertices, or 0 if there is nothing to draw.
 */
export function projectBuilding(prep, cam, scratch) {
  const n = prep.n;
  growScratch(scratch, n);
  const { gx, gy, rx, ry, vis } = scratch;
  const w = prep.world;
  const s = cam.scale;
  const ox = cam.offX;
  const oy = cam.offY;

  for (let i = 0; i < n; i++) {
    gx[i] = w[2 * i] * s - ox;
    gy[i] = w[2 * i + 1] * s - oy;
  }

  // The magnification, computed entirely in METRES.
  //
  // Doing it in metres is what makes it zoom-invariant: a 40 m block has the
  // same `m` at z17 and at z20, and only the pixel distance from the nadir
  // grows, so the lean scales with the building rather than exploding. Doing
  // it in pixels — dividing a pixel height by a pixel altitude that was
  // derived from the viewport — is the bug documented at `cameraAltitudeFor`.
  const A = cam.camAltM;
  let hM = prep.heightM;
  // A guard, not a mechanism: with the 900 m floor on the camera and the 830 m
  // cap on a surveyed height this cannot fire on real data. It is here for the
  // caller who passes a hand-made lot with a height of 10 km.
  const capM = A * 0.75;
  if (hM > capM) hM = capM;
  if (!(hM > 0)) hM = 0;
  const m = A / (A - hM);
  const hPx = hM * cam.pxPerMetre;
  const nx = cam.nadirX;
  const ny = cam.nadirY;
  for (let i = 0; i < n; i++) {
    rx[i] = nx + (gx[i] - nx) * m;
    ry[i] = ny + (gy[i] - ny) * m;
  }

  // Winding, from the signed area of the GROUND ring in screen space.
  let a2 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a2 += gx[j] * gy[i] - gx[i] * gy[j];
  }
  const wind = a2 > 0 ? 1 : -1;

  // Below three pixels of wall a building is a flat roof and the wall quads
  // are invisible paths that still cost a scan conversion each.
  //
  // Worth being honest about how rarely this fires, because an earlier comment
  // here claimed it saved most of the work at z17 and that is simply false.
  // `hPx` is the building's HEIGHT in pixels, not its lean, and at z17
  // (~0.9 m/px at mid latitudes) three pixels is 2.7 metres — shorter than a
  // single storey. Nothing with a roof on it is below that. Over the 400
  // midtown footprints in `prototype/sample/midtown.json` the count below the
  // threshold at z17 is zero. It earns its place only well below z17, where
  // the layer is switched off anyway, and as a guard against a garbage height.
  // The real saving at z17 is the back-face cull below and the AABB cull in
  // `orderVisible`, not this.
  const drawWalls = hPx >= 3;
  let visible = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (!drawWalls) { vis[j] = 0; continue; }
    const ex = gx[i] - gx[j];
    const ey = gy[i] - gy[j];
    // Outward normal in screen space, sign fixed by the measured winding.
    const onx = wind * ey;
    const ony = wind * -ex;
    // Midpoint of the edge, relative to the nadir.
    const mx = (gx[i] + gx[j]) * 0.5 - nx;
    const my = (gy[i] + gy[j]) * 0.5 - ny;
    const facing = onx * mx + ony * my > 0 ? 1 : 0;
    vis[j] = facing;
    visible += facing;
  }

  scratch.hPx = hPx;
  scratch.wind = wind;
  scratch.visibleWalls = visible;
  return n;
}

// ---------------------------------------------------------------------------
// 9. Paint
// ---------------------------------------------------------------------------

/**
 * Colour strings, interned.
 *
 * Never `ctx.globalAlpha` per face: it forces a separate compositing pass per
 * fill. Alpha is baked into an `rgba()` string instead, and the string is
 * built once and cached, because building it is a template literal in the hot
 * loop and 8500 of those per redraw is real time.
 *
 * Two levels, and the second level is an array, not a string key.
 *
 * The obvious one-level `Map` keyed on `hex + q` looks like a cache and is not
 * one: `hex + q` builds a fresh string on EVERY call, hit or miss, and this is
 * called once per visible wall — 7299 times in a 1700-building redraw. A Map
 * keyed on the hex string alone is looked up by reference, and the quantised
 * shade indexes a plain array inside it, so a cache hit allocates nothing at
 * all.
 */
const SHADE_CACHE = new Map();
const SHADE_STEPS = 24;

export function shade(hex, k) {
  // Quantised to 24 steps: a shade cache with continuous keys is not a cache.
  const q = k <= 0 ? 0 : (k >= 1 ? SHADE_STEPS - 1
    : Math.round(k * (SHADE_STEPS - 1)));
  let row = SHADE_CACHE.get(hex);
  if (row === undefined) {
    row = new Array(SHADE_STEPS).fill(null);
    SHADE_CACHE.set(hex, row);
  }
  const hit = row[q];
  if (hit !== null) return hit;
  const v = parseInt(hex.slice(1), 16);
  const f = q / (SHADE_STEPS - 1) * 1.45;
  const r = Math.min(255, Math.round(((v >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((v >> 8) & 255) * f));
  const b = Math.min(255, Math.round((v & 255) * f));
  const out = `rgb(${r},${g},${b})`;
  row[q] = out;
  return out;
}


// --- Telling one building from the next ------------------------------------

/**
 * A palette is chosen by KIND, and a city is mostly two or three kinds. Drawn
 * straight, every commercial block downtown is the identical blue-grey as the
 * one touching it, and the eye reads the whole thing as one blue mass rather
 * than as buildings — which is exactly the complaint this exists to answer.
 *
 * Real terraces vary: same brick, different weathering, different decade of
 * repainting. So each building deflects its own palette by a fixed amount
 * derived from its OSM id — stable across redraws, across sessions and across
 * machines, because it is a property of the building and not of the draw.
 *
 * Bucketed rather than continuous, and cached, so this costs a Map lookup per
 * building per redraw and allocates nothing after the first sighting of each
 * bucket. VARIANTS * kinds is about a hundred palettes, once, forever.
 */
const VARIANTS = 11;
const VARIANT_CACHE = new Map();

function jitterHex(hex, light, warm) {
  const v = parseInt(hex.slice(1), 16);
  let r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  r = Math.round(r * light * (1 + warm));
  g = Math.round(g * light);
  b = Math.round(b * light * (1 - warm));
  r = r < 0 ? 0 : (r > 255 ? 255 : r);
  g = g < 0 ? 0 : (g > 255 ? 255 : g);
  b = b < 0 ? 0 : (b > 255 ? 255 : b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** A stable small integer for a building, from whatever identity it has. */
export function variantOf(prep) {
  const raw = prep && prep.lot && prep.lot.osmId != null ? prep.lot.osmId : (prep && prep.id);
  let h = 2166136261;
  const str = String(raw == null ? '0' : raw);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % VARIANTS;
}

export function variedPalette(kind, variant) {
  const key = kind + '|' + variant;
  const hit = VARIANT_CACHE.get(key);
  if (hit) return hit;
  const base = paletteFor(kind);
  // Spread across the bucket range: lightness +/-14%, and a small warm/cool
  // push so it is not merely the same colour turned up and down.
  const t = VARIANTS === 1 ? 0.5 : variant / (VARIANTS - 1);
  const light = 0.86 + 0.28 * t;
  const warm = -0.05 + 0.10 * (((variant * 7) % VARIANTS) / (VARIANTS - 1));
  const pal = {
    roof: jitterHex(base.roof, light, warm),
    a: jitterHex(base.a, light, warm),
    b: jitterHex(base.b, light, warm),
    trim: base.trim,
  };
  VARIANT_CACHE.set(key, pal);
  return pal;
}

const ALPHA_CACHE = new Map();
function rgba(r, g, b, a) {
  const q = Math.round(a * 20);
  const cacheKey = (r << 24) | (g << 16) | (b << 8) | q;
  let out = ALPHA_CACHE.get(cacheKey);
  if (!out) {
    out = `rgba(${r},${g},${b},${(q / 20).toFixed(2)})`;
    ALPHA_CACHE.set(cacheKey, out);
  }
  return out;
}

/**
 * Draw one prepared, projected building.
 *
 * Takes a context rather than being one, so a recording fake can stand in for
 * `CanvasRenderingContext2D` and the whole paint path is assertable under
 * `jsc`. That is the single most valuable property of `isoart.js` and it is
 * kept here.
 *
 * Walls first, then the roof. A prism's roof is never occluded by its own
 * walls, and the walls never occlude each other because they have been culled
 * to a single outward-facing set — so no per-face sort is needed inside a
 * building, only between them. That is a 5x smaller sort than `sceneFaces()`
 * does (1700 buildings rather than 8500 faces) and it removes the intermediate
 * face-object array entirely.
 *
 * Concave footprints need no tessellation: `ctx.fill()` is a nonzero-winding
 * scan conversion, so a U-shaped block or a courtyard fills correctly for
 * free. This is the main reason the design rejected WebGL, which would need a
 * hand-written ear-clipper for the same result.
 */
export function paintBuilding(ctx, prep, cam, scratch, pal, sunv) {
  const n = prep.n;
  const { gx, gy, rx, ry, vis } = scratch;
  const hPx = scratch.hPx;

  if (hPx >= 3) {
    for (let j = 0, i = 1; j < n; j++, i = (j + 1) % n) {
      if (!vis[j]) continue;
      // Lambert on a vertical facade. The 0.55 floor is ambient: a wall facing
      // away from the sun is in shade, not in the void, and letting it go to
      // black makes a box read as a hole.
      let k = 0.62;
      if (sunv && sunv.up) {
        const ex = gx[i] - gx[j];
        const ey = gy[i] - gy[j];
        const len = Math.hypot(ex, ey) || 1;
        const onx = scratch.wind * ey / len;
        const ony = scratch.wind * -ex / len;
        const lambert = (onx * sunv.tx + ony * sunv.ty) * sunv.cosAlt;
        k = 0.5 + 0.5 * (lambert > 0 ? lambert : 0);
      }
      ctx.beginPath();
      ctx.moveTo(gx[j], gy[j]);
      ctx.lineTo(gx[i], gy[i]);
      ctx.lineTo(rx[i], ry[i]);
      ctx.lineTo(rx[j], ry[j]);
      ctx.closePath();
      ctx.fillStyle = shade(pal.a, k);
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.moveTo(rx[0], ry[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(rx[i], ry[i]);
  ctx.closePath();
  // A roof is horizontal, so its shade is the sun's altitude and nothing else.
  ctx.fillStyle = shade(pal.roof, sunv && sunv.up ? 0.62 + 0.38 * sunv.sinAlt : 0.5);
  ctx.fill();
  // The trim stroke is what separates two adjacent roofs of the same colour,
  // and terraced housing is nothing but adjacent roofs of the same colour.
  if (cam.pxPerMetre > 1.4) {
    ctx.strokeStyle = pal.trim;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/**
 * The ground shadow: the roof ring, slid away from the sun.
 *
 * Drawn from the ROOF ring rather than the footprint because the roof is what
 * blocks the light, and because it already exists in the scratch. Filled flat
 * black at low alpha rather than composited, for the reason in `shade` above.
 * Off at night, off when the sun is low enough that the shadow would be a
 * stripe across the neighbourhood, and off below z18 where 1700 extra fills
 * buy nothing you can see.
 */
export function paintShadow(ctx, prep, cam, scratch, sunv) {
  if (!sunv || !sunv.up || sunv.shadowPerPx <= 0) return;
  const hPx = scratch.hPx;
  if (hPx < 6) return;
  const n = prep.n;
  const { gx, gy } = scratch;
  const run = hPx * sunv.shadowPerPx;
  const dx = -sunv.tx * run;
  const dy = -sunv.ty * run;
  ctx.beginPath();
  ctx.moveTo(gx[0] + dx, gy[0] + dy);
  for (let i = 1; i < n; i++) ctx.lineTo(gx[i] + dx, gy[i] + dy);
  // Close it back through the footprint so the shadow joins the building
  // rather than floating detached a hundred pixels away.
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(gx[i], gy[i]);
  ctx.closePath();
  ctx.fillStyle = rgba(0, 0, 0, 0.34);
  ctx.fill('nonzero');
}

/**
 * Draw the whole scene.
 *
 * The one entry point the layer and the prototype both call, and the one the
 * performance numbers are measured around. Returns how many buildings it drew,
 * which is the only honest denominator for a millisecond figure.
 */
export function drawScene(ctx, prepared, cam, scratch, {
  sun = null, shadows = false, tintOf = null, pad = 64,
} = {}) {
  const sunv = sun ? sunVectors(sun) : null;
  const order = orderVisible(prepared, cam, scratch, { pad });

  if (shadows && sunv && sunv.up) {
    // A separate pass, deliberately. Shadows must all go under all buildings;
    // interleaving them means a near building's shadow lands on top of a far
    // building's wall, which is the wrong way round and very visible.
    for (let k = 0; k < order.length; k++) {
      const prep = prepared[order[k]];
      projectBuilding(prep, cam, scratch);
      paintShadow(ctx, prep, cam, scratch, sunv);
    }
  }

  for (let k = 0; k < order.length; k++) {
    const prep = prepared[order[k]];
    projectBuilding(prep, cam, scratch);
    const pal = tintOf ? tintOf(prep.lot) : variedPalette(prep.kind, variantOf(prep));
    paintBuilding(ctx, prep, cam, scratch, pal, sunv);
  }
  return order.length;
}

/**
 * Which building is under a screen point.
 *
 * Tested against ROOF polygons only, nearest to the camera first — a wall
 * belongs to the building whose roof is above it, and the roof is what a
 * finger is aimed at. Walking the painter order backwards gives nearest-first
 * for free.
 *
 * `tolerance` exists because `mapView.js:57` sets `L.canvas({tolerance: 8})`
 * for the stated reason that "a fingertip lands several pixels off what it
 * aimed at". A hand-rolled hit test has no tolerance unless somebody writes
 * one, so it is written: the point is tested, and then four points a tolerance
 * away, which is cheap and catches the near-miss on a small building.
 */
export function pickAt(px, py, prepared, cam, scratch, { tolerance = 8, pad = 64 } = {}) {
  const order = orderVisible(prepared, cam, scratch, { pad });
  for (let k = order.length - 1; k >= 0; k--) {
    const prep = prepared[order[k]];
    projectBuilding(prep, cam, scratch);
    if (insideRing(px, py, scratch.rx, scratch.ry, prep.n)) return prep.lot;
  }
  if (tolerance > 0) {
    for (let k = order.length - 1; k >= 0; k--) {
      const prep = prepared[order[k]];
      projectBuilding(prep, cam, scratch);
      if (insideRing(px - tolerance, py, scratch.rx, scratch.ry, prep.n)
        || insideRing(px + tolerance, py, scratch.rx, scratch.ry, prep.n)
        || insideRing(px, py - tolerance, scratch.rx, scratch.ry, prep.n)
        || insideRing(px, py + tolerance, scratch.rx, scratch.ry, prep.n)) return prep.lot;
    }
  }
  return null;
}

export function insideRing(x, y, xs, ys, n) {
  let hit = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if ((ys[i] > y) !== (ys[j] > y)
      && x < ((xs[j] - xs[i]) * (y - ys[i])) / (ys[j] - ys[i]) + xs[i]) hit = !hit;
  }
  return hit;
}

// ---------------------------------------------------------------------------
// 10. The Leaflet layer
// ---------------------------------------------------------------------------

/**
 * Extruded massing as a map layer, shaped like the layers in `entities.js`:
 * `new Buildings3DLayer(map, opts)` then `sync(state)` on every state change,
 * the same house pattern as `LotLayer` and `CourierLayer`.
 *
 * OFF BY DEFAULT. `enabled` must be passed true, or set later with
 * `setEnabled(true)`. Nothing is created, no pane, no canvas, no listener,
 * until it is switched on, so wiring it into `main.js` costs a disabled
 * instance and no pixels.
 *
 * Three things about the event wiring matter more than the drawing:
 *
 *  - It listens on `moveend`/`zoomend` ONLY. Never `move`, never `zoom`. A map
 *    is not a game loop; as `prototype/iso.html:88` puts it, it "needs to be
 *    right when it stops moving". One 20 ms hitch at the end of a pan is
 *    invisible; 20 ms every frame during one is the whole problem.
 *  - It lives in its own pane, so Leaflet's pane transform pans the finished
 *    bitmap for free between redraws, exactly as `L.Canvas` does.
 *  - During the zoom animation it rides `L.DomUtil.setTransform` on the
 *    container, so the existing bitmap scales through the animation and is
 *    redrawn once when it lands.
 */
export class Buildings3DLayer {
  constructor(map, {
    enabled = false,
    minZoom = 17,
    shadowMinZoom = 18,
    paneZ = 260,
    sun = null,
    lift = true,
    // null means "ease it with zoom" (§ cameraAltitudeFor). A number pins it,
    // which is what the prototype's slider does while the look is being found.
    camAlt = null,
    tintOf = null,
    onSelect = null,
    onStats = null,
  } = {}) {
    this.map = map;
    this.enabled = false;
    this.minZoom = minZoom;
    this.shadowMinZoom = shadowMinZoom;
    this.paneZ = paneZ;
    this.sun = sun;
    this.lift = lift;
    this.camAlt = camAlt;
    this.tintOf = tintOf;
    this.onSelect = onSelect;
    this.onStats = onStats;

    this.table = new Map();
    this.prepared = [];
    this.scratch = makeScratch();
    this.canvas = null;
    this.ctx = null;
    this.pane = null;
    this._bound = null;
    this._pendingFrame = 0;
    this.lastMs = 0;
    this.lastCount = 0;

    if (enabled) this.setEnabled(true);
  }

  /** The switch. Everything DOM-shaped happens on the first `true`. */
  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this._attach();
      this.redraw();
    } else if (this.canvas) {
      this.canvas.style.display = 'none';
    }
  }

  _attach() {
    if (this.canvas) { this.canvas.style.display = ''; return; }
    const map = this.map;
    // Above the imagery pane (250, see `mapView.js:attachImagery`) and below
    // the overlay pane (400), so the massing sits on the photography and the
    // game's own vectors and markers sit on the massing.
    const pane = map.getPane('buildings3d') || map.createPane('buildings3d');
    pane.style.zIndex = String(this.paneZ);
    // Clicks belong to LotLayer until picking is deliberately handed over.
    pane.style.pointerEvents = this.onSelect ? 'auto' : 'none';
    this.pane = pane;

    const canvas = document.createElement('canvas');
    canvas.className = 'leaflet-zoom-animated';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    pane.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    const onEnd = () => this.redraw();
    const onAnim = (e) => this._animateZoom(e);
    this._bound = { onEnd, onAnim };
    map.on('moveend zoomend resize', onEnd);
    map.on('zoomanim', onAnim);
    if (this.onSelect) {
      canvas.addEventListener('click', (ev) => {
        const rect = canvas.getBoundingClientRect();
        const lot = this.pick(ev.clientX - rect.left, ev.clientY - rect.top);
        if (lot) this.onSelect(lot);
      });
    }
  }

  /** Let go of the pane, the canvas and every listener. */
  destroy() {
    if (this._bound) {
      this.map.off('moveend zoomend resize', this._bound.onEnd);
      this.map.off('zoomanim', this._bound.onAnim);
      this._bound = null;
    }
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
    this.enabled = false;
  }

  /**
   * The house pattern: hand it the whole state and let the layer work out what
   * changed. Appends new lots to the prepared table rather than rebuilding it,
   * because `loadTiles` streams ~1200 at a time and a rebuild per tile would
   * reproject the entire city for the sake of one corner of it.
   */
  sync(state) {
    if (!state || !state.lots) return;
    const added = prepareInto(this.table, state.lots, { lift: this.lift });
    if (added) this.prepared = [...this.table.values()];
    if (this.enabled) this._schedule();
  }

  setSun(sun) {
    this.sun = sun;
    if (this.enabled) this._schedule();
  }

  /**
   * Coalesce to one redraw per frame.
   *
   * `sync` is called from a dozen places and a tile sweep can call it several
   * times in a row; without this a single Overpass response would redraw the
   * whole viewport four times before a pixel reached the screen.
   */
  _schedule() {
    if (this._pendingFrame) return;
    this._pendingFrame = requestAnimationFrame(() => {
      this._pendingFrame = 0;
      this.redraw();
    });
  }

  /** Size the backing store, and place the canvas inside the map pane. */
  _resize() {
    const map = this.map;
    const size = map.getSize();
    // Capped at 2. A 3x phone triples the backing store for no visible gain.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(size.x * dpr);
    const h = Math.round(size.y * dpr);
    const canvas = this.canvas;
    if (canvas.width !== w || canvas.height !== h) {
      // Assigning width CLEARS the bitmap and resets the transform, so this is
      // only ever followed by a full redraw, never a partial one.
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = size.x + 'px';
      canvas.style.height = size.y + 'px';
    }
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);
    return { size, dpr, topLeft };
  }

  /** Leaflet's zoom animation: scale the bitmap we already have, then redraw. */
  _animateZoom(e) {
    if (!this.canvas) return;
    const map = this.map;
    const scale = map.getZoomScale(e.zoom, map.getZoom());
    const offset = map._latLngToNewLayerPoint(
      map.getBounds().getNorthWest(), e.zoom, e.center
    );
    L.DomUtil.setTransform(this.canvas, offset, scale);
  }

  redraw() {
    if (!this.enabled || !this.canvas) return 0;
    const map = this.map;
    const zoom = map.getZoom();
    const { size, dpr, topLeft } = this._resize();
    const ctx = this.ctx;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (zoom < this.minZoom || !this.prepared.length) {
      this.lastCount = 0;
      return 0;
    }
    // Everything downstream of here works in CSS pixels. See the cull comment.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const origin = map.getPixelOrigin();
    const cam = makeCamera({
      zoom,
      centreLat: map.getCenter().lat,
      width: size.x,
      height: size.y,
      pixelOriginX: origin.x,
      pixelOriginY: origin.y,
      canvasOriginX: topLeft.x,
      canvasOriginY: topLeft.y,
      lift: this.lift,
      camAlt: this.camAlt,
    });
    this.cam = cam;

    const t0 = performance.now();
    const drawn = drawScene(ctx, this.prepared, cam, this.scratch, {
      sun: this.sun,
      shadows: zoom >= this.shadowMinZoom,
      tintOf: this.tintOf,
    });
    this.lastMs = performance.now() - t0;
    this.lastCount = drawn;
    if (this.onStats) this.onStats({ ms: this.lastMs, drawn, zoom });
    return drawn;
  }

  /** Screen point (CSS pixels, canvas-relative) to a lot, or null. */
  pick(px, py) {
    if (!this.cam || !this.prepared.length) return null;
    return pickAt(px, py, this.prepared, this.cam, this.scratch);
  }
}
