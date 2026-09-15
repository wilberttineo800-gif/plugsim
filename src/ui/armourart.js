// Body armour artwork.
//
// Drawn to the same rules the firearms are: real proportions at a stated
// pixels-per-inch, and real materials rather than a flat fill. What's different
// is the subject. A gun is one long continuous frame with things hung off it,
// so it lives in a 2:1 field. Armour is roughly as tall as it is wide — a
// 10x12" plate, a vest, a helmet — so it gets a square field of its own and
// keeps its own paint.
//
// The palette is deliberately not the guns' blued steel. Armour is aramid,
// cordura and ceramic: coyote, olive and grey-green, so a rack of vests never
// reads as a rack of iron at thumbnail size.

export const ARMOUR_FIELD = 32;

export const ARMOUR_DEFS = `
  <linearGradient id="paAramid" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8a7c5c"/><stop offset=".4" stop-color="#6e6247"/>
    <stop offset="1" stop-color="#4a4231"/>
  </linearGradient>
  <linearGradient id="paAramidLt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a2937010"/><stop offset="0" stop-color="#a29370"/>
    <stop offset=".45" stop-color="#85785a"/><stop offset="1" stop-color="#5e543f"/>
  </linearGradient>
  <linearGradient id="paCordura" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4e5245"/><stop offset=".42" stop-color="#3b3f35"/>
    <stop offset="1" stop-color="#272a23"/>
  </linearGradient>
  <linearGradient id="paCorduraLt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#666b59"/><stop offset=".45" stop-color="#4e5245"/>
    <stop offset="1" stop-color="#343830"/>
  </linearGradient>
  <linearGradient id="paCeramic" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7d8683"/><stop offset=".38" stop-color="#5f6a67"/>
    <stop offset="1" stop-color="#3d4644"/>
  </linearGradient>
  <linearGradient id="paPoly" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b6b19c"/><stop offset=".4" stop-color="#948f7c"/>
    <stop offset="1" stop-color="#6b6758"/>
  </linearGradient>
  <linearGradient id="paPlateSteel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5a6068"/><stop offset=".4" stop-color="#42474e"/>
    <stop offset="1" stop-color="#2b2f34"/>
  </linearGradient>
  <linearGradient id="paGlass" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7e99ad" stop-opacity=".85"/>
    <stop offset=".5" stop-color="#4e6a86" stop-opacity=".7"/>
    <stop offset="1" stop-color="#35495c" stop-opacity=".8"/>
  </linearGradient>
  <pattern id="paWeave" width="8" height="8" patternUnits="userSpaceOnUse">
    <path d="M0 0 h4 v4 h-4 z M4 4 h4 v4 h-4 z" fill="#000" opacity=".16"/>
    <path d="M0 4 h4 v.9 h-4 z M4 0 h4 v.9 h-4 z" fill="#fff" opacity=".05"/>
  </pattern>
  <pattern id="paMail" width="14" height="14" patternUnits="userSpaceOnUse">
    <circle cx="4" cy="4" r="3" fill="none" stroke="#0d0f12" stroke-width="1.5" opacity=".55"/>
    <circle cx="11" cy="11" r="3" fill="none" stroke="#0d0f12" stroke-width="1.5" opacity=".55"/>
    <circle cx="4" cy="4" r="3" fill="none" stroke="#c9d3de" stroke-width=".6" opacity=".2"/>
    <circle cx="11" cy="11" r="3" fill="none" stroke="#c9d3de" stroke-width=".6" opacity=".2"/>
  </pattern>
  <pattern id="paLaser" width="22" height="16" patternUnits="userSpaceOnUse">
    <rect x="2" y="4" width="18" height="7" rx="3" fill="#0d0f12" opacity=".45"/>
  </pattern>
  <pattern id="paGrit" width="6" height="6" patternUnits="userSpaceOnUse">
    <circle cx="1.4" cy="1.4" r=".9" fill="#0d0f12" opacity=".35"/>
    <circle cx="4.4" cy="4.2" r=".9" fill="#c9d3de" opacity=".12"/>
  </pattern>
`;

/** Fit a drawing's native box into the square field, preserving aspect. */
export function fitArmour(box) {
  const [x, y, w, h] = box;
  const scale = Math.min(ARMOUR_FIELD / w, ARMOUR_FIELD / h);
  return {
    scale,
    tx: (ARMOUR_FIELD - w * scale) / 2 - x * scale,
    ty: (ARMOUR_FIELD - h * scale) / 2 - y * scale,
  };
}

export function armourTransform(detail) {
  const { scale, tx, ty } = fitArmour(detail.box);
  return `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})`;
}

