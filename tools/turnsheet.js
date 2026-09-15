// Every character model, front and back, side by side.
//
// This is the one that matters for the turnaround: hair, facial hair, clothing
// and gear all change between the two views, and a style that reads as bald
// from behind or a hood that bunches in the wrong place is only visible here.
//
//   jsc -m tools/turnsheet.js 0 3 > /tmp/t.svg && qlmanage -t -s 1100 -o <dir> /tmp/t.svg
import {
  BODY_DEFS, FIGURE_W, FIGURE_H, figureFor, placeGear, slingPath, holsterPath,
  ARMOUR_VARIANT,
} from '../src/ui/bodyart.js';
import { ARMOUR_DETAIL, ARMOUR_DEFS } from '../src/ui/armourart.js';
import { GUN_DETAIL, DETAIL_DEFS } from '../src/ui/gunart-detail.js';
import { MODELS, appearanceFrom, BUILDS } from '../src/game/appearance.js';
import { ARMOUR_MODELS } from '../src/game/armour.js';

// A different kit on every other model, so the sheet exercises armour, a
// helmet, a long gun and a bare figure rather than twenty of the same set.
const KITS = [
  {},
  { torso: 'rigger', head: 'fullcut' },
  { torso: 'patrol', primary: 'kite', sidearm: 'kestrel' },
  { torso: 'carbide', head: 'highcut', primary: 'hammerfall' },
];

const armour = (id, slot, build, view) => {
  const d = ARMOUR_DETAIL[id];
  if (!d) return '';
  const variant = ARMOUR_VARIANT[(ARMOUR_MODELS[id] || {}).category] || null;
  const art = (view === 'back' && d.back) || d.body;
  return placeGear(slot, art, { box: d.box, ppi: d.ppi, variant, build, view });
};
const gun = (id, slot, view) => {
  const g = GUN_DETAIL[id];
  return g ? placeGear(slot, g.body, { box: g.box, ppi: g.ppi, view }) : '';
};

const ARGS = (typeof arguments !== 'undefined' ? arguments : []);
const FROM = ARGS.length ? Number(ARGS[0]) : 0;
const SHOW = ARGS.length ? MODELS.slice(FROM, Number(ARGS[1] || ARGS[0]) + 1) : MODELS;

const PAD = 10, LABEL = 22;
const CW = FIGURE_W + PAD * 2, CH = FIGURE_H + PAD * 2 + LABEL;

const one = (m, kit, view) => {
  const look = appearanceFrom(m.id);
  const build = BUILDS[look.build];
  return `<g transform="translate(${PAD} ${PAD})">
    ${figureFor(look, { view })}
    ${kit.sidearm ? holsterPath(view) : ''}
    ${kit.torso ? armour(kit.torso, 'torso', build, view) : ''}
    ${kit.head ? armour(kit.head, 'head', build, view) : ''}
    ${kit.primary ? slingPath(view) : ''}
    ${kit.primary ? gun(kit.primary, 'primary', view) : ''}
    ${kit.sidearm ? gun(kit.sidearm, 'sidearm', view) : ''}
  </g>`;
};

const cells = SHOW.map((m, i) => {
  const kit = KITS[(FROM + i) % KITS.length];
  return `<g transform="translate(0 ${i * CH})">
    <rect width="${CW * 2}" height="${CH}" fill="${i % 2 ? '#121721' : '#0f141c'}"/>
    ${one(m, kit, 'front')}
    <g transform="translate(${CW} 0)">${one(m, kit, 'back')}</g>
    <text x="${PAD}" y="${FIGURE_H + PAD + 16}" fill="#8b97a8"
      font-family="ui-monospace, Menlo, monospace" font-size="13">${m.name} · ${m.hair} · ${m.clothing}</text>
    <text x="${CW + PAD}" y="${FIGURE_H + PAD + 16}" fill="#586373"
      font-family="ui-monospace, Menlo, monospace" font-size="13">back</text>
  </g>`;
}).join('');

print(`<svg xmlns="http://www.w3.org/2000/svg" width="${CW * 2}" height="${SHOW.length * CH}"
  viewBox="0 0 ${CW * 2} ${SHOW.length * CH}">
<defs>${BODY_DEFS}${ARMOUR_DEFS}${DETAIL_DEFS}</defs>
<rect width="100%" height="100%" fill="#0b0e13"/>${cells}</svg>`);
