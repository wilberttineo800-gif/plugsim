// The city, seen from the corner.
//
// This is the geometry half of an isometric view of the real map. It has no
// renderer in it on purpose: the same face list is drawn to a canvas in the
// game (thousands of buildings, so SVG nodes are not an option) and to SVG by
// the contact-sheet tool, and having one set of maths feeding both is what
// stops the thing you looked at and the thing that ships from drifting apart.
//
// It needs NO new data. Every lot the game already generates carries its real
// OpenStreetMap footprint, its floor count and what kind of building it is —
// which happens to be exactly what an extruder wants. That is the whole trick:
// a hand-drawn isometric game can only ever cover the map somebody drew, and
// this covers anywhere on Earth because the footprints are already real.

/**
 * The projection: 2:1 dimetric, which is what everybody means by "isometric"
 * in a game and is not what isometric means in engineering. A ground square
 * comes out twice as wide as it is tall, so horizontal runs stay legible at
 * small sizes — which matters far more on a phone than the 30-degree version
 * being geometrically purer.
 */
export const PITCH = 0.5;

/** Metres per storey. Three is the standard floor-to-floor for anything low. */
export const STOREY_M = 3.1;

/**
 * Readability lift, and why it is not a multiplier.
 *
 * A two-storey rowhouse is six metres of wall under a twelve-metre roof, and
 * at true scale that reads as a flat coloured shape rather than as a house.
 * The obvious fix is to multiply every height, and it is wrong: 2x on the
 * Empire State is a 760-metre building, and the one place this view has to be
 * exactly right is the place it is most impressive.
 *
 * So the lift is a fixed number of metres ADDED, which decays as the building
 * gets taller. A rowhouse nearly doubles. A six-storey block gains a couple of
 * metres. Anything genuinely tall is drawn at its real height, because at that
 * size it needs no help.
 */
export const LIFT_M = 7.5;
export const LIFT_FADE_M = 16;

export function liftedHeight(metres) {
  return metres + LIFT_M * Math.exp(-metres / LIFT_FADE_M);
}

/**
 * How tall this building actually is, in metres.
 *
 * In order of how much OSM can be trusted: a stated `height` is a surveyed
 * number and is what every tall building carries; `building:levels` is a
 * count somebody typed; a kind-based guess is the last resort. Reading levels
 * first — which is what the game's own `levelsOf` does — is exactly how a
 * 381-metre tower comes out as a generic twelve-storey block.
 */
export function heightMetres(lot) {
  const tags = lot.tags || {};
  const direct = parseFloat(lot.heightM ?? tags.height ?? tags['building:height']);
  if (Number.isFinite(direct) && direct > 1) return Math.min(direct, 830);
  const levels = parseFloat(tags['building:levels'] ?? tags.levels ?? lot.levels);
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels, 163) * STOREY_M;
  return 2 * STOREY_M;
}

/**
 * Metres east and north of the origin.
 *
 * Equirectangular rather than a real projection. Over a few kilometres of one
 * city the error is centimetres, and the alternative is a spherical transform
 * per vertex per frame on a phone.
 */
export function toWorld(latlng, origin) {
  const R = 111320;
  const lat = (latlng.lat + origin.lat) / 2;
  return {
    x: (latlng.lng - origin.lng) * R * Math.cos((lat * Math.PI) / 180),
    y: -(latlng.lat - origin.lat) * R,
  };
}

/**
 * World metres to screen pixels.
 *
 * `cam.turn` is 0-3: which corner you are standing at. A building's footprint
 * is fixed to the ground, so turning the camera is rotating the world under a
 * fixed projection rather than moving a camera — one multiply per point, and
 * it means all four views come free from one set of geometry.
 */
export function toScreen(x, y, z, cam) {
  const t = cam.turn & 3;
  let rx = x, ry = y;
  if (t === 1) { rx = y; ry = -x; }
  else if (t === 2) { rx = -x; ry = -y; }
  else if (t === 3) { rx = -y; ry = x; }
  const s = cam.scale;
  return {
    sx: (rx - ry) * s + cam.ox,
    sy: (rx + ry) * s * PITCH - z * s + cam.oy,
  };
}

