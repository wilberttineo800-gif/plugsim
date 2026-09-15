// The fleet, drawn at real relative size so a van reads as bigger than a car.
//   jsc -m tools/carsheet.js 0 3 > /tmp/c.svg && qlmanage -t -s 1100 -o <dir> /tmp/c.svg
import { VEHICLE_DETAIL, VEHICLE_DEFS, vehicleTransform, FIELD_W, FIELD_H }
  from '../src/ui/vehicleart.js';

const IDS = Object.keys(VEHICLE_DETAIL);
const ARGS = (typeof arguments !== 'undefined' ? arguments : []);
const SHOW = ARGS.length ? IDS.slice(Number(ARGS[0]), Number(ARGS[1] || ARGS[0]) + 1) : IDS;

const CW = FIELD_W + 4, CH = FIELD_H + 12;
const COLS = Math.min(2, SHOW.length);
const cells = SHOW.map((id, i) => {
  const d = VEHICLE_DETAIL[id];
  const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
  return `<g transform="translate(${x} ${y})">
    <rect width="${CW}" height="${CH}" fill="${(i + Math.floor(i / COLS)) % 2 ? '#121721' : '#0f141c'}"/>
    <g transform="translate(2 2)"><g transform="${vehicleTransform(d)}">${d.body}</g></g>
    <text x="3" y="${CH - 2}" fill="#8b97a8" font-family="ui-monospace, Menlo, monospace"
      font-size="4.5">${id}</text>
  </g>`;
}).join('');

const W = COLS * CW, H = Math.ceil(SHOW.length / COLS) * CH;
print(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${VEHICLE_DEFS}</defs><rect width="100%" height="100%" fill="#0b0e13"/>${cells}</svg>`);
