// The figure.
//
// One drawing does two jobs. On the character screen it is a person you hang
// equipment on; in the X-ray it is the same person with the skin taken off and
// every wound marked where it actually landed. Both need the body parts to be
// SEPARATELY ADDRESSABLE — a chest wound has to light the chest and not the
// whole silhouette — so the figure is a map of paths keyed by the same part ids
// the health model uses, rather than one outline.
//
// Drawn front-on at 6.3 px/in against a 70" adult, which is where the
// proportions come from: the head is about a seventh of standing height, the
// shoulders about a quarter of it across, and the legs half of it.

export const FIGURE_W = 200;
export const FIGURE_H = 456;

export const BODY_DEFS = `
  <linearGradient id="bfSkin" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#5b6472"/><stop offset=".5" stop-color="#464e5a"/>
    <stop offset="1" stop-color="#343b45"/>
  </linearGradient>
  <linearGradient id="bfSkinLit" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6d7785"/><stop offset=".5" stop-color="#565f6c"/>
    <stop offset="1" stop-color="#3e4551"/>
  </linearGradient>
  <linearGradient id="bfBone" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cfd6dd"/><stop offset=".55" stop-color="#a8b2bd"/>
    <stop offset="1" stop-color="#7d8894"/>
  </linearGradient>
  <linearGradient id="bfFilm" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0e1822"/><stop offset="1" stop-color="#060c12"/>
  </linearGradient>
  <radialGradient id="bfWound">
    <stop offset="0" stop-color="#ff6b5e" stop-opacity=".95"/>
    <stop offset=".6" stop-color="#c8443c" stop-opacity=".55"/>
    <stop offset="1" stop-color="#c8443c" stop-opacity="0"/>
  </radialGradient>
  <!-- Kit is dropped-shadowed so it separates from whatever the figure is
       wearing. Without it a pale vest over a pale coat merges into one blob. -->
  <filter id="bfKit" x="-20%" y="-20%" width="145%" height="145%">
    <feDropShadow dx="1.5" dy="2.5" stdDeviation="2.4" flood-color="#05070a" flood-opacity=".6"/>
  </filter>
  <radialGradient id="bfSepsis">
    <stop offset="0" stop-color="#b388ff" stop-opacity=".9"/>
    <stop offset="1" stop-color="#7a4fd0" stop-opacity="0"/>
  </radialGradient>
`;

/**
 * Each part as its own closed shape, in one shared coordinate space.
 *
 * The two arms and two legs are the same geometry mirrored about the midline,
 * which keeps them honestly symmetrical and halves what there is to get wrong.
 */
const ARM = `M46 92 c-11 3 -17 10 -18 21 l-6 76
  c-1 15 -3 29 -6 41 c-2 9 2 15 11 16 s14 -3 16 -12
  c5 -19 8 -36 9 -50 l7 -72 z`;
const LEG = `M54 268 h44 l-3 70 c-1 23 -3 45 -6 63 c-2 12 -3 21 -4 27
  c-1 9 -6 14 -16 14 s-15 -5 -14 -15 c2 -31 3 -60 3 -89 z`;

/**
 * Which way each part stretches when a build is applied.
 *
 * Build is not a different skeleton — it is the same figure with the shoulders
 * or the waist taken in or let out about the midline, and the limbs thickened
 * about their own centre. Doing it as per-part transforms means one set of
 * paths serves every frame instead of five.
 */
export const BODY_ART = {
  head: {
    path: 'M100 8 c18 0 30 14 30 32 c0 12 -4 22 -11 28 l0 10 h-38 l0 -10 '
      + 'c-7 -6 -11 -16 -11 -28 c0 -18 12 -32 30 -32 z',
    at: [100, 38], about: 100, trait: null,
  },
  neck: { path: 'M84 70 h32 v14 h-32 z', at: [100, 78], about: 100, trait: null },
  thorax: {
    path: 'M100 78 c15 0 32 3 46 9 c8 3 12 9 12 18 v44 '
      + 'c0 23 -3 42 -8 56 h-100 c-5 -14 -8 -33 -8 -56 v-44 '
      + 'c0 -9 4 -15 12 -18 c14 -6 31 -9 46 -9 z',
    at: [100, 140], about: 100, trait: 'shoulder',
  },
  abdomen: {
    path: 'M52 205 h96 c3 17 4 33 3 47 c-1 11 -7 17 -18 17 h-66 '
      + 'c-11 0 -17 -6 -18 -17 c-1 -14 0 -30 3 -47 z',
    at: [100, 236], about: 100, trait: 'waist',
  },
  armL: { path: ARM, at: [36, 190], about: 36, trait: 'limb' },
  armR: { path: ARM, mirror: true, at: [164, 190], about: 36, trait: 'limb' },
  legL: { path: LEG, at: [76, 350], about: 76, trait: 'limb' },
  legR: { path: LEG, mirror: true, at: [124, 350], about: 76, trait: 'limb' },
};

