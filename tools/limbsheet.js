// Every fitment tier on a body, front and back.
//   jsc -m tools/limbsheet.js 0 1 > /tmp/l.svg && qlmanage -t -s 1100 -o <dir> /tmp/l.svg
import { BODY_DEFS, FIGURE_W, FIGURE_H, figureFor, FITMENT_PAINT } from '../src/ui/bodyart.js';
import { appearanceFrom } from '../src/game/appearance.js';

const CASES = [
  { name: 'crude · arm + leg', look: 'm01', fit: { armL: 'crude', legR: 'crude' } },
  { name: 'prosthetic · both arms', look: 'm06', fit: { armL: 'prosthetic', armR: 'prosthetic' } },
  { name: 'salvaged · leg', look: 'm03', fit: { legL: 'salvaged' } },
  { name: 'bionic · arm, leg, eye', look: 'm09', fit: { armR: 'bionic', legR: 'bionic', eye: 'bionic' } },
  { name: 'bionic · the lot', look: 'm14',
    fit: { armL: 'bionic', armR: 'bionic', legL: 'bionic', legR: 'bionic', eye: 'bionic' } },
  { name: 'hand + foot only', look: 'm11', fit: { hand: 'prosthetic', foot: 'crude' } },
];

const ARGS = (typeof arguments !== 'undefined' ? arguments : []);
const FROM = ARGS.length ? Number(ARGS[0]) : 0;
const SHOW = ARGS.length ? CASES.slice(FROM, Number(ARGS[1] || ARGS[0]) + 1) : CASES;

const PAD = 10, LABEL = 22;
const CW = FIGURE_W + PAD * 2, CH = FIGURE_H + PAD * 2 + LABEL;

const cells = SHOW.map((c, i) => {
  const look = appearanceFrom(c.look);
  const one = (view) => `<g transform="translate(${PAD} ${PAD})">
    ${figureFor(look, { view, fittings: c.fit })}</g>`;
  return `<g transform="translate(0 ${i * CH})">
    <rect width="${CW * 2}" height="${CH}" fill="${i % 2 ? '#121721' : '#0f141c'}"/>
    ${one('front')}<g transform="translate(${CW} 0)">${one('back')}</g>
    <text x="${PAD}" y="${FIGURE_H + PAD + 16}" fill="#8b97a8"
      font-family="ui-monospace, Menlo, monospace" font-size="13">${c.name}</text>
  </g>`;
}).join('');

print(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW * 2}" height="${SHOW.length * CH}"
  viewBox="0 0 ${CW * 2} ${SHOW.length * CH}"><defs>${BODY_DEFS}</defs>
  <rect width="100%" height="100%" fill="#0b0e13"/>${cells}</svg>`);
