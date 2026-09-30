// The extruded-buildings renderer, checked without a browser.
//   jsc -m tools/masscheck.js
//
// Companion to `tools/iso-check.js`, which pins the shared half (the height
// read order, the lift, the feet-vs-metres parse, the winding idea). This file
// covers only what `src/map/buildings3d.js` adds on top: the Leaflet-space
// projector, the pinhole lean, the painter order, and the behaviour of the
// whole pipeline on 400 real Manhattan footprints.
//
// It exists because the headless gate and the browser check catch DISJOINT
// classes of bug. `jsc` has never seen a pane, a device pixel ratio or a
// fingertip and cannot tell you whether the canvas is in the right place. The
// browser can see all three and cannot tell you that a vertex came out NaN —
// which is the failure that matters most here, because ONE non-finite vertex
// silently blanks an entire Canvas2D path. No exception, no warning, no red in
// the console: a whole building, or with a shared path a whole block, simply
// stops being drawn. `heightM` is null for every building nobody surveyed
// (`src/game/lots.js:319`, `heightMetresOf` returns null when the tag is
// absent), and 22 of the 400 buildings in the sample are exactly that, so the
// null path is the common path and not an edge case.
//
// Unlike the other tools here this one EXITS NON-ZERO on failure, by throwing
// after it has printed its count. jsc's `quit()` exits 0 whatever you pass it,
// so a throw is the only thing a CI step can actually gate on.

import {
  projectWorld, pxPerMetreAt, mPerPixelAt,
  massingHeightM, prepareLot, prepareInto,
  NADIR_BIAS, cameraAltitudeFor, makeCamera,
  sunFromHour, sunVectors,
  makeScratch, orderVisible, projectBuilding, drawScene, shade,
  pickAt, insideRing,
  STOREY_M, liftedHeight, heightMetres, paletteFor,
} from '../src/map/buildings3d.js';
import {
  heightMetresOf, classify, levelsOf, polygonAreaM2,
} from '../src/game/lots.js';

let pass = 0, fail = 0;
function check(name, cond, detail) {
  print((cond ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
  cond ? pass++ : fail++;
}
const near = (a, b, eps) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;
const section = (t) => { print(''); print('-- ' + t); };

// --- fixtures ---------------------------------------------------------------

const LAT = 40.748;                 // midtown, so the numbers below are real ones
const LNG = -73.9855;
const D2R = Math.PI / 180;

/** A square of `sideM` metres on a side, wound one way or the other. */
function squareLot(id, opts = {}) {
  const {
    lat = LAT, lng = LNG, sideM = 24, rev = false,
    kind = 'commercial', heightM, levels, tags,
  } = opts;
  const dLat = sideM / 111320;
  const dLng = sideM / (111320 * Math.cos(lat * D2R));
  let ring = [
    { lat, lng },
    { lat, lng: lng + dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat + dLat, lng },
  ];
  if (rev) ring = ring.slice().reverse();
  const lot = { id, kind, polygon: ring };
  if ('heightM' in opts) lot.heightM = heightM;
  if ('levels' in opts) lot.levels = levels;
  if (tags) lot.tags = tags;
  return lot;
}

/**
 * A camera whose offsets put a chosen zoom-0 world point at a chosen screen
 * pixel. `makeCamera` folds the zoom scale, Leaflet's pixel origin and the
 * canvas offset into one subtraction, so pinning the result is the honest way
 * to control where a test building lands.
 */
function cameraOn(worldX, worldY, screenX, screenY, opts = {}) {
  const { zoom = 19, width = 900, height = 900, centreLat = LAT } = opts;
  const scale = Math.pow(2, zoom);
  return makeCamera({
    zoom, centreLat, width, height,
    pixelOriginX: worldX * scale - screenX,
    pixelOriginY: worldY * scale - screenY,
    canvasOriginX: 0, canvasOriginY: 0,
    camAlt: opts.camAlt == null ? undefined : opts.camAlt,
    lift: opts.lift !== false,
  });
}

/** Every projected coordinate this building produced, finite? */
function allFinite(scratch, n) {
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(scratch.gx[i])) return false;
    if (!Number.isFinite(scratch.gy[i])) return false;
    if (!Number.isFinite(scratch.rx[i])) return false;
    if (!Number.isFinite(scratch.ry[i])) return false;
  }
  return Number.isFinite(scratch.hPx);
}

/** Mean of a scratch channel over n vertices. */
function meanOf(arr, n) {
  let s = 0;
  for (let i = 0; i < n; i++) s += arr[i];
  return s / n;
}

/**
 * Ground-ring width only. An AABB over both rings measures the lean as well as
 * the footprint, because the roof is magnified about the nadir — so comparing
 * footprint sizes across latitudes has to use this and not `aabb`.
 */
function groundWidth(scratch, n) {
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < n; i++) {
    if (scratch.gx[i] < x0) x0 = scratch.gx[i];
    if (scratch.gx[i] > x1) x1 = scratch.gx[i];
  }
  return x1 - x0;
}

function aabb(scratch, n) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const xs = [scratch.gx[i], scratch.rx[i]];
    const ys = [scratch.gy[i], scratch.ry[i]];
    for (const v of xs) { if (v < x0) x0 = v; if (v > x1) x1 = v; }
    for (const v of ys) { if (v < y0) y0 = v; if (v > y1) y1 = v; }
  }
  return { x0, x1, y0, y1 };
}

/**
 * A recording stand-in for CanvasRenderingContext2D.
 *
 * The renderer takes a context rather than being one, which is the single most
 * valuable thing it inherited from `isoart.js`: the entire paint path can be
 * replayed into a string here and asserted on. Non-finite numbers are written
 * out verbatim rather than formatted, so a NaN that reached the canvas shows up
 * as the literal text `NaN` in the transcript — which is the only way to see
 * the bug that produces no error at all.
 */
function recorder() {
  const ops = [];
  const n = (v) => (Number.isFinite(v) ? v.toFixed(4) : String(v));
  return {
    ops,
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    beginPath() { ops.push('B'); },
    moveTo(x, y) { ops.push('M' + n(x) + ',' + n(y)); },
    lineTo(x, y) { ops.push('L' + n(x) + ',' + n(y)); },
    closePath() { ops.push('Z'); },
    fill(rule) { ops.push('F' + (rule || '') + ':' + this.fillStyle); },
    stroke() { ops.push('S:' + this.strokeStyle + '/' + this.lineWidth); },
    text() { return ops.join(';'); },
  };
}

