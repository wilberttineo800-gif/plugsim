// Detailed firearm artwork.
//
// The original `GUN_MODELS[id].path` in art.js is one flat path filled with
// `currentColor` — a silhouette. It reads as a toy: no materials, no depth, and
// every gun the same colour. This module holds the replacement.
//
// Two things make these look like the real thing rather than assembled blocks:
//
//   1. **Real proportions.** Each drawing is laid out at a stated pixels-per-inch
//      against the actual gun's published dimensions, so the barrel-to-receiver
//      -to-stock relationship is the one the real firearm has. Getting this wrong
//      is what made the first attempts read as submachine guns.
//   2. **Materials.** Steel, blued steel, polymer and wood are separate
//      gradients, and wood carries a grain pattern. A part drawn in the same
//      fill as the part behind it disappears, so shading is done with real
//      tonal difference, never a same-colour shape laid over another.
//
// Each entry declares its own native drawing space and its own mount points in
// that space; `fitDetail` maps both into the 64x32 field the rest of the UI
// uses, so attachments land on the gun rather than floating beside it.

/** The field every other piece of gun art is authored in. */
export const FIELD_W = 64;
export const FIELD_H = 32;

/**
 * Shared paint. Emitted once per SVG — the ids are referenced by every drawing
 * below, so a change here restyles the whole catalogue.
 */
export const DETAIL_DEFS = `
  <linearGradient id="pgSteel" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9fa9b6"/><stop offset=".35" stop-color="#7c8794"/>
    <stop offset=".72" stop-color="#5d6672"/><stop offset="1" stop-color="#474e58"/>
  </linearGradient>
  <linearGradient id="pgSteelDark" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6d7684"/><stop offset=".5" stop-color="#4d545e"/>
    <stop offset="1" stop-color="#343a42"/>
  </linearGradient>
  <linearGradient id="pgBlued" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a515b"/><stop offset=".28" stop-color="#343a43"/>
    <stop offset=".75" stop-color="#23272d"/><stop offset="1" stop-color="#181b20"/>
  </linearGradient>
  <linearGradient id="pgPoly" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#41474f"/><stop offset=".3" stop-color="#2f343b"/>
    <stop offset=".8" stop-color="#22262b"/><stop offset="1" stop-color="#191c21"/>
  </linearGradient>
  <linearGradient id="pgPolyLt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5b636e"/><stop offset=".3" stop-color="#454c56"/>
    <stop offset=".8" stop-color="#333941"/><stop offset="1" stop-color="#282d34"/>
  </linearGradient>
  <linearGradient id="pgWood" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#a9713a"/><stop offset=".3" stop-color="#8d5a2c"/>
    <stop offset=".75" stop-color="#6f4522"/><stop offset="1" stop-color="#57351a"/>
  </linearGradient>
  <linearGradient id="pgWoodTop" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b87c42"/><stop offset=".6" stop-color="#8d5a2c"/>
    <stop offset="1" stop-color="#65401f"/>
  </linearGradient>
  <linearGradient id="pgWalnut" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#7d4b2a"/><stop offset=".4" stop-color="#5e371e"/>
    <stop offset="1" stop-color="#3d2313"/>
  </linearGradient>
  <linearGradient id="pgMag" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#5a626d"/><stop offset=".45" stop-color="#434a54"/>
    <stop offset="1" stop-color="#2f343b"/>
  </linearGradient>
  <pattern id="pgGrain" width="52" height="12" patternUnits="userSpaceOnUse">
    <path d="M0 2.4 C12 1 26 3.8 52 2.2 M0 6.4 C16 8 30 5 52 6.8
             M0 10 C14 8.8 32 11.4 52 9.6"
          fill="none" stroke="#3f2510" stroke-width="1" opacity=".5"/>
    <path d="M0 4.4 C20 5.6 34 3.2 52 4.6"
          fill="none" stroke="#d6a165" stroke-width=".8" opacity=".3"/>
  </pattern>
  <pattern id="pgStipple" width="7" height="7" patternUnits="userSpaceOnUse">
    <circle cx="1.6" cy="1.6" r="1" fill="#0d0f12" opacity=".55"/>
    <circle cx="5.2" cy="4.8" r="1" fill="#0d0f12" opacity=".55"/>
  </pattern>
`;

/**
 * Fit a drawing's native box into the 64x32 field, preserving aspect and
 * centring what's left over. A rifle is about 3.7:1 and a pistol about 1.5:1,
 * so one of the two axes always has slack; squashing to fill both is what makes
 * game art look wrong.
 */
export function fitDetail(box) {
  const [x, y, w, h] = box;
  const scale = Math.min(FIELD_W / w, FIELD_H / h);
  return {
    scale,
    tx: (FIELD_W - w * scale) / 2 - x * scale,
    ty: (FIELD_H - h * scale) / 2 - y * scale,
  };
}

/** A native mount point, in the 64x32 field. */
export function mountInField(detail, name) {
  const p = detail.mounts && detail.mounts[name];
  if (!p) return null;
  const { scale, tx, ty } = fitDetail(detail.box);
  return [p[0] * scale + tx, p[1] * scale + ty];
}

/** The transform that puts a drawing's native space into the field. */
export function detailTransform(detail) {
  const { scale, tx, ty } = fitDetail(detail.box);
  return `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})`;
}