/** Bones, for the X-ray. Not anatomy homework — enough to read as a film. */
export const SKELETON = `
  <g fill="url(#bfBone)" opacity=".85">
    <path d="M100 12 c16 0 27 13 27 29 c0 12 -5 21 -12 26 h-30 c-7 -5 -12 -14 -12 -26
             c0 -16 11 -29 27 -29 z"/>
    <rect x="92" y="68" width="16" height="18" rx="4"/>
    <rect x="94" y="86" width="12" height="120" rx="5"/>
    <path d="M60 96 h80 v7 h-80 z M57 112 h86 v7 h-86 z M56 128 h88 v7 h-88 z
             M57 144 h86 v7 h-86 z M60 160 h80 v7 h-80 z M64 176 h72 v7 h-72 z"/>
    <path d="M46 92 h52 v9 h-52 z M102 92 h52 v9 h-52 z"/>
    <path d="M58 210 h84 c4 18 3 36 -2 46 h-18 c1 -14 -5 -22 -22 -22 s-23 8 -22 22
             h-18 c-5 -10 -6 -28 -2 -46 z"/>
  </g>
  <g fill="#0a121b" opacity=".9">
    <ellipse cx="74" cy="238" rx="9" ry="11"/>
    <ellipse cx="126" cy="238" rx="9" ry="11"/>
  </g>
  <g fill="url(#bfBone)" opacity=".8">
    <path d="M36 100 l10 -2 l6 78 l-10 2 z M40 182 l10 -2 l5 64 l-10 2 z"/>
    <path d="M164 100 l-10 -2 l-6 78 l10 2 z M160 182 l-10 -2 l-5 64 l10 2 z"/>
    <path d="M68 270 h16 l-4 82 h-14 z M66 356 h14 l-4 80 h-12 z"/>
    <path d="M132 270 h-16 l4 82 h14 z M134 356 h-14 l4 80 h12 z"/>
  </g>
`;

/**
 * The transform for one part: mirrored if it is a left/right pair, and
 * stretched if a build is in play.
 */
export function partTransform(part, build = null) {
  const bits = [];
  if (part.mirror) bits.push(`translate(${FIGURE_W} 0) scale(-1 1)`);
  if (build && part.trait && build[part.trait] && build[part.trait] !== 1) {
    const s = build[part.trait];
    const cx = part.about;
    bits.push(`translate(${cx} 0) scale(${s} 1) translate(${-cx} 0)`);
  }
  return bits.join(' ');
}

/**
 * The figure, with each part filled by whatever the caller decides.
 *
 * `fillFor(partId)` returns a paint; `extra(partId)` returns anything to draw
 * on top of that part. Keeping both as callbacks is what lets the character
 * screen and the X-ray share one drawing instead of diverging into two.
 */
export function figure({ fillFor, extra = () => '', stroke = '#0b0e13', build = null } = {}) {
  return Object.keys(BODY_ART).map((id) => {
    const part = BODY_ART[id];
    const tr = partTransform(part, build);
    return `<g${tr ? ` transform="${tr}"` : ''}>
      <path d="${part.path}" fill="${fillFor(id)}" stroke="${stroke}" stroke-width="2"/>
    </g>${extra(id)}`;
  }).join('');
}

// --- Appearance -------------------------------------------------------------
//
// Hair, facial hair and clothing, drawn over the figure. Each is a small shape
// keyed off the trait tables in game/appearance.js — kept here rather than
// there because these are drawings and that is data.

