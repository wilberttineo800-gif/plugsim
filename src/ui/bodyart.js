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

export const BODY_ART = {
  head: {
    path: 'M100 8 c18 0 30 14 30 32 c0 12 -4 22 -11 28 l0 10 h-38 l0 -10 '
      + 'c-7 -6 -11 -16 -11 -28 c0 -18 12 -32 30 -32 z',
    at: [100, 38],
  },
  neck: { path: 'M84 70 h32 v14 h-32 z', at: [100, 78] },
  thorax: {
    path: 'M100 78 c15 0 32 3 46 9 c8 3 12 9 12 18 v44 '
      + 'c0 23 -3 42 -8 56 h-100 c-5 -14 -8 -33 -8 -56 v-44 '
      + 'c0 -9 4 -15 12 -18 c14 -6 31 -9 46 -9 z',
    at: [100, 140],
  },
  abdomen: {
    path: 'M52 205 h96 c3 17 4 33 3 47 c-1 11 -7 17 -18 17 h-66 '
      + 'c-11 0 -17 -6 -18 -17 c-1 -14 0 -30 3 -47 z',
    at: [100, 236],
  },
  armL: { path: ARM, at: [36, 190] },
  armR: { path: ARM, mirror: true, at: [164, 190] },
  legL: { path: LEG, at: [76, 350] },
  legR: { path: LEG, mirror: true, at: [124, 350] },
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

/** The transform that mirrors a part about the midline. */
export function partTransform(part) {
  return part.mirror ? `translate(${FIGURE_W} 0) scale(-1 1)` : '';
}

/**
 * The figure, with each part filled by whatever the caller decides.
 *
 * `fillFor(partId)` returns a paint; `extra(partId)` returns anything to draw
 * on top of that part. Keeping both as callbacks is what lets the character
 * screen and the X-ray share one drawing instead of diverging into two.
 */
export function figure({ fillFor, extra = () => '', stroke = '#0b0e13' } = {}) {
  return Object.keys(BODY_ART).map((id) => {
    const part = BODY_ART[id];
    const tr = partTransform(part);
    return `<g${tr ? ` transform="${tr}"` : ''}>
      <path d="${part.path}" fill="${fillFor(id)}" stroke="${stroke}" stroke-width="2"/>
    </g>${extra(id)}`;
  }).join('');
}
