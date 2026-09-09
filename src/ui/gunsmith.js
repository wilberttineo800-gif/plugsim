// SUPERSEDED — not imported by the game. Kept for the record only.
//
// This was the parts-based approach: compose each firearm at render time from
// interchangeable barrels, furniture, feeds, stocks and sights, so R&D could
// invent patterns nobody had drawn. The idea is sound and may come back for
// procedural variants, but the output was rejected on sight — it composes
// axis-aligned rectangles, so everything it produced read as toy blocks.
//
// src/ui/gunart-detail.js replaces it: hand-drawn artwork traced off reference
// photographs at real proportions. See tools/trace_png.py for how those
// proportions are measured.

// The gunsmith.
//
// Patterns used to be twenty-two hand-drawn silhouettes, which meant R&D could
// never invent one — you can't draw a gun that doesn't exist yet. So a pattern
// is now a *specification* and the drawing is assembled from it: change the
// barrel length and the barrel gets longer on screen.
//
// Proportions come from real firearms rather than eye. Barrel as a fraction of
// overall length: a Glock 17 is 4.49" of 7.95" (56%), a 1911 5" of 8.5" (59%),
// an MP5A2 8.86" of 26.77" (33%), an AK-47 16" of 34.3" (47%), an AR-15 carbine
// 16" of ~33" (48%), a Remington 870 18.5" of ~43" (43%), a Barrett M82 29" of
// 57" (51%). Every pattern is drawn to fill the same frame, so a pistol and a
// rifle read at the same size while keeping their own internal proportions.

const W = 64;          // drawing field
const H = 32;
const MARGIN = 1.5;    // breathing room at each end
const SPAN = W - MARGIN * 2;

// --- little helpers ---------------------------------------------------------

const r = (x, y, w, h) => `M${n(x)} ${n(y)} h${n(w)} v${n(h)} h${n(-w)} z`;
const poly = (...pts) => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')} z`;
const circle = (cx, cy, rad) =>
  `M${n(cx - rad)} ${n(cy)} a${n(rad)} ${n(rad)} 0 1 0 ${n(rad * 2)} 0 a${n(rad)} ${n(rad)} 0 1 0 ${n(-rad * 2)} 0 z`;

function n(v) {
  return Math.round(v * 100) / 100;
}

// --- parts ------------------------------------------------------------------
//
// Each takes the geometry the chassis worked out and returns path data. They
// know nothing about which gun they're on, which is what lets R&D recombine
// them into something nobody drew.

const BARRELS = {
  plain: (g) => r(g.muzzle, g.axis - 1.8, g.barrelLen, 3.6),
  heavy: (g) => r(g.muzzle, g.axis - 2, g.barrelLen, 4),
  shrouded: (g) => {
    let d = r(g.muzzle, g.axis - 2.4, g.barrelLen, 4.8);
    // Cooling slots read as gaps, not as lines drawn on top — same-colour
    // fills merge, so a "rib" over a solid bar is invisible.
    const slots = Math.max(2, Math.floor(g.barrelLen / 5));
    d = '';
    const seg = g.barrelLen / slots;
    for (let i = 0; i < slots; i++) {
      d += r(g.muzzle + i * seg, g.axis - 2.4, seg * 0.72, 4.8);
    }
    return d;
  },
  double: (g) =>
    r(g.muzzle, g.axis - 2.6, g.barrelLen, 2.2) +
    r(g.muzzle, g.axis + 0.4, g.barrelLen, 2.2),
  ported: (g) => {
    let d = r(g.muzzle + 4, g.axis - 1.4, g.barrelLen - 4, 2.8);
    d += r(g.muzzle, g.axis - 2, 4, 4);
    for (let i = 0; i < 3; i++) d += r(g.muzzle + 0.6 + i * 1.2, g.axis - 3.4, 0.8, 1.6);
    return d;
  },
};

const FURNITURE = {
  none: () => '',
  rail: (g) => r(g.handguardStart, g.axis - 3.4, g.handguardLen, 1.4),
  wood: (g) => r(g.handguardStart, g.axis + 1.2, g.handguardLen, 3),
  ribbed: (g) => {
    // Separate blocks with gaps, so the ribs actually read.
    let d = '';
    const ribs = Math.max(3, Math.floor(g.handguardLen / 3.5));
    const seg = g.handguardLen / ribs;
    for (let i = 0; i < ribs; i++) {
      d += r(g.handguardStart + i * seg, g.axis - 3.2, seg * 0.66, 6.4);
    }
    return d;
  },
  gastube: (g) =>
    r(g.handguardStart, g.axis - 4, g.handguardLen * 0.8, 2) +
    r(g.handguardStart, g.axis + 1.4, g.handguardLen, 3.2),
  pump: (g) => r(g.handguardStart + g.handguardLen * 0.25, g.axis + 1.6, g.handguardLen * 0.5, 3.4),
};