import {
  BUILDS, SKINS, HAIR_COLOURS, CLOTH_COLOURS, CLOTHING, normaliseAppearance,
} from '../game/appearance.js';

/**
 * A face: eyes, brows, and the shadow under the jaw.
 *
 * Minimal on purpose — the rest of the game's art is flat and unfussy — but
 * not absent. A head with nothing on it reads as a shop dummy rather than as
 * somebody, which is the one thing a character model cannot afford to do.
 */
function faceShapes(skin) {
  return `<g>
    <ellipse cx="88" cy="40" rx="4" ry="4.6" fill="#15181c" opacity=".8"/>
    <ellipse cx="112" cy="40" rx="4" ry="4.6" fill="#15181c" opacity=".8"/>
    <ellipse cx="86.6" cy="38.6" rx="1.4" ry="1.6" fill="#e8eef4" opacity=".5"/>
    <ellipse cx="110.6" cy="38.6" rx="1.4" ry="1.6" fill="#e8eef4" opacity=".5"/>
    <path d="M80 31 h15 v3 h-15 z M105 31 h15 v3 h-15 z" fill="${skin.dark}" opacity=".8"/>
    <path d="M97 44 h6 v9 h-6 z" fill="${skin.dark}" opacity=".45"/>
    <path d="M91 62 h18 v3 h-18 z" fill="${skin.dark}" opacity=".6"/>
    <path d="M74 56 c3 14 13 22 26 22 s23 -8 26 -22 v6
      c0 16 -11 26 -26 26 s-26 -10 -26 -26 z" fill="${skin.dark}" opacity=".2"/>
  </g>`;
}

/** The skull, roughly: what hair has to sit on. */
const SKULL_TOP = 'M100 8 c18 0 30 14 30 32 c0 6 -1 11 -3 16 h-54 c-2 -5 -3 -10 -3 -16 c0 -18 12 -32 30 -32 z';

