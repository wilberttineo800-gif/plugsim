// Contact sheet for the body-armour artwork.
//
// Same job as tools/sheet.js does for the guns: renders every drawing at its
// real field size so a batch can be judged side by side.
//
//   jsc -m tools/armoursheet.js > /tmp/a.svg
//   qlmanage -t -s 1300 -o /tmp /tmp/a.svg

import { ARMOUR_DETAIL, ARMOUR_DEFS, armourTransform, ARMOUR_FIELD } from '../src/ui/armourart.js';

const only = (globalThis.SHEET_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const ids = only.length ? only.filter((id) => ARMOUR_DETAIL[id]) : Object.keys(ARMOUR_DETAIL);

const COLS = Number(globalThis.SHEET_COLS || 4);
const CELL = ARMOUR_FIELD;
const SCALE = 11;
const PAD = 2;
const LABEL = 7;
const rows = Math.ceil(ids.length / COLS);
const W = COLS * (CELL + PAD * 2) * SCALE;
const H = rows * (CELL + PAD * 2 + LABEL) * SCALE;

const cells = ids.map((id, i) => {
  const x = (i % COLS) * (CELL + PAD * 2) * SCALE;
  const y = Math.floor(i / COLS) * (CELL + PAD * 2 + LABEL) * SCALE;
  const d = ARMOUR_DETAIL[id];
  return `<g transform="translate(${x} ${y}) scale(${SCALE})">
    <rect width="${CELL + PAD * 2}" height="${CELL + PAD * 2}" fill="#141922"/>
    <g transform="translate(${PAD} ${PAD})"><g transform="${armourTransform(d)}">${d.body}</g></g>
    <text x="${PAD}" y="${CELL + PAD * 2 + 5}" fill="#8b97a8"
          font-family="ui-monospace, Menlo, monospace" font-size="4">${id}</text>
  </g>`;
}).join('');

print(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${ARMOUR_DEFS}</defs><rect width="${W}" height="${H}" fill="#0b0e13"/>${cells}</svg>`);
