// The isometric projection, checked without a browser.
//
// This is pure geometry, which means it is exactly the kind of thing that is
// wrong in a way you cannot see until it is on screen — so the properties that
// have to hold are asserted here rather than eyeballed.

import {
  toWorld, toScreen, depthOf, buildingFaces, sceneFaces, fitCamera, boundsOf,
  paletteFor, PITCH, STOREY_M, liftedHeight, heightMetres, LIFT_M, frameOn, groundQuad,
} from '../src/ui/isoart.js';
import { heightMetresOf } from '../src/game/lots.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; print('  FAIL ' + m); } };

const origin = { lat: 39.2904, lng: -76.6122 };
const cam = { scale: 2, ox: 400, oy: 300, turn: 0 };

// A 20m square, wound counter-clockwise in lat/lng, and the same one reversed.
const square = (rev = false) => {
  const d = 0.00018;
  const p = [
    { lat: origin.lat, lng: origin.lng },
    { lat: origin.lat, lng: origin.lng + d },
    { lat: origin.lat + d, lng: origin.lng + d },
    { lat: origin.lat + d, lng: origin.lng },
  ];
  return rev ? p.slice().reverse() : p;
};
const lotOf = (levels, rev = false, kind = 'house') =>
  ({ id: 'x', kind, levels, polygon: square(rev) });

// --- the projection ---------------------------------------------------------
{
  const w = toWorld({ lat: origin.lat + 0.001, lng: origin.lng }, origin);
  ok(w.x === 0, 'moving north does not move you east');
  ok(w.y < 0, 'and north is up the screen, not down');

  const a = toScreen(0, 0, 0, cam);
  const b = toScreen(10, 0, 0, cam);
  const c = toScreen(0, 10, 0, cam);
  ok(Math.abs((b.sx - a.sx) + (c.sx - a.sx)) < 1e-9,
    'the two ground axes lean opposite ways');
  ok(Math.abs((b.sy - a.sy) - (c.sy - a.sy)) < 1e-9, 'and drop by the same amount');
  ok(Math.abs((b.sy - a.sy) / (b.sx - a.sx) - PITCH) < 1e-9,
    'at the 2:1 pitch the whole look depends on');

  const up = toScreen(0, 0, 10, cam);
  ok(up.sy < a.sy, 'height goes up the screen');
  ok(up.sx === a.sx, 'and straight up, not sideways');
}

// --- walls face the right way ----------------------------------------------
//
// The bug this pins: the first pass decided which walls were visible from the
// screen-space x of each edge, which is only correct for one winding. Every
// clockwise OSM way came out with its far walls standing up behind its roof.
{
  for (const rev of [false, true]) {
    for (const turn of [0, 1, 2, 3]) {
      const c = { ...cam, turn };
      const faces = buildingFaces(lotOf(3, rev), origin, c);
      const walls = faces.filter((f) => f.kind === 'wall');
      const roof = faces.filter((f) => f.kind === 'roof');
      ok(roof.length === 1, `one roof (rev=${rev} turn=${turn}): got ${roof.length}`);
      ok(walls.length === 2,
        `a square shows exactly two walls (rev=${rev} turn=${turn}): got ${walls.length}`);

      // Every wall has to hang DOWN from the roof edge it belongs to.
      const bad = walls.filter((w) => {
        const topY = Math.min(w.points[2].sy, w.points[3].sy);
        const botY = Math.max(w.points[0].sy, w.points[1].sy);
        return botY <= topY;
      });
      ok(bad.length === 0, `and hangs below its roof edge (rev=${rev} turn=${turn})`);
    }
  }
}

// --- height -----------------------------------------------------------------
{
  const low = boundsOf(buildingFaces(lotOf(1), origin, cam));
  const high = boundsOf(buildingFaces(lotOf(8), origin, cam));
  ok(high.h > low.h, 'eight storeys is taller on screen than one');
  const gained = (high.h - low.h) / cam.scale;
  const expect = liftedHeight(8 * STOREY_M) - liftedHeight(1 * STOREY_M);
  ok(Math.abs(gained - expect) < 0.001,
    `and by the lifted difference (got ${gained.toFixed(2)}m, want ${expect.toFixed(2)}m)`);

  // A car park is flat, whatever OSM claims about its levels.
  const park = boundsOf(buildingFaces(lotOf(3, false, 'parking'), origin, cam));
  const house = boundsOf(buildingFaces(lotOf(3, false, 'house'), origin, cam));
  ok(park.h < house.h, 'a car park is flatter than a building of the same storeys');
}