function hairShape(style, hex) {
  const dark = hex;
  switch (style) {
    case 'bald': return '';
    case 'buzz':
      return `<path d="${SKULL_TOP}" fill="${dark}" opacity=".55"/>`;
    case 'short':
      return `<path d="M100 6 c19 0 31 15 31 34 c0 4 0 7 -1 10 l-11 -2 c1 -14 -6 -24 -19 -24
        s-20 10 -19 24 l-11 2 c-1 -3 -1 -6 -1 -10 c0 -19 12 -34 31 -34 z" fill="${dark}"/>`;
    case 'fade':
      return `<path d="M100 6 c19 0 31 14 31 32 h-62 c0 -18 12 -32 31 -32 z" fill="${dark}"/>
        <path d="M69 28 h62 v8 h-62 z" fill="${dark}" opacity=".45"/>`;
    case 'afro':
      // Drawn as a dome that MEETS the hairline, not an ellipse centred above
      // the skull — as an ellipse it read as a beret balanced on the head.
      return `<path d="M63 40 c-3 -24 15 -38 37 -38 s40 14 37 38
          c-6 2 -12 3 -18 3 c1 -13 -7 -21 -19 -21 s-20 8 -19 21
          c-6 0 -12 -1 -18 -3 z" fill="${dark}"/>
        <path d="M100 2 c14 0 26 6 32 17 c-8 -7 -19 -11 -32 -11
          s-24 4 -32 11 c6 -11 18 -17 32 -17 z" fill="#fff" opacity=".07"/>`;
    case 'locs':
      return `<path d="M100 2 c21 0 34 13 34 30 h-68 c0 -17 13 -30 34 -30 z" fill="${dark}"/>
        <g fill="${dark}">
          <rect x="62" y="30" width="9" height="54" rx="4"/>
          <rect x="76" y="36" width="9" height="44" rx="4"/>
          <rect x="115" y="36" width="9" height="44" rx="4"/>
          <rect x="129" y="34" width="9" height="54" rx="4"/>
        </g>`;
    case 'braids':
      return `<path d="M100 3 c20 0 33 12 33 29 h-66 c0 -17 13 -29 33 -29 z" fill="${dark}"/>
        <g stroke="#000" stroke-width="1.6" opacity=".35">
          <path d="M78 6 v26"/><path d="M89 3 v29"/><path d="M100 2 v30"/>
          <path d="M111 3 v29"/><path d="M122 6 v26"/>
        </g>
        <g fill="${dark}">
          <rect x="66" y="30" width="7" height="44" rx="3"/>
          <rect x="127" y="30" width="7" height="44" rx="3"/>
        </g>`;
    case 'long':
      return `<path d="M100 5 c21 0 34 15 34 34 v44 c0 6 -4 9 -10 9 h-8 l4 -50
        c1 -15 -6 -25 -20 -25 s-21 10 -20 25 l4 50 h-8 c-6 0 -10 -3 -10 -9 v-44
        c0 -19 13 -34 34 -34 z" fill="${dark}"/>`;
    case 'bun':
      return `<path d="M100 4 c19 0 31 13 31 28 h-62 c0 -15 12 -28 31 -28 z" fill="${dark}"/>
        <circle cx="100" cy="0" r="13" fill="${dark}"/>`;
    case 'cap':
      return `<path d="M100 2 c19 0 31 13 31 28 h-62 c0 -15 12 -28 31 -28 z" fill="${dark}"/>
        <path d="M69 26 h62 v9 h-62 z" fill="${dark}"/>
        <path d="M131 26 h26 c4 0 6 2 6 5 s-2 4 -6 4 h-26 z" fill="${dark}" opacity=".85"/>
        <circle cx="100" cy="7" r="4" fill="#000" opacity=".3"/>`;
    case 'durag':
      return `<path d="M100 3 c20 0 33 12 33 29 h-66 c0 -17 13 -29 33 -29 z" fill="${dark}"/>
        <path d="M67 24 h66 v10 h-66 z" fill="${dark}"/>
        <path d="M133 30 l30 10 l-2 8 l-30 -10 z" fill="${dark}" opacity=".9"/>
        <path d="M133 36 l26 14 l-3 7 l-25 -14 z" fill="${dark}" opacity=".7"/>`;
    case 'beanie':
      return `<path d="M100 0 c20 0 33 13 33 28 h-66 c0 -15 13 -28 33 -28 z" fill="${dark}"/>
        <path d="M66 22 h68 v14 h-68 z" fill="${dark}"/>
        <path d="M66 22 h68 v14 h-68 z" fill="#fff" opacity=".08"/>
        <g stroke="#000" stroke-width="1.4" opacity=".25">
          <path d="M78 2 v20"/><path d="M100 0 v22"/><path d="M122 2 v20"/>
        </g>`;
    default: return '';
  }
}

function facialShape(style, hex) {
  switch (style) {
    case 'none': return '';
    case 'stubble':
      return `<path d="M74 48 c2 18 12 28 26 28 s24 -10 26 -28 v10
        c0 18 -11 30 -26 30 s-26 -12 -26 -30 z" fill="${hex}" opacity=".28"/>`;
    case 'moustache':
      return `<path d="M88 58 h24 c2 0 3 1 3 3 v4 c0 2 -1 3 -3 3 h-24 c-2 0 -3 -1 -3 -3
        v-4 c0 -2 1 -3 3 -3 z" fill="${hex}"/>`;
    case 'goatee':
      return `<path d="M91 62 h18 v10 c0 5 -3 8 -9 8 s-9 -3 -9 -8 z" fill="${hex}"/>`;
    case 'beard':
      return `<path d="M74 50 c1 16 5 26 12 30 h28 c7 -4 11 -14 12 -30 v14
        c0 16 -11 28 -26 28 s-26 -12 -26 -28 z" fill="${hex}"/>
        <path d="M88 56 h24 v6 h-24 z" fill="#000" opacity=".25"/>`;
    case 'full':
      return `<path d="M72 42 c0 24 6 38 14 44 h28 c8 -6 14 -20 14 -44 v22
        c0 18 -12 32 -28 32 s-28 -14 -28 -32 z" fill="${hex}"/>
        <path d="M88 54 h24 v7 h-24 z" fill="#000" opacity=".25"/>`;
    default: return '';
  }
}

/**
 * What somebody has on, drawn over the body.
 *
 * The garment covers the torso and abdomen; `sleeve` decides how much of the
 * arms and `legs` what the lower half looks like. Armour goes on top of all of
 * it, so this is what you see while the cabinet is empty — which, early on, it
 * is, and a figure in nothing but skin reads as unfinished art rather than as
 * somebody who has not bought a vest yet.
 */
