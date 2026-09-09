// Contact sheet for the detailed gun artwork.
//
// Renders every drawing in gunart-detail.js at its real field size into one SVG,
// so a batch can be looked at side by side. Run under JavaScriptCore and
// rasterise the output — the machine has no screen we can rely on:
//
//   jsc -m tools/sheet.js > /tmp/sheet.svg
//   qlmanage -t -s 1600 -o /tmp/out /tmp/sheet.svg

import { GUN_DETAIL, DETAIL_DEFS, detailTransform, mountInField } from '../src/ui/gunart-detail.js';

const COLS = 2;
const CELL_W = 64;
const CELL_H = 32;
const SCALE = 7;          // draw each cell big enough to judge
const PAD = 3;
const LABEL = 7;

const ids = Object.keys(GUN_DETAIL);
const rows = Math.ceil(ids.length / COLS);
const W = COLS * (CELL_W + PAD * 2) * SCALE;
const H = rows * (CELL_H + PAD * 2 + LABEL) * SCALE;

const cells = ids.map((id, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * (CELL_W + PAD * 2) * SCALE;
  const y = row * (CELL_H + PAD * 2 + LABEL) * SCALE;
  const d = GUN_DETAIL[id];

  // Mount points, drawn as crosshairs so misplaced anchors are visible before
  // an attachment is ever hung on them.
  const marks = Object.keys(d.mounts || {}).map((name) => {
    const p = mountInField(d, name);
    if (!p) return '';
    return `<g stroke="#e0574f" stroke-width=".22" opacity=".8">
      <path d="M${(p[0] - 1).toFixed(2)} ${p[1].toFixed(2)} h2"/>
      <path d="M${p[0].toFixed(2)} ${(p[1] - 1).toFixed(2)} v2"/></g>`;
  }).join('');

  return `<g transform="translate(${x} ${y}) scale(${SCALE})">
    <rect width="${CELL_W + PAD * 2}" height="${CELL_H + PAD * 2}" fill="#141922"/>
    <g transform="translate(${PAD} ${PAD})">
      <g transform="${detailTransform(d)}">${d.body}</g>${marks}
    </g>
    <text x="${PAD}" y="${CELL_H + PAD * 2 + 5}" fill="#8b97a8"
          font-family="ui-monospace, Menlo, monospace" font-size="4.4">${id}</text>
  </g>`;
}).join('');

print(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>${DETAIL_DEFS}</defs>
<rect width="${W}" height="${H}" fill="#0b0e13"/>
${cells}
</svg>`);