/**
 * The transcript, reduced to the set of FACES it describes.
 *
 * A path is canonicalised as its fill (or stroke) style plus its vertices
 * SORTED, which throws away the order the vertices were emitted in while
 * keeping everything a viewer could see: the same polygon, filled the same
 * colour. That distinction is the whole point of the winding checks — reversing
 * an OSM ring legitimately reverses the order `ctx.lineTo` is called in, and a
 * naive string comparison would call that a difference when the two are
 * pixel-for-pixel the same picture.
 */
function faces(rec) {
  const out = [];
  let pts = null;
  for (const op of rec.ops) {
    const c = op[0];
    if (c === 'B') { pts = []; continue; }
    if (c === 'M' || c === 'L') { if (pts) pts.push(op.slice(1)); continue; }
    if ((c === 'F' || c === 'S') && pts) out.push(op + '{' + pts.slice().sort().join(' ') + '}');
  }
  return out.sort();
}

/** A camera whose viewport holds every prepared building, so a drawn count is
 *  a count of what was drawn rather than of what happened to be on screen. */
function cameraCovering(prepared, { zoom = 19, margin = 300, centreLat = LAT } = {}) {
  const sc = Math.pow(2, zoom);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of prepared) {
    for (let i = 0; i < p.n; i++) {
      const x = p.world[2 * i], y = p.world[2 * i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const width = Math.ceil((x1 - x0) * sc) + margin * 2;
  const height = Math.ceil((y1 - y0) * sc) + margin * 2;
  return { cam: cameraOn(x0, y0, margin, margin, { zoom, width, height, centreLat }), width, height };
}

const scratch = makeScratch();


// ===========================================================================
section('0. The module is DOM-free, and stays that way');
// ===========================================================================
//
// This file shims nothing — no `document`, no `window`, no `L`. The imports at
// the top of it have already run by the time this executes, so the geometry
// half of the renderer importing cleanly is proved by the fact that anything
// below prints at all. What is asserted here is that it STAYS true: the moment
// a `document.createElement` or an `L.something` creeps above the seam, this
// tool stops running and `tools/loadcheck.js` — which shims a DOM — would not
// notice.
{
  check('no DOM was shimmed to make this run',
    typeof globalThis.document === 'undefined'
    && typeof globalThis.window === 'undefined'
    && typeof globalThis.L === 'undefined');
  check('and the pure half imported anyway',
    typeof projectWorld === 'function' && typeof drawScene === 'function'
    && typeof makeCamera === 'function');
  check('and importing the module created no pane, canvas or listener',
    typeof globalThis.requestAnimationFrame === 'undefined');
}


// ===========================================================================
section('1. NaN containment — one bad vertex blanks a whole path, silently');
// ===========================================================================
//
// Every one of these is a shape the real data actually hands over. The untagged
// building is 22 of the sample's 400. The two-point ring is what an OSM way
// reduces to once its duplicate points are dropped. The absurd height is the
// 830 m clamp in `heightMetresOf` doing its job.
{
  const cases = [
    ['no survey at all (heightM null, no levels)', squareLot('a', { heightM: null })],
    ['heightM null on a parking lot', squareLot('a', { heightM: null, kind: 'parking' })],
    ['heightM 0', squareLot('a', { heightM: 0 })],
    ['heightM negative', squareLot('a', { heightM: -42 })],
    ['heightM absurd (clamped to 830)', squareLot('a', { heightM: 99999 })],
    ['levels 0', squareLot('a', { heightM: null, levels: 0 })],
    ['levels negative', squareLot('a', { heightM: null, levels: -3 })],
    ['a height tag that is a word', squareLot('a', { tags: { height: 'tall' } })],
  ];
  for (const [what, lot] of cases) {
    const prep = prepareLot(lot);
    if (!prep) { check('finite geometry for ' + what, false, 'prepareLot returned null'); continue; }
    const cam = cameraOn(prep.cx, prep.cy, 450, 600);
    const n = projectBuilding(prep, cam, scratch);
    check('finite geometry for ' + what, allFinite(scratch, n) && n >= 3,
      'n=' + n + ' hPx=' + scratch.hPx.toFixed(2));
  }

  // The three rings that must be REFUSED rather than drawn. A ring with fewer
  // than three distinct points has no interior; drawing it emits a degenerate
  // path, and the zero-length edge divides by zero in the wall normal.
  const twoPoint = {
    id: 'b', kind: 'house', heightM: 20,
    polygon: [{ lat: LAT, lng: LNG }, { lat: LAT + 0.0002, lng: LNG }],
  };
  check('a 2-point ring is refused, not drawn', prepareLot(twoPoint) === null);
  check('an empty polygon is refused',
    prepareLot({ id: 'c', kind: 'house', heightM: 20, polygon: [] }) === null);
  check('a missing polygon is refused',
    prepareLot({ id: 'd', kind: 'house', heightM: 20 }) === null);
  const collapsed = {
    id: 'e', kind: 'house', heightM: 20,
    polygon: [{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG }, { lat: LAT, lng: LNG }],
  };
  check('a ring of three identical points is refused', prepareLot(collapsed) === null);

  // Duplicates that DO leave a real ring must survive, deduped: both the
  // consecutive pair and the wrap-around pair, which is the one everybody
  // forgets because OSM closes every way by repeating its first node.
  const base = squareLot('f', { heightM: 30 }).polygon;
  const dupRing = [
    base[0], base[0], base[1], base[2], base[2], base[2], base[3], base[0],
  ];
  const dup = prepareLot({ id: 'f', kind: 'commercial', heightM: 30, polygon: dupRing });
  check('a ring with duplicate and closing points dedups to 4', dup && dup.n === 4,
    dup ? 'n=' + dup.n + ' (from ' + dupRing.length + ')' : 'null');
  if (dup) {
    const cam = cameraOn(dup.cx, dup.cy, 450, 600);
    const n = projectBuilding(dup, cam, scratch);
    check('and projects finite', allFinite(scratch, n));
  }

  // A NaN latitude in the source data must not reach the screen.
  const poisoned = squareLot('g', { heightM: 30 });
  poisoned.polygon = poisoned.polygon.slice();
  poisoned.polygon.splice(2, 0, { lat: NaN, lng: LNG });
  const pz = prepareLot(poisoned);
  check('a NaN vertex in the source ring is dropped, not projected',
    pz && pz.n === 4, pz ? 'n=' + pz.n : 'null');

  // The pinhole runs to infinity as the height approaches the camera altitude,
  // so the height is capped at three quarters of it. Without the cap a 443 m
  // tower at z20 divides by something very close to zero.
  {
    const tall = prepareLot(squareLot('h', { heightM: 99999 }));
    const cam = cameraOn(tall.cx, tall.cy, 450, 600, { zoom: 20, width: 390, height: 844 });
    const n = projectBuilding(tall, cam, scratch);
    check('an absurd height is clamped, not divided by zero', allFinite(scratch, n),
      'hPx=' + scratch.hPx.toFixed(1) + ' of camAlt=' + cam.camAltPx.toFixed(1));
    // m = A / (A - 0.75A) = 4 exactly, so the roof sits four times as far from
    // the nadir as the ground does.
    const gd = Math.hypot(meanOf(scratch.gx, n) - cam.nadirX, meanOf(scratch.gy, n) - cam.nadirY);
    const rd = Math.hypot(meanOf(scratch.rx, n) - cam.nadirX, meanOf(scratch.ry, n) - cam.nadirY);
    check('and the magnification stops at exactly 4x', near(rd / gd, 4, 1e-4),
      'got ' + (rd / gd).toFixed(6));
  }

  // The whole pipeline, fed every degenerate at once: nothing throws, nothing
  // non-finite reaches the context, and only the drawable ones get drawn.
  {
    const table = new Map();
    const junk = [
      squareLot('j1', { heightM: null }),
      squareLot('j2', { heightM: -1 }),
      squareLot('j3', { heightM: 99999, lat: LAT + 0.0005 }),
      { id: 'j4', kind: 'house', polygon: [] },
      { id: 'j5', kind: 'house', polygon: [{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG }] },
      { id: 'j6', kind: 'house' },
      { id: 'j7', kind: 'house', polygon: [{ lat: NaN, lng: NaN }, { lat: NaN, lng: NaN }, { lat: NaN, lng: NaN }] },
    ];
    const added = prepareInto(table, junk, {});
    const prepared = [...table.values()];
    const cam = cameraOn(prepared[0].cx, prepared[0].cy, 450, 600);
    const rec = recorder();
    let threw = null;
    let drawn = 0;
    try {
      drawn = drawScene(rec, prepared, cam, scratch, { sun: sunFromHour(10), shadows: true });
    } catch (e) { threw = e; }
    check('drawScene survives a pile of degenerate lots', threw === null, String(threw || ''));
    check('and only the three real ones were prepared', added === 3, 'added=' + added);
    check('and it drew them', drawn === 3, 'drawn=' + drawn);
    check('and no NaN reached the canvas', !/NaN|Infinity|undefined/.test(rec.text()));
  }
}


// ===========================================================================
section('2. Projection — the scale, and the lean');
// ===========================================================================
//
// The absolute SCALE of the projection is deliberately thin here: it has
// already been verified two other ways, and a gate that re-derives a settled
// number is cost with no cover. `pxPerMetreAt` was checked against the
// independent Web Mercator closed form
//
//     mPerPx(phi, z) = 156543.03392804097 * cos(phi) / 2^z
//
// (2 * PI * 6378137 / 256, the published zoom-0 resolution) at phi 0 / 40.75 /
// 60 and z17 / z20, and `projectWorld` was separately proved bit-exact against
// live Leaflet by `prototype/buildings3d.html` at 2.8e-14 px. What is kept
// below is two spot values, so a future edit to EARTH_CIRCUM or TILE still
// trips something, plus the direction-of-latitude case, which is the one that
// is wrong in a plausible-looking way. Everything after that is the LEAN,
// which nothing else covers.
{
  check('phi=40 z17 is 0.915 m/px', near(mPerPixelAt(40, 17), 0.915, 0.001),
    mPerPixelAt(40, 17).toFixed(4));
  check('phi=40 z20 is 0.114 m/px', near(mPerPixelAt(40, 20), 0.114, 0.001),
    mPerPixelAt(40, 20).toFixed(4));
  check('mPerPixelAt is the exact inverse of pxPerMetreAt',
    near(mPerPixelAt(40.75, 19) * pxPerMetreAt(40.75, 19), 1, 1e-12));

  // The same building is a different pixel size at the equator and at 40.75N,
  // by exactly 1/cos(latitude). It is BIGGER at 40.75 — Mercator inflates with
  // latitude — and inverting that is a 32% size error that looks plausible on
  // screen and is only ever caught by an assertion.
  {
    const phi = 40.75;
    const want = 1 / Math.cos(phi * D2R);
    const ratio = pxPerMetreAt(phi, 19) / pxPerMetreAt(0, 19);
    check('a metre is 1/cos(40.75) = 1.3200 times as many pixels as at the equator',
      near(ratio, want, 1e-12), 'got ' + ratio.toFixed(9) + ' want ' + want.toFixed(9));

    // And the same thing end to end: one 30 m building, laid out at each
    // latitude, comes out wider on screen at 40.75 by the same factor. Ground
    // ring only — the roof is magnified about the nadir, so including it would
    // be measuring the lean as well as the footprint.
    const eq = prepareLot(squareLot('eq', { lat: 0, lng: 0, sideM: 30, heightM: 40 }));
    const up = prepareLot(squareLot('up', { lat: phi, lng: 0, sideM: 30, heightM: 40 }));
    projectBuilding(eq, cameraOn(eq.cx, eq.cy, 450, 600, { centreLat: 0 }), scratch);
    const wEq = groundWidth(scratch, eq.n);
    projectBuilding(up, cameraOn(up.cx, up.cy, 450, 600, { centreLat: phi }), scratch);
    const wUp = groundWidth(scratch, up.n);
    check('and a 30 m footprint is that much wider on screen at 40.75N',
      Math.abs(wUp / wEq - want) / want < 0.002,
      `${wEq.toFixed(1)}px vs ${wUp.toFixed(1)}px, ratio ${(wUp / wEq).toFixed(4)}`);
  }

  // The 2^z scale, not 256*2^z. `makeCamera` calls this out as a 256x error
  // that puts every building off the coast; here is the assertion.
  {
    const w = projectWorld(0, 0);
    check('projectWorld puts 0,0 at the middle of the 256px zoom-0 world',
      near(w.x, 128, 1e-9) && near(w.y, 128, 1e-9), `${w.x},${w.y}`);
    check('and 180E at the right edge', near(projectWorld(0, 180).x, 256, 1e-9));
    const cam = makeCamera({ zoom: 19, centreLat: LAT, width: 800, height: 800 });
    check('makeCamera scale is 2^z, not 256*2^z', cam.scale === Math.pow(2, 19),
      String(cam.scale));
    // A known point, projected the long way round, must land where the camera
    // arithmetic puts it. Anchored at a realistic pixel origin rather than
    // zero: with a zero origin the projected coordinate is the raw world
    // coordinate, ~4e7 px at z19, which is the magnitude at which a float32
    // scratch would quantise to steps of 4 px. The scratch is float64 today so
    // it would pass either way — but a test that only holds at 4e7 is testing
    // the float format, not the projection.
    const prep = prepareLot(squareLot('k', { heightM: 10 }));
    const anchored = cameraOn(prep.cx, prep.cy, 400, 400, { zoom: 19, width: 800, height: 800 });
    const sx = prep.world[0] * anchored.scale - anchored.offX;
    const n = projectBuilding(prep, anchored, scratch);
    check('and the first vertex lands exactly where world*scale-off says',
      near(scratch.gx[0], sx, 1e-3), `${scratch.gx[0].toFixed(4)} vs ${sx.toFixed(4)}`);
  }

  // The nadir, and the lean.
  //
  // The nadir N sits below the bottom of the viewport on purpose: with N inside
  // the viewport the building under it would show no walls at all. So a
  // building on the vertical centre line leans STRAIGHT UP — same screen x,
  // smaller screen y — and one off to the side leans up and outward, growing
  // with the distance from N. That is the real aerial-photograph behaviour and
  // it is what makes the massing register with orthorectified imagery.
  {
    const W = 800, H = 800;
    const prep = prepareLot(squareLot('n', { heightM: 60 }));
    const camOpts = { width: W, height: H, zoom: 19 };
    const cam0 = cameraOn(prep.cx, prep.cy, W / 2, 400, camOpts);
    check('the nadir is on the vertical centre line', cam0.nadirX === W / 2);
    check('and below the bottom of the viewport',
      cam0.nadirY === H + NADIR_BIAS * H && cam0.nadirY > H, String(cam0.nadirY));

    const n = projectBuilding(prep, cam0, scratch);
    const gx = meanOf(scratch.gx, n), gy = meanOf(scratch.gy, n);
    const rx = meanOf(scratch.rx, n), ry = meanOf(scratch.ry, n);
    check('at the nadir line the roof sits directly above its footprint',
      near(rx - gx, 0, 1e-6), 'dx=' + (rx - gx).toExponential(2));
    check('and above it, not below', ry < gy - 1, `dy=${(ry - gy).toFixed(2)}px`);

    // Away from the centre line it leans outward, and further out leans more.
    const leans = [];
    for (const off of [-300, -120, 0, 120, 300]) {
      const cam = cameraOn(prep.cx, prep.cy, W / 2 + off, 400, camOpts);
      const m = projectBuilding(prep, cam, scratch);
      leans.push(meanOf(scratch.rx, m) - meanOf(scratch.gx, m));
    }
    check('a building left of the nadir leans left', leans[0] < -1 && leans[1] < -1,
      leans.map((v) => v.toFixed(2)).join(' / '));
    check('and right of it leans right', leans[3] > 1 && leans[4] > 1);
    check('and the lean grows with distance from the nadir',
      leans[4] > leans[3] && leans[3] > leans[2] && leans[2] > leans[1] && leans[1] > leans[0]);
    // 1e-3 px rather than an exact comparison: this is a mean of projected
    // coordinates, so it carries whatever the screen-space scratch's float
    // width gives it. Asserting the float format is not the job.
    check('and is symmetric about it',
      near(leans[0], -leans[4], 1e-3) && near(leans[1], -leans[3], 1e-3),
      leans.map((v) => v.toFixed(4)).join(' / '));

    // The lean grows with zoom because hPx does. Flat at z17, volumetric at z20
    // is the entire point of the ladder in the design doc.
    const rise = [];
    for (const z of [17, 18, 19, 20]) {
      const cam = cameraOn(prep.cx, prep.cy, W / 2, 400, { width: W, height: H, zoom: z });
      const m = projectBuilding(prep, cam, scratch);
      rise.push(meanOf(scratch.gy, m) - meanOf(scratch.ry, m));
    }
    check('a 60 m building rises further up the screen at every zoom step',
      rise[1] > rise[0] && rise[2] > rise[1] && rise[3] > rise[2],
      'z17..z20: ' + rise.map((v) => Math.round(v) + 'px').join(' ') );
  }

  // Height in metres, as this renderer decides it. `iso-check.js` owns the read
  // order; what is new here is the parking rule and the lift switch.
  {
    check('a surveyed height beats a levels count',
      near(massingHeightM({ heightM: 443.2, levels: 12, kind: 'commercial' }, { lift: false }), 443.2, 1e-9));
    check('an untagged building falls back to 2 storeys',
      near(massingHeightM({ kind: 'house' }, { lift: false }), 2 * STOREY_M, 1e-9));
    check('an absurd height is clamped at 830 m',
      near(massingHeightM({ heightM: 99999, kind: 'commercial' }, { lift: false }), 830, 1e-6));
    check('a car park is tarmac, not premises',
      massingHeightM({ heightM: 40, kind: 'parking' }) < massingHeightM({ heightM: 40, kind: 'commercial' }),
      massingHeightM({ heightM: 40, kind: 'parking' }).toFixed(1) + 'm');
    check('and never below 3 m', massingHeightM({ heightM: null, kind: 'parking' }) >= 3);
    check('the readability lift is on by default and off when asked',
      massingHeightM({ heightM: 6.2, kind: 'house' }) > massingHeightM({ heightM: 6.2, kind: 'house' }, { lift: false }));
    check('and does not lie about a 443 m tower',
      near(massingHeightM({ heightM: 443.2, kind: 'commercial' }), 443.2, 0.01));
  }

  // The camera altitude ladder: flat at z17 where 1700 buildings are in view,
  // tilted in at z20 where twenty are.
  check('camera altitude eases from 3.5 viewport-heights at z17',
    near(cameraAltitudeFor(17), 3.5, 1e-9));
  check('to 2.0 at z20', near(cameraAltitudeFor(20), 2.0, 1e-9));
  check('and is clamped outside the ladder',
    cameraAltitudeFor(12) === 3.5 && cameraAltitudeFor(22) === 2.0);
}


// ===========================================================================
section('3. Draw order — the near building is painted LAST');
// ===========================================================================
//
// Painter's algorithm, and the only assertion that means anything is the
// ordering itself, not the pixels. The construction is the one that actually
// bites: a SHORT building NEAR the camera in front of a TALL one further away.
// Sorting by height, or by roof-top screen y, or by anything other than
// distance from the nadir, puts the tall one on top of the short one and the
// short one vanishes behind a building that is physically behind it.
{
  const W = 800, H = 800;
  // Nadir is at y = 800 + 0.85*800 = 1480, i.e. below the screen, so "nearer
  // the camera" means "further down the screen".
  const shortNear = prepareLot(squareLot('near-short', { heightM: 6, sideM: 40 }));
  const tallFar = prepareLot(squareLot('far-tall', { heightM: 200, sideM: 40, lat: LAT + 0.0004 }));

  // Put them 30 screen pixels apart vertically with the same x, so their
  // footprints genuinely overlap and the ordering is not a vacuous question.
  const anchorX = shortNear.cx, anchorY = shortNear.cy;
  const cam = cameraOn(anchorX, anchorY, W / 2, 700, { width: W, height: H, zoom: 19 });
  const prepared = [tallFar, shortNear];   // deliberately in the WRONG order

  projectBuilding(shortNear, cam, scratch);
  const boxNear = aabb(scratch, shortNear.n);
  projectBuilding(tallFar, cam, scratch);
  const boxFar = aabb(scratch, tallFar.n);
  const overlaps = boxNear.x0 < boxFar.x1 && boxFar.x0 < boxNear.x1
    && boxNear.y0 < boxFar.y1 && boxFar.y0 < boxNear.y1;
  check('the two test buildings genuinely overlap on screen', overlaps,
    `near y ${boxNear.y0.toFixed(0)}..${boxNear.y1.toFixed(0)}, `
    + `far y ${boxFar.y0.toFixed(0)}..${boxFar.y1.toFixed(0)}`);
  check('and the short one really is the nearer to the camera',
    (boxNear.y0 + boxNear.y1) / 2 > (boxFar.y0 + boxFar.y1) / 2);

  const order = orderVisible(prepared, cam, scratch, {});
  check('both are kept by the cull', order.length === 2, 'order.length=' + order.length);
  check('the far tall building is ordered first',
    prepared[order[0]].id === 'far-tall', prepared[order[0]].id);
  check('and the near short one LAST, so it occludes rather than being occluded',
    prepared[order[order.length - 1]].id === 'near-short', prepared[order[order.length - 1]].id);

  // And the paint path honours it. `tintOf` is called once per building in
  // paint order, which is an exact readout of the order the context saw.
  {
    const painted = [];
    const rec = recorder();
    drawScene(rec, prepared, cam, scratch, {
      tintOf: (lot) => { painted.push(lot.id); return paletteFor(lot.kind); },
    });
    check('drawScene paints far-tall then near-short',
      painted.join(' > ') === 'far-tall > near-short', painted.join(' > '));
  }

  // The general property, over a row of identical buildings marching down the
  // screen: the order is monotonically decreasing in distance from the nadir.
  {
    const row = [];
    for (let i = 0; i < 9; i++) {
      row.push(prepareLot(squareLot('r' + i, { heightM: 20, lat: LAT + i * 0.0003 })));
    }
    const c = cameraOn(row[4].cx, row[4].cy, W / 2, 400, { width: W, height: H, zoom: 18 });
    const ord = orderVisible(row, c, scratch, {});
    let mono = true, prevD = Infinity;
    const ys = [];
    for (const idx of ord) {
      const p = row[idx];
      const cy = p.cy * c.scale - c.offY;
      const cx = p.cx * c.scale - c.offX;
      const d = (cx - c.nadirX) ** 2 + (cy - c.nadirY) ** 2;
      if (d > prevD) mono = false;
      prevD = d;
      ys.push(Math.round(cy));
    }
    check('a row of buildings is ordered furthest-from-the-nadir first', mono,
      ord.length + ' drawn, screen y ' + ys.join(' '));
    check('which for a nadir below the screen is top-of-screen first',
      ys.every((v, i) => i === 0 || v >= ys[i - 1]), ys.join(' '));
  }

  // The cull must not be symmetric, and this is the reason why: a tall
  // building standing well BELOW the bottom of the viewport still has its roof
  // on screen, because the lean carries the roof upward. Cull it on its
  // footprint and it pops in late and visibly, which is the exact artifact
  // that reads as "the 3D is broken".
  {
    const tower = prepareLot(squareLot('below', { heightM: 300, sideM: 40 }));
    const c = cameraOn(tower.cx, tower.cy, W / 2, H + 350, { width: W, height: H, zoom: 19 });
    const ord = orderVisible([tower], c, scratch, {});
    projectBuilding(tower, c, scratch);
    const box = aabb(scratch, tower.n);
    check('a 300 m tower 350 px below the viewport still has its roof on screen',
      box.y0 < H, 'ground at y=' + (H + 350) + ', roof top at y=' + box.y0.toFixed(0));
    check('and the cull keeps it rather than popping it in late',
      ord.length === 1, 'kept=' + ord.length);
  }

  // And the asymmetry itself, with a SHORT building, where the per-building
  // height slack is too small to hide a mistake: the same distance below the
  // viewport is kept, the same distance above it is dropped.
  {
    const hut = prepareLot(squareLot('hut', { heightM: 6, sideM: 20 }));
    const below = cameraOn(hut.cx, hut.cy, W / 2, H + 400, { width: W, height: H, zoom: 19 });
    const above = cameraOn(hut.cx, hut.cy, W / 2, -400, { width: W, height: H, zoom: 19 });
    check('a short building 400 px below the viewport is kept',
      orderVisible([hut], below, scratch, {}).length === 1);
    check('and the same building 400 px above it is culled',
      orderVisible([hut], above, scratch, {}).length === 0);
  }
}


// ===========================================================================
section('4. Winding — a ring and its reverse are the same building');
// ===========================================================================
//
// OSM ways come wound both ways round and nothing normalises them.
// `isoart.js:172-180` records this bug already: deciding which walls face the
// camera from screen-space x instead of the measured winding kept the wrong
// half of the walls on every clockwise footprint, and buildings had faces
// standing up behind their own roofs. The property that pins it is not "the
// winding is detected" but "the two rings LOOK IDENTICAL" — same visible wall
// set, same roof, same everything a viewer could see.
{
  /** The set of visible walls, as undirected edges, independent of index order. */
  function visibleWalls(prep, cam) {
    const n = projectBuilding(prep, cam, scratch);
    const out = [];
    const r = (v) => v.toFixed(3);
    for (let j = 0, i = 1; j < n; j++, i = (j + 1) % n) {
      if (!scratch.vis[j]) continue;
      const a = r(scratch.gx[j]) + ',' + r(scratch.gy[j]) + '|' + r(scratch.rx[j]) + ',' + r(scratch.ry[j]);
      const b = r(scratch.gx[i]) + ',' + r(scratch.gy[i]) + '|' + r(scratch.rx[i]) + ',' + r(scratch.ry[i]);
      out.push(a < b ? a + '  ' + b : b + '  ' + a);
    }
    return out.sort();
  }
  function roofSet(prep, cam) {
    const n = projectBuilding(prep, cam, scratch);
    const out = [];
    for (let i = 0; i < n; i++) out.push(scratch.rx[i].toFixed(3) + ',' + scratch.ry[i].toFixed(3));
    return out.sort();
  }

  // Four placements relative to the nadir, because "which walls face away from
  // N" changes with position and a winding bug can hide at one of them.
  const places = [[400, 300], [120, 300], [680, 300], [400, 740]];
  for (const [sx, sy] of places) {
    const cw = prepareLot(squareLot('cw', { heightM: 45, sideM: 40 }));
    const ccw = prepareLot(squareLot('ccw', { heightM: 45, sideM: 40, rev: true }));
    const cam = cameraOn(cw.cx, cw.cy, sx, sy, { width: 800, height: 800, zoom: 19 });

    const a = visibleWalls(cw, cam);
    const b = visibleWalls(ccw, cam);
    check(`same visible wall set either way round at (${sx},${sy})`,
      a.length > 0 && a.join('#') === b.join('#'),
      `${a.length} walls vs ${b.length}`);
    check(`and the same roof polygon at (${sx},${sy})`,
      roofSet(cw, cam).join('#') === roofSet(ccw, cam).join('#'));

    // Never all four: if the back-face cull is a no-op the two rings match
    // trivially and the test above proves nothing. Three is the correct answer
    // on the centre line — a pinhole low and far away sees the far wall and a
    // grazing sliver of each side wall — and two once the building is off to
    // one side. Only the wall facing the nadir is ever hidden.
    check(`and it is a real cull, not all four walls, at (${sx},${sy})`,
      a.length >= 1 && a.length < 4, a.length + ' of 4');
  }

  // The winding is actually measured, and it is opposite for the two rings.
  {
    const cw = prepareLot(squareLot('cw', { heightM: 45 }));
    const ccw = prepareLot(squareLot('ccw', { heightM: 45, rev: true }));
    const cam = cameraOn(cw.cx, cw.cy, 400, 300, { width: 800, height: 800, zoom: 19 });
    projectBuilding(cw, cam, scratch);
    const w1 = scratch.wind;
    projectBuilding(ccw, cam, scratch);
    const w2 = scratch.wind;
    check('the two rings are measured as opposite windings', w1 === -w2, `${w1} vs ${w2}`);
  }

  // And the whole painted output is identical, not merely the wall set.
  {
    const cw = prepareLot(squareLot('x', { heightM: 45, kind: 'commercial' }));
    const ccw = prepareLot(squareLot('x', { heightM: 45, kind: 'commercial', rev: true }));
    const cam = cameraOn(cw.cx, cw.cy, 300, 500, { width: 800, height: 800, zoom: 19 });
    const sun = sunFromHour(9);
    const r1 = recorder(); drawScene(r1, [cw], cam, scratch, { sun, shadows: true });
    const r2 = recorder(); drawScene(r2, [ccw], cam, scratch, { sun, shadows: true });
    const f1 = faces(r1), f2 = faces(r2);
    check('a clockwise and an anticlockwise ring paint the same faces',
      f1.length > 0 && f1.join('\n') === f2.join('\n'),
      f1.length + ' faces vs ' + f2.length);
    check('including the same wall shading, so neither is lit from inside',
      f1.filter((s) => s.startsWith('F')).join('\n') === f2.filter((s) => s.startsWith('F')).join('\n'));
  }

  // A concave footprint (an L) must still cull correctly and still fill: the
  // reason this renderer is Canvas2D and not WebGL is that ctx.fill() does
  // nonzero-winding scan conversion and needs no tessellator.
  {
    const d = 0.00025, e = 0.00012;
    const L = [
      { lat: LAT, lng: LNG }, { lat: LAT, lng: LNG + d },
      { lat: LAT + e, lng: LNG + d }, { lat: LAT + e, lng: LNG + e },
      { lat: LAT + d, lng: LNG + e }, { lat: LAT + d, lng: LNG },
    ];
    const fwd = prepareLot({ id: 'L', kind: 'commercial', heightM: 40, polygon: L });
    const rev = prepareLot({ id: 'L', kind: 'commercial', heightM: 40, polygon: L.slice().reverse() });
    const cam = cameraOn(fwd.cx, fwd.cy, 400, 400, { width: 800, height: 800, zoom: 19 });
    check('a concave L-shaped footprint keeps all six vertices', fwd.n === 6, 'n=' + fwd.n);
    check('and shows the same walls either way round',
      visibleWalls(fwd, cam).join('#') === visibleWalls(rev, cam).join('#'));
    const n = projectBuilding(fwd, cam, scratch);
    check('and projects finite', allFinite(scratch, n));
  }
}


// ===========================================================================
section('5. Determinism and allocation');
// ===========================================================================
{
  const lots = [];
  for (let i = 0; i < 40; i++) {
    lots.push(squareLot('d' + i, {
      lat: LAT + (i % 8) * 0.00035,
      lng: LNG + Math.floor(i / 8) * 0.00045,
      heightM: i % 5 === 0 ? null : 8 + i * 4,
      kind: ['house', 'commercial', 'retail', 'parking', 'apartments'][i % 5],
      rev: i % 3 === 0,
    }));
  }
  const table = new Map();
  prepareInto(table, lots, {});
  const prepared = [...table.values()];
  const cam = cameraCovering(prepared, { zoom: 19, margin: 300 }).cam;
  const sun = sunFromHour(15);

  const s = makeScratch();
  const r1 = recorder();
  const n1 = drawScene(r1, prepared, cam, s, { sun, shadows: true });
  const r2 = recorder();
  const n2 = drawScene(r2, prepared, cam, s, { sun, shadows: true });
  check('the same inputs draw the same count', n1 === n2 && n1 === prepared.length,
    `${n1} then ${n2} of ${prepared.length}`);
  check('and produce byte-identical output', r1.text() === r2.text(),
    r1.text().length + ' chars');
  check('with no NaN anywhere in it', !/NaN|Infinity|undefined/.test(r1.text()));

  // Third run after a different camera, back to the first: still identical.
  const other = cameraCovering(prepared, { zoom: 17, margin: 200 }).cam;
  drawScene(recorder(), prepared, other, s, { sun, shadows: true });
  const r3 = recorder();
  drawScene(r3, prepared, cam, s, { sun, shadows: true });
  check('and are unaffected by a redraw at another camera in between',
    r1.text() === r3.text());

  // Zero allocation. The scratch buffers grow to the largest ring ever seen and
  // are then held for the life of the layer; if they are reallocated per call,
  // 1700 buildings a redraw is exactly the garbage the design set out to avoid.
  const before = {
    gx: s.gx, gy: s.gy, rx: s.rx, ry: s.ry, vis: s.vis,
    order: s.order, key: s.key, cap: s.cap, keyLen: s.key.length,
  };
  for (let i = 0; i < 20; i++) drawScene(recorder(), prepared, cam, s, { sun, shadows: true });
  check('the scratch vertex buffers are the same objects 20 redraws later',
    s.gx === before.gx && s.gy === before.gy && s.rx === before.rx && s.ry === before.ry
    && s.vis === before.vis);
  check('and have not grown', s.cap === before.cap, 'cap=' + s.cap);
  check('the sort key array is reused, not reallocated',
    s.key === before.key && s.key.length === before.keyLen, 'len=' + s.key.length);
  check('and the order array is reused in place',
    s.order === before.order, 'length=' + s.order.length);
  // Typed, deliberately width-agnostic: the point is that no per-vertex object
  // exists, not which float the screen-space scratch uses. (It is Float64 as
  // of this writing, with the reasoning in `makeScratch`'s docstring; Float32
  // would also be defensible and this check should not be the thing that
  // stops someone changing it.)
  check('the scratch is typed, so no per-vertex objects exist at all',
    ArrayBuffer.isView(s.gx) && ArrayBuffer.isView(s.gy)
    && ArrayBuffer.isView(s.rx) && ArrayBuffer.isView(s.ry)
    && s.vis instanceof Uint8Array,
    Object.prototype.toString.call(s.gx).slice(8, -1));

  // Precomputed geometry must be Float64, not Float32: at z20 the world is
  // 2.68e8 px wide and float32 carries ~1.7e7 of integer precision, so world
  // coordinates would quantise to ~16-pixel steps and every building would
  // visibly snap to a grid.
  check('precomputed world rings are Float64Array',
    prepared[0].world instanceof Float64Array);
  {
    const p = projectWorld(LAT, LNG);
    const f32 = Math.fround(p.x * Math.pow(2, 20));
    const f64 = p.x * Math.pow(2, 20);
    check('and float32 really would have quantised them', Math.abs(f64 - f32) > 1,
      'float32 error at z20: ' + Math.abs(f64 - f32).toFixed(1) + 'px');
  }

  // Streaming: `loadTiles` adds ~1200 lots at a time, so re-preparing must
  // append and must not rebuild what is already there.
  {
    const t = new Map();
    const a = prepareInto(t, lots.slice(0, 20), {});
    const first = t.get('d0');
    const b = prepareInto(t, lots, {});
    check('a second tile sweep only prepares what is new', a === 20 && b === 20,
      `${a} then ${b}`);
    check('and does not rebuild geometry it already had', t.get('d0') === first);
    check('but does refresh the lot pointer for tinting', t.get('d0').lot === lots[0]);
  }

  // Picking is a pure function and belongs here rather than in a browser.
  {
    projectBuilding(prepared[0], cam, s);
    const cx = meanOf(s.rx, prepared[0].n), cy = meanOf(s.ry, prepared[0].n);
    const hit = pickAt(cx, cy, prepared, cam, s, {});
    check('a point in the middle of a roof picks that building',
      hit && hit.id === prepared[0].id, hit ? hit.id : 'null');
    check('a point far outside everything picks nothing',
      pickAt(-5000, -5000, prepared, cam, s, {}) === null);
    check('insideRing agrees with itself on a known square',
      insideRing(0.5, 0.5, [0, 1, 1, 0], [0, 0, 1, 1], 4)
      && !insideRing(1.5, 0.5, [0, 1, 1, 0], [0, 0, 1, 1], 4));
  }

  // The shade cache must be a cache: continuous keys make it a memory leak.
  check('shade() returns the identical interned string for the same input',
    shade('#7e9e6c', 0.62) === shade('#7e9e6c', 0.62));
  check('and a different one for a different shade',
    shade('#7e9e6c', 0.2) !== shade('#7e9e6c', 0.95));
  check('and never emits a non-finite channel',
    !/NaN|undefined/.test(shade('#7e9e6c', 0) + shade('#7e9e6c', 1)));

  // The sun: the shadow direction has to flip across the day and vanish at
  // night, or the whole city is lit from the same side at 3 a.m.
  {
    const morning = sunVectors(sunFromHour(8));
    const evening = sunVectors(sunFromHour(17));
    const night = sunVectors(sunFromHour(2));
    check('the sun is up in the morning and in the evening', morning.up && evening.up);
    check('and down at 2 a.m.', !night.up && night.shadowPerPx === 0);
    check('and morning and evening light come from opposite sides',
      morning.tx * evening.tx < 0, `${morning.tx.toFixed(3)} vs ${evening.tx.toFixed(3)}`);
    check('sun vectors are finite at every hour of the day', (() => {
      for (let h = 0; h < 24; h += 0.25) {
        const v = sunVectors(sunFromHour(h));
        if (![v.tx, v.ty, v.cosAlt, v.sinAlt, v.shadowPerPx].every(Number.isFinite)) return false;
      }
      return true;
    })());
    const rNight = recorder();
    drawScene(rNight, prepared, cam, s, { sun: sunFromHour(2), shadows: true });
    const rDay = recorder();
    drawScene(rDay, prepared, cam, s, { sun: sunFromHour(13), shadows: true });
    check('no shadows are painted at night', rNight.ops.length < rDay.ops.length,
      `${rNight.ops.length} ops at 02:00 vs ${rDay.ops.length} at 13:00`);
  }
}


// ===========================================================================
section('6. Real data — 400 Manhattan footprints');
// ===========================================================================
//
// `prototype/sample/midtown.json` is a captured Overpass response: 400 real OSM
// buildings, 378 of them carrying a surveyed `height`, element 0 the Empire
// State Building at 443.2 m. It goes through exactly what `buildLots` does to
// it so the renderer is fed the shape the game actually produces, including the
// 22 lots where `heightMetresOf` returns null.
{
  const raw = JSON.parse(readFile('prototype/sample/midtown.json'));
  const els = raw.elements;
  check('the sample holds 400 footprints', els.length === 400, String(els.length));

  const lots = els.map((e, i) => {
    const tags = e.tags || {};
    const polygon = e.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
    const areaM2 = polygonAreaM2(polygon);
    const kind = classify(tags, areaM2);
    return {
      id: 'M' + i, osmId: e.id, polygon, tags, kind, areaM2,
      levels: kind === 'parking' ? 1 : levelsOf(tags, kind),
      heightM: heightMetresOf(tags),
    };
  });
  const surveyed = lots.filter((l) => l.heightM != null).length;
  check('378 of them were surveyed, 22 were not', surveyed === 378,
    surveyed + ' surveyed, ' + (lots.length - surveyed) + ' null');
  check('and element 0 is the Empire State Building at 443.2 m',
    lots[0].heightM === 443.2 && els[0].tags.name === 'Empire State Building',
    els[0].tags.name + ' ' + lots[0].heightM + 'm');

  const table = new Map();
  const added = prepareInto(table, lots, {});
  const prepared = [...table.values()];
  check('every footprint survives preparation — none is silently dropped',
    added === 400 && prepared.length === 400,
    'prepared ' + prepared.length + ' of ' + lots.length);

  // A camera that holds the whole sample, so the count below is a count of
  // what the renderer drew and not of what happened to be on screen.
  const ZOOM = 17;
  const cover = cameraCovering(prepared, { zoom: ZOOM, margin: 350 });
  const cam = cover.cam;
  check('the test viewport holds the whole sample', cover.width > 800 && cover.height > 700,
    `${cover.width}x${cover.height} css px at z${ZOOM}, ${cam.pxPerMetre.toFixed(4)} px/m`);

  // Every vertex of every building, finite. This one has been verified
  // independently as well; it stays because it is two lines and because it is
  // the assertion that will catch the regression, not the one that found the
  // bug. 22 of these lots have no surveyed height at all.
  {
    let bad = 0, worst = '';
    let verts = 0;
    for (const p of prepared) {
      const n = projectBuilding(p, cam, scratch);
      verts += n;
      if (!allFinite(scratch, n)) { bad++; if (!worst) worst = p.id + ' (' + p.lot.kind + ')'; }
    }
    check('every projected vertex of all 400 buildings is finite', bad === 0,
      bad ? bad + ' bad, first ' + worst : verts + ' vertices checked');
  }

  // The whole scene, drawn.
  const rec = recorder();
  const drawn = drawScene(rec, prepared, cam, scratch, { sun: sunFromHour(11), shadows: true });
  check('the count of drawn buildings equals the count of input footprints',
    drawn === els.length, drawn + ' drawn of ' + els.length + ' footprints');
  check('and nothing non-finite reached the canvas', !/NaN|Infinity|undefined/.test(rec.text()),
    rec.ops.length + ' context calls');

  // The Empire State Building has to be the Empire State Building. A view built
  // on `levels` instead of `heightM` puts it at twelve storeys; a view that
  // reads feet as metres puts it in orbit. Either way this assertion is the one
  // that notices.
  {
    const esb = prepared.find((p) => p.id === 'M0');
    let tallest = null, tallestExt = -Infinity, esbExt = 0;
    let hTallest = null, hMax = -Infinity;
    for (const p of prepared) {
      const n = projectBuilding(p, cam, scratch);
      let bottom = -Infinity, top = Infinity;
      for (let i = 0; i < n; i++) {
        if (scratch.gy[i] > bottom) bottom = scratch.gy[i];
        if (scratch.ry[i] < top) top = scratch.ry[i];
      }
      const ext = bottom - top;
      if (p === esb) esbExt = ext;
      else if (ext > tallestExt) { tallestExt = ext; tallest = p; }
      if (p !== esb && scratch.hPx > hMax) { hMax = scratch.hPx; hTallest = p; }
    }
    projectBuilding(esb, cam, scratch);
    const esbH = scratch.hPx;
    check('the Empire State stands taller in pixels than every neighbour',
      esbExt > tallestExt,
      `${esbExt.toFixed(0)}px vs ${tallestExt.toFixed(0)}px for `
      + `${tallest.lot.tags.name || tallest.id}`);
    check('and its extruded height alone beats the next tallest',
      esbH > hMax, `${esbH.toFixed(0)}px vs ${hMax.toFixed(0)}px for `
      + `${(hTallest.lot.tags || {}).name || hTallest.id}`);
    check('and is drawn at its surveyed height, not its levels count',
      near(esb.heightM, 443.2, 0.01), esb.heightM.toFixed(2) + 'm (levels say '
      + (lots[0].levels * STOREY_M).toFixed(0) + 'm)');
  }

  // Determinism over the real data, which is where the awkward rings live.
  {
    const a = recorder();
    drawScene(a, prepared, cam, scratch, { sun: sunFromHour(11), shadows: true });
    const b = recorder();
    drawScene(b, prepared, cam, scratch, { sun: sunFromHour(11), shadows: true });
    check('400 real buildings draw byte-identically twice running',
      a.text() === b.text(), a.text().length + ' chars');
  }

  // Both windings, over real data. OSM gives them mixed and reversing every
  // ring must change nothing a viewer can see.
  {
    const revLots = lots.map((l) => ({ ...l, polygon: l.polygon.slice().reverse() }));
    const revTable = new Map();
    prepareInto(revTable, revLots, {});
    const revPrepared = [...revTable.values()];
    const sun = sunFromHour(11);
    const a = recorder(); drawScene(a, prepared, cam, scratch, { sun, shadows: false });
    const b = recorder(); drawScene(b, revPrepared, cam, scratch, { sun, shadows: false });
    const fa = faces(a), fb = faces(b);
    check('reversing the winding of all 400 rings paints the same faces',
      fa.length > 0 && fa.join('\n') === fb.join('\n'),
      `${fa.length} faces vs ${fb.length}`);
  }

  // The scratch had to grow for the largest real ring, and then stop.
  {
    let maxRing = 0;
    for (const p of prepared) if (p.n > maxRing) maxRing = p.n;
    const capNow = scratch.cap;
    drawScene(recorder(), prepared, cam, scratch, { sun: sunFromHour(11), shadows: true });
    check('the scratch grew once to cover the largest real ring and stopped',
      scratch.cap === capNow && scratch.cap >= maxRing,
      'cap=' + scratch.cap + ' largest ring=' + maxRing);
  }

  // The fill-rate budget. Back-face culling is the one optimisation the design
  // counts on being there at z17 with 1700 buildings in view, and it is silent
  // when it stops working: nothing looks wrong, the phone just gets hot. So the
  // saving is measured rather than assumed.
  {
    let edges = 0, walls = 0, wallless = 0;
    for (const p of prepared) {
      projectBuilding(p, cam, scratch);
      edges += p.n;
      walls += scratch.visibleWalls;
      if (scratch.visibleWalls === 0) wallless++;
    }
    check('back-face culling drops roughly half the walls on real footprints',
      walls < edges * 0.65 && walls > 0,
      `${walls} walls drawn of ${edges} edges (${Math.round(100 * walls / edges)}%)`);
    // Recorded, not asserted as a target: the hPx < 3 roof-only shortcut is
    // inert at this zoom, because the smallest height this renderer will ever
    // produce is 2 storeys lifted (~11.4 m), which is 12 px at z17. See the
    // note in the tool's report.
    check('and the roof-only shortcut is not what is saving the z17 frame',
      wallless < prepared.length * 0.1,
      wallless + ' of ' + prepared.length + ' below the 3px lean threshold');
  }
}


print('');
print(fail ? `mass: ${fail} FAILED, ${pass} passed` : `mass: all ${pass} checks passed`);
// Gate. jsc's quit() exits 0 whatever it is given, so the only way to fail a
// CI step from here is to throw.
if (fail) throw new Error(`masscheck: ${fail} of ${fail + pass} checks failed`);