/**
 * Shift a hex colour lighter or darker.
 *
 * Needed because a sleeve filled with exactly the torso colour vanishes into
 * the torso — which is the same mistake the firearms went through twice, and
 * the reason the rule is written down: a part drawn in the same fill as the
 * part behind it is not a part, it is a lump.
 */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v + 255 * amount))));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function clothingShapes(def, hex, build) {
  const g = (id, extra = '') => {
    const part = BODY_ART[id];
    const tr = partTransform(part, build);
    return `<g${tr ? ` transform="${tr}"` : ''}>
      <path d="${part.path}" fill="${hex}"/>${extra}</g>`;
  };
  const body = (id) => {
    const part = BODY_ART[id];
    const tr = partTransform(part, build);
    return `<g${tr ? ` transform="${tr}"` : ''}>
      <path d="${part.path}" fill="${hex}"/></g>`;
  };
  const out = [body('thorax'), body('abdomen')];

  // Sleeves are a shade off the body and carry a shoulder seam and a cuff.
  // Without those three things the arm is the same silhouette-coloured mass as
  // the chest and simply is not visible.
  // Seam and cuff are drawn as translucent shadow rather than as computed
  // colours: shifting a already-dark cloth darker lands on black, and a black
  // block at the shoulder reads as a hole rather than a seam.
  const sleeveHex = shade(hex, -0.05);
  const sleeve = (id, clip) => {
    const part = BODY_ART[id];
    const tr = partTransform(part, build);
    return `<g${tr ? ` transform="${tr}"` : ''}>
      ${clip ? `<clipPath id="${clip.id}"><rect x="0" y="${clip.y}" width="${FIGURE_W}"
        height="${clip.h}"/></clipPath>` : ''}
      <path d="${part.path}" fill="${sleeveHex}"${clip ? ` clip-path="url(#${clip.id})"` : ''}/>
      <path d="${part.path}" fill="#000" opacity=".12"${clip ? ` clip-path="url(#${clip.id})"` : ''}/>
      <path d="M29 100 c11 -7 24 -9 35 -5" fill="none" stroke="#000" stroke-width="4"
            opacity=".22" stroke-linecap="round"/>
      ${clip ? '' : `<path d="M20 240 c10 4 20 5 29 2" fill="none" stroke="#000"
            stroke-width="7" opacity=".2" stroke-linecap="round"/>`}
    </g>`;
  };

  if (def.sleeve === 'long') { out.push(sleeve('armL'), sleeve('armR')); }
  else if (def.sleeve === 'short') {
    // Only the upper arm: clip the sleeve to the top third of the limb.
    for (const id of ['armL', 'armR']) {
      out.push(sleeve(id, { id: `slv-${id}`, y: 86, h: 60 }));
    }
  }

  if (def.legs === 'shorts') {
    for (const id of ['legL', 'legR']) {
      const part = BODY_ART[id];
      const tr = partTransform(part, build);
      out.push(`<g${tr ? ` transform="${tr}"` : ''}>
        <clipPath id="sht-${id}"><rect x="0" y="262" width="${FIGURE_W}" height="70"/></clipPath>
        <path d="${part.path}" fill="${hex}" clip-path="url(#sht-${id})"/></g>`);
    }
  } else {
    const legHex = def.legs === 'coverall' ? hex : '#2b303a';
    for (const id of ['legL', 'legR']) {
      const part = BODY_ART[id];
      const tr = partTransform(part, build);
      out.push(`<g${tr ? ` transform="${tr}"` : ''}>
        <path d="${part.path}" fill="${legHex}"/>
        <path d="${part.path}" fill="#000" opacity="${id === 'legR' ? '.1' : '0'}"/>
        ${def.stripe ? `<clipPath id="stp-${id}"><path d="${part.path}"/></clipPath>
          <path d="M56 268 h7 v180 h-7 z" fill="${hex}" opacity=".85"
                clip-path="url(#stp-${id})"/>` : ''}</g>`);
    }
  }

  if (def.hood) {
    out.push(`<path d="M70 78 c8 10 20 15 30 15 s22 -5 30 -15
      c6 4 9 10 9 18 v6 h-78 v-6 c0 -8 3 -14 9 -18 z" fill="${hex}"/>
      <path d="M70 78 c8 10 20 15 30 15 s22 -5 30 -15 c3 2 5 4 7 7
      c-9 9 -22 14 -37 14 s-28 -5 -37 -14 c2 -3 4 -5 7 -7 z" fill="#000" opacity=".22"/>`);
  }
  if (def.collar) {
    out.push(`<path d="M82 80 l18 14 l18 -14 l10 6 l-28 22 l-28 -22 z" fill="${hex}"/>
      <path d="M82 80 l18 14 l18 -14 l10 6 l-28 22 l-28 -22 z" fill="#000" opacity=".18"/>`);
  }
  if (def.quilted) {
    out.push(`<g stroke="#000" stroke-width="2" opacity=".22" fill="none">
      <path d="M54 104 h92"/><path d="M52 132 h96"/><path d="M52 160 h96"/><path d="M54 188 h92"/>
    </g>`);
  }
  if (def.id === 'shirt') {
    out.push(`<g fill="#000" opacity=".3">
      <circle cx="100" cy="120" r="3"/><circle cx="100" cy="146" r="3"/>
      <circle cx="100" cy="172" r="3"/><circle cx="100" cy="198" r="3"/>
    </g>`);
  }
  return out.join('');
}