// --- painting order ---------------------------------------------------------
{
  const near = { id: 'n', kind: 'house', levels: 2, polygon: square() };
  const far = {
    id: 'f', kind: 'house', levels: 2,
    polygon: square().map((p) => ({ lat: p.lat + 0.003, lng: p.lng - 0.003 })),
  };
  const faces = sceneFaces([near, far], origin, cam);
  const firstNear = faces.findIndex((f) => f.depth > 0);
  ok(firstNear > 0, 'something is drawn before the nearest thing');
  const depths = faces.map((f) => f.depth);
  ok(depths.every((d, i) => i === 0 || d >= depths[i - 1]), 'and the order never goes backwards');
}

// --- framing ----------------------------------------------------------------
{
  const lots = [lotOf(2), {
    id: 'b', kind: 'commercial', levels: 9,
    polygon: square().map((p) => ({ lat: p.lat + 0.002, lng: p.lng + 0.002 })),
  }];
  for (const turn of [0, 1, 2, 3]) {
    const c = fitCamera(lots, origin, { width: 800, height: 600, turn, pad: 20 });
    const b = boundsOf(sceneFaces(lots, origin, c));
    ok(b.minX >= 19 && b.maxX <= 781 && b.minY >= 19 && b.maxY <= 581,
      `the fit actually fits at turn ${turn} (${Math.round(b.minX)}..${Math.round(b.maxX)}, `
      + `${Math.round(b.minY)}..${Math.round(b.maxY)})`);
  }
}

// --- paint ------------------------------------------------------------------
{
  const own = paletteFor('house', { owned: true });
  const plain = paletteFor('house');
  ok(own.roof !== plain.roof, 'a lot you own does not look like one you do not');
  ok(paletteFor('house', { owned: true, running: true }).roof !== own.roof,
    'and one with something running in it is different again');
  ok(paletteFor('nonsense-kind').roof, 'an unknown building kind still gets paint');
  const p = paletteFor('house');
  ok(p.a !== p.b, 'and the two wall faces differ, or a box reads as a hexagon');
}



// --- real heights -----------------------------------------------------------
//
// The whole point of building on real data: if you go to New York the towers
// have to be towers. A surveyed `height` tag beats a levels count beats a
// guess, and getting that order wrong turns the Empire State into a generic
// twelve-storey block — which is what reading levels first does.
{
  ok(heightMetres({ tags: { height: '381' }, levels: 12 }) === 381,
    'a stated height wins over a levels count');
  ok(heightMetres({ tags: { height: '381 m' }, levels: 12 }) === 381,
    'and is read even with the unit on it');
  ok(heightMetres({ tags: { 'building:levels': '102' } }) === 102 * STOREY_M,
    'a levels count is used when there is no height');
  ok(heightMetres({ levels: 3 }) === 3 * STOREY_M, 'and the lot\u2019s own levels after that');
  ok(heightMetres({}) === 2 * STOREY_M, 'and something sensible with nothing at all');
  ok(heightMetres({ tags: { height: '99999' } }) === 830,
    'a nonsense height is clamped rather than drawn');

  // The lift has to fade, or the tallest buildings in the world are wrong.
  const row = liftedHeight(6.2), tower = liftedHeight(381);
  ok(row > 6.2 * 1.6, `a rowhouse is lifted enough to read (${row.toFixed(1)}m from 6.2)`);
  ok(tower - 381 < 0.01, `and a 381m tower is drawn at 381m (got ${tower.toFixed(2)})`);
  ok(liftedHeight(0) <= LIFT_M + 0.001, 'nothing gains more than the lift itself');
  // Monotonic: a taller building must never come out shorter than a short one.
  let prev = -1, mono = true;
  for (let m = 0; m <= 400; m += 0.5) {
    const v = liftedHeight(m);
    if (v < prev) mono = false;
    prev = v;
  }
  ok(mono, 'and taller is always taller on screen');
}


