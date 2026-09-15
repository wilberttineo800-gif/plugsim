// A figure wearing things, so the placement can be looked at rather than guessed.
//   jsc -m tools/kitsheet.js > /tmp/k.svg && qlmanage -t -s 900 -o <dir> /tmp/k.svg
import {
  BODY_DEFS, FIGURE_W, FIGURE_H, figureFor, placeGear, slingPath, holsterPath,
  ARMOUR_VARIANT,
} from '../src/ui/bodyart.js';
import { ARMOUR_DETAIL, ARMOUR_DEFS } from '../src/ui/armourart.js';
import { GUN_DETAIL, DETAIL_DEFS } from '../src/ui/gunart-detail.js';
import { appearanceFrom, BUILDS } from '../src/game/appearance.js';
import { ARMOUR_MODELS } from '../src/game/armour.js';

// `jsc -m tools/kitsheet.js 1 3 back` renders the same figures from behind.
const VIEW = (typeof arguments !== 'undefined' && arguments[2]) === 'back' ? 'back' : 'front';

const armour = (id, slot, build) => {
  const d = ARMOUR_DETAIL[id];
  if (!d) return '';
  const variant = ARMOUR_VARIANT[(ARMOUR_MODELS[id] || {}).category] || null;
  const art = (VIEW === 'back' && d.back) || d.body;
  return placeGear(slot, art, { box: d.box, ppi: d.ppi, variant, build, view: VIEW });
};
const gun = (id, slot) => {
  const g = GUN_DETAIL[id];
  return g ? placeGear(slot, g.body, { box: g.box, ppi: g.ppi, view: VIEW }) : '';
};

const SETS = [
  { name: 'nothing', look: 'm01' },
  { name: 'plate carrier', look: 'm09', torso: 'rigger' },
  { name: 'plates + helmet', look: 'm03', torso: 'carbide', head: 'highcut' },
  { name: 'vest, carbine, sidearm', look: 'm15', torso: 'patrol', primary: 'kite', sidearm: 'vulcan' },
  { name: 'sidearm only', look: 'm11', torso: 'shadow', sidearm: 'kestrel' },
  { name: 'the lot', look: 'm05', torso: 'rigger', head: 'fullcut', primary: 'hammerfall', sidearm: 'kestrel' },
  { name: 'shield', look: 'm07', torso: 'patrol', offhand: 'minishield', sidearm: 'warden' },
];

// `jsc -m tools/kitsheet.js 2 4` renders only those sets — qlmanage crops square,
// so a wide sheet has to be looked at a couple of figures at a time.
const ARGS = (typeof arguments !== 'undefined' ? arguments : []);
const SHOW = ARGS.length ? SETS.slice(Number(ARGS[0]), Number(ARGS[1] || ARGS[0]) + 1) : SETS;
const PAD = 12, LABEL = 26;
const CW = FIGURE_W + PAD * 2, CH = FIGURE_H + PAD * 2 + LABEL;
const cells = SHOW.map((s, i) => {
  const look = appearanceFrom(s.look);
  const build = BUILDS[look.build];
  return `<g transform="translate(${i * CW} 0)">
    <rect width="${CW}" height="${CH}" fill="${i % 2 ? '#121721' : '#0f141c'}"/>
    <g transform="translate(${PAD} ${PAD})">
      ${figureFor(look, { view: VIEW })}
      ${s.sidearm ? holsterPath(VIEW) : ''}
      ${s.torso ? armour(s.torso, 'torso', build) : ''}
      ${s.head ? armour(s.head, 'head', build) : ''}
      ${s.primary ? slingPath(VIEW) : ''}
      ${s.primary ? gun(s.primary, 'primary') : ''}
      ${s.sidearm ? gun(s.sidearm, 'sidearm') : ''}
      ${s.offhand ? armour(s.offhand, 'offhand', build) : ''}
    </g>
    <text x="${PAD}" y="${FIGURE_H + PAD + 20}" fill="#8b97a8"
      font-family="ui-monospace, Menlo, monospace" font-size="14">${s.name}</text>
  </g>`;
}).join('');

print(`<svg xmlns="http://www.w3.org/2000/svg" width="${SHOW.length * CW}" height="${CH}"
  viewBox="0 0 ${SHOW.length * CW} ${CH}">
<defs>${BODY_DEFS}${ARMOUR_DEFS}${DETAIL_DEFS}</defs>
<rect width="100%" height="100%" fill="#0b0e13"/>${cells}</svg>`);