/**
 * A whole person.
 *
 * `overlay(partId)` is anything to draw on top of a part after the clothes —
 * armour, wound markers — so the character screen and the X-ray still share
 * one drawing.
 */
export function figureFor(appearance, { overlay = () => '', lostParts = {} } = {}) {
  const a = normaliseAppearance(appearance);
  const build = BUILDS[a.build];
  const skin = SKINS[a.skin];
  const hair = HAIR_COLOURS[a.hairColour];
  const cloth = CLOTH_COLOURS[a.cloth];
  const wearing = CLOTHING[a.clothing];

  // No outlines on a dressed figure. The parts are only separate so wounds can
  // land on them — drawn with a stroke each, the neck reads as a collar box
  // sitting on top of whatever the person is actually wearing.
  const body = figure({
    build,
    fillFor: (id) => (lostParts[id] ? '#1a1e24' : skin.base),
    stroke: 'none',
    extra: () => '',
  });

  return `<g transform="translate(100 0) scale(1 ${build.height}) translate(-100 0)">
    ${body}
    ${faceShapes(skin)}
    ${clothingShapes(wearing, cloth.hex, build)}
    ${hairShape(a.hair, hair.hex)}
    ${facialShape(a.facial, hair.hex)}
    ${Object.keys(BODY_ART).map(overlay).join('')}
  </g>`;
}

// --- Gear on the body -------------------------------------------------------
//
// The kit is already drawn, front-on, and — this is the part that makes the
// placement possible — every drawing states the px/in it was authored at. So
// does the figure. That turns "how big is a plate carrier on this person" from
// a taste question into arithmetic: scale = 6.3 / the drawing's own px/in, and
// a 10x12" plate comes out 10x12" on a 70" body.
//
// The first attempt stretched each drawing to fill a fixed square instead, and
// it showed: a bare plate came out the size of a door because a plate and a
// vest are not the same object at the same size. Real dimensions or nothing.
//
// Anchoring is by the TOP, not the centre. A vest hangs off the shoulders and
// a helmet sits on a skull; get the line it hangs from right and the drop
// takes care of itself whatever the cut, which is why a short mail liner and a
// long stab vest both land correctly from one number.

/** The figure's own scale. A 70" adult over 441px of drawing. */
export const FIGURE_PPI = 6.3;

/**
 * Where each piece of kit goes.
 *
 * `from` is a point in the DRAWING's own coordinates, `to` where that point
 * lands on the figure. Slots that take more than one shape of thing are keyed
 * `slot:variant`, because a carrier and a bare plate hang from different
 * places even though they occupy the same slot.
 */