/** How far back a point is, for painter's order. Bigger is nearer the viewer. */
export function depthOf(x, y, cam) {
  const t = cam.turn & 3;
  if (t === 1) return y - x;
  if (t === 2) return -x - y;
  if (t === 3) return x - y;
  return x + y;
}

/**
 * What a building is made of, by what OSM says it is.
 *
 * Roof, then the two wall shades. Two walls rather than one because a box lit
 * from one side needs its faces to differ or it reads as a flat hexagon — the
 * single most common way isometric art goes wrong.
 */
export const ISO_PALETTE = {
  house:      { roof: '#6b5344', a: '#8a6f5c', b: '#5e4b3d', trim: '#3a2e25' },
  rowhouse:   { roof: '#67504a', a: '#856a62', b: '#5a4640', trim: '#372b27' },
  apartments: { roof: '#4f5666', a: '#6d7585', b: '#464d5b', trim: '#2b303a' },
  commercial: { roof: '#4c5a63', a: '#697b86', b: '#42505a', trim: '#28323a' },
  retail:     { roof: '#5b5a45', a: '#7d7b5e', b: '#4e4d3b', trim: '#303024' },
  industrial: { roof: '#4a4f52', a: '#666d71', b: '#3f4447', trim: '#262a2c' },
  garage:     { roof: '#464a4e', a: '#5f6469', b: '#3c4043', trim: '#24272a' },
  parking:    { roof: '#33383d', a: '#474d53', b: '#2c3035', trim: '#1c1f22' },
  civic:      { roof: '#55506a', a: '#726c8c', b: '#48445c', trim: '#2c2938' },
  default:    { roof: '#4d5359', a: '#697077', b: '#42474c', trim: '#282c30' },
};

/** Lots you own are lit, so the map reads as a holding rather than a city. */
export const OWNED_TINT = { roof: '#5f7a52', a: '#7e9e6c', b: '#4d6343', trim: '#2c3826' };
export const ACTIVE_TINT = { roof: '#7a6b3a', a: '#a08e4d', b: '#63562e', trim: '#3a321b' };

export function paletteFor(kind, { owned = false, running = false } = {}) {
  if (running) return ACTIVE_TINT;
  if (owned) return OWNED_TINT;
  return ISO_PALETTE[kind] || ISO_PALETTE.default;
}

/**
 * One building, as a list of flat faces ready to be filled.
 *
 * Walls are emitted only for the edges actually facing the viewer — a
 * footprint with forty nodes is forty quads and half of them are behind the
 * roof, so dropping them halves the fill work for nothing lost. Which half
 * that is depends on the camera, which is why this takes one.
 */
export function buildingFaces(lot, origin, cam, tint = {}) {
  const poly = lot.polygon;
  if (!poly || poly.length < 3) return [];
  const pal = paletteFor(lot.kind, tint);
  // `cam.lift === false` draws true heights, which is the only honest way to
  // check whether the lift is doing anything you would not want it to.
  const real = heightMetres(lot);
  const h = lot.kind === 'parking'
    ? Math.max(3, real * 0.3)
    : (cam.lift === false ? real : liftedHeight(real));

  const pts = poly.map((p) => toWorld(p, origin));
  const ground = pts.map((p) => toScreen(p.x, p.y, 0, cam));

  // Which way round the footprint is wound decides which side of each edge is
  // outside, and OSM ways come in both directions. Testing the screen-space x
  // of the edge instead — which is what the first pass did — kept the wrong
  // half of the walls on every clockwise footprint, so buildings had faces
  // standing up behind their own roofs.
  let area2 = 0;
  for (let i = 0; i < ground.length; i++) {
    const a = ground[i], b = ground[(i + 1) % ground.length];
    area2 += a.sx * b.sy - b.sx * a.sy;
  }
  const wind = area2 > 0 ? 1 : -1;

  const faces = [];
  let sum = 0;

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const sa = ground[i], sb = ground[(i + 1) % ground.length];
    const dx = sb.sx - sa.sx, dy = sb.sy - sa.sy;
    if (!dx && !dy) continue;
    // Outward normal in screen space. Walls hang downward from the roof, so a
    // wall is visible exactly when its outward normal points down the screen.
    if (-wind * dx <= 0) continue;

    const ta = toScreen(a.x, a.y, h, cam);
    const tb = toScreen(b.x, b.y, h, cam);
    // Two wall tones by which way the edge runs, so a corner reads as a corner.
    const steep = Math.abs(dy) > Math.abs(dx) * PITCH;
    faces.push({
      points: [sa, sb, tb, ta],
      fill: steep ? pal.b : pal.a,
      depth: depthOf((a.x + b.x) / 2, (a.y + b.y) / 2, cam),
      kind: 'wall',
      lot,
    });
    sum += depthOf((a.x + b.x) / 2, (a.y + b.y) / 2, cam);
  }

  faces.push({
    points: pts.map((p) => toScreen(p.x, p.y, h, cam)),
    fill: pal.roof,
    stroke: pal.trim,
    depth: sum / Math.max(1, pts.length) + 0.01,
    kind: 'roof',
    // Carried through so a renderer can say which building was tapped without
    // keeping a parallel index in step with the face list.
    lot,
  });
  return faces;
}

