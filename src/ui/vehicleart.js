// The fleet, drawn properly.
//
// What was here before was twelve flat silhouettes shared between twenty-two
// models: a cab was a saloon, a chiller was a van, a flatbed was a pickup and
// a luxury car was a Camry. At thumbnail size that is not a shortcut, it is a
// lie about what you just spent money on.
//
// So: one drawing per model, side profile, authored against the real vehicle.
// Every entry states the px/in it was drawn at, exactly like the firearms and
// the armour, and every dimension below came off a real spec sheet — a Golf is
// 168" long and 57" tall, a 53' trailer is 53 feet. That is what makes an SUV
// read as taller than a saloon rather than as a saloon somebody scaled up.
//
// The outlines are generated from measured control points rather than traced
// by hand twenty-two times. That is not the same as sharing one shape: a
// hatchback's roof ends over the rear axle and a saloon's does not, a van's
// windscreen is nearly vertical and a sports car's is raked past 60 degrees,
// and those numbers are what the generator takes. Hand-tracing twenty-two
// bezier chains is how they end up subtly wrong in twenty-two different ways.

export const FIELD_W = 64;
export const FIELD_H = 32;

export const VEHICLE_DEFS = `
  <linearGradient id="pvGlass" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5f7185"/><stop offset=".45" stop-color="#3a4757"/>
    <stop offset="1" stop-color="#232c37"/>
  </linearGradient>
  <linearGradient id="pvTyre" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2a2d33"/><stop offset=".5" stop-color="#191b1f"/>
    <stop offset="1" stop-color="#0e0f12"/>
  </linearGradient>
  <linearGradient id="pvRim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#c3cbd4"/><stop offset=".5" stop-color="#8f99a5"/>
    <stop offset="1" stop-color="#5c6572"/>
  </linearGradient>
  <linearGradient id="pvChrome" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#dfe6ee"/><stop offset=".5" stop-color="#9aa4b0"/>
    <stop offset="1" stop-color="#6b7480"/>
  </linearGradient>

  <!-- Paint. Top-lit, because a car body is a horizontal surface catching the
       sky and a vertical one catching the street, and the line between them is
       the single thing that makes flat car art read as metal. -->
  <linearGradient id="pvSilver" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cdd4dc"/><stop offset=".46" stop-color="#9aa3ad"/>
    <stop offset=".52" stop-color="#848d98"/><stop offset="1" stop-color="#5e666f"/>
  </linearGradient>
  <!-- "Black" has to stay visible against a near-black UI, so this is the
       black a black car actually photographs as rather than #000. -->
  <linearGradient id="pvBlack" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#525a65"/><stop offset=".46" stop-color="#32383f"/>
    <stop offset=".52" stop-color="#282d34"/><stop offset="1" stop-color="#1b1f24"/>
  </linearGradient>
  <linearGradient id="pvWhite" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#eef1f4"/><stop offset=".46" stop-color="#d2d7dc"/>
    <stop offset=".52" stop-color="#bcc2c9"/><stop offset="1" stop-color="#959ca4"/>
  </linearGradient>
  <linearGradient id="pvRed" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c8453c"/><stop offset=".46" stop-color="#a5312a"/>
    <stop offset=".52" stop-color="#8d2822"/><stop offset="1" stop-color="#5f1a16"/>
  </linearGradient>
  <linearGradient id="pvBlue" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a6f9e"/><stop offset=".46" stop-color="#365478"/>
    <stop offset=".52" stop-color="#2c4763"/>
    <stop offset="1" stop-color="#1c2f43"/>
  </linearGradient>
  <linearGradient id="pvGrey" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8b939c"/><stop offset=".46" stop-color="#6a727b"/>
    <stop offset=".52" stop-color="#5a6169"/><stop offset="1" stop-color="#3d434a"/>
  </linearGradient>
  <linearGradient id="pvYellow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e3b94a"/><stop offset=".46" stop-color="#c79a2c"/>
    <stop offset=".52" stop-color="#ad8423"/><stop offset="1" stop-color="#7a5c16"/>
  </linearGradient>
  <linearGradient id="pvGreen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5a7a5c"/><stop offset=".46" stop-color="#425e45"/>
    <stop offset=".52" stop-color="#374f3a"/><stop offset="1" stop-color="#243527"/>
  </linearGradient>

  <!-- A box body is corrugated aluminium, and the ribs are most of what tells
       you it is a box body rather than a painted panel. -->
  <pattern id="pvRibs" width="22" height="8" patternUnits="userSpaceOnUse">
    <rect width="22" height="8" fill="none"/>
    <rect width="3" height="8" fill="#000" opacity=".16"/>
    <rect x="3" width="2" height="8" fill="#fff" opacity=".07"/>
  </pattern>
  <linearGradient id="pvPanel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e6eaee"/><stop offset=".5" stop-color="#c4cad1"/>
    <stop offset="1" stop-color="#959ba2"/>
  </linearGradient>
  <linearGradient id="pvSteelDeck" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8d959e"/><stop offset="1" stop-color="#4e555d"/>
  </linearGradient>
`;

/** Fit a drawing's native box into the 64x32 field, preserving aspect. */
export function fitVehicle(box) {
  const [x, y, w, h] = box;
  const scale = Math.min(FIELD_W / w, FIELD_H / h);
  return {
    scale,
    tx: (FIELD_W - w * scale) / 2 - x * scale,
    ty: (FIELD_H - h * scale) / 2 - y * scale,
  };
}

export function vehicleTransform(detail) {
  const { scale, tx, ty } = fitVehicle(detail.box);
  return `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})`;
}

// --- Shared parts -----------------------------------------------------------
//
// Wheels, glass and lamps are the same objects on every vehicle, so they are
// functions. Everything that distinguishes one model from another lives in the
// measurements passed to `road` and `boxed` below, never in here.

/**
 * A wheel: tyre, rim, hub and a wedge of shadow inside the arch.
 *
 * `r` is the TYRE radius. A car wheel is about 55% rim and 45% sidewall on a
 * saloon and much more rim on anything sporting, so `rimFrac` is a parameter
 * rather than a constant — it is the difference between a 911 and a pickup.
 */
function wheel(cx, cy, r, { rimFrac = 0.62, spokes = 5 } = {}) {
  const rim = r * rimFrac;
  const spoke = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    spoke.push(`M${(cx + Math.cos(a) * rim * 0.28).toFixed(1)} ${(cy + Math.sin(a) * rim * 0.28).toFixed(1)}
      L${(cx + Math.cos(a) * rim * 0.88).toFixed(1)} ${(cy + Math.sin(a) * rim * 0.88).toFixed(1)}`);
  }
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="url(#pvTyre)"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.97).toFixed(1)}" fill="none"
      stroke="#000" stroke-width="${(r * 0.06).toFixed(1)}" opacity=".35"/>
    <circle cx="${cx}" cy="${cy}" r="${rim.toFixed(1)}" fill="url(#pvRim)"/>
    <g stroke="#5c6572" stroke-width="${(rim * 0.16).toFixed(1)}" stroke-linecap="round"
       opacity=".55">${spoke.join('')}</g>
    <circle cx="${cx}" cy="${cy}" r="${(rim * 0.24).toFixed(1)}" fill="#6f7884"/>
  </g>`;
}

/** Glazing, inset from the pillar line so the pillars read as pillars. */
function pane(d) {
  return `<path d="${d}" fill="url(#pvGlass)"/>
    <path d="${d}" fill="#dce6f0" opacity=".1"/>`;
}

function lamp(x, y, w, h, { tail = false, r = 2 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"
    fill="${tail ? '#c4413a' : '#f2e4c0'}" opacity=".92"/>`;
}