export const GEAR_PLACEMENT = {
  // Vests and carriers are all authored around x=218 with the shoulder straps
  // starting at y=20, whichever helper drew them — so one anchor serves the
  // lot. y=80 is the figure's shoulder line, just under the neck.
  // 0.92 because the figure's "thorax" is shoulder-to-shoulder, not chest —
  // at true scale a 16" vest panel covers it edge to edge and reads as a slab.
  'torso:vest': { from: [218, 20], to: [100, 80], spread: true, grow: 0.92 },
  // A bare plate is not worn off the shoulders; it sits on the sternum, a
  // couple of inches down. Authored 300 wide from x=0.
  'torso:plate': { from: [150, 0], to: [100, 102] },
  // The figure's skull is drawn wider and shorter than a real one, so a
  // true-scale helmet would sit INSIDE the head outline. `grow` is that
  // discrepancy and nothing else.
  head: { from: [168, 18], to: [100, 1], grow: 1.06 },
  // A shield is held out in front of the off side. Big ones are genuinely
  // bigger than the figure, so there is a ceiling on how much of the person
  // one is allowed to swallow.
  offhand: { box: true, to: [50, 148], maxH: 250 },
  // Slung MUZZLE-DOWN across the front — the drawings all face left, so the
  // rotation has to be negative to drop the muzzle rather than raise it. Hung
  // low and a little under scale on purpose: a real carbine is 46% of a man's
  // height, and drawn at that across the chest it buries the vest underneath.
  primary: { box: true, to: [96, 0], rotate: -36, pivot: [96, 262], grow: 0.82 },
  // On the hip, in the holster, barrel down and canted the way a holster cants.
  sidearm: { box: true, to: [157, 0], rotate: -72, pivot: [157, 255], grow: 0.82 },
};

/**
 * One piece of kit, placed on the body.
 *
 * `body` is the drawing in its OWN coordinates — not pre-fitted to a field —
 * together with the `box` and `ppi` it was authored with. Everything else
 * follows from those three.
 */
export function placeGear(slot, body, { box, ppi, variant = null, build = null } = {}) {
  const at = GEAR_PLACEMENT[variant ? `${slot}:${variant}` : slot] || GEAR_PLACEMENT[slot];
  if (!at || !body || !box || !ppi) return '';

  let scale = (FIGURE_PPI / ppi) * (at.grow || 1);
  // Nothing may be taller than the ceiling, if the slot sets one.
  if (at.maxH && box[3] * scale > at.maxH) scale = at.maxH / box[3];

  // Widening the shoulders widens what is strapped to them.
  const spread = at.spread && build ? build.shoulder : 1;

  // The anchor: an explicit point in the drawing, or the top-centre of its box.
  const [ax, ay] = at.box ? [box[0] + box[2] / 2, box[1]] : at.from;
  const [tx, ty] = at.to;

  // A slung gun turns about a point on the body rather than about itself.
  const [px, py] = at.pivot || [tx, ty];
  const spin = at.rotate ? `translate(${px} ${py}) rotate(${at.rotate}) translate(${-px} ${-py})` : '';
  const y = at.pivot ? py - (box[3] * scale) / 2 - ay * scale : ty - ay * scale;

  return `<g filter="url(#bfKit)"><g transform="${spin}
    translate(${(tx - ax * scale * spread).toFixed(2)} ${y.toFixed(2)})
    scale(${(scale * spread).toFixed(5)} ${scale.toFixed(5)})">${body}</g></g>`;
}

/** Which placement variant a piece of armour wants, from its class. */
export const ARMOUR_VARIANT = {
  stab: 'vest', carrier: 'vest', covert: 'vest', soft: 'vest',
  rifle: 'plate', ceramic: 'plate', helmet: null, shield: null,
};

/** A sling, so a long gun is being carried rather than floating. */
export function slingPath() {
  return `<path d="M141 96 C136 150 124 206 104 252" fill="none" stroke="#1c1f19"
    stroke-width="9" stroke-linecap="round" opacity=".85"/>`;
}

/** A holster, so a sidearm has something to sit in. */
export function holsterPath() {
  return `<path d="M140 232 h30 c5 0 8 3 8 8 v34 c0 6 -4 9 -10 9 h-26
    c-6 0 -10 -3 -10 -9 v-34 c0 -5 3 -8 8 -8 z" fill="#1c1f19" opacity=".9"/>
    <path d="M138 244 h42 v7 h-42 z" fill="#0c0e0c" opacity=".7"/>`;
}