// --- the surveyed height, as the game will hand it over ---------------------
//
// The renderer reads what `buildLots` stores, so the parsing has to agree with
// it. Feet exist in the wild and a building tagged "1250'" is not 1250 metres.
{
  ok(heightMetresOf({ height: '443.2' }) === 443.2, 'a plain metre height');
  ok(heightMetresOf({ height: '112 m' }) === 112, 'and one with a unit on it');
  ok(heightMetresOf({ 'building:height': '60' }) === 60, 'the other spelling of the tag');
  ok(Math.abs(heightMetresOf({ height: "1250'" }) - 381) < 0.5,
    `feet are converted, not taken as metres (${heightMetresOf({ height: "1250'" })})`);
  ok(heightMetresOf({}) === null, 'nothing when nobody measured');
  ok(heightMetresOf({ height: 'tall' }) === null, 'and nothing from a word');
  ok(heightMetresOf({ height: '0.5' }) === null, 'a height under a metre is a mistake');
  ok(heightMetresOf({ height: '99999' }) === 830, 'and an absurd one is clamped');

  // A lot carrying a surveyed height must beat its own level count.
  ok(heightMetres({ heightM: 443.2, levels: 12 }) === 443.2,
    'and the lot field wins over levels, which is the Empire State case exactly');
}


// --- framing for a screen that is taller than it is wide --------------------
//
// Fitting a whole survey onto a phone is what made the prototype unusable
// there: an isometric diamond is roughly 2:1 wide and a portrait phone is
// roughly 1:2 tall, so the fit is decided by width and most of the screen ends
// up empty with every building a few pixels across.
{
  const centre = { lat: origin.lat, lng: origin.lng };
  for (const [w, h] of [[390, 755], [1440, 800], [768, 1024]]) {
    const cam = frameOn(centre, origin, { width: w, height: h, metresAcross: 240 });
    const at = toScreen(0, 0, 0, cam);
    ok(Math.abs(at.sx - w / 2) < 0.001 && Math.abs(at.sy - h / 2) < 0.001,
      `the centre lands in the middle at ${w}x${h}`);
    const low = frameOn(centre, origin, { width: w, height: h, metresAcross: 240, groundAt: 0.62 });
    const lowAt = toScreen(0, 0, 0, low);
    ok(Math.abs(lowAt.sy - h * 0.62) < 0.001,
      `and lower down when asked, so towers have room at ${w}x${h}`);
    // 240m of ground across the short edge, whichever edge that is.
    const across = Math.min(w, h) / cam.scale;
    ok(Math.abs(across - 240) < 0.001, `and 240m spans the short edge at ${w}x${h}`);
  }

  // On a phone, framing has to be closer than fitting a whole district.
  const lots = [];
  for (let i = 0; i < 40; i++) {
    lots.push({
      id: 'x' + i, kind: 'rowhouse', levels: 2,
      polygon: square().map((p) => ({
        lat: p.lat + (i % 8) * 0.0004, lng: p.lng + Math.floor(i / 8) * 0.0004,
      })),
    });
  }
  const fitted = fitCamera(lots, origin, { width: 390, height: 755 });
  const framed = frameOn(origin, origin, { width: 390, height: 755, metresAcross: 240 });
  ok(framed.scale > fitted.scale * 2,
    `and is much closer than the fit (${framed.scale.toFixed(2)} vs ${fitted.scale.toFixed(2)} px/m)`);
}


// --- the floor --------------------------------------------------------------
{
  const lots = [lotOf(2), {
    id: 'b', kind: 'house', levels: 2,
    polygon: square().map((p) => ({ lat: p.lat + 0.001, lng: p.lng + 0.001 })),
  }];
  const q = groundQuad(lots, origin, cam);
  ok(q && q.length === 4, 'the ground is a quad');
  const b = boundsOf([{ points: q }]);
  const inner = boundsOf(sceneFaces(lots, origin, cam));
  ok(b.minX < inner.minX && b.maxX > inner.maxX,
    'and reaches past the buildings standing on it');
  ok(groundQuad([], origin, cam) === null, 'and there is none when there is nothing');

  // It has to turn with the city, or it stops being the same piece of ground.
  const a0 = groundQuad(lots, origin, { ...cam, turn: 0 });
  const a1 = groundQuad(lots, origin, { ...cam, turn: 1 });
  ok(JSON.stringify(a0) !== JSON.stringify(a1), 'and turns with the camera');
}

print(fail ? `iso: ${fail} FAILED, ${pass} passed` : `iso: all ${pass} checks passed`);
