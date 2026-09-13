// Attachment fit check.
//
// Renders patterns with parts bolted on, so a scope that floats above the rail
// or a magazine hanging in mid-air is visible before anyone opens the game.
//
//   jsc -m tools/fitsheet.js > /tmp/fit.svg && qlmanage -t -s 1300 -o /tmp /tmp/fit.svg

import { modelWithAttachments } from '../src/ui/art.js';
import { DETAIL_DEFS } from '../src/ui/gunart-detail.js';

const PAIRS = (globalThis.FIT_ONLY || 'kite,optic+suppressor;longmarch,optic+extmag;'
  + 'kestrel,suppressor+laser;hammerfall,optic+foregrip').split(';');
const COLS = 2, CELL = 78, H = 32, SCALE = 8, PAD = 3, LABEL = 7;
const rows = Math.ceil(PAIRS.length / COLS);
const W = COLS * (CELL + PAD * 2) * SCALE;
const TH = rows * (H + PAD * 2 + LABEL) * SCALE;

const cells = PAIRS.map((spec, i) => {
  const [id, parts] = spec.split(',');
  const fitted = (parts || '').split('+').filter(Boolean);
  const svg = modelWithAttachments(id, fitted, { size: 0 });
  const inner = svg.replace(/^[\s\S]*?aria-hidden="true"\s*>/, '').replace(/<\/svg>$/, '');
  const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1].split(/\s+/).map(Number);
  const x = (i % COLS) * (CELL + PAD * 2) * SCALE;
  const y = Math.floor(i / COLS) * (H + PAD * 2 + LABEL) * SCALE;
  return `<g transform="translate(${x} ${y}) scale(${SCALE})">
    <rect width="${CELL + PAD * 2}" height="${H + PAD * 2}" fill="#141922"/>
    <g transform="translate(${PAD - vb[0]} ${PAD})">${inner}</g>
    <text x="${PAD}" y="${H + PAD * 2 + 5}" fill="#8b97a8"
          font-family="ui-monospace, Menlo, monospace" font-size="4.2">${spec}</text>
  </g>`;
}).join('');

print(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${TH}" width="${W}" height="${TH}">
<defs>${DETAIL_DEFS}</defs><rect width="${W}" height="${TH}" fill="#0b0e13"/>${cells}</svg>`);
