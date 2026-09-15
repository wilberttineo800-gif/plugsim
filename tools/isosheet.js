// The isometric view, rendered from real lot data outside a browser.
//   tools/safari-eval.sh <export> > /tmp/lots.json
//   jsc -m tools/isosheet.js /tmp/lots.json 0 > /tmp/i.svg
//
// Reads the same lots the game generates, so what this shows is what the city
// actually looks like rather than a mock-up of one.
import { sceneFaces, fitCamera, toSvg } from '../src/ui/isoart.js';

const ARGS = (typeof arguments !== 'undefined' ? arguments : []);
const file = ARGS[0] || '/tmp/lots.json';
const turn = Number(ARGS[1] || 0);
const W = Number(ARGS[2] || 1100), H = Number(ARGS[3] || 760);

const data = JSON.parse(readFile(file));
const lots = data.lots.map((l) => ({
  ...l,
  polygon: l.polygon.map(([lat, lng]) => ({ lat, lng })),
}));

const cam = fitCamera(lots, data.origin, { width: W, height: H, turn });
const faces = sceneFaces(lots, data.origin, cam, (l) => ({ owned: l.owned }));
print(toSvg(faces, W, H));