// --- Shared geometry --------------------------------------------------------
//
// Six of these are a vest and four are a plate. Drawing each outline by hand
// six times is how they end up subtly different from each other for no reason,
// so the silhouettes are functions and the variants differ where they should:
// materials, cut, and what is stitched to the front.

/**
 * A vest front, built the way a real one is built.
 *
 * The first pass drew the whole outline as one curve and got a dome with a
 * notch in it — no shoulders at all. A carrier is not one shape: it is a flat
 * front PANEL with two padded STRAPS running up over the shoulders behind it,
 * and the deep neck opening is simply the gap left between them. Drawing it in
 * those two pieces gets the silhouette right for free and lets the straps lean
 * the way they actually lean.
 *
 * Returns the finished SVG rather than a path, because the straps have to go
 * down before the panel does — they pass behind it.
 */
function vest({ drop = 296, fill = 'url(#paCordura)', texture = 'url(#paWeave)' } = {}) {
  const panel = `M70 100 h280 c20 0 30 10 30 30 v${drop}
    c0 20 -12 32 -32 32 h-276 c-20 0 -32 -12 -32 -32 v-${drop} c0 -20 10 -30 30 -30 z`;
  const strap = (x, deg) =>
    `<g transform="translate(${x} 34) rotate(${deg})">
      <rect x="-27" y="-10" width="54" height="116" rx="17" fill="${fill}"/>
      <rect x="-27" y="-10" width="54" height="116" rx="17" fill="${texture}"/>
      <rect x="-27" y="-10" width="54" height="9" rx="4" fill="#9aa08b" opacity=".28"/>
    </g>`;
  return `${strap(146, 21)}${strap(274, -21)}
    <path d="${panel}" fill="${fill}"/>
    <path d="${panel}" fill="${texture}"/>
    <path d="M70 100 h280 c20 0 30 10 30 30 v6 h-340 v-6 c0 -20 10 -30 30 -30 z"
          fill="#9aa08b" opacity=".26"/>
    <!-- the collar shadow, so the neck reads as an opening and not a gap -->
    <path d="M168 100 h84 c-4 18 -20 28 -42 28 s-38 -10 -42 -28 z"
          fill="#0c0e0c" opacity=".45"/>`;
}

/**
 * A plate carrier front: the same two pieces, but the panel is sized to a
 * 10x12" plate rather than to a torso, so it is narrower and finishes higher.
 */
function carrier({ drop = 196, fill = 'url(#paCordura)', texture = 'url(#paWeave)' } = {}) {
  const panel = `M96 104 h228 c18 0 27 9 27 27 v${drop}
    c0 18 -11 29 -29 29 h-224 c-18 0 -29 -11 -29 -29 v-${drop} c0 -18 9 -27 27 -27 z`;
  const strap = (x, deg) =>
    `<g transform="translate(${x} 40) rotate(${deg})">
      <rect x="-24" y="-10" width="48" height="104" rx="15" fill="${fill}"/>
      <rect x="-24" y="-10" width="48" height="104" rx="15" fill="${texture}"/>
      <rect x="-24" y="-10" width="48" height="8" rx="4" fill="#9aa08b" opacity=".28"/>
    </g>`;
  return `${strap(160, 19)}${strap(260, -19)}
    <path d="${panel}" fill="${fill}"/>
    <path d="${panel}" fill="${texture}"/>
    <path d="M96 104 h228 c18 0 27 9 27 27 v6 h-282 v-6 c0 -18 9 -27 27 -27 z"
          fill="#9aa08b" opacity=".26"/>
    <path d="M176 104 h68 c-3 16 -16 25 -34 25 s-31 -9 -34 -25 z"
          fill="#0c0e0c" opacity=".45"/>`;
}

/**
 * Laser-cut MOLLE: rows of short rounded slots burnt straight through the
 * laminate. Every modern carrier is covered in them and they are the single
 * most recognisable thing about one, so they are drawn as real slots rather
 * than hinted at with a texture.
 */
function laserGrid(x, y, w, h, cols = 5, rows = 5) {
  const gapX = 10;
  const gapY = h / rows;
  const sw = (w - gapX * (cols - 1)) / cols;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(`<rect x="${(x + c * (sw + gapX)).toFixed(1)}" y="${(y + r * gapY).toFixed(1)}"
        width="${sw.toFixed(1)}" height="7" rx="3.5"/>`);
    }
  }
  return `<g fill="#0c0e0c" opacity=".62">${out.join('')}</g>`;
}

/**
 * The cummerbund: a wide band out past the torso on both sides, slotted like
 * everything else, with a buckle where it closes.
 */
