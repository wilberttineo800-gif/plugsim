// Inline SVG, not a bitmap — same constraint as art.js and the rest of
// src/ui/: no images, no icon fonts, works offline. A night skyline for the
// retro start screen (start--retro). Two layers: building silhouettes
// (fill=currentColor, so the CSS color/opacity rule on .start__skyline
// controls them) and lit windows (fixed warm color, independent of theme, so
// the skyline reads as "occupied city at night" rather than a flat cutout).
//
// Generated, not hand-placed: a skyline is dozens of buildings and hundreds
// of windows, and typing that out by hand invites the exact silent-clipping
// bug this file already shipped once (coordinates outside the viewBox render
// nothing, no error). Bounds are enforced in code instead of by eye.

const VIEW_W = 800;
const VIEW_H = 200;
const BASE_Y = VIEW_H; // every building sits on the bottom edge

// A small deterministic PRNG (mulberry32) rather than Math.random — the
// skyline should look the same on every reload of the same session, not
// reflow every time main.js re-renders it.
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function building(x, w, h, rand) {
  const top = BASE_Y - h;
  const hasSetback = w > 30 && rand() > 0.55;
  const hasSpire = w > 26 && rand() > 0.72;
  const hasTank = !hasSpire && w > 20 && rand() > 0.75;

  let shape = `<rect x="${x}" y="${top}" width="${w}" height="${h}"/>`;

  if (hasSetback) {
    const insetW = w * 0.55;
    const insetX = x + (w - insetW) / 2;
    const insetH = h * 0.28;
    const insetTop = Math.max(0, top - insetH);
    shape += `<rect x="${insetX.toFixed(1)}" y="${insetTop.toFixed(1)}" width="${insetW.toFixed(1)}" height="${(top - insetTop + 1).toFixed(1)}"/>`;
  }
  if (hasSpire) {
    const spireW = Math.min(10, w * 0.18);
    const spireX = x + w / 2 - spireW / 2;
    const spireH = Math.min(24, VIEW_H * 0.12);
    const spireTop = Math.max(0, top - spireH);
    shape += `<polygon points="${spireX.toFixed(1)},${top} ${(spireX + spireW / 2).toFixed(1)},${spireTop.toFixed(1)} ${(spireX + spireW).toFixed(1)},${top}"/>`;
    const antennaTop = Math.max(0, spireTop - 14);
    shape += `<rect x="${(x + w / 2 - 1).toFixed(1)}" y="${antennaTop.toFixed(1)}" width="2" height="${(spireTop - antennaTop).toFixed(1)}"/>`;
  } else if (hasTank) {
    const tankW = Math.min(9, w * 0.3);
    const tankX = x + w * 0.2;
    const tankTop = Math.max(0, top - 9);
    shape += `<rect x="${tankX.toFixed(1)}" y="${tankTop.toFixed(1)}" width="${tankW.toFixed(1)}" height="9"/>`;
  }
  // Windows are placed against the plain rectangle's own top, never the
  // spire/setback/tank additions above it — those extend outside this box,
  // and a window row computed from their y would float above the solid
  // shape instead of sitting inside it.
  return { x, top, w, h, shape };
}

function windows(b, rand) {
  const pad = 3;
  const cellW = 6;
  const cellH = 7;
  const cols = Math.max(1, Math.floor((b.w - pad * 2) / cellW));
  const rowTop = b.top + 6; // clear of any spire/setback/tank added above the main box
  const rows = Math.max(1, Math.floor((BASE_Y - rowTop - pad) / cellH));
  if (cols < 1 || rows < 1) return '';
  let out = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rand() > 0.62) continue; // most windows dark — a lived-in city, not a lit-up one
      const wx = b.x + pad + c * cellW + (b.w - pad * 2 - cols * cellW) / 2;
      const wy = rowTop + r * cellH;
      const lit = rand();
      const opacity = (0.35 + lit * 0.55).toFixed(2);
      out += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="3" height="4" opacity="${opacity}"/>`;
    }
  }
  return out;
}

export function skylineSVG(seed = 1) {
  const rand = rng(seed);
  const plan = [];
  let x = -4;
  while (x < VIEW_W + 4) {
    const w = 20 + Math.floor(rand() * 46);
    const h = 60 + Math.floor(rand() * 130);
    plan.push({ x, w, h });
    x += w + 2 + Math.floor(rand() * 6);
  }

  let bodies = '';
  let lit = '';
  for (const p of plan) {
    const b = building(p.x, p.w, p.h, rand);
    bodies += b.shape;
    lit += windows(b, rand);
  }

  return `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor">${bodies}</g>
    <g fill="#ffcf8a">${lit}</g>
  </svg>`;
}