const FEEDS = {
  none: () => '',
  // A straight box, raked slightly the way a magazine sits.
  box: (g) => poly(
    [g.feedX, g.axis + 3.2], [g.feedX + 4.4, g.axis + 3.2],
    [g.feedX + 5.6, g.axis + 12], [g.feedX + 1.2, g.axis + 12]
  ),
  // The banana curve that makes an AK an AK.
  curved: (g) => {
    const x = g.feedX, y = g.axis + 3.2;
    return `M${n(x)} ${n(y)} h5 c0 5 1.6 7.6 4 10 h-5.4 c-2.4 -2.4 -3.6 -5 -3.6 -10 z`;
  },
  drum: (g) => r(g.feedX, g.axis + 3.2, 6, 2) +
    circle(g.feedX + 3, g.axis + 8.4, 4.4),
  // A shotgun's tube sits under the barrel, not below the action.
  tube: (g) => r(g.muzzle + 1, g.axis + 1.6, g.barrelLen - 1, 2.2),
  belt: (g) => r(g.feedX - 1, g.axis + 3.2, 8, 4.6),
  cylinder: (g) => poly(
    [g.feedX - 1, g.axis - 3.4], [g.feedX + 0.8, g.axis - 5],
    [g.feedX + 5.4, g.axis - 5], [g.feedX + 7.2, g.axis - 3.4],
    [g.feedX + 7.2, g.axis + 3.4], [g.feedX + 5.4, g.axis + 5],
    [g.feedX + 0.8, g.axis + 5], [g.feedX - 1, g.axis + 3.4]
  ),
};

const STOCKS = {
  none: () => '',
  // A pistol grip raked back, which is most of a handgun's silhouette.
  grip: (g) => poly(
    [g.gripX, g.axis + 3.2], [g.gripX + 5.6, g.axis + 3.2],
    [g.gripX + 7.6, g.axis + 13.6], [g.gripX + 1.6, g.axis + 13.6]
  ),
  // A revolver's plough handle: a curve, not a wedge.
  plough: (g) => {
    const x = g.gripX, y = g.axis + 3;
    return `M${n(x)} ${n(y)} h5.4 c1.2 4 0.6 7.6 -1.6 9.4 c-2.4 2 -5.4 1 -5.8 -1.8 c-0.4 -2.8 1 -5.4 2 -7.6 z`;
  },
  fixed: (g) => r(g.stockX, g.axis - 2.6, g.stockLen, 5.6) +
    r(g.stockX + g.stockLen - 2, g.axis - 3.6, 2, 7.6),
  // A straight comb dropping to a butt plate, the way a shotgun stock does.
  comb: (g) => poly(
    [g.stockX, g.axis - 3.4],
    [g.stockX + g.stockLen, g.axis - 4.8],
    [g.stockX + g.stockLen, g.axis + 5.6],
    [g.stockX + g.stockLen - 2.4, g.axis + 5.2],
    [g.stockX + 1, g.axis + 3.6]
  ),
  // The AK's underfolder line: straight top, angled toe.
  sloped: (g) => poly(
    [g.stockX, g.axis - 3], [g.stockX + g.stockLen, g.axis - 5],
    [g.stockX + g.stockLen, g.axis + 0.6], [g.stockX + 2, g.axis + 3.4]
  ),
  collapsing: (g) => r(g.stockX, g.axis - 1.4, g.stockLen * 0.45, 2.8) +
    r(g.stockX + g.stockLen * 0.45, g.axis - 3, g.stockLen * 0.55, 6),
  wire: (g) => r(g.stockX, g.axis - 0.8, g.stockLen * 0.8, 1.4) +
    r(g.stockX + g.stockLen * 0.8, g.axis - 3.2, 1.4, 6.4),
  thumbhole: (g) => r(g.stockX, g.axis - 2.6, g.stockLen, 5.6) +
    r(g.stockX - 1, g.axis + 3, 4.4, 5),
};

const SIGHTS = {
  none: () => '',
  irons: (g) => r(g.muzzle + 1.5, g.axis - 4, 1.2, 1.8) +
    r(g.receiverEnd - 3, g.axis - 4.6, 1.6, 2),
  rail: (g) => r(g.receiverStart + 1, g.axis - 4.4, g.receiverLen - 2, 1.4),
  scope: (g) => r(g.receiverStart + 1, g.axis - 7.6, g.receiverLen - 1, 3.2) +
    r(g.receiverStart + 3, g.axis - 4.4, 1.8, 1.4) +
    r(g.receiverEnd - 5, g.axis - 4.4, 1.8, 1.4),
};

// --- chassis ----------------------------------------------------------------
//
// A chassis works out where everything sits from the real dimensions, then the
// parts fill it in. This is what a new pattern varies.

/**
 * Lay out one gun. `oal` and `barrel` are real inches; everything else is
 * derived so a longer barrel genuinely moves the receiver back.
 */
