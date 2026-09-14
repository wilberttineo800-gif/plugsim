// Every character model, so twenty people can be looked at side by side.
//   jsc -m tools/peoplesheet.js > /tmp/p.svg && qlmanage -t -s 1800 -o /tmp /tmp/p.svg
import { BODY_DEFS, FIGURE_W, FIGURE_H, figureFor } from '../src/ui/bodyart.js';
import { MODELS, appearanceFrom } from '../src/game/appearance.js';

const COLS = 5, PAD = 14, LABEL = 26;
const rows = Math.ceil(MODELS.length / COLS);
const CW = FIGURE_W + PAD * 2, CH = FIGURE_H + PAD * 2 + LABEL;
const cells = MODELS.map((m, i) => {
  const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
  return `<g transform="translate(${x} ${y})">
    <rect width="${CW}" height="${CH}" fill="${i % 2 ? '#121721' : '#0f141c'}"/>
    <g transform="translate(${PAD} ${PAD})">${figureFor(appearanceFrom(m.id))}</g>
    <text x="${PAD}" y="${FIGURE_H + PAD + 20}" fill="#8b97a8"
      font-family="ui-monospace, Menlo, monospace" font-size="15">${m.name}</text>
  </g>`;
}).join('');
print(`<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * CW}" height="${rows * CH}"
  viewBox="0 0 ${COLS * CW} ${rows * CH}"><defs>${BODY_DEFS}</defs>
  <rect width="100%" height="100%" fill="#0b0e13"/>${cells}</svg>`);