/**
 * The shoulder highlight every painted vehicle gets: a soft band just below
 * the glass, where the body side turns over towards the roof.
 */
function shoulder(x, y, w, h = 6) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"
    fill="#fff" opacity=".13"/>`;
}

/** A shut line between two doors. Cheap, and nothing says "car" faster. */
function shut(x, y1, y2, w = 2.5) {
  return `<path d="M${x} ${y1} V${y2}" stroke="#000" stroke-width="${w}"
    opacity=".28" stroke-linecap="round"/>`;
}

/**
 * A road vehicle in side profile, built from measured control points.
 *
 * Coordinates: y=0 is the highest point of the vehicle, y=`h` is the ground,
 * x=0 is the front bumper. Every argument is in the same units, so a caller
 * works in "inches times px/in" and nothing has to be converted twice.
 *
 * The bottom edge arcs UP over each wheel rather than being cut out of the
 * body with a boolean — the tyre is drawn over the arch afterwards and fills
 * it, which is both simpler and how the real thing looks.
 */
function road({
  len, h, sill, wheelR, fwx, rwx,
  noseY, bonnetY, screenX, roofFront, roofY, roofRear, backX, tailY,
  fill = 'url(#pvSilver)', rimFrac = 0.62,
  frontFace = 4, backFace = 4,
}) {
  // The arch has to be SHALLOW enough that the tyre covers its apex, or the
  // background shows through the gap between the two — which is exactly how
  // the first pass came out, with every car apparently floating over its own
  // wheels. `sill` sitting 6-8" off the ground is what makes that work; at
  // fifteen inches there is no arch depth that closes it.
  const wy = h - wheelR;
  const arch = Math.min(wheelR + h * 0.03, sill - (wy - wheelR) - 2);
  const archPath = (cx) =>
    `L${(cx - arch).toFixed(1)} ${sill} A${arch.toFixed(1)} ${arch.toFixed(1)} 0 0 1 ${(cx + arch).toFixed(1)} ${sill}`;

  const outline = `M${frontFace} ${sill}
    L0 ${noseY.toFixed(1)}
    L${screenX.toFixed(1)} ${bonnetY.toFixed(1)}
    L${roofFront.toFixed(1)} ${roofY.toFixed(1)}
    L${roofRear.toFixed(1)} ${roofY.toFixed(1)}
    L${backX.toFixed(1)} ${tailY.toFixed(1)}
    L${len.toFixed(1)} ${tailY.toFixed(1)}
    L${(len - backFace).toFixed(1)} ${sill}
    ${archPath(rwx)}
    ${archPath(fwx)}
    Z`;

  return {
    outline,
    svg: `
      <path d="${outline}" fill="${fill}"/>
      ${shoulder(screenX * 0.5, sill - h * 0.30, len * 0.62, h * 0.05)}
      ${wheel(fwx, wy, wheelR, { rimFrac })}
      ${wheel(rwx, wy, wheelR, { rimFrac })}`,
  };
}

/**
 * A van, truck or anything else whose back half is a box.
 *
 * Different function rather than a flag, because a box body is not a car with
 * a tall roof: the cab and the box are separate objects with a gap and a
 * different material, and drawing them as one shape is what made a Luton look
 * like a very tall van.
 */
function boxed({
  len, h, sill, wheelR, fwx, rwx,
  noseY, bonnetY, screenX, cabTop, cabBack,
  boxFront, boxTop, boxBack,
  fill = 'url(#pvWhite)', rimFrac = 0.5, luton = 0,
}) {
  // No arches. A lorry body stops at the chassis rail and the wheels are under
  // it in plain view — cutting arches into a box body is what made the first
  // Luton look like a van with a growth.
  const wy = h - wheelR;

  const cab = `M4 ${sill}
    L0 ${noseY.toFixed(1)}
    L${screenX.toFixed(1)} ${bonnetY.toFixed(1)}
    L${(screenX + (cabTop - bonnetY) * 0.28).toFixed(1)} ${cabTop.toFixed(1)}
    L${cabBack.toFixed(1)} ${cabTop.toFixed(1)}
    L${cabBack.toFixed(1)} ${sill}
    Z`;

  const box = `M${boxFront.toFixed(1)} ${sill}
    L${boxFront.toFixed(1)} ${(boxTop + luton).toFixed(1)}
    ${luton ? `L${(boxFront - luton * 0.9).toFixed(1)} ${boxTop.toFixed(1)}` : ''}
    L${boxBack.toFixed(1)} ${boxTop.toFixed(1)}
    L${boxBack.toFixed(1)} ${sill}
    Z`;

  // The chassis rail, spanning the gap the body leaves above the wheels. It is
  // most of what tells you this is a truck and not a very tall van.
  const rail = `<path d="M${(fwx - wheelR * 1.3).toFixed(1)} ${sill}
    H${(len - 8).toFixed(1)} V${(sill + (wy - wheelR - sill) * 0.55).toFixed(1)}
    H${(fwx - wheelR * 1.3).toFixed(1)} Z" fill="#2f353d"/>`;

  return {
    cab, box,
    svg: `
      ${wheel(fwx, wy, wheelR, { rimFrac })}
      ${wheel(rwx, wy, wheelR, { rimFrac })}
      ${rail}
      <path d="${box}" fill="${fill}"/>
      <path d="${box}" fill="url(#pvRibs)"/>
      <path d="${cab}" fill="${fill}"/>
      <path d="${cab}" fill="#000" opacity=".07"/>
      <path d="M${cabBack} ${cabTop} V${sill}" stroke="#000" stroke-width="${(len * 0.006).toFixed(1)}"
        opacity=".3"/>`,
  };
}

/**
 * A spoked wheel: a tyre you can see THROUGH.
 *
 * The car `wheel` above fills the rim solid, which is right for a car and
 * catastrophic for a bicycle — at 88% rim it came out as a plain grey disc and
 * the bikes read as two circles with a stick between them. A bicycle wheel is
 * mostly air, and the air is the recognisable part.
 */