/**
 * Every building, in the order they have to be painted.
 *
 * Painter's algorithm rather than a depth buffer: there is no z-buffer in a 2D
 * canvas, and sorting a few thousand faces once per frame is cheaper than any
 * of the alternatives. Sorting by the FAR corner of each face rather than its
 * centre is what stops a long building from being drawn through a short one
 * standing in front of it.
 */
export function sceneFaces(lots, origin, cam, tintOf = () => ({})) {
  const out = [];
  for (const lot of lots) {
    const fs = buildingFaces(lot, origin, cam, tintOf(lot));
    for (const f of fs) out.push(f);
  }
  out.sort((a, b) => a.depth - b.depth);
  return out;
}

/** What the scene covers on screen, so a caller can frame it. */
export function boundsOf(faces) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of faces) {
    for (const p of f.points) {
      if (p.sx < minX) minX = p.sx;
      if (p.sx > maxX) maxX = p.sx;
      if (p.sy < minY) minY = p.sy;
      if (p.sy > maxY) maxY = p.sy;
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * A camera that fits the given lots into a viewport.
 *
 * Done by measuring rather than by guessing a zoom: project once at unit
 * scale, see how big the answer is, and solve for the scale that fits. Two
 * passes and it is right for any city, any density, any turn.
 */
export function fitCamera(lots, origin, { width, height, turn = 0, pad = 24 }) {
  const probe = { scale: 1, ox: 0, oy: 0, turn };
  const faces = sceneFaces(lots, origin, probe);
  if (!faces.length) return { scale: 1, ox: width / 2, oy: height / 2, turn };
  const b = boundsOf(faces);
  const scale = Math.min((width - pad * 2) / (b.w || 1), (height - pad * 2) / (b.h || 1));
  return {
    scale,
    ox: -((b.minX + b.maxX) / 2) * scale + width / 2,
    oy: -((b.minY + b.maxY) / 2) * scale + height / 2,
    turn,
  };
}

/** Draw a prepared scene to a 2D canvas context. */
export function paint(ctx, faces, { ground = '#0d1219' } = {}) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.points[0].sx, f.points[0].sy);
    for (let i = 1; i < f.points.length; i++) ctx.lineTo(f.points[i].sx, f.points[i].sy);
    ctx.closePath();
    ctx.fillStyle = f.fill;
    ctx.fill();
    if (f.stroke) {
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/** The same scene as SVG, for looking at outside a browser. */
export function toSvg(faces, width, height, { ground = '#0d1219' } = {}) {
  const body = faces.map((f) => {
    const d = f.points.map((p, i) => `${i ? 'L' : 'M'}${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`).join('');
    return `<path d="${d}Z" fill="${f.fill}"${
      f.stroke ? ` stroke="${f.stroke}" stroke-width="1"` : ''}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
    viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${ground}"/>${body}</svg>`;
}
