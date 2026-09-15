// The isometric projection, checked without a browser.
//
// This is pure geometry, which means it is exactly the kind of thing that is
// wrong in a way you cannot see until it is on screen — so the properties that
// have to hold are asserted here rather than eyeballed.

import {
  toWorld, toScreen, depthOf, buildingFaces, sceneFaces, fitCamera, boundsOf,
  paletteFor, PITCH, STOREY_M, LIFT,
} from '../src/ui/isoart.js';

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
  ok(Math.abs(gained - 7 * STOREY_M * LIFT) < 0.001,
    `and by exactly seven lifted storeys (got ${gained.toFixed(2)}m)`);

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

print(fail ? `iso: ${fail} FAILED, ${pass} passed` : `iso: all ${pass} checks passed`);