// ---------------------------------------------------------------------------
// The drawings.
//
// `box`    the native rectangle that should fill the field, [x, y, w, h]
// `mounts` rail / muzzle / under / mag, in the same native space
// `body`   SVG, authored in that space
// ---------------------------------------------------------------------------

export const GUN_DETAIL = {

  // --- Longmarch 47 ---------------------------------------------------------
  // AK-47: 34.3" overall on a 16.3" barrel, at 14 px/in.
  longmarch: {
    box: [0, 22, 478, 134],
    mounts: { rail: [252, 38], muzzle: [6, 59], under: [152, 86], mag: [242, 82] },
    body: `
      <rect x="30" y="70" width="152" height="3.5" rx="1.6" fill="#5a626d"/>
      <path d="M8 50 h22 v18 h-22 a3 3 0 0 1 -3 -3 v-12 a3 3 0 0 1 3 -3 z" fill="url(#pgSteel)"/>
      <path d="M8 50 h6 v18 h-6 z" fill="#3d434b" opacity=".55"/>
      <rect x="30" y="54.5" width="66" height="9" fill="url(#pgSteel)"/>
      <rect x="30" y="54.5" width="66" height="2.2" fill="#b3bcc7" opacity=".55"/>
      <path d="M36 44 h20 v26 h-20 z" fill="url(#pgSteel)"/>
      <path d="M39 44 c0 -10 2 -14 3 -14 h8 c1 0 3 4 3 14 z" fill="url(#pgSteelDark)"/>
      <rect x="44" y="26" width="4" height="12" rx="1.6" fill="#6d7684"/>
      <path d="M39 30 h3 v10 h-3 z M50 30 h3 v10 h-3 z" fill="#5a626d"/>
      <rect x="36" y="44" width="20" height="2.4" fill="#b3bcc7" opacity=".4"/>
      <path d="M96 40 h20 v32 h-20 z" fill="url(#pgSteel)"/>
      <path d="M104 28 h9 v12 h-9 z" fill="url(#pgSteelDark)"/>
      <rect x="96" y="40" width="20" height="2.4" fill="#b3bcc7" opacity=".45"/>
      <rect x="116" y="41" width="76" height="10" fill="url(#pgSteel)"/>
      <rect x="116" y="41" width="76" height="2.2" fill="#b3bcc7" opacity=".5"/>
      <rect x="116" y="55" width="82" height="8" fill="url(#pgSteel)"/>
      <path d="M120 34 h58 c3 0 5 2 5 5 v4 h-68 v-4 c0 -3 2 -5 5 -5 z" fill="url(#pgWoodTop)"/>
      <path d="M120 34 h58 c3 0 5 2 5 5 v4 h-68 v-4 c0 -3 2 -5 5 -5 z" fill="url(#pgGrain)"/>
      <path d="M120 34 h58 c3 0 5 2 5 5 h-68 c0 -3 2 -5 5 -5 z" fill="#c0873f" opacity=".3"/>
      <path d="M116 64 c14 -2 46 -3 70 -1 c4 .3 6 2.4 6 6 c0 8 -2 13 -6 15
               c-22 3 -50 3 -66 1 c-4 -.6 -6 -3 -6 -8 v-8 c0 -3 1 -4.6 2 -5 z" fill="url(#pgWood)"/>
      <path d="M116 64 c14 -2 46 -3 70 -1 c4 .3 6 2.4 6 6 c0 8 -2 13 -6 15
               c-22 3 -50 3 -66 1 c-4 -.6 -6 -3 -6 -8 v-8 c0 -3 1 -4.6 2 -5 z" fill="url(#pgGrain)"/>
      <path d="M118 65 c14 -2 44 -3 68 -1 c3 .2 5 1.6 5.6 4 c-26 -2.6 -54 -2.4 -73.6 0 z"
            fill="#c0873f" opacity=".35"/>
      <g fill="#4a2d14" opacity=".45">
        <rect x="134" y="70" width="2.6" height="13" rx="1.3"/>
        <rect x="146" y="70" width="2.6" height="13" rx="1.3"/>
        <rect x="158" y="70" width="2.6" height="13" rx="1.3"/>
        <rect x="170" y="70" width="2.6" height="13" rx="1.3"/>
      </g>
      <path d="M186 42 h22 v14 h-22 z" fill="url(#pgSteelDark)"/>
      <path d="M190 36 h16 v6 h-16 z" fill="#6d7684"/>
      <rect x="186" y="42" width="22" height="2" fill="#9fa9b6" opacity=".45"/>
      <path d="M334 44 C368 47 414 52 456 58 c8 1.2 14 4 14 10.4 v33 c0 6 -5 8.4 -12 7
               C420 103 378 95 356 89 c-13 -3.4 -20 -9 -22 -19 z" fill="url(#pgWood)"/>
      <path d="M334 44 C368 47 414 52 456 58 c8 1.2 14 4 14 10.4 v33 c0 6 -5 8.4 -12 7
               C420 103 378 95 356 89 c-13 -3.4 -20 -9 -22 -19 z" fill="url(#pgGrain)"/>
      <path d="M334 44 C368 47 414 52 456 58 c5 .8 9 2.6 11 5.6 C420 57 368 51 336 49 z"
            fill="#c0873f" opacity=".38"/>
      <path d="M400 74 l30 3.6 c3 .4 5 2.4 5 5 c0 2.6 -2 4 -5 3.6 l-30 -4.2
               c-3 -.4 -4.6 -2 -4.6 -3.8 c0 -1.8 1.6 -4.4 4.6 -4.2 z" fill="#3a2412" opacity=".7"/>
      <path d="M454 57.8 c9 1.2 16 4 16 10.6 v33 c0 6 -5 8.4 -12 7 l-4 -.6 z" fill="url(#pgSteelDark)"/>
      <rect x="450" y="58" width="3" height="50" fill="#7c8794" opacity=".4"/>
      <path d="M196 46 h144 v36 h-132 c-8 0 -12 -4 -12 -12 z" fill="url(#pgSteel)"/>
      <path d="M196 38 h144 c2 0 3 1 3 3 v6 h-150 v-6 c0 -2 1 -3 3 -3 z" fill="url(#pgSteelDark)"/>
      <rect x="196" y="38" width="147" height="2.2" fill="#aab4c0" opacity=".5"/>
      <path d="M196 46 h18 v36 h-6 c-8 0 -12 -4 -12 -12 z" fill="#6d7684" opacity=".45"/>
      <path d="M256 57 h68 v9 h-68 z" fill="#5f6874" opacity=".5"/>
      <g fill="#3f454e" opacity=".7">
        <circle cx="204" cy="75" r="2.4"/><circle cx="240" cy="75" r="2.4"/>
        <circle cx="320" cy="54" r="2.4"/><circle cx="332" cy="75" r="2.4"/>
      </g>
      <path d="M272 48 h48 v6 h-48 z" fill="#5a626d"/>
      <path d="M314 42 h10 c3 0 5 2 5 5 v3 h-15 z" fill="#6d7684"/>
      <path d="M330 46 h14 v7 h-14 z" fill="#6d7684"/>
      <path d="M216 76 h56 v11 h-58 c-4 0 -6 -3 -4 -6 z" fill="url(#pgSteelDark)"/>
      <path d="M218 82 C212 104 204 122 196 138 C195 140.6 197 143 200 143.6
               l30 5 c3.2 .6 5.6 -1 6 -4 C240 122 252 104 266 82 z" fill="url(#pgMag)"/>
      <g fill="none" stroke="#232830" stroke-width="2" opacity=".4">
        <path d="M228 88 C222 108 213 124 205 138"/>
        <path d="M240 88 C234 108 225 125 217 140"/>
        <path d="M252 88 C246 109 237 126 229 141"/>
      </g>
      <path d="M218 82 C212 104 204 122 196 138 c-1.2 2.6 0 4.6 2.2 5.2
               C206 126 214 106 222 84 z" fill="#79828f" opacity=".38"/>
      <path d="M194 138 l40 6.6 l-1 5 c-.4 2 -2.2 3 -4.4 2.6 l-31 -5.2
               c-3.2 -.6 -4.2 -2 -3.2 -4.8 z" fill="#3a404a"/>
      <path d="M268 82 h44 v6 h-6 c-2 8.4 -6.4 12.6 -14.6 12.6
               c-8.2 0 -13.4 -4.2 -15.4 -12.6 h-8 z" fill="url(#pgSteelDark)"/>
      <path d="M288 84 c1 7.4 3.2 10.6 6.4 11.6 l-1 5.2 c-6.4 -2 -9.6 -7.4 -10.6 -16.8 z" fill="#5a626d"/>
      <path d="M294 82 h34 l9 40 c2.2 9.6 -3.6 16.4 -12.6 16.4
               c-8.2 0 -12.8 -3.6 -14.6 -11.8 z" fill="url(#pgWood)"/>
      <path d="M294 82 h34 l9 40 c2.2 9.6 -3.6 16.4 -12.6 16.4
               c-8.2 0 -12.8 -3.6 -14.6 -11.8 z" fill="url(#pgGrain)"/>
      <path d="M294 82 h34 l2 8.6 c-11 -2.2 -25 -2.2 -33.6 0 z" fill="#c0873f" opacity=".35"/>
      <path d="M309 106 c5 -1.2 12 -1.2 17 0 l2.8 11 c-8 -2 -14.8 -2 -21.2 0 z"
            fill="#4a2d14" opacity=".4"/>
    `,
  },

  // --- Kestrel 9 ------------------------------------------------------------
  // Glock 17: 7.95" overall, 5.47" tall, 4.49" barrel, at 56 px/in.
  // The grip rakes *forward* going down — that is what grip angle means, and
  // drawing it the other way is what made the first pass look like a toy.
  kestrel: {
    box: [-8, -16, 470, 334],
    mounts: { rail: [200, 4], muzzle: [0, 31], under: [170, 90], mag: [330, 288] },
    body: `
      <path d="M0 18 h14 v26 h-14 z" fill="#2a2e34"/>
      <circle cx="6" cy="31" r="6.4" fill="#0d0f12"/>
      <!-- slide -->
      <path d="M2 6 h396 c8 0 12 4 12 12 v28 c0 8 -4 12 -12 12 h-396
               c-2 0 -3.6 -1.4 -3.6 -3.6 v-44.8 c0 -2.2 1.6 -3.6 3.6 -3.6 z" fill="url(#pgPoly)"/>
      <path d="M2 6 h396 c8 0 12 4 12 12 v2.6 h-411.6 v-11 c0 -2.2 1.6 -3.6 3.6 -3.6 z"
            fill="#7c8794" opacity=".3"/>
      <path d="M0 52 h410 c0 4 -3 6 -8 6 h-398 c-2.4 0 -4 -1.6 -4 -3.6 z"
            fill="#0d0f12" opacity=".45"/>
      <!-- ejection port -->
      <path d="M236 13 h94 c3 0 5 2 5 5 v15 c0 3 -2 5 -5 5 h-94 c-3 0 -5 -2 -5 -5
               v-15 c0 -3 2 -5 5 -5 z" fill="#101317"/>
      <path d="M236 33 h94 c3 0 5 2 5 5 v-2.4 c0 3 -2 5 -5 5 h-94 c-3 0 -5 -2 -5 -5 z"
            fill="#8d97a5" opacity=".25"/>
      <!-- rear cocking serrations -->
      <g fill="#101317" opacity=".75">
        <rect x="344" y="12" width="5" height="40" rx="2.4"/>
        <rect x="356" y="12" width="5" height="40" rx="2.4"/>
        <rect x="368" y="12" width="5" height="40" rx="2.4"/>
        <rect x="380" y="12" width="5" height="40" rx="2.4"/>
        <rect x="392" y="12" width="5" height="40" rx="2.4"/>
      </g>
      <!-- sights -->
      <path d="M26 -8 h13 v14 h-13 z" fill="#20242a"/>
      <circle cx="32.5" cy="0" r="3.6" fill="#e8eef5" opacity=".85"/>
      <path d="M372 -8 h34 v14 h-34 z" fill="#20242a"/>
      <path d="M385 -8 h8 v9 h-8 z" fill="#0b0d10"/>
      <!-- frame: dust cover, accessory rail, takedown lever -->
      <path d="M62 58 h178 v28 h-178 c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-16.8
               c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="url(#pgPoly)"/>
      <g fill="#12151a" opacity=".7">
        <rect x="96" y="76" width="28" height="10" rx="2"/>
        <rect x="140" y="76" width="28" height="10" rx="2"/>
        <rect x="184" y="76" width="28" height="10" rx="2"/>
      </g>
      <path d="M214 58 h24 v10 h-24 z" fill="#4a515b"/>
      <!-- trigger guard: the squared Glock loop -->
      <path d="M240 58 h100 v18 h-11 c-4 28 -17 40 -37 40 c-22 0 -34 -12 -38 -40 h-14 z"
            fill="url(#pgPoly)"/>
      <path d="M262 76 c3 21 11 30 25 32 l-2 12 c-23 -3 -33 -19 -36 -44 z" fill="#101317"/>
      <path d="M270 78 h14 v28 h-14 z" fill="#20242a"/>
      <path d="M274.5 80 h4 v24 h-4 z" fill="#0b0d10"/>
      <!-- grip: frontstrap and backstrap both rake forward as they drop -->
      <path d="M340 76
               C336 132 320 212 300 284
               c-1.2 4.4 1.4 7.6 5.8 8
               l54 4.8 c4.4 .4 7.6 -2.4 8 -6.8
               C378 212 402 132 434 66
               c2.6 -5.4 -.4 -9.4 -6.6 -9.4 h-72 c-10 0 -15.4 5.6 -15.4 15.4 z"
            fill="url(#pgPoly)"/>
      <!-- beavertail over the web of the hand -->
      <path d="M400 56 h30 c8 0 12 4 10 11 l-6 18 c-2 -13 -10 -21 -24 -22 z"
            fill="url(#pgPoly)"/>
      <path d="M340 76 C336 132 320 212 300 284 c-1.2 4.4 1.4 7.6 5.8 8
               l12 1 C338 214 356 134 360 78 z" fill="#5a626d" opacity=".22"/>
      <!-- stippled panel and the finger grooves down the frontstrap -->
      <path d="M330 116 h44 l-22 156 h-44 z" fill="url(#pgStipple)"/>
      <g fill="#12151a" opacity=".5">
        <path d="M332 122 c9 .6 15 3.4 19 7.6 l1.6 -12 c-5 -3.4 -11 -5.4 -18 -5.6 z"/>
        <path d="M322 168 c9 .6 15 3.4 19 7.6 l1.6 -12 c-5 -3.4 -11 -5.4 -18 -5.6 z"/>
        <path d="M312 214 c9 .6 15 3.4 19 7.6 l1.6 -12 c-5 -3.4 -11 -5.4 -18 -5.6 z"/>
      </g>
      <!-- magazine floorplate -->
      <path d="M296 282 h66 c4.4 0 7 3 7 7.4 v9 c0 4.4 -2.6 7.4 -7 7 l-62 -5.4
               c-4.4 -.4 -7 -3.4 -7 -7.6 v-3 c0 -4.4 2.6 -7.4 3 -7.4 z" fill="#20242a"/>
      <path d="M294 288 l76 6.6 v3.4 l-76 -6.6 z" fill="#8d97a5" opacity=".3"/>
    `,
  },

  // --- Warden .45 -----------------------------------------------------------
  // M1911A1: 8.625" overall, 5.5" tall, 5.03" barrel, at 52 px/in.
  warden: {
    box: [-8, -16, 476, 322],
    mounts: { rail: [190, 4], muzzle: [0, 30], under: [160, 86], mag: [332, 276] },
    body: `
      <!-- barrel bushing and recoil spring plug -->
      <path d="M0 10 h28 v42 h-28 z" fill="url(#pgSteelDark)"/>
      <circle cx="12" cy="23" r="7.4" fill="#0d0f12"/>
      <circle cx="12" cy="42" r="6" fill="#3a4048"/>
      <!-- slide: rounded top, unlike the Glock's flat one -->
      <path d="M6 3 h354 c9 0 14 5 14 14 v26 c0 9 -5 14 -14 14 h-354
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-42.8 c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="url(#pgBlued)"/>
      <path d="M6 3 h354 c9 0 14 5 14 14 v1.6 c-4 -7 -10 -10.6 -19 -10.6 h-354.6
               c0 -3.4 2.2 -5 5.6 -5 z" fill="#8d97a5" opacity=".38"/>
      <path d="M0 49 h374 c-1 5 -6 8 -14 8 h-354 c-3.4 0 -5.6 -2.2 -5.6 -5.6 z"
            fill="#0b0d10" opacity=".5"/>
      <path d="M212 12 h76 c3 0 5 2 5 5 v14 c0 3 -2 5 -5 5 h-76 c-3 0 -5 -2 -5 -5
               v-14 c0 -3 2 -5 5 -5 z" fill="#101317"/>
      <g fill="#101317" opacity=".7">
        <rect x="308" y="10" width="5" height="42" rx="2.4"/>
        <rect x="320" y="10" width="5" height="42" rx="2.4"/>
        <rect x="332" y="10" width="5" height="42" rx="2.4"/>
        <rect x="344" y="10" width="5" height="42" rx="2.4"/>
        <rect x="356" y="10" width="5" height="42" rx="2.4"/>
      </g>
      <path d="M24 -7 h12 v10 h-12 z" fill="#2a2e34"/>
      <path d="M338 -7 h26 v10 h-26 z" fill="#2a2e34"/>
      <path d="M347 -7 h8 v8 h-8 z" fill="#0b0d10"/>
      <!-- hammer: spur standing proud behind the slide -->
      <path d="M374 20 c18 0 30 10 32 26 c1.4 11 -4.6 19 -15 20 l-2.6 -13
               c4.6 -.6 7 -4 6.2 -9 c-1.6 -10 -9.6 -15.6 -22 -16 z" fill="url(#pgBlued)"/>
      <path d="M374 20 c18 0 30 10 32 26 l-6 .6 c-2.6 -13 -12 -20 -26 -20.6 z"
            fill="#8d97a5" opacity=".3"/>
      <circle cx="376" cy="44" r="8" fill="#3a4048"/>
      <circle cx="376" cy="44" r="3.4" fill="#101317"/>
      <!-- grip safety, running into the backstrap -->
      <path d="M362 40 h20 c15 0 24 9 26 24 l4 24 c-9 -18 -22 -28 -40 -30 l-10 -1 z"
            fill="url(#pgBlued)"/>
      <!-- thumb safety and slide stop -->
      <path d="M344 56 h34 c4.4 0 6.6 2.2 6.6 6.6 c0 4.4 -2.2 6.6 -6.6 6.6 h-34 z"
            fill="url(#pgSteelDark)"/>
      <circle cx="192" cy="66" r="7.4" fill="url(#pgSteelDark)"/>
      <!-- frame: same blued steel as the slide, not a second colour -->
      <path d="M54 55 h178 v26 h-178 c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-14.8
               c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="url(#pgBlued)"/>
      <path d="M54 55 h178 v3 h-183.6 c0 -1.8 2.2 -3 5.6 -3 z" fill="#8d97a5" opacity=".3"/>
      <!-- trigger guard: round, the 1911 signature -->
      <path d="M232 55 h92 v17 h-10 c-4 25 -17 36 -36 36 c-20 0 -32 -11 -36 -36 h-10 z"
            fill="url(#pgBlued)"/>
      <path d="M254 72 c3 20 12 28 25 30 l-2 11 c-22 -3 -32 -17 -35 -41 z" fill="#101317"/>
      <path d="M262 74 h16 v26 h-16 z" fill="url(#pgSteelDark)"/>
      <g fill="#0b0d10" opacity=".65">
        <rect x="264" y="78" width="12" height="2.4"/>
        <rect x="264" y="85" width="12" height="2.4"/>
        <rect x="264" y="92" width="12" height="2.4"/>
      </g>
      <!-- grip frame: rakes forward as it drops -->
      <path d="M324 72
               C320 124 306 198 288 266
               c-1.2 4.4 1.4 7.6 5.8 8
               l52 4.6 c4.4 .4 7.6 -2.4 8 -6.8
               C364 198 388 124 418 62
               c2.6 -5.4 -.4 -9.4 -6.6 -9.4 h-72 c-10 0 -15.4 5.6 -15.4 15.4 z"
            fill="url(#pgBlued)"/>
      <!-- walnut grip panel, checkered, with its screw -->
      <path d="M330 104 h44 c5 0 7.6 3 6.8 8 l-26 148 c-.8 5 -4 8 -9 7.6
               l-40 -3.6 c-5 -.4 -7.4 -3.6 -6.4 -8.4 l24 -144 c.8 -5 4.6 -7.6 6.6 -7.6 z"
            fill="url(#pgWalnut)"/>
      <path d="M330 104 h44 c5 0 7.6 3 6.8 8 l-26 148 c-.8 5 -4 8 -9 7.6
               l-40 -3.6 c-5 -.4 -7.4 -3.6 -6.4 -8.4 l24 -144 c.8 -5 4.6 -7.6 6.6 -7.6 z"
            fill="url(#pgStipple)"/>
      <circle cx="344" cy="188" r="9" fill="#2f1c0e"/>
      <circle cx="344" cy="188" r="4.6" fill="#9fa9b6" opacity=".5"/>
      <!-- mainspring housing, grooved, down the backstrap -->
      <g stroke="#0b0d10" stroke-width="3.4" opacity=".5" fill="none">
        <path d="M390 108 l-8 20"/><path d="M378 150 l-8 20"/><path d="M366 192 l-8 20"/>
      </g>
      <!-- magazine floorplate -->
      <path d="M284 264 h64 c4.4 0 7 3 7 7.4 v8 c0 4.4 -2.6 7.4 -7 7 l-60 -5.2
               c-4.4 -.4 -7 -3.4 -7 -7.6 v-2.2 c0 -4.4 2.6 -7.4 3 -7.4 z" fill="url(#pgSteelDark)"/>
      <path d="M282 270 l74 6.4 v3.4 l-74 -6.4 z" fill="#9fa9b6" opacity=".3"/>
    `,
  },

  // --- Kite 15 --------------------------------------------------------------
  // AR-15 carbine: 32.5" overall on a 16" barrel, at 14.5 px/in.
  kite: {
    box: [0, 26, 474, 176],
    mounts: { rail: [280, 34], muzzle: [6, 60], under: [140, 78], mag: [300, 104] },
    body: `
      <!-- A2 flash hider -->
      <path d="M0 47 h34 v26 h-34 z" fill="#2a2f36"/>
      <g fill="#0b0d10" opacity=".75">
        <rect x="6" y="47" width="4" height="13"/><rect x="15" y="47" width="4" height="13"/>
        <rect x="24" y="47" width="4" height="13"/>
      </g>
      <path d="M0 47 h34 v3 h-34 z" fill="#8d97a5" opacity=".25"/>
      <!-- barrel, between the muzzle device and the handguard -->
      <rect x="34" y="52" width="22" height="16" fill="#31373f"/>
      <rect x="34" y="52" width="22" height="3" fill="#8d97a5" opacity=".25"/>
      <!-- free-float rail handguard: the darkest part of the rifle -->
      <path d="M56 42 h174 v36 h-174 z" fill="#2c313a"/>
      <path d="M56 42 h174 v4 h-174 z" fill="#7c8794" opacity=".26"/>
      <path d="M56 74 h174 v4 h-174 z" fill="#0b0d10" opacity=".45"/>
      <g fill="#12151a" opacity=".85">
        <rect x="64" y="46" width="7" height="5"/><rect x="79" y="46" width="7" height="5"/>
        <rect x="94" y="46" width="7" height="5"/><rect x="109" y="46" width="7" height="5"/>
        <rect x="124" y="46" width="7" height="5"/><rect x="139" y="46" width="7" height="5"/>
        <rect x="154" y="46" width="7" height="5"/><rect x="169" y="46" width="7" height="5"/>
        <rect x="184" y="46" width="7" height="5"/><rect x="199" y="46" width="7" height="5"/>
        <rect x="214" y="46" width="7" height="5"/>
      </g>
      <g fill="#0b0d10" opacity=".5">
        <rect x="64" y="69" width="7" height="5"/><rect x="94" y="69" width="7" height="5"/>
        <rect x="124" y="69" width="7" height="5"/><rect x="154" y="69" width="7" height="5"/>
        <rect x="184" y="69" width="7" height="5"/><rect x="214" y="69" width="7" height="5"/>
      </g>
      <!-- upper receiver: the lightest of the aluminium parts -->
      <path d="M230 40 h104 v38 h-104 z" fill="#464e59"/>
      <path d="M230 40 h104 v4 h-104 z" fill="#a4aeba" opacity=".32"/>
      <path d="M230 74 h104 v4 h-104 z" fill="#0b0d10" opacity=".35"/>
      <!-- picatinny along the top, continuous with the handguard's -->
      <path d="M228 32 h112 c2.4 0 4 1.6 4 4 v6 h-120 v-6 c0 -2.4 1.6 -4 4 -4 z" fill="#333941"/>
      <g fill="#0b0d10" opacity=".8">
        <rect x="234" y="32" width="7" height="5"/><rect x="249" y="32" width="7" height="5"/>
        <rect x="264" y="32" width="7" height="5"/><rect x="279" y="32" width="7" height="5"/>
        <rect x="294" y="32" width="7" height="5"/><rect x="309" y="32" width="7" height="5"/>
        <rect x="324" y="32" width="7" height="5"/>
      </g>
      <!-- forward assist, ejection port door, brass deflector -->
      <circle cx="324" cy="52" r="7" fill="#5b636e"/>
      <path d="M252 54 h58 v17 c0 2 -1.4 3 -3 3 h-52 c-2 0 -3 -1.4 -3 -3 z"
            fill="#101317" opacity=".65"/>
      <path d="M330 60 c8 2 12 7 12 14 h-12 z" fill="#5b636e" opacity=".7"/>
      <!-- charging handle latch -->
      <path d="M334 35 h26 v11 h-26 z" fill="#5b636e"/>
      <!-- lower receiver: a compact block, not a rounded lump -->
      <path d="M282 78 h74 v28 h-80 l-4 -18 c-1.4 -6.6 2 -10 10 -10 z" fill="#3d444e"/>
      <path d="M282 78 h74 v3.4 h-77.6 c.8 -2.4 2.4 -3.4 3.6 -3.4 z" fill="#a4aeba" opacity=".26"/>
      <path d="M276 100 h80 v6 h-78.6 z" fill="#0b0d10" opacity=".3"/>
      <!-- magazine release -->
      <circle cx="348" cy="90" r="5" fill="#5b636e"/>
      <!-- STANAG magazine -->
      <path d="M280 104 C276 128 271 152 266 174
               c-.8 3.6 1.8 6.8 5.6 7.2 l34 3.8 c3.8 .4 6.8 -2 7 -5.8
               C314 158 316 130 318 104 z" fill="#22262d"/>
      <g fill="none" stroke="#0b0d10" stroke-width="2.6" opacity=".55">
        <path d="M290 110 C286 130 282 152 278 172"/>
        <path d="M303 110 C300 130 297 152 295 173"/>
      </g>
      <path d="M280 104 C276 128 271 152 266 174 c-.8 3.6 1.8 6.8 5.6 7.2
               C276 158 281 130 285 106 z" fill="#8d97a5" opacity=".3"/>
      <path d="M264 174 l50 5.6 l-.6 6.6 c-.4 3.4 -3 5.2 -6.4 4.8 l-38 -4.4
               c-3.8 -.4 -5.6 -2.8 -5.2 -6.2 z" fill="#191d23"/>
      <!-- trigger guard and trigger -->
      <path d="M336 106 h44 v8 h-6 c-2.4 11 -8 16.4 -17 16.4
               c-9.6 0 -16 -5.4 -18.4 -16.4 h-2.6 z" fill="#3d444e"/>
      <path d="M348 108 c1 8.6 4.4 13 9 14 l-1 6.4 c-8.6 -2.2 -13 -8.6 -14 -20.4 z"
            fill="#6d7684"/>
      <!-- A2 pistol grip -->
      <path d="M340 106 h38 l11 44 c2.6 10.6 -3.8 18.4 -13.8 18.4
               c-9.2 0 -14 -4.4 -15.8 -13 z" fill="#2c313a"/>
      <path d="M340 106 h38 l1.8 7 c-12 -2 -26 -2 -38 0 z" fill="#7c8794" opacity=".2"/>
      <g fill="#0b0d10" opacity=".55">
        <path d="M352 128 c5.6 -1.4 13 -1.4 18.6 0 l2.2 8.6 c-9 -1.8 -14.6 -1.8 -20 0 z"/>
        <path d="M357 147 c5.4 -1.4 12 -1.4 17.4 0 l2.2 8.6 c-8.6 -1.8 -13.4 -1.8 -18.6 0 z"/>
      </g>
      <!-- buffer tube in line with the bore, with its castle nut -->
      <path d="M336 50 h48 v24 h-48 z" fill="#4a515b"/>
      <path d="M336 50 h48 v3 h-48 z" fill="#a4aeba" opacity=".3"/>
      <path d="M336 48 h13 v28 h-13 z" fill="#5b636e"/>
      <!-- collapsible stock, riding the tube -->
      <path d="M368 46 h80 c8 0 13 4.4 13 12.4
               v34 c0 8 -5 12.4 -13 12.4 h-20 c-6.6 0 -11 -4.4 -11 -11
               v-6 h-49 c-6 0 -10 -3.4 -10 -9.4
               v-23 c0 -6 4 -9.4 10 -9.4 z" fill="#232830"/>
      <path d="M368 46 h80 c8 0 13 4.4 13 12.4 v2.6 c-1.4 -6 -6 -9 -13 -9 h-80
               c-6 0 -9.4 2.4 -10 7 v-3.6 c0 -6 4 -9.4 10 -9.4 z"
            fill="#8d97a5" opacity=".3"/>
      <path d="M448 46 c8 0 13 4.4 13 12.4 v34 c0 8 -5 12.4 -13 12.4 z" fill="#101317"/>
      <!-- release lever under the comb, sling loop at the toe -->
      <path d="M388 80 h26 v7 h-26 z" fill="#101317" opacity=".6"/>
      <path d="M432 88 h18 v7 h-18 z" fill="#101317" opacity=".5"/>
    `,
  },

  // --- Ridgeback 12 ---------------------------------------------------------
  // Remington 870: 38.5" overall on an 18.5" barrel, at 12.2 px/in.
  ridgeback: {
    box: [0, 18, 474, 118],
    mounts: { rail: [280, 38], muzzle: [4, 51], under: [140, 90], mag: [236, 66] },
    body: `
      <!-- barrel, with the bead sight up front -->
      <rect x="0" y="44" width="240" height="14" fill="url(#pgBlued)"/>
      <rect x="0" y="44" width="240" height="3" fill="#8d97a5" opacity=".38"/>
      <circle cx="10" cy="41" r="3.6" fill="#d5dde6"/>
      <!-- magazine tube under the barrel -->
      <rect x="16" y="61" width="190" height="13" rx="6" fill="url(#pgBlued)"/>
      <rect x="20" y="62" width="180" height="2.6" fill="#8d97a5" opacity=".3"/>
      <path d="M198 61 h10 c4.4 0 6.6 2.2 6.6 6.6 c0 4.4 -2.2 6.4 -6.6 6.4 h-10 z" fill="#4a515b"/>
      <rect x="152" y="42" width="9" height="34" rx="2" fill="#4a515b"/>
      <!-- pump forend: ribbed walnut -->
      <path d="M78 58 h116 c6.6 0 10 3.4 10 10 v16 c0 6.6 -3.4 10 -10 10 h-116
               c-6.6 0 -10 -3.4 -10 -10 v-16 c0 -6.6 3.4 -10 10 -10 z" fill="url(#pgWalnut)"/>
      <path d="M78 58 h116 c6.6 0 10 3.4 10 10 v16 c0 6.6 -3.4 10 -10 10 h-116
               c-6.6 0 -10 -3.4 -10 -10 v-16 c0 -6.6 3.4 -10 10 -10 z" fill="url(#pgGrain)"/>
      <path d="M78 58 h116 c6.6 0 10 3.4 10 10 h-136 c0 -6.6 3.4 -10 10 -10 z"
            fill="#a4652f" opacity=".32"/>
      <g fill="#26150a" opacity=".5">
        <rect x="90" y="62" width="3.4" height="28" rx="1.7"/>
        <rect x="104" y="62" width="3.4" height="28" rx="1.7"/>
        <rect x="118" y="62" width="3.4" height="28" rx="1.7"/>
        <rect x="132" y="62" width="3.4" height="28" rx="1.7"/>
        <rect x="146" y="62" width="3.4" height="28" rx="1.7"/>
        <rect x="160" y="62" width="3.4" height="28" rx="1.7"/>
        <rect x="174" y="62" width="3.4" height="28" rx="1.7"/>
      </g>
      <!-- receiver: the tall slab that says pump shotgun -->
      <path d="M240 36 h96 v50 h-84 c-8 0 -12 -4 -12 -12 z" fill="url(#pgBlued)"/>
      <path d="M240 36 h96 v4 h-96 z" fill="#8d97a5" opacity=".35"/>
      <path d="M256 50 h62 c3.4 0 5.6 2.2 5.6 5.6 v11 c0 3.4 -2.2 5.6 -5.6 5.6 h-62
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-11 c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="#101317"/>
      <path d="M256 66 h62 c3.4 0 5.6 2.2 5.6 5.6 v-2 c0 3.4 -2.2 5.6 -5.6 5.6 h-62
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 z" fill="#8d97a5" opacity=".22"/>
      <circle cx="249" cy="80" r="4.4" fill="#4a515b"/>
      <!-- trigger group -->
      <path d="M284 86 h52 v8 h-6 c-2.4 12 -9 17.4 -19 17.4 c-10.6 0 -17 -5.4 -19.4 -17.4 h-7.6 z"
            fill="url(#pgBlued)"/>
      <path d="M300 88 c1.2 9 4.6 14 10 15 l-1 6.4 c-9.6 -2.2 -15 -9.6 -16 -21.4 z" fill="#5a626d"/>
      <!-- stock: comb, wrist and recoil pad -->
      <path d="M336 38
               C372 42 420 50 450 56
               c8.6 1.6 14 5.4 14 13 v32 c0 7.6 -6 11 -14 9
               C420 104 372 94 350 86
               c-9.6 -3.4 -14 -9 -14 -18 z" fill="url(#pgWalnut)"/>
      <path d="M336 38
               C372 42 420 50 450 56
               c8.6 1.6 14 5.4 14 13 v32 c0 7.6 -6 11 -14 9
               C420 104 372 94 350 86
               c-9.6 -3.4 -14 -9 -14 -18 z" fill="url(#pgGrain)"/>
      <path d="M336 38 C372 42 420 50 450 56 c5.4 1 9.6 3 11.6 6.2
               C422 55 372 47 338 43 z" fill="#a4652f" opacity=".35"/>
      <!-- the wrist, cut back under the comb -->
      <path d="M350 86 c-9.6 -3.4 -14 -9 -14 -18 l16 1.6 c1 10 5.4 17 14.6 21 z"
            fill="#26150a" opacity=".38"/>
      <!-- recoil pad -->
      <path d="M448 55.6 c9.6 1.8 16 5.6 16 13.4 v32 c0 7.6 -6 11 -14 9 l-5 -1.2 z"
            fill="#15171b"/>
      <path d="M444 56 l4 .8 v52.6 l-4 -1 z" fill="#d5dde6" opacity=".22"/>
    `,
  },
};

export const DETAIL_IDS = Object.keys(GUN_DETAIL);
