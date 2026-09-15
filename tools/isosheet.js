// The isometric view, rendered outside a browser from real data.
//
//   jsc -m tools/isosheet.js lots.json 0          # lots exported from a session
//   jsc -m tools/isosheet.js overpass.json 0      # raw Overpass, straight off the wire
//
// Reads what the game reads, so what this shows is what the city actually
// looks like rather than a mock-up of one.
import { sceneFaces, fitCamera, toSvg, heightMetres } from '../src/ui/isoart.js';
import { classify, polygonAreaM2 } from '../src/game/lots.js';

const ARGS = (typeof arguments !== 'undefined' ? arguments : []);
const file = ARGS[0] || '/tmp/lots.json';
const turn = Number(ARGS[1] || 0);
const W = Number(ARGS[2] || 1100), H = Number(ARGS[3] || 760);
const LIMIT = Number(ARGS[4] || 0);

const data = JSON.parse(readFile(file));

// Raw Overpass, or a session export. Both end up as the same shape.
let lots, origin;
if (data.elements) {
  const ways = data.elements.filter((e) => e.geometry && e.geometry.length >= 3);
  let lat = 0, lng = 0;
  for (const w of ways) { lat += w.geometry[0].lat; lng += w.geometry[0].lon; }
  origin = { lat: lat / ways.length, lng: lng / ways.length };
  lots = ways.map((w, i) => {
    const polygon = w.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
    const tags = w.tags || {};
    return {
      id: 'W' + i, polygon, tags,
      kind: classify(tags, polygonAreaM2(polygon)),
      owned: false,
    };
  });
} else {
  origin = data.origin;
  lots = data.lots.map((l) => ({
    ...l,
    polygon: l.polygon.map(([lat, lng]) => ({ lat, lng })),
  }));
}

if (LIMIT) {
  // Keep the tallest, which is what a skyline is.
  lots.sort((a, b) => heightMetres(b) - heightMetres(a));
  lots = lots.slice(0, LIMIT);
}

const cam = fitCamera(lots, origin, { width: W, height: H, turn });
const faces = sceneFaces(lots, origin, cam, (l) => ({ owned: l.owned }));
print(toSvg(faces, W, H));