function spoked(cx, cy, r, { tyre = 0.1, spokes = 12, hub = 0.1, rim = '#8d97a4' } = {}) {
  const tw = r * tyre;
  const inner = r - tw;
  const lines = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.2;
    lines.push(`M${(cx + Math.cos(a) * r * hub).toFixed(1)} ${(cy + Math.sin(a) * r * hub).toFixed(1)}
      L${(cx + Math.cos(a) * inner).toFixed(1)} ${(cy + Math.sin(a) * inner).toFixed(1)}`);
  }
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${(r - tw / 2).toFixed(1)}" fill="none"
      stroke="url(#pvTyre)" stroke-width="${tw.toFixed(1)}"/>
    <circle cx="${cx}" cy="${cy}" r="${inner.toFixed(1)}" fill="none"
      stroke="${rim}" stroke-width="${(tw * 0.42).toFixed(1)}" opacity=".85"/>
    <g stroke="${rim}" stroke-width="${Math.max(1.6, r * 0.022).toFixed(1)}"
       opacity=".55">${lines.join('')}</g>
    <circle cx="${cx}" cy="${cy}" r="${(r * hub * 1.4).toFixed(1)}" fill="#6f7884"/>
  </g>`;
}

/** Both wheels of a two-wheeler. The frame is each model's own business. */
function twoWheels(fx, rx, cy, r, opts = {}) {
  return `${spoked(fx, cy, r, opts)}${spoked(rx, cy, r, opts)}`;
}

// ---------------------------------------------------------------------------
// The drawings.
//
// `box` native bounding box [x, y, w, h]
// `ppi` the px/in it was drawn at, so it can be sized against anything
// `body` SVG in that space
// ---------------------------------------------------------------------------

const P = 3;   // road vehicles: 3 px per inch
const B = 6;   // two-wheelers and people: 6 px per inch
const D = 10;  // drones: 10 px per inch

export const VEHICLE_DETAIL = {

  // --- On foot --------------------------------------------------------------
  // A 70" adult at 6 px/in is 420 tall and about 100 wide, and a 2:1 field
  // renders that at a sixth of its width — the first pass was two grey sticks
  // nobody could read. What fixes it is not a bigger person: it is giving the
  // courier the thing that makes them a courier. A sack barrow with two crates
  // on it fills the frame, says "on foot, carrying weight" at twenty pixels,
  // and happens to be exactly how this job is actually done.
  runner: {
    box: [-10, -10, 372, 442],
    ppi: B,
    body: `
      <!-- the barrow: wheels, toe plate, uprights -->
      ${spoked(64, 386, 30, { tyre: 0.42, spokes: 5, hub: 0.3 })}
      <path d="M26 352 h112 v20 h-112 z" fill="#5a636e"/>
      <g stroke="#6e7883" stroke-width="13" stroke-linecap="round">
        <path d="M46 356 V128"/><path d="M130 356 V128"/>
        <path d="M46 128 h84"/>
      </g>
      <!-- what is on it -->
      <path d="M34 232 h108 v116 h-108 z" fill="#b08a54"/>
      <path d="M34 232 h108 v10 h-108 z" fill="#fff" opacity=".18"/>
      <path d="M82 232 h12 v116 h-12 z" fill="#8a6a3e"/>
      <path d="M42 146 h92 v82 h-92 z" fill="#c09864"/>
      <path d="M42 146 h92 v8 h-92 z" fill="#fff" opacity=".18"/>
      <path d="M82 146 h12 v82 h-12 z" fill="#96754a"/>
      <!-- the person, leaning into it -->
      <g fill="#46515e">
        <path d="M212 118 h44 c16 0 25 9 27 25 l14 78 c2 12 -4 20 -14 21
                 s-17 -5 -19 -16 l-9 -46 v52 h-46 v-52 l-9 46
                 c-2 11 -9 17 -19 16 s-16 -9 -14 -21 l14 -78 c2 -16 11 -25 27 -25 z"/>
        <path d="M204 230 h20 l-6 92 l10 90 c1 12 -5 19 -15 19 s-17 -7 -17 -19
                 l-2 -94 z"/>
        <path d="M232 230 h21 l22 88 l16 84 c2 12 -3 19 -13 20 s-18 -6 -20 -18
                 l-22 -86 z"/>
      </g>
      <circle cx="234" cy="82" r="31" fill="#5b6472"/>
      <path d="M206 74 c6 -15 20 -23 38 -21 c14 2 21 10 21 19 z" fill="#2a3139"/>
      <!-- arms out to the handles, which is what ties the two halves together -->
      <path d="M212 138 L132 124" stroke="#46515e" stroke-width="20" stroke-linecap="round"/>
    `,
  },

  // The jogger takes no barrow — a rucksack, a wide stride, and that is the
  // whole vehicle. Cheaper, quicker, and it carries almost nothing.
  jogger: {
    box: [-10, -10, 330, 442],
    ppi: B,
    body: `
      <g fill="#4e5966">
        <!-- back leg, driving; front leg, reaching -->
        <path d="M150 236 h24 l30 78 l44 68 c7 11 4 20 -5 25 s-19 2 -26 -8
                 l-52 -76 z"/>
        <path d="M126 236 h24 l-10 84 l-54 62 c-8 9 -18 10 -26 3 s-8 -17 0 -26
                 l46 -58 z"/>
        <!-- torso, leaning forward into the run -->
        <path d="M118 106 h50 c17 0 27 9 29 26 l16 76 c2 12 -4 20 -14 21
                 s-17 -5 -19 -16 l-10 -44 v70 h-52 v-70 l-10 44
                 c-2 11 -9 17 -19 16 s-16 -9 -14 -21 l16 -76 c2 -17 11 -26 27 -26 z"/>
        <!-- arms, one forward one back, which is most of what says "running" -->
        <path d="M112 124 L54 168" stroke="#4e5966" stroke-width="21" stroke-linecap="round"/>
        <path d="M180 126 L246 106" stroke="#4e5966" stroke-width="21" stroke-linecap="round"/>
      </g>
      <!-- the rucksack: the entire payload -->
      <path d="M166 122 h52 c13 0 20 7 20 20 v56 c0 13 -7 20 -20 20 h-52 z"
            fill="#7a5f3e"/>
      <path d="M166 122 h52 c13 0 20 7 20 20 v6 h-72 z" fill="#9b7a50"/>
      <path d="M186 148 h34 v26 h-34 z" fill="#5e4930"/>
      <circle cx="143" cy="70" r="30" fill="#5b6472"/>
      <path d="M116 62 c6 -14 19 -22 36 -20 c14 2 20 10 20 18 z" fill="#2d343c"/>
    `,
  },

  // --- Bicycle --------------------------------------------------------------
  // 68" long on a 40" wheelbase, 27" wheels, at 6 px/in. A diamond frame is
  // five tubes and it has to be five tubes — drawn as a blob it reads as a
  // scooter with the fairing missing.
  bike: {
    box: [-12, -12, 432, 276],
    ppi: B,
    body: `
      ${twoWheels(80, 320, 172, 81, { tyre: 0.09, spokes: 16, hub: 0.09 })}
      <g stroke="#7b8592" stroke-width="11" fill="none" stroke-linecap="round">
        <!-- seat tube, down tube, top tube: the diamond -->
        <path d="M232 172 V92"/>
        <path d="M232 172 L154 92"/>
        <path d="M154 92 L232 92"/>
        <!-- chain stay and seat stay to the rear hub -->
        <path d="M232 172 L320 172"/>
        <path d="M232 92 L320 172"/>
        <!-- forks -->
        <path d="M154 92 L80 172"/>
      </g>
      <!-- bars and saddle -->
      <path d="M118 78 h58 v13 h-58 z" fill="#4e5763"/>
      <path d="M212 78 h46 c6 0 9 4 9 9 s-3 8 -9 8 h-46 z" fill="#3a424d"/>
      <!-- chainring and cranks -->
      <circle cx="232" cy="172" r="26" fill="none" stroke="#8d97a4" stroke-width="5"/>
      <circle cx="232" cy="172" r="9" fill="#8d97a4"/>
      <path d="M232 172 l0 34" stroke="#6a7280" stroke-width="8" stroke-linecap="round"/>
    `,
  },

  // Same frame, with the two things that make it an e-bike: a battery on the
  // down tube and a hub motor in the back wheel. Nothing else changes, which
  // is exactly true of the real conversion.
  ebike: {
    box: [-12, -12, 440, 282],
    ppi: B,
    body: `
      ${twoWheels(80, 322, 176, 82, { tyre: 0.1, spokes: 16, hub: 0.09 })}
      <circle cx="322" cy="176" r="26" fill="#4b5560"/>
      <circle cx="322" cy="176" r="26" fill="#fff" opacity=".08"/>
      <g stroke="#7b8592" stroke-width="12" fill="none" stroke-linecap="round">
        <path d="M234 176 V94"/>
        <path d="M234 176 L156 94"/>
        <path d="M156 94 L234 94"/>
        <path d="M234 176 L322 176"/>
        <path d="M234 94 L322 176"/>
        <path d="M156 94 L80 176"/>
      </g>
      <!-- the battery, clamped along the down tube -->
      <path d="M170 106 L232 156 l-16 20 l-62 -50 z" fill="#2f3640"/>
      <path d="M176 112 L226 152" stroke="#7fd4a0" stroke-width="5" opacity=".8"/>
      <path d="M118 80 h58 v13 h-58 z" fill="#4e5763"/>
      <path d="M214 80 h46 c6 0 9 4 9 9 s-3 8 -9 8 h-46 z" fill="#3a424d"/>
      <circle cx="234" cy="176" r="9" fill="#8d97a4"/>
    `,
  },

  // --- Scooter --------------------------------------------------------------
  // 76" long, 46" tall, 16" wheels, at 6 px/in. A scooter is a step-through:
  // the whole silhouette is the leg shield at the front, the low floor, and
  // the body under the seat. Small wheels are the giveaway.
  scooter: {
    box: [-10, -10, 476, 300],
    ppi: B,
    body: `
      ${twoWheels(78, 372, 228, 50, { tyre: 0.32, spokes: 5, hub: 0.22 })}
      <!-- the body under the seat, sat over the back wheel -->
      <path d="M244 142 h104 c30 0 46 16 48 44 l4 38 c2 22 -10 34 -32 34 h-124
               c-20 0 -30 -10 -30 -30 v-56 c0 -20 10 -30 30 -30 z"
            fill="url(#pvRed)"/>
      <!-- the floor pan: the flat bit you put your feet on, and the single
           thing that separates a scooter from a motorcycle -->
      <path d="M126 224 h130 v26 h-130 z" fill="#3a4048"/>
      <path d="M126 224 h130 v6 h-130 z" fill="#fff" opacity=".1"/>
      <!-- leg shield, standing up in front of the floor -->
      <path d="M96 120 c26 -8 44 2 52 30 l26 74 h-54 l-30 -70
               c-8 -20 -4 -32 6 -34 z" fill="url(#pvRed)"/>
      <path d="M96 120 c26 -8 44 2 52 30 l6 18 l-52 8 z" fill="#fff" opacity=".14"/>
      <!-- front mudguard, which hangs off the fork and not off the shield -->
      <path d="M40 180 c18 -16 50 -18 70 -4 l-10 18 c-16 -10 -38 -8 -52 4 z"
            fill="url(#pvRed)"/>
      <path d="M118 126 L74 196" stroke="#8d97a4" stroke-width="13" stroke-linecap="round"/>
      <!-- seat, bars, mirror -->
      <path d="M236 128 h128 c14 0 20 6 20 16 s-6 14 -20 14 h-128 z" fill="#23272d"/>
      <path d="M236 128 h128 c12 0 18 4 20 12 l-148 2 z" fill="#fff" opacity=".07"/>
      <path d="M104 92 h84 v15 h-84 z" fill="#4e5763"/>
      <path d="M156 92 l16 -24 h11 l-8 24 z" fill="#8d97a4"/>
      ${lamp(84, 112, 34, 26, { r: 11 })}
      ${lamp(388, 176, 14, 18, { tail: true })}
    `,
  },

  // --- Motorcycle -----------------------------------------------------------
  // 85" long, 25" wheels, at 6 px/in. What separates it from the scooter is
  // that the ENGINE is the middle of the vehicle — big wheels, a tank you sit
  // behind, and no bodywork between your knees.
  motorcycle: {
    box: [-10, -10, 530, 300],
    ppi: B,
    body: `
      ${twoWheels(86, 434, 198, 78, { tyre: 0.28, spokes: 6, hub: 0.18 })}
      <!-- swingarm and exhaust go down first, so the engine sits over them -->
      <path d="M286 206 L434 198" stroke="#5a636e" stroke-width="18" stroke-linecap="round"/>
      <path d="M262 212 h196 c11 0 16 5 16 13 s-5 13 -16 13 h-196
               c-11 0 -16 -5 -16 -13 s5 -13 16 -13 z" fill="url(#pvChrome)"/>
      <!-- the engine: the middle of a motorcycle IS the engine, and the fins
           are the whole reason it reads as one rather than as a scooter -->
      <path d="M204 152 h110 c18 0 28 10 28 28 v34 c0 18 -10 28 -28 28 h-110
               c-18 0 -28 -10 -28 -28 v-34 c0 -18 10 -28 28 -28 z" fill="#5e6772"/>
      <g stroke="#3a4149" stroke-width="6" stroke-linecap="round">
        <path d="M188 166 h140"/><path d="M188 182 h140"/>
        <path d="M188 198 h140"/><path d="M188 214 h140"/>
      </g>
      <!-- tank, in paint, with the light along the top of it -->
      <path d="M204 108 c14 -12 36 -16 62 -16 h52 c26 0 38 12 38 34 v26 h-166
               c-4 -20 0 -34 14 -44 z" fill="url(#pvBlue)"/>
      <path d="M204 108 c14 -12 36 -16 62 -16 h52 c22 0 34 9 37 26
               l-158 8 z" fill="#fff" opacity=".16"/>
      <!-- seat and tail unit -->
      <path d="M346 116 h74 c16 0 24 8 24 22 l-4 24 h-96 z" fill="#1c2026"/>
      <path d="M418 108 h48 c14 0 20 8 18 22 l-6 32 h-52 z" fill="url(#pvBlue)"/>
      <!-- frame: headstock down to the swingarm pivot, seen between the tubes -->
      <path d="M186 112 L300 196" stroke="#78828e" stroke-width="12" stroke-linecap="round"/>
      <!-- forks, raked the way a standard is raked -->
      <path d="M180 108 L86 198" stroke="#9aa4b0" stroke-width="15" stroke-linecap="round"/>
      <path d="M40 158 c20 -16 56 -18 78 -4 l-11 20 c-17 -11 -41 -9 -58 4 z"
            fill="url(#pvBlue)"/>
      <path d="M124 86 h92 v15 h-92 z" fill="#4e5763"/>
      <path d="M188 86 l16 -24 h11 l-8 24 z" fill="#8d97a4"/>
      ${lamp(102, 104, 44, 34, { r: 16 })}
      ${lamp(470, 130, 16, 20, { tail: true })}
    `,
  },

  // --- Hatchback ------------------------------------------------------------
  // VW Golf: 168" long, 57" tall, 104" wheelbase, 25" wheels, at 3 px/in.
  // The defining fact about a hatchback is that the roof runs all the way back
  // to the rear axle and then drops in one line — there is no boot.
  hatchback: {
    box: [-6, -6, 516, 183],
    ppi: P,
    body: (() => {
      const r = road({
        len: 504, h: 171, sill: 150, wheelR: 37, fwx: 108, rwx: 420,
        noseY: 96, bonnetY: 84, screenX: 150, roofFront: 210, roofY: 24,
        roofRear: 396, backX: 470, tailY: 66,
        fill: 'url(#pvBlue)', rimFrac: 0.62,
      });
      return `${r.svg}
        ${pane('M158 84 L216 32 L288 32 L288 84 Z')}
        ${pane('M300 32 L378 32 L390 84 L300 84 Z')}
        ${shut(294, 34, 148)}
        ${shut(392, 40, 148)}
        ${lamp(6, 88, 34, 16, { r: 6 })}
        ${lamp(462, 74, 22, 24, { tail: true })}
        <path d="M288 88 h16 v7 h-16 z" fill="#c3cbd4" opacity=".7"/>
        <path d="M146 78 l-6 -12 h22 l-4 12 z" fill="#3d444d"/>`;
    })(),
  },

  // --- Saloon ---------------------------------------------------------------
  // Toyota Camry: 193" long, 57" tall, 111" wheelbase, 26" wheels, at 3 px/in.
  // A boot is the entire difference from the hatchback above, and it is 25"
  // of it — the roof stops well short of the rear axle and a deck runs back.
  sedan: {
    box: [-6, -6, 591, 183],
    ppi: P,
    body: (() => {
      const r = road({
        len: 579, h: 171, sill: 150, wheelR: 39, fwx: 126, rwx: 459,
        noseY: 99, bonnetY: 84, screenX: 174, roofFront: 246, roofY: 24,
        roofRear: 396, backX: 474, tailY: 72,
        fill: 'url(#pvSilver)', rimFrac: 0.6,
      });
      return `${r.svg}
        ${pane('M182 84 L252 32 L318 32 L318 84 Z')}
        ${pane('M330 32 L390 32 L414 84 L330 84 Z')}
        ${shut(324, 34, 148)}
        ${shut(418, 46, 148)}
        <path d="M474 78 h99 v8 h-99 z" fill="#000" opacity=".18"/>
        <path d="M150 140 h330 v8 h-330 z" fill="#000" opacity=".2"/>
        ${lamp(6, 92, 38, 16, { r: 6 })}
        ${lamp(542, 80, 26, 22, { tail: true })}
        <path d="M318 88 h18 v7 h-18 z" fill="#c3cbd4" opacity=".7"/>
        <path d="M170 78 l-6 -12 h24 l-5 12 z" fill="#3d444d"/>`;
    })(),
  },

  // --- Taxi -----------------------------------------------------------------
  // Crown Victoria: 212" long, 58" tall, 115" wheelbase, at 3 px/in. Same
  // three-box shape as the saloon and deliberately so — what makes a cab a cab
  // is the roof sign, the livery band and the door shield, not the body.
  cab: {
    box: [-6, -24, 648, 201],
    ppi: P,
    body: (() => {
      const r = road({
        len: 636, h: 174, sill: 153, wheelR: 40, fwx: 138, rwx: 483,
        noseY: 102, bonnetY: 86, screenX: 192, roofFront: 264, roofY: 26,
        roofRear: 432, backX: 516, tailY: 74,
        fill: 'url(#pvYellow)', rimFrac: 0.56,
      });
      return `${r.svg}
        ${pane('M200 86 L270 34 L342 34 L342 86 Z')}
        ${pane('M354 34 L426 34 L450 86 L354 86 Z')}
        ${shut(348, 36, 151)}
        ${shut(454, 48, 151)}
        <!-- the livery: a chequer band along the sill -->
        <path d="M150 126 h336 v20 h-336 z" fill="#1c1f24"/>
        <g fill="#eef1f4">
          <rect x="150" y="126" width="24" height="10"/><rect x="198" y="126" width="24" height="10"/>
          <rect x="246" y="126" width="24" height="10"/><rect x="294" y="126" width="24" height="10"/>
          <rect x="342" y="126" width="24" height="10"/><rect x="390" y="126" width="24" height="10"/>
          <rect x="438" y="126" width="24" height="10"/>
          <rect x="174" y="136" width="24" height="10"/><rect x="222" y="136" width="24" height="10"/>
          <rect x="270" y="136" width="24" height="10"/><rect x="318" y="136" width="24" height="10"/>
          <rect x="366" y="136" width="24" height="10"/><rect x="414" y="136" width="24" height="10"/>
          <rect x="462" y="136" width="24" height="10"/>
        </g>
        <!-- roof sign -->
        <path d="M300 4 h96 c8 0 12 4 12 12 v10 h-120 v-10 c0 -8 4 -12 12 -12 z"
              fill="#f0c33c"/>
        <path d="M312 12 h72 v10 h-72 z" fill="#2a2e34"/>
        ${lamp(6, 94, 40, 16, { r: 6 })}
        ${lamp(598, 82, 26, 22, { tail: true })}`;
    })(),
  },

  // --- Luxury saloon --------------------------------------------------------
  // S-Class: 208" long, 59" tall, 125" wheelbase, 28" wheels, at 3 px/in. The
  // proportion is the product: a very long wheelbase, short overhangs, and a
  // rear door as big as the front one. Black, chrome, and nothing else.
  luxury: {
    box: [-6, -6, 636, 189],
    ppi: P,
    body: (() => {
      const r = road({
        len: 624, h: 177, sill: 156, wheelR: 42, fwx: 132, rwx: 507,
        noseY: 100, bonnetY: 82, screenX: 204, roofFront: 276, roofY: 24,
        roofRear: 438, backX: 522, tailY: 74,
        fill: 'url(#pvBlack)', rimFrac: 0.66,
      });
      return `${r.svg}
        ${pane('M212 82 L282 30 L354 30 L354 82 Z')}
        ${pane('M366 30 L438 30 L462 82 L366 82 Z')}
        ${shut(360, 32, 154)}
        ${shut(466, 46, 154)}
        <!-- chrome: the window surround and a rocker strip -->
        <g fill="url(#pvChrome)" opacity=".85">
          <path d="M206 84 h258 v5 h-258 z"/>
          <path d="M150 144 h330 v7 h-330 z"/>
        </g>
        ${lamp(6, 90, 44, 14, { r: 5 })}
        ${lamp(588, 80, 28, 20, { tail: true })}
        <path d="M354 86 h20 v7 h-20 z" fill="#c3cbd4" opacity=".8"/>`;
    })(),
  },

  // --- Sports car -----------------------------------------------------------
  // 911: 178" long, 51" tall, 97" wheelbase, 26" wheels on very short
  // sidewalls, at 3 px/in. Low, and the roof line runs unbroken from the
  // windscreen to the tail — that single curve is the whole car.
  sportscar: {
    box: [-6, -6, 546, 165],
    ppi: P,
    body: (() => {
      const r = road({
        len: 534, h: 153, sill: 141, wheelR: 39, fwx: 114, rwx: 405,
        noseY: 90, bonnetY: 80, screenX: 150, roofFront: 234, roofY: 24,
        roofRear: 300, backX: 468, tailY: 58,
        fill: 'url(#pvRed)', rimFrac: 0.74,
      });
      return `${r.svg}
        ${pane('M160 80 L240 32 L294 32 L318 80 Z')}
        ${shut(330, 48, 139)}
        <!-- the tail: an engine deck and a ducktail, which is where the
             silhouette actually differs from a coupe -->
        <path d="M330 62 L468 58 L468 68 L330 72 z" fill="#000" opacity=".2"/>
        <path d="M456 52 h72 c6 0 8 4 8 9 h-88 c0 -5 2 -9 8 -9 z" fill="#8d2822"/>
        ${lamp(8, 84, 36, 12, { r: 6 })}
        ${lamp(494, 66, 30, 12, { tail: true })}
        <g stroke="#000" opacity=".22" stroke-width="3">
          <path d="M366 74 h70"/><path d="M366 84 h70"/>
        </g>`;
    })(),
  },

  // --- SUV ------------------------------------------------------------------
  // Ford Explorer: 199" long, 70" tall, 113" wheelbase, 30" wheels, at 3 px/in.
  // Thirteen inches taller than the saloon on a shorter body — that ratio is
  // the entire point and it is why a shared silhouette never worked.
  suv: {
    box: [-6, -6, 609, 216],
    ppi: P,
    body: (() => {
      const r = road({
        len: 597, h: 210, sill: 183, wheelR: 45, fwx: 132, rwx: 471,
        noseY: 126, bonnetY: 108, screenX: 174, roofFront: 234, roofY: 24,
        roofRear: 528, backX: 570, tailY: 34,
        fill: 'url(#pvGrey)', rimFrac: 0.56,
      });
      return `${r.svg}
        ${pane('M184 108 L240 34 L306 34 L306 108 Z')}
        ${pane('M318 34 L396 34 L396 108 L318 108 Z')}
        ${pane('M408 34 L498 34 L510 108 L408 108 Z')}
        ${shut(312, 36, 181)}
        ${shut(402, 36, 181)}
        ${shut(516, 36, 181)}
        <!-- roof rails and cladding: what an SUV has that a car doesn't -->
        <path d="M244 18 h280 v8 h-280 z" fill="#2f353d"/>
        <path d="M60 166 h480 v16 h-480 z" fill="#2c3138" opacity=".8"/>
        ${lamp(6, 116, 40, 18, { r: 6 })}
        ${lamp(566, 44, 26, 30, { tail: true })}`;
    })(),
  },

  // --- Minivan --------------------------------------------------------------
  // Toyota Sienna: 204" long, 69" tall, 119" wheelbase, at 3 px/in. A one-box
  // shape: the windscreen starts where the bonnet stops and the roof runs flat
  // to the very back. Enormous glass, which is what you see first.
  minivan: {
    box: [-6, -6, 624, 213],
    ppi: P,
    body: (() => {
      const r = road({
        len: 612, h: 207, sill: 183, wheelR: 42, fwx: 120, rwx: 477,
        noseY: 132, bonnetY: 114, screenX: 156, roofFront: 234, roofY: 22,
        roofRear: 540, backX: 594, tailY: 40,
        fill: 'url(#pvWhite)', rimFrac: 0.52,
      });
      return `${r.svg}
        ${pane('M166 114 L240 32 L306 32 L306 114 Z')}
        ${pane('M318 32 L414 32 L414 114 L318 114 Z')}
        ${pane('M426 32 L528 32 L540 114 L426 114 Z')}
        ${shut(312, 34, 181)}
        ${shut(420, 34, 181)}
        <!-- the sliding-door rail, which no other body has -->
        <path d="M318 110 h222 v9 h-222 z" fill="#000" opacity=".22"/>
        ${lamp(6, 122, 38, 18, { r: 6 })}
        ${lamp(586, 50, 24, 34, { tail: true })}`;
    })(),
  },

  // --- Van ------------------------------------------------------------------
  // Ford Transit LWB: 219" long, 83" tall, 130" wheelbase, at 3 px/in. Cab and
  // load box in one shell — the windscreen is nearly vertical and everything
  // behind the B-pillar is a blank panel, which is the whole silhouette.
  van: {
    box: [-6, -6, 669, 255],
    ppi: P,
    body: (() => {
      const r = road({
        len: 657, h: 249, sill: 219, wheelR: 42, fwx: 126, rwx: 516,
        noseY: 168, bonnetY: 150, screenX: 156, roofFront: 234, roofY: 22,
        roofRear: 636, backX: 651, tailY: 26,
        fill: 'url(#pvWhite)', rimFrac: 0.5,
      });
      return `${r.svg}
        ${pane('M166 150 L234 34 L300 34 L300 150 Z')}
        ${pane('M312 46 L372 46 L372 126 L312 126 Z')}
        ${shut(306, 36, 217)}
        <!-- the load body: one long blank flank with a rubbing strip -->
        <path d="M384 76 h246 v128 h-246 z" fill="#000" opacity=".05"/>
        <path d="M312 200 h324 v11 h-324 z" fill="#000" opacity=".2"/>
        ${lamp(6, 156, 38, 18, { r: 6 })}
        ${lamp(628, 36, 20, 40, { tail: true })}
        <path d="M300 130 h16 v8 h-16 z" fill="#c3cbd4" opacity=".7"/>`;
    })(),
  },

  // --- Chiller van ----------------------------------------------------------
  // The same Transit with a refrigeration unit on the nose of the roof, which
  // is the one thing that says "this is the cold one" at thumbnail size, and
  // a foot of extra height because of it.
  chiller: {
    box: [-6, -6, 669, 288],
    ppi: P,
    body: (() => {
      const r = road({
        len: 657, h: 282, sill: 252, wheelR: 42, fwx: 126, rwx: 516,
        noseY: 202, bonnetY: 184, screenX: 156, roofFront: 234, roofY: 56,
        roofRear: 636, backX: 651, tailY: 60,
        fill: 'url(#pvWhite)', rimFrac: 0.5,
      });
      return `${r.svg}
        ${pane('M166 184 L234 68 L300 68 L300 184 Z')}
        ${pane('M312 80 L372 80 L372 160 L312 160 Z')}
        ${shut(306, 70, 250)}
        <!-- the fridge pack, sat on the front of the roof -->
        <path d="M252 6 h204 c14 0 22 8 22 22 v28 h-248 v-28 c0 -14 8 -22 22 -22 z"
              fill="#5d6772"/>
        <path d="M252 6 h204 c14 0 22 8 22 22 v4 h-248 v-4 c0 -14 8 -22 22 -22 z"
              fill="#fff" opacity=".14"/>
        <g fill="#2b3037">
          <rect x="278" y="20" width="14" height="30"/><rect x="302" y="20" width="14" height="30"/>
          <rect x="326" y="20" width="14" height="30"/><rect x="350" y="20" width="14" height="30"/>
          <rect x="374" y="20" width="14" height="30"/><rect x="398" y="20" width="14" height="30"/>
          <rect x="422" y="20" width="14" height="30"/>
        </g>
        <path d="M384 110 h246 v124 h-246 z" fill="#000" opacity=".05"/>
        <path d="M312 234 h324 v11 h-324 z" fill="#000" opacity=".2"/>
        <!-- a blue flash, because every fridge van in the world has one -->
        <path d="M396 116 h210 v26 h-210 z" fill="#4a6f9e" opacity=".75"/>
        ${lamp(6, 190, 38, 18, { r: 6 })}
        ${lamp(628, 70, 20, 40, { tail: true })}`;
    })(),
  },

  // --- Luton ----------------------------------------------------------------
  // 260" long, 130" tall, at 3 px/in. A Luton is a cab with a separate box
  // that OVERHANGS it — that overhang is the definition of the body type and
  // it is why this cannot be the same drawing as a van.
  luton: {
    box: [-6, -6, 792, 402],
    ppi: P,
    body: (() => {
      const b = boxed({
        len: 780, h: 390, sill: 282, wheelR: 45, fwx: 168, rwx: 606,
        noseY: 258, bonnetY: 228, screenX: 78, cabTop: 150, cabBack: 258,
        boxFront: 210, boxTop: 42, boxBack: 774,
        fill: 'url(#pvWhite)', rimFrac: 0.48, luton: 60,
      });
      return `${b.svg}
        ${pane('M92 222 L134 166 L134 222 Z')}
        ${pane('M144 168 h100 v54 h-100 z')}
        ${shut(140, 156, 282)}
        <path d="M64 176 h16 v52 h-16 z" fill="#3d444d"/>
        <path d="M210 42 h564 v18 h-564 z" fill="#000" opacity=".16"/>
        <path d="M210 262 h564 v14 h-564 z" fill="#000" opacity=".2"/>
        <!-- the shutter at the back, and the step under it -->
        <g stroke="#000" opacity=".16" stroke-width="4">
          <path d="M690 60 v226"/>
        </g>
        <path d="M684 288 h96 v22 h-96 z" fill="#4e555d"/>
        ${lamp(4, 250, 44, 22, { r: 7 })}
        ${lamp(752, 254, 22, 32, { tail: true })}`;
    })(),
  },

  // --- Pickup ---------------------------------------------------------------
  // Ford F-150: 232" long, 77" tall, 145" wheelbase, 32" wheels, at 3 px/in.
  // Cab in front, open bed behind, and a very visible gap between them. The
  // bed sides come up only to the shoulder line, which is what stops it
  // reading as a van.
  pickup: {
    box: [-6, -6, 708, 237],
    ppi: P,
    body: (() => {
      const r = road({
        len: 696, h: 231, sill: 201, wheelR: 48, fwx: 138, rwx: 561,
        noseY: 138, bonnetY: 120, screenX: 204, roofFront: 264, roofY: 30,
        roofRear: 420, backX: 432, tailY: 96,
        fill: 'url(#pvGreen)', rimFrac: 0.5,
      });
      return `${r.svg}
        ${pane('M214 120 L270 40 L330 40 L330 120 Z')}
        ${pane('M342 40 L402 40 L402 120 L342 120 Z')}
        ${shut(336, 42, 199)}
        <!-- the bed: a separate box behind the cab, open at the top -->
        <path d="M444 96 h246 v105 h-246 z" fill="url(#pvGreen)"/>
        <path d="M444 96 h246 v10 h-246 z" fill="#fff" opacity=".14"/>
        <path d="M432 96 h12 v105 h-12 z" fill="#000" opacity=".25"/>
        <path d="M444 168 h246 v10 h-246 z" fill="#000" opacity=".2"/>
        ${lamp(6, 128, 42, 20, { r: 7 })}
        ${lamp(668, 104, 24, 30, { tail: true })}`;
    })(),
  },

  // --- Flatbed --------------------------------------------------------------
  // 300" long, 108" tall over the cab, 34" wheels, at 3 px/in. A flat deck and
  // dropsides: there is no roof behind the cab at all, which makes it the most
  // distinctive shape in the whole fleet and the easiest to get wrong.
  flatbed: {
    box: [-6, -6, 912, 336],
    ppi: P,
    body: (() => {
      const b = boxed({
        len: 900, h: 324, sill: 210, wheelR: 51, fwx: 156, rwx: 720,
        noseY: 216, bonnetY: 186, screenX: 66, cabTop: 114, cabBack: 252,
        boxFront: 264, boxTop: 174, boxBack: 894,
        fill: 'url(#pvBlue)', rimFrac: 0.46,
      });
      return `${b.svg}
        ${pane('M84 172 L128 126 L128 172 Z')}
        ${pane('M138 128 h102 v44 h-102 z')}
        ${shut(134, 114, 210)}
        <path d="M58 138 h15 v44 h-15 z" fill="#3d444d"/>
        <!-- the deck itself, and the dropsides standing on it -->
        <path d="M258 174 h642 v22 h-642 z" fill="url(#pvSteelDeck)"/>
        <path d="M258 196 h642 v16 h-642 z" fill="#3a4048"/>
        <g fill="#7f8a96">
          <rect x="276" y="120" width="14" height="56"/>
          <rect x="420" y="120" width="14" height="56"/>
          <rect x="564" y="120" width="14" height="56"/>
          <rect x="708" y="120" width="14" height="56"/>
          <rect x="852" y="120" width="14" height="56"/>
        </g>
        <path d="M264 158 h630 v16 h-630 z" fill="#8d959e"/>
        ${lamp(4, 196, 44, 22, { r: 7 })}
        ${lamp(872, 180, 22, 24, { tail: true })}`;
    })(),
  },

  // --- Box truck ------------------------------------------------------------
  // A 26-footer: 312" long, 150" tall, 34" wheels, at 3 px/in. The box is
  // taller than the cab and set back behind it, which is the difference from
  // the Luton — and both are different from a van.
  boxtruck: {
    box: [-6, -6, 948, 462],
    ppi: P,
    body: (() => {
      const b = boxed({
        len: 936, h: 450, sill: 318, wheelR: 51, fwx: 168, rwx: 738,
        noseY: 300, bonnetY: 270, screenX: 72, cabTop: 156, cabBack: 276,
        boxFront: 288, boxTop: 30, boxBack: 930,
        fill: 'url(#pvPanel)', rimFrac: 0.46,
      });
      return `${b.svg}
        ${pane('M96 240 L146 172 L146 240 Z')}
        ${pane('M156 176 h104 v64 h-104 z')}
        ${shut(151, 156, 318)}
        <path d="M70 186 h17 v60 h-17 z" fill="#3d444d"/>
        <path d="M288 30 h642 v20 h-642 z" fill="#000" opacity=".14"/>
        <path d="M288 300 h642 v16 h-642 z" fill="#000" opacity=".2"/>
        <!-- roll shutter and the tail lift, which every one of these has -->
        <g stroke="#000" opacity=".14" stroke-width="4">
          <path d="M840 50 v278"/>
        </g>
        <path d="M900 316 h48 v18 h-48 z" fill="#5a636e"/>
        <path d="M828 330 h108 v20 h-108 z" fill="#4e555d"/>
        ${lamp(4, 292, 46, 24, { r: 8 })}
        ${lamp(906, 296, 22, 26, { tail: true })}`;
    })(),
  },

  // --- Semi -----------------------------------------------------------------
  // A sleeper tractor and a 53' trailer: 63 feet over the pair, 13'6" tall,
  // 41" wheels, at 3 px/in. The trailer nose sits OVER the tractor's back
  // axles — the fifth wheel is under it — so the two overlap rather than being
  // parked nose to tail, which is what the first pass drew.
  semi: {
    box: [-6, -6, 2292, 500],
    ppi: P,
    body: (() => {
      const ground = 486, wr = 61.5, wy = ground - wr;
      const tyres = [150, 560, 690, 1960, 2090]
        .map((x) => wheel(x, wy, wr, { rimFrac: 0.44, spokes: 6 })).join('');
      return `
        ${tyres}
        <!-- trailer: box, floor rail, legs, bogie frame -->
        <path d="M360 0 h1908 v342 h-1908 z" fill="url(#pvPanel)"/>
        <path d="M360 0 h1908 v342 h-1908 z" fill="url(#pvRibs)"/>
        <path d="M360 0 h1908 v26 h-1908 z" fill="#000" opacity=".14"/>
        <path d="M360 318 h1908 v24 h-1908 z" fill="#000" opacity=".22"/>
        <path d="M900 342 h30 v104 h-30 z" fill="#4e555d"/>
        <path d="M978 342 h30 v104 h-30 z" fill="#4e555d"/>
        <path d="M1890 342 h270 v34 h-270 z" fill="#3a4048"/>
        <!-- tractor: bonnet, sleeper cab, stack, tanks -->
        <path d="M6 366 L0 258 L96 246 L186 186 h150
                 c14 0 22 -10 22 -24 v-42 c0 -26 14 -40 40 -40 h140
                 c26 0 40 14 40 40 v246 z" fill="url(#pvRed)"/>
        <path d="M398 80 h140 c26 0 40 14 40 40 v10 h-220 v-10
                 c0 -26 14 -40 40 -40 z" fill="#fff" opacity=".14"/>
        ${pane('M366 176 L366 104 L470 104 L470 176 Z')}
        ${pane('M486 104 h90 v72 h-90 z')}
        ${shut(478, 92, 366)}
        <path d="M330 130 h22 v70 h-22 z" fill="#3d444d"/>
        <path d="M578 36 h30 v330 h-30 z" fill="url(#pvChrome)"/>
        <path d="M200 300 h150 c16 0 24 9 24 24 s-8 24 -24 24 h-150
                 c-16 0 -24 -9 -24 -24 s8 -24 24 -24 z" fill="url(#pvChrome)"/>
        <path d="M100 246 h100 v120 h-100 z" fill="url(#pvRed)"/>
        ${lamp(8, 284, 46, 30, { r: 9 })}
        ${lamp(2238, 286, 26, 34, { tail: true })}`;
    })(),
  },

  // --- Drone ----------------------------------------------------------------
  // A delivery quadcopter: 35" across the rotors, 12" deep, at 10 px/in. What
  // makes it read as a drone and not a plane is that the rotors are ABOVE the
  // booms and the payload hangs BELOW the hull — three layers, not one.
  drone: {
    box: [-12, -12, 374, 168],
    ppi: D,
    body: `
      <!-- booms -->
      <g stroke="#5a636e" stroke-width="11" stroke-linecap="round">
        <path d="M120 66 L36 44"/><path d="M230 66 L314 44"/>
        <path d="M124 78 L46 96"/><path d="M226 78 L304 96"/>
      </g>
      <!-- rotor discs, drawn as blur rather than as blades -->
      <g fill="#8d97a4" opacity=".28">
        <ellipse cx="36" cy="40" rx="42" ry="7"/><ellipse cx="314" cy="40" rx="42" ry="7"/>
        <ellipse cx="46" cy="92" rx="38" ry="6"/><ellipse cx="304" cy="92" rx="38" ry="6"/>
      </g>
      <g fill="#3d444d">
        <rect x="28" y="36" width="16" height="10" rx="4"/>
        <rect x="306" y="36" width="16" height="10" rx="4"/>
        <rect x="38" y="88" width="16" height="9" rx="4"/>
        <rect x="296" y="88" width="16" height="9" rx="4"/>
      </g>
      <!-- hull -->
      <path d="M126 50 h98 c16 0 24 8 24 24 v14 c0 16 -8 24 -24 24 h-98
               c-16 0 -24 -8 -24 -24 v-14 c0 -16 8 -24 24 -24 z" fill="url(#pvGrey)"/>
      <path d="M126 50 h98 c16 0 24 8 24 24 v2 h-146 v-2 c0 -16 8 -24 24 -24 z"
            fill="#fff" opacity=".14"/>
      <circle cx="140" cy="88" r="10" fill="#2b3037"/>
      <!-- the parcel, slung underneath -->
      <path d="M146 112 h64 v34 h-64 z" fill="#b08a54"/>
      <path d="M146 112 h64 v6 h-64 z" fill="#fff" opacity=".18"/>
      <path d="M174 112 h8 v34 h-8 z" fill="#8a6a3e"/>
    `,
  },

  // --- Heavy lift -----------------------------------------------------------
  // Six rotors, 62" across, 26" deep, at 10 px/in. Nearly twice the drone in
  // every direction, with landing legs it actually needs and a crate rather
  // than a parcel.
  heavylift: {
    box: [-14, -14, 660, 320],
    ppi: D,
    body: `
      <g stroke="#4e555d" stroke-width="16" stroke-linecap="round">
        <path d="M228 108 L74 66"/><path d="M404 108 L558 66"/>
        <path d="M222 128 L56 128"/><path d="M410 128 L576 128"/>
        <path d="M232 150 L86 190"/><path d="M400 150 L546 190"/>
      </g>
      <g fill="#8d97a4" opacity=".26">
        <ellipse cx="74" cy="60" rx="64" ry="10"/><ellipse cx="558" cy="60" rx="64" ry="10"/>
        <ellipse cx="56" cy="122" rx="64" ry="10"/><ellipse cx="576" cy="122" rx="64" ry="10"/>
        <ellipse cx="86" cy="184" rx="64" ry="10"/><ellipse cx="546" cy="184" rx="64" ry="10"/>
      </g>
      <g fill="#343a42">
        <rect x="62" y="54" width="24" height="14" rx="5"/><rect x="546" y="54" width="24" height="14" rx="5"/>
        <rect x="44" y="116" width="24" height="14" rx="5"/><rect x="564" y="116" width="24" height="14" rx="5"/>
        <rect x="74" y="178" width="24" height="14" rx="5"/><rect x="534" y="178" width="24" height="14" rx="5"/>
      </g>
      <path d="M232 84 h168 c26 0 40 14 40 40 v26 c0 26 -14 40 -40 40 h-168
               c-26 0 -40 -14 -40 -40 v-26 c0 -26 14 -40 40 -40 z" fill="url(#pvGrey)"/>
      <path d="M232 84 h168 c26 0 40 14 40 40 v4 h-248 v-4 c0 -26 14 -40 40 -40 z"
            fill="#fff" opacity=".14"/>
      <circle cx="252" cy="148" r="16" fill="#2b3037"/>
      <!-- legs, because something this size cannot land on its parcel -->
      <g stroke="#4e555d" stroke-width="13" stroke-linecap="round" fill="none">
        <path d="M244 190 L216 260"/><path d="M388 190 L416 260"/>
        <path d="M200 262 h232"/>
      </g>
      <path d="M254 198 h124 v58 h-124 z" fill="#b08a54"/>
      <path d="M254 198 h124 v10 h-124 z" fill="#fff" opacity=".18"/>
      <g stroke="#8a6a3e" stroke-width="9">
        <path d="M296 198 v58"/><path d="M338 198 v58"/>
      </g>
    `,
  },
};

export const VEHICLE_DETAIL_IDS = Object.keys(VEHICLE_DETAIL);