function layout(spec) {
  const { oal, barrel, receiver = oal * 0.24, pistol = false } = spec;
  const scale = SPAN / oal;
  const axis = pistol ? 13 : 14;

  const barrelLen = barrel * scale;
  const receiverLen = receiver * scale;
  const muzzle = MARGIN;
  const receiverStart = muzzle + barrelLen;
  const receiverEnd = receiverStart + receiverLen;
  const stockX = receiverEnd;
  const stockLen = Math.max(0, MARGIN + SPAN - stockX);

  return {
    axis, scale, muzzle, barrelLen,
    receiverStart, receiverLen, receiverEnd,
    stockX, stockLen,
    handguardStart: muzzle + barrelLen * 0.35,
    handguardLen: barrelLen * 0.55,
    feedX: receiverStart + receiverLen * 0.3,
    gripX: pistol ? receiverStart + receiverLen * 0.45 : receiverEnd - 6,
    receiverTop: axis - 3.2,
  };
}

/** The receiver itself — the block everything hangs off. */
function receiverBlock(g, spec) {
  const h = spec.pistol ? 6.4 : 7;
  return r(g.receiverStart, g.axis - h / 2, g.receiverLen, h);
}

/**
 * Assemble a pattern into path data. Every visible difference between two guns
 * comes from the spec, which is what lets R&D produce one nobody drew.
 */
function assemblePistol(spec) {
  const g = layout(spec);
  const slideLen = g.barrelLen + g.receiverLen * 0.55;
  const parts = [
    // Slide: full height, running back from the muzzle over the barrel.
    r(g.muzzle, g.axis - 3.4, slideLen, 6),
    // Frame under the rear of it, carrying the trigger.
    r(g.muzzle + slideLen * 0.42, g.axis + 2.6, slideLen * 0.58 + 2, 3),
    // Grip, raked back, with the magazine inside it rather than beside it.
    STOCKS.plough === spec.stock ? '' : '',
    (STOCKS[spec.stock] || STOCKS.grip)({ ...g, gripX: g.muzzle + slideLen * 0.72 }),
    // Trigger, tucked under the frame.
    r(g.muzzle + slideLen * 0.66, g.axis + 5.6, 1.4, 2.6),
  ];
  if (spec.feed === 'cylinder') {
    parts.push(FEEDS.cylinder({ ...g, feedX: g.muzzle + slideLen * 0.58 }));
  }
  if (spec.barrelStyle === 'ported') {
    for (let i = 0; i < 3; i++) parts.push(r(g.muzzle + 1 + i * 2.4, g.axis - 5, 1.2, 1.6));
  }
  if (spec.sights === 'irons') {
    parts.push(r(g.muzzle + 1.2, g.axis - 4.8, 1.2, 1.4));
    parts.push(r(g.muzzle + slideLen - 3, g.axis - 4.8, 1.6, 1.4));
  }
  if (spec.sights === 'rail') parts.push(r(g.muzzle + 4, g.axis - 4.8, slideLen - 8, 1.4));
  return parts.filter(Boolean).join(' ');
}

export function assemble(spec) {
  if (spec.pistol) return assemblePistol(spec);
  const g = layout(spec);
  const parts = [
    (BARRELS[spec.barrelStyle] || BARRELS.plain)(g),
    (FURNITURE[spec.furniture] || FURNITURE.none)(g),
    receiverBlock(g, spec),
    (FEEDS[spec.feed] || FEEDS.none)(g),
    (STOCKS[spec.stock] || STOCKS.none)(g),
    (SIGHTS[spec.sights] || SIGHTS.none)(g),
  ];
  // A trigger guard, on anything that has a trigger where you'd expect one.
  if (!spec.pistol && spec.stock !== 'none') {
    parts.push(r(g.gripX - 1, g.axis + 3.2, 5, 1.6));
    parts.push(STOCKS.grip({ ...g, gripX: g.gripX }));
  }
  return parts.filter(Boolean).join(' ');
}

/** Where things bolt on, worked out from the same layout. */
export function mountsFor(spec) {
  const g = layout(spec);
  return {
    rail: [g.receiverStart + 2, g.axis - 5.6],
    muzzle: [g.muzzle - 1, g.axis - 3],
    under: [g.handguardStart + g.handguardLen * 0.4, g.axis + 2],
    mag: [g.feedX, g.axis + 3],
  };
}

/** One assembled pattern, drawn. */
export function assembledArt(spec, { size = 180, color = 'currentColor', className = '' } = {}) {
  return `<svg class="art art--gun ${className}" viewBox="0 0 ${W} ${H}"
    width="${size}" height="${Math.round(size / 2)}" aria-hidden="true"
    ><path d="${assemble(spec)}" fill="${color}"/></svg>`;
}

export const PART_LISTS = {
  barrelStyle: Object.keys(BARRELS),
  furniture: Object.keys(FURNITURE),
  feed: Object.keys(FEEDS),
  stock: Object.keys(STOCKS),
  sights: Object.keys(SIGHTS),
};

export { layout };
