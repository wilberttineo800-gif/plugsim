// Render the figure, so the proportions can be looked at rather than guessed.
//   jsc -m tools/bodysheet.js > /tmp/b.svg && qlmanage -t -s 900 -o /tmp /tmp/b.svg
import { BODY_DEFS, SKELETON, FIGURE_W, FIGURE_H, figure } from '../src/ui/bodyart.js';

const plain = figure({ fillFor: () => 'url(#bfSkin)' });
const xray = figure({ fillFor: () => 'url(#bfFilm)', stroke: '#1b2836' }) + SKELETON;

print(`<svg xmlns="http://www.w3.org/2000/svg" width="${FIGURE_W * 2 + 60}" height="${FIGURE_H + 40}"
  viewBox="0 0 ${FIGURE_W * 2 + 60} ${FIGURE_H + 40}">
<defs>${BODY_DEFS}</defs>
<rect width="100%" height="100%" fill="#0b0e13"/>
<g transform="translate(20 20)">${plain}</g>
<g transform="translate(${FIGURE_W + 40} 20)"><rect width="${FIGURE_W}" height="${FIGURE_H}" fill="#070d14"/>${xray}</g>
</svg>`);