function cummerbund(y, h = 68, { slots = true } = {}) {
  return `
    <path d="M14 ${y} h392 v${h} c0 10 -7 16 -18 16 h-356 c-11 0 -18 -6 -18 -16 z"
          fill="url(#paCorduraLt)"/>
    <path d="M14 ${y} h392 v6 h-392 z" fill="#8d9382" opacity=".22"/>
    ${slots ? laserGrid(26, y + 14, 368, h - 20, 8, 2) : ''}
    <path d="M92 ${y - 4} h26 v${h + 26} h-26 z" fill="#14160f"/>
    <path d="M302 ${y - 4} h26 v${h + 26} h-26 z" fill="#14160f"/>`;
}

/**
 * A SAPI shooter's-cut plate: square at the bottom, top corners angled away so
 * it clears the shoulder. Every hard plate in the game is this outline.
 */
function sapi(w, h, r = 10) {
  const cut = w * 0.26;
  const rise = h * 0.19;
  return `M${cut} 0 h${w - cut * 2} l${cut} ${rise} v${h - rise - r}
    a${r} ${r} 0 0 1 -${r} ${r} h-${w - r * 2} a${r} ${r} 0 0 1 -${r} -${r}
    v-${h - rise - r} z`;
}

/** A helmet shell in profile-front: a dome with the brow and an ear cut. */
function helmet({ earDrop = 74 } = {}) {
  return `M30 122 C30 54 92 12 168 12 s138 42 138 110
    v34 c0 10 -7 17 -17 17 h-32 l-12 ${earDrop} h-154 l-12 -${earDrop} h-32
    c-10 0 -17 -7 -17 -17 z`;
}

// ---------------------------------------------------------------------------
// The drawings.
//
// `box`  the native rectangle that should fill the square field, [x, y, w, h]
// `body` SVG, authored in that space
// ---------------------------------------------------------------------------

export const ARMOUR_DETAIL = {

  // --- Weaver Stab Vest -----------------------------------------------------
  // A stab vest is about 18" across the shoulders and hangs 20", at 19 px/in.
  // Aramid and nothing else: no plates, no laser cut, no pouches. The quilted
  // rows and the plain side straps are the whole garment, and that is exactly
  // why it is the cheapest thing in the trade.
  weaver: {
    box: [4, 8, 402, 434],
    ppi: 19,
    body: `
      ${vest({ fill: 'url(#paAramid)' })}
      <!-- quilting: the rows of stitching holding the panels together -->
      <g fill="none" stroke="#2b2619" stroke-width="3.4" opacity=".45">
        <path d="M78 176 h264"/><path d="M74 222 h272"/>
        <path d="M72 268 h276"/><path d="M72 314 h276"/>
      </g>
      <!-- plain side straps: the only hardware on it -->
      <path d="M70 250 h-46 v40 h46 z" fill="url(#paCordura)"/>
      <path d="M350 250 h46 v40 h-46 z" fill="url(#paCordura)"/>
      <path d="M28 254 h24 v32 h-24 z" fill="#141612"/>
      <path d="M368 254 h24 v32 h-24 z" fill="#141612"/>
      <path d="M172 386 h76 v22 h-76 z" fill="#c9c3ac" opacity=".28"/>
    `,
  },

  // --- Mail Liner -----------------------------------------------------------
  // Titanium ring mail worn under a shirt. Same silhouette, completely
  // different material — which is the whole reason to draw the rings rather
  // than tint the aramid a shade greyer and call it a variant.
  mailliner: {
    box: [4, 8, 402, 320],
    ppi: 19,
    body: `
      ${vest({ drop: 182, fill: 'url(#paPlateSteel)', texture: 'url(#paMail)' })}
      <!-- fabric binding top and bottom, where mail against skin would chafe -->
      <path d="M74 132 h252 v26 h-252 z" fill="url(#paCordura)"/>
      <path d="M72 282 h256 v28 h-256 z" fill="url(#paCordura)"/>
      <path d="M74 132 h252 v5 h-252 z" fill="#666b59" opacity=".5"/>
      <path d="M70 200 h-26 v36 h26 z" fill="#141612"/>
      <path d="M350 200 h26 v36 h-26 z" fill="#141612"/>
    `,
  },

  // --- Shadow Undervest -----------------------------------------------------
  // Thin, pale, worn against the skin. Cut short so it finishes above the belt
  // and disappears under a shirt — no slots, no bulk, nothing to print.
  shadow: {
    box: [26, 8, 358, 274],
    ppi: 19,
    body: `
      ${vest({ drop: 134, fill: 'url(#paAramidLt)' })}
      <!-- one seam down the middle: a single front panel and nothing else -->
      <path d="M210 132 v144" stroke="#332d1e" stroke-width="3" opacity=".38" fill="none"/>
      <g fill="none" stroke="#332d1e" stroke-width="2.6" opacity=".28">
        <path d="M76 176 h268"/><path d="M74 232 h272"/>
      </g>
      <!-- elastic rather than buckles: it has to lie flat under a shirt -->
      <path d="M70 190 h-28 v22 h28 z" fill="#2b2619"/>
      <path d="M350 190 h28 v22 h-28 z" fill="#2b2619"/>
    `,
  },

  // --- Dayshift II ----------------------------------------------------------
  // An outer carrier cut like a waistcoat: covered zip, a yoke seam, loop
  // panels for tape. Black cordura, because that is what a duty vest is.
  dayshift: {
    box: [4, 8, 402, 434],
    ppi: 19,
    body: `
      ${vest({ fill: 'url(#paCordura)' })}
      <!-- loop panels for a name tape and a badge tab -->
      <path d="M88 168 h108 v30 h-108 z" fill="#14160f" opacity=".8"/>
      <path d="M232 162 h72 v46 h-72 z" fill="#14160f" opacity=".8"/>
      <g fill="#3b3f35"><circle cx="252" cy="178" r="4"/><circle cx="284" cy="178" r="4"/>
        <circle cx="268" cy="196" r="4"/></g>
      <!-- a couple of slot rows across the chest, not a full field of them -->
      ${laserGrid(80, 218, 260, 44, 4, 2)}
      <!-- the closure: a covered zip down the centre -->
      <path d="M196 148 h28 v272 h-28 z" fill="#1a1d17"/>
      <path d="M200 152 h6 v264 h-6 z" fill="#8d9382" opacity=".45"/>
      ${cummerbund(344, 62)}
    `,
  },

  // --- Slick Carrier --------------------------------------------------------
  // Sized to a 10x12" plate at 22 px/in. "Slick" means no laser cut and no
  // pouches at all — the entire selling point is that it goes under a jacket,
  // so what defines this drawing is everything the others have and it doesn't.
  slick: {
    box: [40, 8, 330, 338],
    ppi: 22,
    body: `
      ${carrier({ fill: 'url(#paCordura)' })}
      <!-- the plate pocket, stitched as an outline and nothing else -->
      <path d="M112 146 h196 v152 h-196 z" fill="none" stroke="#0c0e0c"
            stroke-width="3.5" opacity=".55"/>
      <!-- plain elastic cummerbund, unslotted -->
      <path d="M62 250 h296 v54 c0 10 -7 15 -17 15 h-262 c-10 0 -17 -5 -17 -15 z"
            fill="url(#paCorduraLt)"/>
      <path d="M62 250 h296 v5 h-296 z" fill="#8d9382" opacity=".22"/>
      <path d="M196 246 h28 v78 h-28 z" fill="#14160f"/>
      <!-- quick-release tab high on the chest -->
      <path d="M186 118 h48 v18 h-48 z" fill="#14160f"/>
    `,
  },

  // --- Rigger Rig -----------------------------------------------------------
  // The same carrier with every option ticked: a full laser-cut field front
  // and back, a slotted cummerbund, shoulder buckles with pull tabs, and a
  // placard of magazine pouches hanging over the front.
  rigger: {
    box: [4, 8, 402, 366],
    ppi: 22,
    body: `
      ${carrier({ drop: 160, fill: 'url(#paCorduraLt)' })}
      <!-- shoulder buckles with pull tabs, the quick-release everyone fits -->
      <path d="M128 52 h34 v34 h-34 z" fill="#14160f"/>
      <path d="M258 52 h34 v34 h-34 z" fill="#14160f"/>
      <path d="M138 86 h14 v30 h-14 z" fill="#14160f"/>
      <path d="M268 86 h14 v30 h-14 z" fill="#14160f"/>
      <!-- admin panel top centre, then the laser-cut field -->
      <path d="M180 126 h60 v34 h-60 z" fill="#14160f" opacity=".85"/>
      ${laserGrid(108, 172, 204, 72, 4, 3)}
      <!-- placard: magazine pouches hung over the front -->
      <path d="M112 268 h196 v88 c0 10 -7 16 -17 16 h-162 c-10 0 -17 -6 -17 -16 z"
            fill="url(#paCordura)"/>
      ${laserGrid(124, 282, 172, 56, 4, 3)}
      <g fill="#14160f">
        <rect x="150" y="258" width="14" height="22" rx="4"/>
        <rect x="203" y="258" width="14" height="22" rx="4"/>
        <rect x="256" y="258" width="14" height="22" rx="4"/>
      </g>
      <!-- cummerbund, running out past the torso on both sides -->
      <path d="M14 200 h392 v56 c0 10 -7 16 -18 16 h-356 c-11 0 -18 -6 -18 -16 z"
            fill="url(#paCordura)"/>
      ${laserGrid(26, 212, 368, 34, 8, 2)}
      <path d="M96 196 h24 v82 h-24 z" fill="#14160f"/>
      <path d="M300 196 h24 v82 h-24 z" fill="#14160f"/>
    `,
  },

  // --- Patrol IIIA ----------------------------------------------------------
  // The full duty carrier, and the one that has to read as "police vest" at a
  // glance: stand-up collar, reflective name tape, slot rows top and bottom,
  // and a cummerbund wider than the vest itself.
  patrol: {
    box: [4, 8, 402, 434],
    ppi: 19,
    body: `
      ${vest({ fill: 'url(#paCordura)' })}
      <!-- reflective name tape across the chest -->
      <path d="M92 158 h236 v34 h-236 z" fill="#14160f"/>
      <path d="M100 166 h220 v18 h-220 z" fill="#b9c3cc" opacity=".35"/>
      ${laserGrid(80, 208, 260, 56, 5, 3)}
      ${cummerbund(344, 62)}
    `,
  },

  // --- Sheerweb IIIA --------------------------------------------------------
  // Polyethylene instead of aramid: half the weight and twice the money. The
  // material IS the product, so it is drawn pale with the crossed laminate
  // showing through, and stripped of everything that would add weight.
  sheerweb: {
    box: [26, 8, 358, 340],
    ppi: 19,
    body: `
      ${vest({ drop: 198, fill: 'url(#paPoly)', texture: 'none' })}
      <!-- unidirectional laminate: layers laid crossways over each other -->
      <g fill="none" stroke="#4e4a3c" stroke-width="2" opacity=".3">
        <path d="M74 164 h272"/><path d="M72 196 h276"/><path d="M72 228 h276"/>
        <path d="M72 260 h276"/><path d="M72 292 h276"/><path d="M74 324 h272"/>
      </g>
      <g fill="none" stroke="#4e4a3c" stroke-width="2" opacity=".2">
        <path d="M120 150 v204"/><path d="M175 150 v204"/>
        <path d="M245 150 v204"/><path d="M300 150 v204"/>
      </g>
      <!-- one loop on the shoulder for a radio lead. Nothing else on it. -->
      <path d="M276 74 h36 v14 h-36 z" fill="#3f3c31" opacity=".7"/>
      <path d="M70 236 h-28 v30 h28 z" fill="#3f3c31"/>
      <path d="M350 236 h28 v30 h-28 z" fill="#3f3c31"/>
    `,
  },

  // --- High-Cut Shell -------------------------------------------------------
  // A ballistic helmet is about 11" front to back and 8" tall, at 30 px/in.
  // "High cut" means the shell is cut away above the ear for a headset and a
  // rifle stock — that scoop is the entire difference from a full cut.
  highcut: {
    box: [10, -6, 320, 260],
    ppi: 30,
    body: `
      <path d="M28 132 C28 62 90 18 168 18 s140 44 140 114
               v22 c0 10 -7 17 -17 17 h-26 l-14 34 h-126 l-14 -34 h-26
               c-10 0 -17 -7 -17 -17 z" fill="url(#paAramid)"/>
      <path d="M28 132 C28 62 90 18 168 18 s140 44 140 114 v6
               c0 -68 -62 -110 -140 -110 s-140 42 -140 110 z"
            fill="#b5a884" opacity=".28"/>
      <path d="M28 132 C28 62 90 18 168 18 s140 44 140 114
               v22 c0 10 -7 17 -17 17 h-26 l-14 34 h-126 l-14 -34 h-26
               c-10 0 -17 -7 -17 -17 z" fill="url(#paWeave)"/>
      <!-- accessory rails down both sides, which a high cut exists to carry -->
      <path d="M26 108 h20 v56 h-20 z" fill="#141612"/>
      <path d="M290 108 h20 v56 h-20 z" fill="#141612"/>
      <g fill="#3b3f35">
        <rect x="28" y="114" width="16" height="8"/><rect x="28" y="130" width="16" height="8"/>
        <rect x="28" y="146" width="16" height="8"/>
        <rect x="292" y="114" width="16" height="8"/><rect x="292" y="130" width="16" height="8"/>
        <rect x="292" y="146" width="16" height="8"/>
      </g>
      <!-- front shroud for a night-vision mount -->
      <path d="M146 40 h44 c6 0 9 3 9 9 v20 h-62 v-20 c0 -6 3 -9 9 -9 z" fill="#141612"/>
      <path d="M158 26 h20 v16 h-20 z" fill="#3b3f35"/>
      <!-- chinstrap, off the rails and down past the cut -->
      <g fill="none" stroke="#1c1f19" stroke-width="9" stroke-linecap="round">
        <path d="M52 164 l34 52"/><path d="M284 164 l-34 52"/>
      </g>
      <path d="M120 210 h96 v18 h-96 z" fill="#1c1f19"/>
    `,
  },

  // --- Full-Cut Lid ---------------------------------------------------------
  // The old pattern: shell carried on down past the ear, no cut and no rails.
  // Heavier, more coverage, and a great deal cheaper to press.
  fullcut: {
    box: [10, -6, 320, 268],
    ppi: 30,
    body: `
      <path d="M24 138 C24 62 88 16 168 16 s144 46 144 122
               v34 c0 12 -8 20 -20 20 h-28 l-16 30 h-120 l-16 -30 h-28
               c-12 0 -20 -8 -20 -20 z" fill="url(#paAramidLt)"/>
      <path d="M24 138 C24 62 88 16 168 16 s144 46 144 122 v6
               c0 -74 -64 -118 -144 -118 s-144 44 -144 118 z"
            fill="#c2b28a" opacity=".3"/>
      <path d="M24 138 C24 62 88 16 168 16 s144 46 144 122
               v34 c0 12 -8 20 -20 20 h-28 l-16 30 h-120 l-16 -30 h-28
               c-12 0 -20 -8 -20 -20 z" fill="url(#paWeave)"/>
      <!-- the brim: a full cut has a lip all the way round -->
      <path d="M24 160 h288 v16 c0 12 -8 16 -20 16 h-248 c-12 0 -20 -4 -20 -16 z"
            fill="#5e543f"/>
      <path d="M24 160 h288 v5 h-288 z" fill="#1c1f19" opacity=".45"/>
      <!-- chinstrap bales through the shell, the only hardware on it -->
      <path d="M62 120 h18 v22 h-18 z" fill="#141612"/>
      <path d="M256 120 h18 v22 h-18 z" fill="#141612"/>
      <g fill="none" stroke="#1c1f19" stroke-width="9" stroke-linecap="round">
        <path d="M72 192 l28 44"/><path d="M264 192 l-28 44"/>
      </g>
      <path d="M126 230 h84 v18 h-84 z" fill="#1c1f19"/>
    `,
  },

  // --- Hardline Steel III ---------------------------------------------------
  // A 10x12" shooter's-cut plate at 30 px/in. Steel is a quarter inch thick and
  // dead flat, and what it is really known for is the spall coat sprayed over
  // the face to catch fragments — so the grit finish is the point of the
  // drawing, not a texture laid on for its own sake.
  hardline: {
    box: [-14, -14, 328, 388],
    ppi: 30,
    body: `
      <path d="${sapi(300, 360)}" fill="url(#paPlateSteel)"/>
      <path d="${sapi(300, 360)}" fill="url(#paGrit)"/>
      <path d="M78 0 h144 l78 68 v10 l-84 -70 h-132 l-84 70 v-10 z"
            fill="#8d97a5" opacity=".3"/>
      <!-- a quarter inch of plate, seen at the edge -->
      <path d="M0 344 h300 v6 a10 10 0 0 1 -10 10 h-280 a10 10 0 0 1 -10 -10 z"
            fill="#15181c"/>
      <!-- stamped rating, the way steel plates are marked -->
      <path d="M96 156 h108 v52 h-108 z" fill="none" stroke="#0f1115"
            stroke-width="4" opacity=".55"/>
      <path d="M112 172 h20 v20 h-20 z M140 172 h8 v20 h-8 z M156 172 h20 v20 h-20 z"
            fill="#0f1115" opacity=".5"/>
      <!-- the single hole every steel plate has, for the retention strap -->
      <circle cx="150" cy="286" r="11" fill="#0f1115"/>
    `,
  },

  // --- Poly III+ ------------------------------------------------------------
  // Pressed polyethylene: an inch and a quarter thick where steel is a quarter,
  // so it is drawn deep, and the pressed layers show at the edge. Pale, because
  // that is what UHMWPE is before anybody paints it.
  polyplate: {
    box: [-14, -14, 328, 396],
    ppi: 30,
    body: `
      <path d="${sapi(300, 360)}" fill="url(#paPoly)"/>
      <path d="M78 0 h144 l78 68 v10 l-84 -70 h-132 l-84 70 v-10 z"
            fill="#d8d4c2" opacity=".38"/>
      <!-- the pressed layers, stacked and visible all the way round the edge -->
      <g fill="#5b5748" opacity=".4">
        <rect x="0" y="318" width="300" height="4"/>
        <rect x="0" y="328" width="300" height="4"/>
        <rect x="0" y="338" width="300" height="4"/>
      </g>
      <path d="M0 346 h300 v4 a10 10 0 0 1 -10 10 h-280 a10 10 0 0 1 -10 -10 z"
            fill="#3f3c31"/>
      <!-- a thin painted face, rolled on and stopping short of the edge -->
      <path d="M22 40 h256 v246 h-256 z" fill="#4e4a3c" opacity=".18"/>
      <path d="M104 158 h92 v46 h-92 z" fill="none" stroke="#3f3c31"
            stroke-width="4" opacity=".5"/>
      <path d="M118 172 h16 v18 h-16 z M142 172 h8 v18 h-8 z M158 172 h22 v18 h-22 z"
            fill="#3f3c31" opacity=".45"/>
    `,
  },

  // --- Carbide IV -----------------------------------------------------------
  // Level IV: a silicon carbide strike face bonded to a polyethylene backer.
  // Two materials, and you can see both — the ceramic face stops short of the
  // edge and the backer wraps round it. That step is the whole silhouette.
  carbide: {
    box: [-14, -14, 328, 392],
    ppi: 30,
    body: `
      <!-- the backer, which is the part that actually catches the fragments -->
      <path d="${sapi(300, 360)}" fill="url(#paPoly)"/>
      <path d="M0 340 h300 v10 a10 10 0 0 1 -10 10 h-280 a10 10 0 0 1 -10 -10 z"
            fill="#3f3c31"/>
      <!-- the ceramic face, inset so the backer shows all the way round -->
      <path d="${sapi(262, 322, 8)}" transform="translate(19 16)" fill="url(#paCeramic)"/>
      <g transform="translate(19 16)">
        <path d="${sapi(262, 322, 8)}" fill="url(#paGrit)"/>
        <path d="M68 0 h126 l68 61 v9 l-73 -63 h-116 l-73 63 v-9 z"
              fill="#b6c0bc" opacity=".3"/>
        <!-- the tiles the face is actually made of, seen through the cover -->
        <g fill="none" stroke="#2b3230" stroke-width="2.4" opacity=".45">
          <path d="M0 96 h262"/><path d="M0 176 h262"/><path d="M0 256 h262"/>
          <path d="M88 40 v282"/><path d="M175 40 v282"/>
        </g>
      </g>
      <!-- label: every Level IV plate carries its lot and its date -->
      <path d="M96 268 h108 v38 h-108 z" fill="#cfd6d2" opacity=".28"/>
      <g fill="#1b211f" opacity=".5">
        <rect x="106" y="278" width="88" height="5"/>
        <rect x="106" y="290" width="60" height="5"/>
      </g>
    `,
  },

  // --- Boron IV Lite --------------------------------------------------------
  // Boron carbide instead of silicon: two pounds lighter, roughly twice the
  // money, and darker. Same construction, drawn thinner — the whole product is
  // "the same protection, less of it", so it has to LOOK like less of it.
  boronlite: {
    box: [-14, -14, 328, 386],
    ppi: 30,
    body: `
      <path d="${sapi(300, 352)}" fill="url(#paPoly)"/>
      <path d="M0 338 h300 v4 a10 10 0 0 1 -10 10 h-280 a10 10 0 0 1 -10 -10 z"
            fill="#3f3c31"/>
      <path d="${sapi(274, 326, 8)}" transform="translate(13 11)" fill="#3a4442"/>
      <g transform="translate(13 11)">
        <path d="${sapi(274, 326, 8)}" fill="url(#paGrit)"/>
        <path d="M71 0 h132 l71 62 v9 l-76 -64 h-122 l-76 64 v-9 z"
              fill="#8fa09c" opacity=".25"/>
        <g fill="none" stroke="#1e2523" stroke-width="2.2" opacity=".5">
          <path d="M0 108 h274"/><path d="M0 216 h274"/>
          <path d="M92 40 v286"/><path d="M183 40 v286"/>
        </g>
      </g>
      <path d="M100 262 h100 v34 h-100 z" fill="#cfd6d2" opacity=".22"/>
      <g fill="#1b211f" opacity=".45">
        <rect x="110" y="272" width="80" height="5"/>
        <rect x="110" y="283" width="52" height="5"/>
      </g>
    `,
  },

  // --- Mini Shield ----------------------------------------------------------
  // Twelve by eighteen, one hand, Level IIIA, at 20 px/in. What makes a shield
  // a shield rather than a big plate is the VIEWPORT and the handle — so both
  // are drawn as real hardware rather than suggested.
  minishield: {
    box: [-16, -16, 304, 424],
    ppi: 20,
    body: `
      <path d="M0 20 c0 -12 8 -20 20 -20 h232 c12 0 20 8 20 20 v352
               c0 12 -8 20 -20 20 h-232 c-12 0 -20 -8 -20 -20 z"
            fill="url(#paCordura)"/>
      <path d="M0 20 c0 -12 8 -20 20 -20 h232 c12 0 20 8 20 20 v8 h-272 z"
            fill="#8d9382" opacity=".3"/>
      <!-- ballistic glass, set into the top third -->
      <path d="M44 44 h184 v96 h-184 z" fill="#141612"/>
      <path d="M52 52 h168 v80 h-168 z" fill="url(#paGlass)"/>
      <path d="M60 58 l52 0 -58 62 v-56 z" fill="#cfe3f2" opacity=".2"/>
      <!-- handle bracket across the back, seen through the outline -->
      <path d="M84 208 h104 v22 h-104 z" fill="#141612"/>
      <path d="M96 230 h18 v78 h-18 z" fill="#141612"/>
      <path d="M158 230 h18 v78 h-18 z" fill="#141612"/>
      <path d="M84 308 h104 v20 c0 8 -6 12 -14 12 h-76 c-8 0 -14 -4 -14 -12 z"
            fill="#1f231c"/>
      <!-- rating stencilled on the face, because they always are -->
      <g fill="#b9c3cc" opacity=".28">
        <rect x="40" y="356" width="30" height="8"/>
        <rect x="78" y="356" width="10" height="8"/>
        <rect x="96" y="356" width="30" height="8"/>
      </g>
    `,
  },

  // --- Barricade Shield -----------------------------------------------------
  // Full body, Level III, at 13 px/in: four feet tall and two across, which is
  // why it takes two people to move and a department to afford. Viewport, a
  // light on the side, and a skid along the floor edge.
  barricade: {
    box: [-18, -18, 340, 660],
    ppi: 13,
    body: `
      <path d="M0 26 c0 -14 10 -24 24 -24 h256 c14 0 24 10 24 24 v574
               c0 14 -10 24 -24 24 h-256 c-14 0 -24 -10 -24 -24 z"
            fill="url(#paPlateSteel)"/>
      <path d="M0 26 c0 -14 10 -24 24 -24 h256 c14 0 24 10 24 24 v10 h-304 z"
            fill="#8d97a5" opacity=".3"/>
      <!-- the ribs a shield this size needs so it does not flex -->
      <g fill="#15181c" opacity=".35">
        <rect x="24" y="240" width="256" height="8"/>
        <rect x="24" y="330" width="256" height="8"/>
        <rect x="24" y="420" width="256" height="8"/>
      </g>
      <!-- viewport, up where the eyes go -->
      <path d="M52 62 h200 v112 h-200 z" fill="#141612"/>
      <path d="M62 72 h180 v92 h-180 z" fill="url(#paGlass)"/>
      <path d="M74 80 l58 0 -64 72 v-64 z" fill="#cfe3f2" opacity=".2"/>
      <!-- the light, clamped to the side rail where one always is -->
      <path d="M282 96 h34 v58 h-34 z" fill="#1f231c"/>
      <circle cx="299" cy="125" r="13" fill="#141612"/>
      <circle cx="299" cy="125" r="8" fill="#e8dfb6" opacity=".65"/>
      <!-- forearm cuff and grip, on the back -->
      <path d="M84 216 h136 v30 h-136 z" fill="#141612"/>
      <path d="M104 246 h22 v150 h-22 z" fill="#141612"/>
      <path d="M178 246 h22 v150 h-22 z" fill="#141612"/>
      <path d="M84 396 h136 v26 c0 10 -7 16 -17 16 h-102 c-10 0 -17 -6 -17 -16 z"
            fill="#1f231c"/>
      <!-- skid along the bottom, so it can be walked forward on the floor -->
      <path d="M8 600 h288 v22 c0 8 -6 12 -14 12 h-260 c-8 0 -14 -4 -14 -12 z"
            fill="#0f1115"/>
      <g fill="#b9c3cc" opacity=".25">
        <rect x="48" y="556" width="34" height="10"/>
        <rect x="90" y="556" width="12" height="10"/>
        <rect x="110" y="556" width="34" height="10"/>
      </g>
    `,
  },
};

export const ARMOUR_DETAIL_IDS = Object.keys(ARMOUR_DETAIL);
