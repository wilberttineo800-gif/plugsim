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
      <path d="M8 50 h22 v18 h-22 a3 3 0 0 1 -3 -3 v-12 a3 3 0 0 1 3 -3 z" fill="url(#pgBlued)"/>
      <path d="M8 50 h6 v18 h-6 z" fill="#3d434b" opacity=".55"/>
      <rect x="30" y="54.5" width="66" height="9" fill="url(#pgBlued)"/>
      <rect x="30" y="54.5" width="66" height="2.2" fill="#b3bcc7" opacity=".55"/>
      <path d="M36 44 h20 v26 h-20 z" fill="url(#pgBlued)"/>
      <path d="M39 44 c0 -10 2 -14 3 -14 h8 c1 0 3 4 3 14 z" fill="url(#pgSteelDark)"/>
      <rect x="44" y="26" width="4" height="12" rx="1.6" fill="#6d7684"/>
      <path d="M39 30 h3 v10 h-3 z M50 30 h3 v10 h-3 z" fill="#5a626d"/>
      <rect x="36" y="44" width="20" height="2.4" fill="#b3bcc7" opacity=".4"/>
      <path d="M96 40 h20 v32 h-20 z" fill="url(#pgBlued)"/>
      <path d="M104 28 h9 v12 h-9 z" fill="url(#pgSteelDark)"/>
      <rect x="96" y="40" width="20" height="2.4" fill="#b3bcc7" opacity=".45"/>
      <rect x="116" y="41" width="76" height="10" fill="url(#pgBlued)"/>
      <rect x="116" y="41" width="76" height="2.2" fill="#b3bcc7" opacity=".5"/>
      <rect x="116" y="55" width="82" height="8" fill="url(#pgBlued)"/>
      <path d="M120 34 h58 c3 0 5 2 5 5 v4 h-68 v-4 c0 -3 2 -5 5 -5 z" fill="url(#pgWalnut)"/>
      <path d="M120 34 h58 c3 0 5 2 5 5 v4 h-68 v-4 c0 -3 2 -5 5 -5 z" fill="url(#pgGrain)"/>
      <path d="M120 34 h58 c3 0 5 2 5 5 h-68 c0 -3 2 -5 5 -5 z" fill="#c0873f" opacity=".3"/>
      <path d="M116 64 c14 -2 46 -3 70 -1 c4 .3 6 2.4 6 6 c0 8 -2 13 -6 15
               c-22 3 -50 3 -66 1 c-4 -.6 -6 -3 -6 -8 v-8 c0 -3 1 -4.6 2 -5 z" fill="url(#pgWalnut)"/>
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
               C420 103 378 95 356 89 c-13 -3.4 -20 -9 -22 -19 z" fill="url(#pgWalnut)"/>
      <path d="M334 44 C368 47 414 52 456 58 c8 1.2 14 4 14 10.4 v33 c0 6 -5 8.4 -12 7
               C420 103 378 95 356 89 c-13 -3.4 -20 -9 -22 -19 z" fill="url(#pgGrain)"/>
      <path d="M334 44 C368 47 414 52 456 58 c5 .8 9 2.6 11 5.6 C420 57 368 51 336 49 z"
            fill="#c0873f" opacity=".38"/>
      <path d="M400 74 l30 3.6 c3 .4 5 2.4 5 5 c0 2.6 -2 4 -5 3.6 l-30 -4.2
               c-3 -.4 -4.6 -2 -4.6 -3.8 c0 -1.8 1.6 -4.4 4.6 -4.2 z" fill="#3a2412" opacity=".7"/>
      <path d="M454 57.8 c9 1.2 16 4 16 10.6 v33 c0 6 -5 8.4 -12 7 l-4 -.6 z" fill="url(#pgSteelDark)"/>
      <rect x="450" y="58" width="3" height="50" fill="#7c8794" opacity=".4"/>
      <path d="M196 46 h144 v36 h-132 c-8 0 -12 -4 -12 -12 z" fill="url(#pgBlued)"/>
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
               c-8.2 0 -12.8 -3.6 -14.6 -11.8 z" fill="url(#pgWalnut)"/>
      <path d="M294 82 h34 l9 40 c2.2 9.6 -3.6 16.4 -12.6 16.4
               c-8.2 0 -12.8 -3.6 -14.6 -11.8 z" fill="url(#pgGrain)"/>
      <path d="M294 82 h34 l2 8.6 c-11 -2.2 -25 -2.2 -33.6 0 z" fill="#c0873f" opacity=".35"/>
      <path d="M309 106 c5 -1.2 12 -1.2 17 0 l2.8 11 c-8 -2 -14.8 -2 -21.2 0 z"
            fill="#4a2d14" opacity=".4"/>
    `,
  },

  // --- Kestrel 9 ------------------------------------------------------------
  // Glock 17: 7.95" overall, 5.47" tall, at 55.6 px/in — a 442 x 311 field.
  //
  // These numbers are traced off a photograph rather than guessed, because
  // guessing got the single most important thing backwards three times running:
  // **the grip rakes rearward as it drops.** The magazine sits behind the top
  // of the grip, not in front of it. Measured off the reference, both straps
  // lean back about 18 degrees, the slide is a quarter of the gun's height, and
  // the trigger guard bottoms out at half of it.
  kestrel: {
    box: [-6, -6, 464, 326],
    mounts: { rail: [200, 8], muzzle: [0, 42], under: [110, 92], mag: [366, 296] },
    body: `
      <!-- barrel at the muzzle -->
      <path d="M0 26 h16 v32 h-16 z" fill="#2a2e34"/>
      <circle cx="7" cy="42" r="7" fill="#0b0d10"/>
      <!-- slide: a quarter of the gun's height -->
      <path d="M2 10 h396 c7 0 11 4 11 11 v35 c0 7 -4 11 -11 11 h-396
               c-2.4 0 -4 -1.6 -4 -4 v-49 c0 -2.4 1.6 -4 4 -4 z" fill="url(#pgPoly)"/>
      <path d="M2 10 h396 c7 0 11 4 11 11 v3 h-411 v-10 c0 -2.4 1.6 -4 4 -4 z"
            fill="#7c8794" opacity=".3"/>
      <path d="M0 61 h409 c0 4 -3 6 -8 6 h-397 c-2.4 0 -4 -1.6 -4 -4 z"
            fill="#0b0d10" opacity=".35"/>
      <!-- ejection port -->
      <path d="M248 18 h92 c3.4 0 5.6 2.2 5.6 5.6 v17 c0 3.4 -2.2 5.6 -5.6 5.6 h-92
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-17 c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="#101317"/>
      <path d="M248 40 h92 c3.4 0 5.6 2.2 5.6 5.6 v-2.6 c0 3.4 -2.2 5.6 -5.6 5.6 h-92
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 z" fill="#8d97a5" opacity=".22"/>
      <!-- rear cocking serrations -->
      <g fill="#101317" opacity=".75">
        <rect x="350" y="16" width="5" height="45" rx="2.4"/>
        <rect x="362" y="16" width="5" height="45" rx="2.4"/>
        <rect x="374" y="16" width="5" height="45" rx="2.4"/>
        <rect x="386" y="16" width="5" height="45" rx="2.4"/>
        <rect x="398" y="16" width="5" height="45" rx="2.4"/>
      </g>
      <!-- sights -->
      <path d="M28 -2 h14 v12 h-14 z" fill="#20242a"/>
      <circle cx="35" cy="4.4" r="3.6" fill="#e8eef5" opacity=".85"/>
      <path d="M368 -2 h36 v12 h-36 z" fill="#20242a"/>
      <path d="M382 -2 h8 v8 h-8 z" fill="#0b0d10"/>
      <!-- frame: dust cover forward of the guard, with its accessory rail -->
      <path d="M40 67 h124 v27 h-124 c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-15.8
               c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="url(#pgPoly)"/>
      <path d="M40 67 h124 v3.4 h-129.6 c0 -2.2 2.2 -3.4 5.6 -3.4 z"
            fill="#7c8794" opacity=".24"/>
      <g fill="#12151a" opacity=".7">
        <rect x="66" y="83" width="24" height="11" rx="2.4"/>
        <rect x="102" y="83" width="24" height="11" rx="2.4"/>
        <rect x="138" y="83" width="24" height="11" rx="2.4"/>
      </g>
      <path d="M168 67 h22 v11 h-22 z" fill="#4a515b"/>
      <path d="M196 70 h44 v9 h-44 z" fill="#4a515b"/>
      <!-- trigger guard: bottoms out at half the gun's height -->
      <path fill-rule="evenodd" fill="url(#pgPoly)"
            d="M160 67 h124 v24 h-14 c-4 40 -20 58 -46 58 c-27 0 -42 -18 -46 -58 h-18
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-12.8 c0 -3.4 2.2 -5.6 5.6 -5.6 z
               M186 91 h72 c-3.4 30 -15 43 -35 43 c-21 0 -33 -13 -37 -43 z"/>
      <path d="M186 91 h10 c3 27 12 39 28 41 l-2 12 c-24 -3.4 -34 -22 -36 -53 z"
            fill="#12151a" opacity=".5"/>
      <path d="M196 92 h18 v38 h-18 z" fill="#20242a"/>
      <path d="M202 94 h5 v34 h-5 z" fill="#0b0d10"/>
      <!-- grip: rakes REARWARD as it drops, about 18 degrees, so the magazine
           finishes behind the top of the grip -->
      <path d="M284 90
               C288 150 306 240 328 296
               c1.6 4.2 5.6 6.4 10 5.4
               l96 -22 c4.8 -1 7.4 -5 6.4 -9.8
               C424 200 402 140 386 84
               c-1.4 -5 -5 -7.6 -10.6 -7.6 h-79 c-10 0 -13.6 6.4 -12.4 13.6 z"
            fill="url(#pgPoly)"/>
      <!-- beavertail, over the web of the hand -->
      <path d="M378 72 h26 c7 0 10 4.4 8 10.4 l-6 18
               c-2 -14 -9.4 -23 -22 -25.4 z" fill="url(#pgPoly)"/>
      <!-- frontstrap highlight -->
      <path d="M284 90 C288 150 306 240 328 296 c1.6 4.2 5.6 6.4 10 5.4
               l-13 -2.8 C302 242 288 152 288 88 z" fill="#7c8794" opacity=".22"/>
      <!-- stippled panel between the straps -->
      <path d="M298 116 C304 176 320 250 338 292 l84 -19
               C408 216 390 158 372 108 z" fill="url(#pgStipple)"/>
      <!-- finger grooves down the frontstrap -->
      <g fill="#12151a" opacity=".5">
        <path d="M292 132 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
        <path d="M302 188 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
        <path d="M314 244 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
      </g>
      <!-- magazine floorplate, the rearmost thing on the gun -->
      <path d="M330 294 l104 -23 c5 -1.2 8.4 1.4 9.4 6.4 l2 9.6
               c1 5 -1.6 8.8 -6.6 9.8 l-100 21 c-5 1 -8.6 -1.4 -9.6 -6.2 l-2 -9
               c-1 -5 1.6 -8.6 2.8 -8.6 z" fill="#20242a"/>
      <path d="M326 302 l118 -25 .8 4 -118 25 z" fill="#8d97a5" opacity=".3"/>
    `,
  },

  // --- Sable Compact --------------------------------------------------------
  // Glock 26: 6.29" overall, 4.17" tall. Derived from the kestrel rather than
  // drawn fresh — same family, same frame, and that frame was traced off a
  // photograph. Only two things actually differ: the slide is 316px instead of
  // 409, and the grip drops 153px instead of 226. Everything between the
  // trigger guard and the breech face is where it already was.
  sable: {
    box: [87, -6, 371, 262],
    mounts: { rail: [240, 8], muzzle: [93, 42], under: [150, 92], mag: [330, 228] },
    body: `
      <path d="M93 26 h16 v32 h-16 z" fill="#2a2e34"/>
      <circle cx="100" cy="42" r="7" fill="#0b0d10"/>
      <!-- slide: shorter at the muzzle, breech face unmoved -->
      <path d="M95 10 h303 c7 0 11 4 11 11 v35 c0 7 -4 11 -11 11 h-303
               c-2.4 0 -4 -1.6 -4 -4 v-49 c0 -2.4 1.6 -4 4 -4 z" fill="url(#pgPoly)"/>
      <path d="M95 10 h303 c7 0 11 4 11 11 v3 h-318 v-10 c0 -2.4 1.6 -4 4 -4 z"
            fill="#7c8794" opacity=".3"/>
      <path d="M93 61 h316 c0 4 -3 6 -8 6 h-304 c-2.4 0 -4 -1.6 -4 -4 z"
            fill="#0b0d10" opacity=".35"/>
      <!-- ejection port and serrations sit off the breech, so they do not move -->
      <path d="M268 18 h72 c3.4 0 5.6 2.2 5.6 5.6 v17 c0 3.4 -2.2 5.6 -5.6 5.6 h-72
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-17 c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="#101317"/>
      <g fill="#101317" opacity=".75">
        <rect x="350" y="16" width="5" height="45" rx="2.4"/>
        <rect x="362" y="16" width="5" height="45" rx="2.4"/>
        <rect x="374" y="16" width="5" height="45" rx="2.4"/>
        <rect x="386" y="16" width="5" height="45" rx="2.4"/>
        <rect x="398" y="16" width="5" height="45" rx="2.4"/>
      </g>
      <path d="M121 -2 h14 v12 h-14 z" fill="#20242a"/>
      <circle cx="128" cy="4.4" r="3.6" fill="#e8eef5" opacity=".85"/>
      <path d="M368 -2 h36 v12 h-36 z" fill="#20242a"/>
      <path d="M382 -2 h8 v8 h-8 z" fill="#0b0d10"/>
      <!-- dust cover barely clears the guard on a subcompact -->
      <path d="M128 67 h36 v27 h-36 c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-15.8
               c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="url(#pgPoly)"/>
      <path d="M168 67 h22 v11 h-22 z" fill="#4a515b"/>
      <path d="M196 70 h44 v9 h-44 z" fill="#4a515b"/>
      <path fill-rule="evenodd" fill="url(#pgPoly)"
            d="M160 67 h124 v24 h-14 c-4 40 -20 58 -46 58 c-27 0 -42 -18 -46 -58 h-18
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-12.8 c0 -3.4 2.2 -5.6 5.6 -5.6 z
               M186 91 h72 c-3.4 30 -15 43 -35 43 c-21 0 -33 -13 -37 -43 z"/>
      <path d="M196 92 h18 v38 h-18 z" fill="#20242a"/>
      <path d="M202 94 h5 v34 h-5 z" fill="#0b0d10"/>
      <!-- grip: same 18-degree rearward rake, 153px of drop instead of 226 -->
      <path d="M284 90
               C287 135 302 195 317 243
               c1.6 4.2 5.6 6.4 10 5.4
               l84 -19 c4.8 -1 7.4 -5 6.4 -9.8
               C414 175 398 128 386 84
               c-1.4 -5 -5 -7.6 -10.6 -7.6 h-79 c-10 0 -13.6 6.4 -12.4 13.6 z"
            fill="url(#pgPoly)"/>
      <path d="M378 72 h26 c7 0 10 4.4 8 10.4 l-6 18
               c-2 -14 -9.4 -23 -22 -25.4 z" fill="url(#pgPoly)"/>
      <path d="M284 90 C287 135 302 195 317 243 c1.6 4.2 5.6 6.4 10 5.4
               l-13 -2.8 C296 195 288 140 288 88 z" fill="#7c8794" opacity=".22"/>
      <path d="M296 112 C302 158 314 205 327 240 l74 -17
               C392 185 378 146 366 106 z" fill="url(#pgStipple)"/>
      <g fill="#12151a" opacity=".5">
        <path d="M292 128 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
        <path d="M302 178 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
      </g>
      <!-- floorplate: a 26 has almost no grip below the hand, which is the tell -->
      <path d="M319 241 l92 -20 c5 -1.2 8.4 1.4 9.4 6.4 l2 9.6
               c1 5 -1.6 8.8 -6.6 9.8 l-88 19 c-5 1 -8.6 -1.4 -9.6 -6.2 l-2 -9
               c-1 -5 1.6 -8.6 2.8 -8.6 z" fill="#20242a"/>
      <path d="M315 249 l106 -23 .8 4 -106 23 z" fill="#8d97a5" opacity=".3"/>
    `,
  },

  // --- Vulcan 10 ------------------------------------------------------------
  // Glock 40 long slide: 9.49" overall, 5.47" tall, 6.02" barrel. Same frame
  // and grip as the kestrel — the only thing that changes is that the slide
  // runs 495px instead of 409, forward of the breech. The blurb calls it a
  // ported competition gun, so it gets the slide cut, the barrel ports and a
  // raised adjustable rear sight, which is what that actually looks like.
  vulcan: {
    box: [-92, -10, 550, 334],
    mounts: { rail: [150, 8], muzzle: [-86, 42], under: [20, 92], mag: [366, 296] },
    body: `
      <path d="M-86 26 h16 v32 h-16 z" fill="#2a2e34"/>
      <circle cx="-79" cy="42" r="7" fill="#0b0d10"/>
      <!-- slide, run forward -->
      <path d="M-84 10 h482 c7 0 11 4 11 11 v35 c0 7 -4 11 -11 11 h-482
               c-2.4 0 -4 -1.6 -4 -4 v-49 c0 -2.4 1.6 -4 4 -4 z" fill="url(#pgPoly)"/>
      <path d="M-84 10 h482 c7 0 11 4 11 11 v3 h-497 v-10 c0 -2.4 1.6 -4 4 -4 z"
            fill="#7c8794" opacity=".3"/>
      <path d="M-86 61 h495 c0 4 -3 6 -8 6 h-483 c-2.4 0 -4 -1.6 -4 -4 z"
            fill="#0b0d10" opacity=".35"/>
      <!-- lightening cut through the top of the slide: the competition tell -->
      <path d="M60 14 h112 c4 0 6.4 2.4 6.4 6.4 v9 c0 4 -2.4 6.4 -6.4 6.4 h-112
               c-4 0 -6.4 -2.4 -6.4 -6.4 v-9 c0 -4 2.4 -6.4 6.4 -6.4 z" fill="#0b0d10"/>
      <path d="M60 33 h112 c4 0 6.4 2.4 6.4 6.4 v-3 c0 4 -2.4 6.4 -6.4 6.4 h-112
               c-4 0 -6.4 -2.4 -6.4 -6.4 z" fill="#8d97a5" opacity=".2"/>
      <!-- barrel ports, cut through the slide onto the barrel beneath -->
      <g fill="#0b0d10">
        <rect x="-58" y="17" width="9" height="13" rx="3"/>
        <rect x="-40" y="17" width="9" height="13" rx="3"/>
        <rect x="-22" y="17" width="9" height="13" rx="3"/>
      </g>
      <path d="M268 18 h72 c3.4 0 5.6 2.2 5.6 5.6 v17 c0 3.4 -2.2 5.6 -5.6 5.6 h-72
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-17 c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="#101317"/>
      <g fill="#101317" opacity=".75">
        <rect x="350" y="16" width="5" height="45" rx="2.4"/>
        <rect x="362" y="16" width="5" height="45" rx="2.4"/>
        <rect x="374" y="16" width="5" height="45" rx="2.4"/>
        <rect x="386" y="16" width="5" height="45" rx="2.4"/>
        <rect x="398" y="16" width="5" height="45" rx="2.4"/>
      </g>
      <!-- fibre front, adjustable rear standing proud -->
      <path d="M-58 -3 h12 v13 h-12 z" fill="#20242a"/>
      <circle cx="-52" cy="3.4" r="3.4" fill="#ffcf5c" opacity=".9"/>
      <path d="M364 -8 h42 v18 h-42 z" fill="#20242a"/>
      <path d="M380 -8 h9 v12 h-9 z" fill="#0b0d10"/>
      <path d="M364 -8 h42 v3 h-42 z" fill="#8d97a5" opacity=".3"/>
      <!-- long dust cover with a full accessory rail under it -->
      <path d="M-46 67 h210 v27 h-210 c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-15.8
               c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="url(#pgPoly)"/>
      <path d="M-46 67 h210 v3.4 h-215.6 c0 -2.2 2.2 -3.4 5.6 -3.4 z"
            fill="#7c8794" opacity=".24"/>
      <g fill="#12151a" opacity=".7">
        <rect x="-14" y="83" width="24" height="11" rx="2.4"/>
        <rect x="22" y="83" width="24" height="11" rx="2.4"/>
        <rect x="58" y="83" width="24" height="11" rx="2.4"/>
        <rect x="94" y="83" width="24" height="11" rx="2.4"/>
        <rect x="130" y="83" width="24" height="11" rx="2.4"/>
      </g>
      <path d="M168 67 h22 v11 h-22 z" fill="#4a515b"/>
      <path d="M196 70 h44 v9 h-44 z" fill="#4a515b"/>
      <!-- frame, guard and grip are the kestrel's, unchanged -->
      <path fill-rule="evenodd" fill="url(#pgPoly)"
            d="M160 67 h124 v24 h-14 c-4 40 -20 58 -46 58 c-27 0 -42 -18 -46 -58 h-18
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-12.8 c0 -3.4 2.2 -5.6 5.6 -5.6 z
               M186 91 h72 c-3.4 30 -15 43 -35 43 c-21 0 -33 -13 -37 -43 z"/>
      <path d="M186 91 h10 c3 27 12 39 28 41 l-2 12 c-24 -3.4 -34 -22 -36 -53 z"
            fill="#12151a" opacity=".5"/>
      <path d="M196 92 h18 v38 h-18 z" fill="#20242a"/>
      <path d="M202 94 h5 v34 h-5 z" fill="#0b0d10"/>
      <path d="M284 90
               C288 150 306 240 328 296
               c1.6 4.2 5.6 6.4 10 5.4
               l96 -22 c4.8 -1 7.4 -5 6.4 -9.8
               C424 200 402 140 386 84
               c-1.4 -5 -5 -7.6 -10.6 -7.6 h-79 c-10 0 -13.6 6.4 -12.4 13.6 z"
            fill="url(#pgPoly)"/>
      <path d="M378 72 h26 c7 0 10 4.4 8 10.4 l-6 18
               c-2 -14 -9.4 -23 -22 -25.4 z" fill="url(#pgPoly)"/>
      <path d="M284 90 C288 150 306 240 328 296 c1.6 4.2 5.6 6.4 10 5.4
               l-13 -2.8 C302 242 288 152 288 88 z" fill="#7c8794" opacity=".22"/>
      <path d="M298 116 C304 176 320 250 338 292 l84 -19
               C408 216 390 158 372 108 z" fill="url(#pgStipple)"/>
      <g fill="#12151a" opacity=".5">
        <path d="M292 132 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
        <path d="M302 188 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
        <path d="M314 244 c9.6 2.4 15.4 6.6 18 12.4 l1.6 -13.6
               c-4 -5 -9.6 -8 -17 -9.4 z"/>
      </g>
      <path d="M330 294 l104 -23 c5 -1.2 8.4 1.4 9.4 6.4 l2 9.6
               c1 5 -1.6 8.8 -6.6 9.8 l-100 21 c-5 1 -8.6 -1.4 -9.6 -6.2 l-2 -9
               c-1 -5 1.6 -8.6 2.8 -8.6 z" fill="#20242a"/>
      <path d="M326 302 l118 -25 .8 4 -118 25 z" fill="#8d97a5" opacity=".3"/>
    `,
  },



  // --- Drover .357 ----------------------------------------------------------
  // S&W 686, 6" barrel: 12.0" overall, 5.5" tall, at 46 px/in.
  //
  // The first attempt drew the barrel, the cylinder and the grip as separate
  // pieces and it read as a toy. A revolver is ONE frame: the topstrap runs
  // unbroken from the barrel back over the cylinder to the hammer, and the
  // grip frame hangs off the bottom of that same casting. Drawn as one outline
  // here, with the cylinder sitting IN its window rather than beside it.
  drover: {
    box: [-8, -14, 560, 288],
    mounts: { rail: [300, 18], muzzle: [4, 62], under: [140, 106], mag: [316, 100] },
    body: `
      <!-- one continuous frame: barrel, topstrap, standing breech, grip frame -->
      <path fill="url(#pgBlued)" d="
        M6 42 h250 v-6 h122 c7 0 12 5 12 12 v34
        c14 26 22 66 22 104 c0 13 -8 21 -22 21 h-60 c-14 0 -22 -8 -20 -22
        c3 -22 7 -42 13 -60 h-24 c-5 32 -20 48 -43 48 c-25 0 -39 -16 -43 -48
        h-25 v-24 h-32 v-16 h-150 z"/>
      <!-- top highlight along the whole spine, so it reads as one casting -->
      <path d="M6 42 h250 v-6 h122 c7 0 12 5 12 12 v4 h-134 v-4 h-250 z"
            fill="#8d97a5" opacity=".3"/>
      <!-- barrel: underlug and bore -->
      <path d="M6 74 h250 v22 c0 4 -3 6 -7 6 h-236 c-4 0 -7 -2 -7 -6 z"
            fill="#20242a"/>
      <circle cx="20" cy="58" r="9" fill="#0b0d10"/>
      <circle cx="20" cy="58" r="9" fill="none" stroke="#0b0d10" stroke-width="3"/>
      <!-- ventilated rib -->
      <g fill="#20242a" opacity=".75">
        <rect x="44" y="36" width="15" height="6" rx="2"/><rect x="71" y="36" width="15" height="6" rx="2"/>
        <rect x="98" y="36" width="15" height="6" rx="2"/><rect x="125" y="36" width="15" height="6" rx="2"/>
        <rect x="152" y="36" width="15" height="6" rx="2"/><rect x="179" y="36" width="15" height="6" rx="2"/>
      </g>
      <path d="M30 24 h11 v18 h-11 z" fill="#20242a"/>
      <path d="M33 26 h5 v14 h-5 z" fill="#e05a5a" opacity=".85"/>
      <!-- the cylinder window, cut into the frame, with the cylinder in it -->
      <path d="M256 62 h116 v76 h-116 z" fill="#12151a"/>
      <ellipse cx="314" cy="100" rx="54" ry="36" fill="url(#pgBlued)"/>
      <ellipse cx="314" cy="100" rx="54" ry="36" fill="none" stroke="#0b0d10" stroke-width="2.5"/>
      <!-- flutes, drawn as the shadowed gaps between them -->
      <g fill="#0b0d10" opacity=".55">
        <rect x="272" y="74" width="8" height="52" rx="4"/>
        <rect x="296" y="70" width="8" height="60" rx="4"/>
        <rect x="322" y="70" width="8" height="60" rx="4"/>
        <rect x="346" y="74" width="8" height="52" rx="4"/>
      </g>
      <ellipse cx="314" cy="82" rx="48" ry="10" fill="#8d97a5" opacity=".18"/>
      <!-- rear sight and the hammer spur standing behind the frame -->
      <path d="M352 22 h32 v14 h-32 z" fill="#20242a"/>
      <path d="M365 22 h7 v10 h-7 z" fill="#0b0d10"/>
      <path d="M384 24 c24 -2 38 12 38 32 c0 10 -5 17 -13 20 l-25 -12 z"
            fill="#2f353d"/>
      <g fill="#0b0d10" opacity=".65">
        <rect x="394" y="30" width="20" height="3.4" rx="1.7"/>
        <rect x="396" y="38" width="20" height="3.4" rx="1.7"/>
        <rect x="398" y="46" width="20" height="3.4" rx="1.7"/>
      </g>
      <!-- trigger, inside the guard the frame already cut -->
      <path d="M296 126 h16 v34 h-16 z" fill="#20242a"/>
      <path d="M301 128 h5 v30 h-5 z" fill="#0b0d10"/>
      <!-- grip: walnut panels ON the frame, following its backstrap rather
           than replacing it. The frame's own curve shows above and below. -->
      <path d="M392 112
               c18 26 28 64 30 96 c1 12 -5 20 -16 20 h-44 c-11 0 -17 -7 -15 -18
               c3 -17 6 -31 10 -43 c9 -4 14 -11 15 -21 c1 -12 -3 -20 -11 -25
               c8 -12 17 -22 31 -9 z" fill="url(#pgWalnut)"/>
      <path d="M392 112 c18 26 28 64 30 96 c1 12 -5 20 -16 20 h-10
               c7 -42 0 -83 -21 -111 z" fill="#3d2313" opacity=".5"/>
      <path d="M383 138 c13 22 21 54 23 82 l-36 3 c2 -31 6 -60 11 -85 z"
            fill="url(#pgStipple)" opacity=".7"/>
      <circle cx="395" cy="178" r="5.5" fill="#c3ccd8" opacity=".5"/>
    `,
  },

  // --- Wasp 9 ---------------------------------------------------------------
  // MP5A2: 27" overall, 10.2" tall, 8.9" barrel, at 26 px/in.
  //
  // Second attempt. The first drew the handguard, receiver, grip and stock as
  // four pale rectangles that did not touch, and it read as parts rather than a
  // gun. The receiver is now ONE dark tube running the whole length with
  // everything hung off it, which is what a stamped submachine gun actually is.
  wasp: {
    box: [-10, -16, 726, 306],
    mounts: { rail: [318, 30], muzzle: [8, 72], under: [150, 116], mag: [392, 220] },
    body: `
      <!-- the receiver tube, unbroken from muzzle end to stock -->
      <path d="M56 50 h640 c8 0 12 4 12 12 v46 c0 8 -4 12 -12 12 h-640 z"
            fill="url(#pgBlued)"/>
      <path d="M56 50 h640 c8 0 12 4 12 12 v4 h-652 z" fill="#8d97a5" opacity=".2"/>
      <path d="M56 112 h652 c0 5 -4 8 -12 8 h-640 z" fill="#0b0d10" opacity=".4"/>
      <!-- barrel out the front, and the three-lug nose -->
      <path d="M12 66 h48 v26 h-48 z" fill="#2a2e34"/>
      <path d="M2 60 h18 v38 h-18 z" fill="#3d434c"/>
      <circle cx="11" cy="79" r="7" fill="#0b0d10"/>
      <!-- ribbed handguard, clamped under the tube -->
      <path d="M62 68 h152 c7 0 11 4 11 11 v36 c0 7 -4 11 -11 11 h-152
               c-7 0 -11 -4 -11 -11 v-36 c0 -7 4 -11 11 -11 z" fill="url(#pgPoly)"/>
      <g fill="#0b0d10" opacity=".55">
        <rect x="70" y="76" width="138" height="5" rx="2.5"/>
        <rect x="70" y="88" width="138" height="5" rx="2.5"/>
        <rect x="70" y="100" width="138" height="5" rx="2.5"/>
      </g>
      <path d="M62 68 h152 c7 0 11 4 11 11 v3 h-174 c0 -8 4 -14 11 -14 z"
            fill="#7c8794" opacity=".2"/>
      <!-- hooded front sight, on the tube -->
      <path d="M54 26 c11 -12 29 -12 40 0 v16 h-40 z" fill="#20242a"/>
      <path d="M70 30 h7 v14 h-7 z" fill="#0b0d10"/>
      <!-- cocking tube along the top, with the handle bent up off it -->
      <path d="M92 38 h136 v14 h-136 z" fill="#2f353d"/>
      <path d="M196 24 h30 c6 0 9 3 9 9 v7 h-39 z" fill="#4a515b"/>
      <path d="M196 24 h30 c6 0 9 3 9 9 v2 h-39 z" fill="#8d97a5" opacity=".35"/>
      <!-- rotary drum rear sight -->
      <path d="M300 18 c16 0 27 11 27 27 c0 8 -4 15 -11 19 h-32
               c-7 -4 -11 -11 -11 -19 c0 -16 11 -27 27 -27 z" fill="#20242a"/>
      <circle cx="300" cy="42" r="8" fill="#0b0d10"/>
      <circle cx="300" cy="42" r="14" fill="none" stroke="#3d434c" stroke-width="2.5"/>
      <!-- ejection port and the two receiver pins -->
      <path d="M272 68 h60 c4.5 0 7 2.5 7 7 v18 c0 4.5 -2.5 7 -7 7 h-60
               c-4.5 0 -7 -2.5 -7 -7 v-18 c0 -4.5 2.5 -7 7 -7 z" fill="#101317"/>
      <path d="M272 90 h60 c4.5 0 7 2.5 7 7 v-3 c0 4.5 -2.5 7 -7 7 h-60
               c-4.5 0 -7 -2.5 -7 -7 z" fill="#8d97a5" opacity=".2"/>
      <circle cx="372" cy="76" r="6.5" fill="#3d434c"/>
      <circle cx="372" cy="102" r="6.5" fill="#3d434c"/>
      <!-- magazine: long, curved, raked forward of the grip -->
      <path d="M330 120 h62 l26 100 c2.4 9 -2 15 -11 15 h-48 c-9 0 -14 -5 -15 -13 z"
            fill="url(#pgMag)"/>
      <path d="M330 120 h15 l24 115 h-13 c-9 0 -14 -5 -15 -13 z"
            fill="#8d97a5" opacity=".22"/>
      <g fill="#0b0d10" opacity=".4">
        <rect x="344" y="150" width="56" height="4.5" rx="2"/>
        <rect x="351" y="178" width="56" height="4.5" rx="2"/>
        <rect x="358" y="206" width="56" height="4.5" rx="2"/>
      </g>
      <!-- grip frame: guard and grip cut as one piece, hung off the tube -->
      <path fill-rule="evenodd" fill="url(#pgPoly)"
            d="M400 120 h96 v24 h-11 c-3 32 -16 45 -37 45 c-22 0 -34 -14 -37 -45 h-11 z
               M424 144 h54 c-2 22 -11 32 -26 32 c-16 0 -26 -10 -28 -32 z"/>
      <path d="M430 146 h15 v32 h-15 z" fill="#20242a"/>
      <path d="M478 118 h48 c9 0 13 6 11 14 l-24 94 c-2 9 -9 13 -18 13 h-32
               c-9 0 -13 -6 -11 -14 l15 -94 c1.4 -9 5 -13 11 -13 z" fill="url(#pgPoly)"/>
      <path d="M478 118 h14 l-26 121 h-8 c-9 0 -13 -6 -11 -14 z"
            fill="#7c8794" opacity=".18"/>
      <path d="M484 142 c15 24 19 54 15 84 l-28 4 c7 -30 9 -60 5 -86 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- fixed stock, the same tube carried back and squared off -->
      <path d="M540 56 h156 c8 0 12 4 12 12 v40 c0 8 -4 12 -12 12 h-156 z"
            fill="url(#pgPolyLt)"/>
      <path d="M540 56 h156 c8 0 12 4 12 12 v4 h-168 z" fill="#7c8794" opacity=".2"/>
      <path d="M552 70 h130 v22 h-130 z" fill="#0b0d10" opacity=".22"/>
      <path d="M664 118 h44 v36 c0 7 -5 11 -12 11 h-20 c-7 0 -12 -4 -12 -11 z"
            fill="url(#pgPoly)"/>
      <path d="M664 118 h44 v4 h-44 z" fill="#8d97a5" opacity=".2"/>
    `,
  },

  // --- Bulldog .44 ----------------------------------------------------------
  // Charter Arms Bulldog: 7.2" overall, 5" tall, at 70 px/in. Same frame logic
  // as the Drover — one casting from barrel to hammer to grip frame — but a
  // 2.5" barrel, no rib, and the bobbed hammer the blurb calls out. A snub is
  // mostly cylinder and grip, which is the whole reason it looks like it does.
  bulldog: {
    box: [-8, -10, 520, 300],
    mounts: { rail: [250, 20], muzzle: [4, 60], under: [90, 100], mag: [262, 98] },
    body: `
      <path fill="url(#pgBlued)" d="
        M6 40 h190 v-4 h104 c7 0 12 5 12 12 v34
        c15 28 24 70 24 110 c0 14 -9 22 -24 22 h-62 c-15 0 -23 -9 -21 -23
        c3 -24 8 -45 14 -64 h-25 c-5 34 -21 51 -45 51 c-26 0 -41 -17 -45 -51
        h-26 v-26 h-34 v-18 h-66 z"/>
      <path d="M6 40 h190 v-4 h104 c7 0 12 5 12 12 v4 h-116 v-4 h-190 z"
            fill="#8d97a5" opacity=".28"/>
      <path d="M6 72 h190 v24 c0 4 -3 7 -8 7 h-174 c-5 0 -8 -3 -8 -7 z" fill="#20242a"/>
      <circle cx="20" cy="56" r="10" fill="#0b0d10"/>
      <path d="M34 22 h12 v18 h-12 z" fill="#20242a"/>
      <!-- cylinder in its window -->
      <path d="M196 58 h108 v80 h-108 z" fill="#12151a"/>
      <ellipse cx="250" cy="98" rx="52" ry="38" fill="url(#pgBlued)"/>
      <ellipse cx="250" cy="98" rx="52" ry="38" fill="none" stroke="#0b0d10" stroke-width="2.5"/>
      <g fill="#0b0d10" opacity=".55">
        <rect x="210" y="72" width="8" height="54" rx="4"/>
        <rect x="234" y="66" width="8" height="64" rx="4"/>
        <rect x="260" y="66" width="8" height="64" rx="4"/>
        <rect x="284" y="72" width="8" height="54" rx="4"/>
      </g>
      <ellipse cx="250" cy="78" rx="46" ry="10" fill="#8d97a5" opacity=".18"/>
      <!-- bobbed hammer: a rounded stub, nothing to snag -->
      <path d="M312 34 c18 0 28 10 28 26 c0 9 -4 15 -11 18 l-21 -10 z" fill="#2f353d"/>
      <path d="M234 124 h16 v34 h-16 z" fill="#20242a"/>
      <!-- the fat rubber grip a Bulldog is known for -->
      <path d="M320 108 c20 28 31 70 33 104 c1 13 -6 21 -18 21 h-48
               c-12 0 -18 -8 -16 -20 c5 -38 21 -76 40 -105 z" fill="url(#pgPoly)"/>
      <path d="M320 108 c20 28 31 70 33 104 c1 13 -6 21 -18 21 h-11
               c8 -46 -1 -90 -24 -120 z" fill="#0b0d10" opacity=".4"/>
      <path d="M311 134 c15 24 24 58 26 88 l-40 3 c3 -33 7 -64 14 -91 z"
            fill="url(#pgStipple)" opacity=".8"/>
    `,
  },

  // --- Frontier .45 ---------------------------------------------------------
  // Colt Single Action Army, 4.75" barrel: 11" overall, 5.5" tall, at 48 px/in.
  // Unchanged in a century and a half, and what makes it recognisable is all
  // outline: a plough-handle grip that sweeps back and down, the ejector rod
  // housing along the barrel, and a hammer standing up proud because there is
  // no other way to cock it.
  frontier: {
    box: [-8, -18, 556, 300],
    mounts: { rail: [280, 12], muzzle: [4, 56], under: [110, 96], mag: [286, 96] },
    body: `
      <path fill="url(#pgBlued)" d="
        M6 38 h214 v-6 h96 c7 0 12 5 12 12 v30
        c10 18 16 40 18 60 c2 22 -6 44 -24 62 c-10 10 -22 14 -34 12
        c-12 -2 -18 -10 -16 -22 c4 -26 10 -50 18 -70 h-20
        c-5 30 -20 45 -42 45 c-24 0 -38 -15 -42 -45 h-24 v-24 h-30 v-16 h-126 z"/>
      <path d="M6 38 h214 v-6 h96 c7 0 12 5 12 12 v4 h-108 v-4 h-214 z"
            fill="#8d97a5" opacity=".28"/>
      <path d="M6 70 h214 v22 c0 4 -3 6 -7 6 h-200 c-4 0 -7 -2 -7 -6 z" fill="#20242a"/>
      <circle cx="19" cy="54" r="9" fill="#0b0d10"/>
      <!-- ejector rod housing, slung under the barrel on the right -->
      <path d="M40 96 h150 c5 0 8 3 8 8 v12 c0 5 -3 8 -8 8 h-150
               c-5 0 -8 -3 -8 -8 v-12 c0 -5 3 -8 8 -8 z" fill="#2f353d"/>
      <path d="M40 96 h150 c5 0 8 3 8 8 v2 h-166 c0 -6 3 -10 8 -10 z"
            fill="#8d97a5" opacity=".25"/>
      <circle cx="36" cy="110" r="9" fill="#3d434c"/>
      <!-- cylinder: no flutes shadowed as deep, and the loading gate behind -->
      <path d="M220 56 h100 v78 h-100 z" fill="#12151a"/>
      <ellipse cx="270" cy="96" rx="48" ry="37" fill="url(#pgBlued)"/>
      <ellipse cx="270" cy="96" rx="48" ry="37" fill="none" stroke="#0b0d10" stroke-width="2.5"/>
      <g fill="#0b0d10" opacity=".5">
        <rect x="234" y="70" width="7" height="52" rx="3.5"/>
        <rect x="256" y="64" width="7" height="64" rx="3.5"/>
        <rect x="280" y="64" width="7" height="64" rx="3.5"/>
        <rect x="302" y="70" width="7" height="52" rx="3.5"/>
      </g>
      <ellipse cx="270" cy="76" rx="42" ry="9" fill="#8d97a5" opacity=".18"/>
      <path d="M318 66 c10 0 16 6 16 16 v22 c0 10 -6 16 -16 16 z" fill="#2f353d"/>
      <!-- hammer, standing tall with a checkered spur -->
      <path d="M326 32 c22 -6 36 6 38 26 c1 12 -5 20 -14 24 l-24 -14 z"
            fill="#2f353d"/>
      <g fill="#0b0d10" opacity=".6">
        <rect x="334" y="36" width="22" height="3.4" rx="1.7"/>
        <rect x="337" y="44" width="22" height="3.4" rx="1.7"/>
      </g>
      <path d="M248 122 h15 v32 h-15 z" fill="#20242a"/>
      <!-- plough handle: sweeps back and DOWN, which is the whole silhouette -->
      <path d="M340 118
               c11 21 16 45 16 66 c0 23 -10 41 -28 52 c-9 5 -17 3 -20 -5
               c-3 -9 0 -15 7 -20 c12 -9 17 -23 17 -43 c0 -18 -3 -34 -10 -50 z"
            fill="url(#pgWalnut)"/>
      <path d="M340 118 c11 21 16 45 16 66 c0 23 -10 41 -28 52 l-7 -5
               c16 -13 23 -30 23 -52 c0 -22 -4 -43 -13 -61 z"
            fill="#3d2313" opacity=".45"/>
      <path d="M336 134 c8 18 12 38 12 54 c0 18 -7 32 -20 41 l-10 -12
               c11 -9 16 -23 16 -41 c0 -14 -3 -29 -8 -41 z"
            fill="url(#pgGrain)" opacity=".5"/>
    `,
  },

  // --- Coachman -------------------------------------------------------------
  // Side-by-side coach gun: 37" overall on 20" barrels, at 20 px/in. Two
  // things kept going wrong here. The action was drawn in bright steel, which
  // made it the loudest thing in a catalogue of dark guns; and the stock was
  // drawn as a solid wedge, which is a boot, not a stock. A shotgun butt is a
  // WRIST narrow enough to get a hand round, a comb running back level, and a
  // butt plate a good three inches deeper than the wrist — the undercut under
  // the comb is what makes it read as wood somebody shaped.
  coachman: {
    box: [-10, -16, 760, 244],
    mounts: { rail: [430, 40], muzzle: [6, 62], under: [250, 100], mag: [470, 110] },
    body: `
      <!-- twin barrels, one over the other in side view -->
      <path d="M8 48 h396 v24 h-396 z" fill="url(#pgBlued)"/>
      <path d="M8 48 h396 v5 h-396 z" fill="#8d97a5" opacity=".25"/>
      <path d="M8 76 h396 v24 h-396 z" fill="url(#pgBlued)"/>
      <path d="M8 76 h396 v4 h-396 z" fill="#8d97a5" opacity=".18"/>
      <path d="M8 72 h396 v5 h-396 z" fill="#0b0d10" opacity=".55"/>
      <circle cx="18" cy="52" r="5" fill="#c9d3de"/>
      <path d="M4 48 h10 v52 h-10 z" fill="#20242a"/>
      <!-- splinter forend, under the barrels where the hand goes -->
      <path d="M210 94 h154 c8 0 12 4 11 12 l-5 30 c-1 8 -6 12 -14 12 h-140
               c-8 0 -12 -4 -11 -12 l5 -30 c1 -8 6 -12 14 -12 z" fill="url(#pgWalnut)"/>
      <path d="M210 94 h154 c8 0 12 4 11 12 l-5 30 c-1 8 -6 12 -14 12 h-140
               c-8 0 -12 -4 -11 -12 l5 -30 c1 -8 6 -12 14 -12 z" fill="url(#pgGrain)"/>
      <path d="M210 94 h154 c7 0 11 3 11 8 h-178 c1 -5 5 -8 13 -8 z"
            fill="#a4652f" opacity=".3"/>
      <!-- the action: blued, like the rest of the gun -->
      <path d="M396 40 h116 c11 0 16 5 16 16 v66 c0 11 -5 16 -16 16 h-116 z"
            fill="url(#pgBlued)"/>
      <path d="M396 40 h116 c11 0 16 5 16 16 v4 h-132 z" fill="#8d97a5" opacity=".25"/>
      <path d="M396 40 h10 v98 h-10 z" fill="#4b525c"/>
      <!-- top lever, over the breech, thumbed to the side to open it -->
      <path d="M438 24 h44 c6 0 9 3 9 9 v7 h-62 v-7 c0 -6 3 -9 9 -9 z" fill="#3d434c"/>
      <path d="M438 24 h44 c6 0 9 3 9 9 v2 h-62 c0 -8 3 -11 9 -11 z"
            fill="#b6c0cc" opacity=".25"/>
      <!-- hinge pin and the fences either side of the breech -->
      <circle cx="404" cy="112" r="9" fill="#5a626d"/>
      <circle cx="404" cy="112" r="4" fill="#0b0d10"/>
      <path d="M420 56 h80 v28 h-80 z" fill="#101317" opacity=".5"/>
      <!-- trigger guard with TWO triggers, one barrel each -->
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M430 138 h106 v20 h-10 c-4 30 -18 42 -43 42 c-24 0 -37 -13 -41 -42 h-12 z
               M454 158 h62 c-3 20 -12 30 -30 30 c-18 0 -29 -10 -32 -30 z"/>
      <path d="M462 158 h12 v28 h-12 z" fill="#20242a"/>
      <path d="M484 158 h12 v28 h-12 z" fill="#20242a"/>
      <!-- The stock. Comb back and level, wrist cut narrow behind the action,
           butt plate three inches deeper than the wrist, toe below the bore. -->
      <path d="M516 44
               C580 47 664 54 714 59
               c13 1 19 8 19 20
               v70
               c0 12 -6 19 -19 20
               C668 176 610 152 580 116
               C568 102 544 94 516 94 z" fill="url(#pgWalnut)"/>
      <path d="M516 44
               C580 47 664 54 714 59
               c13 1 19 8 19 20
               v70
               c0 12 -6 19 -19 20
               C668 176 610 152 580 116
               C568 102 544 94 516 94 z" fill="url(#pgGrain)"/>
      <path d="M516 44 C580 47 664 54 714 59 c9 1 15 4 17 10
               C666 61 586 51 518 47 z" fill="#a4652f" opacity=".32"/>
      <!-- the hollow under the comb, which is what says "shaped" -->
      <path d="M516 94 c28 0 54 8 64 22 l-16 10 c-10 -12 -26 -18 -48 -18 z"
            fill="#26150a" opacity=".42"/>
      <!-- chequered panel on the wrist -->
      <path d="M560 62 h62 v34 h-62 z" fill="url(#pgStipple)" opacity=".5"/>
      <!-- butt plate -->
      <path d="M714 59 c13 1 19 8 19 20 v70 c0 12 -6 19 -19 20 l-6 .4 v-110 z"
            fill="#15171b"/>
      <path d="M706 59 h8 v111 h-8 z" fill="#d5dde6" opacity=".2"/>
    `,
  },

  // --- Vigil .308 -----------------------------------------------------------
  // Remington 700 with a 24" barrel: 41.5" overall, at 17 px/in. The blurb says
  // it comes with glass, so the scope is part of the gun rather than an
  // attachment — it is drawn here and the rail mount sits on top of it.
  //
  // A bolt gun's silhouette is a long thin barrel, a short fat action, and a
  // stock with a comb high enough to get your eye behind that glass.
  vigil: {
    box: [-10, -46, 748, 244],
    mounts: { rail: [356, -30], muzzle: [6, 74], under: [210, 104], mag: [372, 128] },
    body: `
      <!-- barrel: heavy, tapering, and most of the gun -->
      <path d="M8 64 h300 v22 h-300 z" fill="url(#pgBlued)"/>
      <path d="M8 64 h300 v4 h-300 z" fill="#8d97a5" opacity=".22"/>
      <path d="M308 58 h34 v34 h-34 z" fill="url(#pgBlued)"/>
      <circle cx="17" cy="75" r="8" fill="#0b0d10"/>
      <path d="M2 62 h12 v26 h-12 z" fill="#2f353d"/>
      <!-- action: short, square, with the ejection port and bolt on it -->
      <path d="M342 52 h132 c8 0 12 4 12 12 v44 c0 8 -4 12 -12 12 h-132 z"
            fill="url(#pgBlued)"/>
      <path d="M342 52 h132 c8 0 12 4 12 12 v4 h-144 z" fill="#8d97a5" opacity=".22"/>
      <path d="M378 62 h56 c4 0 6 2 6 6 v14 c0 4 -2 6 -6 6 h-56 c-4 0 -6 -2 -6 -6 v-14
               c0 -4 2 -6 6 -6 z" fill="#101317"/>
      <!-- bolt handle, swept down and back: the tell for a bolt gun -->
      <path d="M436 88 h30 c5 0 8 3 8 8 l6 26 c2 8 -3 13 -11 13 c-8 0 -13 -5 -15 -13
               l-6 -24 h-12 z" fill="url(#pgSteelDark)"/>
      <circle cx="470" cy="130" r="12" fill="url(#pgSteelDark)"/>
      <circle cx="470" cy="130" r="12" fill="none" stroke="#2a2e34" stroke-width="2"/>
      <!-- glass, on rings, above the action -->
      <path d="M300 -34 h230 c9 0 14 5 14 14 v30 c0 9 -5 14 -14 14 h-230
               c-9 0 -14 -5 -14 -14 v-30 c0 -9 5 -14 14 -14 z" fill="url(#pgBlued)"/>
      <path d="M300 -34 h230 c9 0 14 5 14 14 v4 h-258 c0 -11 5 -18 14 -18 z"
            fill="#8d97a5" opacity=".25"/>
      <path d="M270 -40 h34 v46 h-34 z" fill="#2f353d"/>
      <path d="M528 -40 h30 v46 h-30 z" fill="#2f353d"/>
      <ellipse cx="276" cy="-17" rx="7" ry="19" fill="#1b3a4a"/>
      <ellipse cx="274" cy="-17" rx="4" ry="15" fill="#3f7f9b" opacity=".6"/>
      <!-- turret and rings -->
      <path d="M394 -46 h34 v14 h-34 z" fill="#3d434c"/>
      <path d="M352 -36 h26 v46 h-26 z" fill="#20242a"/>
      <path d="M470 -36 h26 v46 h-26 z" fill="#20242a"/>
      <!-- trigger, guard and the box magazine in front of it -->
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M392 120 h92 v16 h-8 c-4 24 -16 34 -36 34 c-22 0 -34 -11 -38 -34 h-10 z
               M414 136 h52 c-3 14 -11 21 -25 21 c-15 0 -25 -7 -27 -21 z"/>
      <path d="M432 138 h12 v28 h-12 z" fill="#20242a"/>
      <path d="M356 120 h42 v40 c0 6 -4 10 -10 10 h-22 c-6 0 -10 -4 -10 -10 z"
            fill="#2f353d"/>
      <!-- Stock. It was drawn in the same tone as the receiver and the grip,
           which made the whole back half one dark mass with no shape in it.
           Lifted a tone, with a comb running back level, the wrist cut in
           behind the action, and a butt plate deeper than the wrist. -->
      <path d="M486 52
               C536 55 604 62 648 68
               c13 2 19 9 19 21
               v56
               c0 12 -6 19 -19 21
               C608 172 556 156 528 128
               C518 118 502 112 486 112 z" fill="url(#pgPolyLt)"/>
      <path d="M486 52 C536 55 604 62 648 68 c9 1 15 4 17 10
               C606 70 540 60 488 56 z" fill="#8d97a5" opacity=".25"/>
      <path d="M486 112 c17 0 33 6 43 17 l-13 11 c-7 -8 -17 -13 -30 -13 z"
            fill="#0b0d10" opacity=".4"/>
      <path d="M540 76 h72 v34 h-72 z" fill="#0b0d10" opacity=".3"/>
      <path d="M500 128 h52 c8 0 12 5 10 13 l-12 62 c-2 8 -8 12 -16 12 h-30
               c-8 0 -12 -5 -10 -13 l6 -62 c1 -8 4 -12 6 -12 z" fill="url(#pgPoly)"/>
      <path d="M506 148 c13 20 16 46 12 66 l-25 3 c7 -23 8 -46 3 -68 z"
            fill="url(#pgStipple)" opacity=".7"/>
      <path d="M648 68 c13 2 19 9 19 21 v56 c0 12 -6 19 -19 21 l-7 1 v-98 z"
            fill="#15171b"/>
      <path d="M641 68 h7 v99 h-7 z" fill="#d5dde6" opacity=".2"/>
    `,
  },

  // --- Grease .45 -----------------------------------------------------------
  // M3 "grease gun": 29.8" with the stock out, 8" tall, at 24 px/in. The whole
  // thing is a stamped tube with a wire stock — it was designed to be cheap,
  // and drawing it any prettier than that would be wrong.
  grease: {
    box: [-10, -14, 736, 268],
    mounts: { rail: [300, 30], muzzle: [8, 76], under: [190, 120], mag: [330, 214] },
    body: `
      <path d="M60 52 h330 c10 0 16 6 16 16 v56 c0 10 -6 16 -16 16 h-330
               c-10 0 -16 -6 -16 -16 v-56 c0 -10 6 -16 16 -16 z" fill="url(#pgBlued)"/>
      <path d="M60 52 h330 c10 0 16 6 16 16 v4 h-362 c0 -12 6 -20 16 -20 z"
            fill="#8d97a5" opacity=".2"/>
      <path d="M44 128 h362 c0 10 -6 16 -16 16 h-330 c-10 0 -16 -6 -16 -16 z"
            fill="#0b0d10" opacity=".4"/>
      <path d="M10 74 h40 v26 h-40 z" fill="#2a2e34"/>
      <circle cx="18" cy="87" r="8" fill="#0b0d10"/>
      <path d="M46 40 h10 v16 h-10 z" fill="#20242a"/>
      <path d="M300 34 h14 v20 h-14 z" fill="#20242a"/>
      <!-- the oiler-cap ejection cover, hinged on top -->
      <path d="M180 44 h96 c6 0 9 3 9 9 v6 h-114 v-6 c0 -6 3 -9 9 -9 z" fill="#2f353d"/>
      <circle cx="330" cy="90" r="10" fill="#3d434c"/>
      <!-- straight stick magazine, straight down -->
      <path d="M296 140 h68 v90 c0 8 -5 12 -13 12 h-42 c-8 0 -13 -4 -13 -12 z"
            fill="url(#pgMag)"/>
      <path d="M296 140 h14 v102 h-1 c-8 0 -13 -4 -13 -12 z" fill="#8d97a5" opacity=".2"/>
      <g fill="#0b0d10" opacity=".4">
        <rect x="304" y="168" width="52" height="4.5" rx="2"/>
        <rect x="304" y="192" width="52" height="4.5" rx="2"/>
      </g>
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M384 140 h92 v22 h-10 c-3 30 -16 42 -35 42 c-21 0 -32 -13 -35 -42 h-12 z
               M406 162 h52 c-2 20 -11 30 -25 30 c-15 0 -25 -10 -27 -30 z"/>
      <path d="M414 164 h14 v30 h-14 z" fill="#20242a"/>
      <path d="M458 138 h44 c8 0 12 5 10 13 l-18 74 c-2 8 -8 12 -16 12 h-28
               c-8 0 -12 -5 -10 -13 l12 -74 c1 -8 4 -12 6 -12 z" fill="url(#pgPoly)"/>
      <path d="M464 158 c12 20 15 46 11 70 l-24 3 c6 -25 7 -50 3 -73 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- wire stock: two rails and a bar, nothing more -->
      <g fill="none" stroke="#3d434c" stroke-width="10" stroke-linecap="round">
        <path d="M406 70 h270"/>
        <path d="M406 116 h270"/>
      </g>
      <path d="M672 60 c22 0 34 14 34 38 c0 24 -12 38 -34 38 z" fill="none"
            stroke="#3d434c" stroke-width="10" stroke-linecap="round"/>
    `,
  },

  // --- Spectre .45 ----------------------------------------------------------
  // Spectre M4: 23" with the stock out, 9" tall, at 26 px/in. Folding stock
  // over the top, and the four-column magazine that makes it fat and short —
  // which is the only thing anybody remembers about it.
  spectre: {
    box: [-10, -16, 650, 288],
    mounts: { rail: [300, 24], muzzle: [8, 72], under: [180, 116], mag: [340, 214] },
    body: `
      <path d="M56 50 h330 c10 0 16 6 16 16 v54 c0 10 -6 16 -16 16 h-330
               c-10 0 -16 -6 -16 -16 v-54 c0 -10 6 -16 16 -16 z" fill="url(#pgPoly)"/>
      <path d="M56 50 h330 c10 0 16 6 16 16 v4 h-362 c0 -12 6 -20 16 -20 z"
            fill="#7c8794" opacity=".2"/>
      <path d="M12 70 h44 v28 h-44 z" fill="#2a2e34"/>
      <circle cx="20" cy="84" r="8" fill="#0b0d10"/>
      <g fill="#0b0d10" opacity=".45">
        <rect x="70" y="62" width="120" height="5" rx="2.5"/>
        <rect x="70" y="74" width="120" height="5" rx="2.5"/>
        <rect x="70" y="86" width="120" height="5" rx="2.5"/>
      </g>
      <path d="M46 30 c10 -12 28 -12 38 0 v16 h-38 z" fill="#20242a"/>
      <path d="M290 24 h34 v22 h-34 z" fill="#20242a"/>
      <circle cx="307" cy="36" r="6" fill="#0b0d10"/>
      <path d="M250 60 h56 c4 0 6 2 6 6 v16 c0 4 -2 6 -6 6 h-56 c-4 0 -6 -2 -6 -6 v-16
               c0 -4 2 -6 6 -6 z" fill="#101317"/>
      <!-- the fat four-column magazine -->
      <path d="M296 136 h92 v84 c0 9 -6 14 -15 14 h-62 c-9 0 -15 -5 -15 -14 z"
            fill="url(#pgMag)"/>
      <path d="M296 136 h18 v98 h-3 c-9 0 -15 -5 -15 -14 z" fill="#8d97a5" opacity=".2"/>
      <g fill="#0b0d10" opacity=".38">
        <rect x="306" y="162" width="72" height="5" rx="2.5"/>
        <rect x="306" y="186" width="72" height="5" rx="2.5"/>
      </g>
      <path fill-rule="evenodd" fill="url(#pgPoly)"
            d="M396 136 h88 v22 h-10 c-3 30 -15 42 -34 42 c-20 0 -31 -13 -34 -42 h-10 z
               M418 158 h50 c-2 20 -10 30 -24 30 c-15 0 -24 -10 -26 -30 z"/>
      <path d="M426 160 h14 v30 h-14 z" fill="#20242a"/>
      <path d="M468 134 h44 c8 0 12 5 10 13 l-18 76 c-2 8 -8 12 -16 12 h-28
               c-8 0 -12 -5 -10 -13 l12 -76 c1 -8 4 -12 6 -12 z" fill="url(#pgPoly)"/>
      <path d="M474 156 c12 20 15 48 11 72 l-24 3 c6 -26 7 -52 3 -75 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- stock folded over the top, which is where it lives -->
      <path d="M402 34 h200 c8 0 12 4 12 12 v10 c0 8 -4 12 -12 12 h-200 z"
            fill="url(#pgPolyLt)"/>
      <path d="M402 34 h200 c8 0 12 4 12 12 v3 h-212 z" fill="#8d97a5" opacity=".25"/>
      <path d="M594 68 h26 v56 c0 8 -5 12 -13 12 c-8 0 -13 -4 -13 -12 z"
            fill="url(#pgPoly)"/>
    `,
  },

  // --- Streetsweeper --------------------------------------------------------
  // Armsel Striker: 31" overall, 9" tall, at 23 px/in. A 12-round spring-wound
  // drum bolted to the side of a short shotgun. The drum IS the gun — it is
  // most of the mass and all of the silhouette.
  streetsweeper: {
    box: [-12, -16, 700, 300],
    mounts: { rail: [280, 26], muzzle: [8, 62], under: [150, 100], mag: [300, 150] },
    body: `
      <path d="M10 48 h230 v28 h-230 z" fill="url(#pgBlued)"/>
      <path d="M10 48 h230 v5 h-230 z" fill="#8d97a5" opacity=".22"/>
      <circle cx="22" cy="62" r="10" fill="#0b0d10"/>
      <path d="M2 44 h14 v36 h-14 z" fill="#2f353d"/>
      <!-- receiver -->
      <path d="M236 44 h150 c9 0 14 5 14 14 v52 c0 9 -5 14 -14 14 h-150 z"
            fill="url(#pgBlued)"/>
      <path d="M236 44 h150 c9 0 14 5 14 14 v4 h-164 z" fill="#8d97a5" opacity=".22"/>
      <path d="M120 30 h10 v18 h-10 z" fill="#20242a"/>
      <path d="M338 24 h34 v20 h-34 z" fill="#20242a"/>
      <!-- the drum, hung under and forward, with its winding key -->
      <circle cx="300" cy="150" r="74" fill="url(#pgPoly)"/>
      <circle cx="300" cy="150" r="74" fill="none" stroke="#0b0d10" stroke-width="3"/>
      <circle cx="300" cy="150" r="52" fill="none" stroke="#0b0d10" stroke-width="2" opacity=".6"/>
      <g fill="#12151a" opacity=".7">
        <circle cx="300" cy="96" r="11"/><circle cx="338" cy="112" r="11"/>
        <circle cx="354" cy="150" r="11"/><circle cx="338" cy="188" r="11"/>
        <circle cx="300" cy="204" r="11"/><circle cx="262" cy="188" r="11"/>
        <circle cx="246" cy="150" r="11"/><circle cx="262" cy="112" r="11"/>
      </g>
      <circle cx="300" cy="150" r="18" fill="#3d434c"/>
      <path d="M292 132 h16 v36 h-16 z" fill="#2a2e34"/>
      <path d="M282 142 h36 v16 h-36 z" fill="#2a2e34"/>
      <path d="M240 96 a74 74 0 0 1 46 -22 l2 14 a60 60 0 0 0 -36 18 z"
            fill="#8d97a5" opacity=".18"/>
      <!-- foregrip out front, since there is nowhere else to hold it -->
      <path d="M150 76 h44 c7 0 11 4 11 11 v40 c0 7 -4 11 -11 11 h-44
               c-7 0 -11 -4 -11 -11 v-40 c0 -7 4 -11 11 -11 z" fill="url(#pgPoly)"/>
      <g fill="#0b0d10" opacity=".45">
        <rect x="146" y="88" width="52" height="5" rx="2.5"/>
        <rect x="146" y="102" width="52" height="5" rx="2.5"/>
        <rect x="146" y="116" width="52" height="5" rx="2.5"/>
      </g>
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M382 124 h92 v22 h-10 c-3 30 -16 42 -35 42 c-21 0 -32 -13 -35 -42 h-12 z
               M404 146 h52 c-2 20 -11 30 -25 30 c-15 0 -25 -10 -27 -30 z"/>
      <path d="M412 148 h14 v30 h-14 z" fill="#20242a"/>
      <path d="M456 122 h48 c9 0 13 5 11 14 l-20 80 c-2 9 -9 13 -18 13 h-30
               c-9 0 -13 -5 -11 -14 l14 -80 c1.5 -9 5 -13 6 -13 z" fill="url(#pgPoly)"/>
      <path d="M462 144 c13 22 16 52 12 76 l-26 3 c7 -27 8 -54 4 -79 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- folding wire stock over the top -->
      <g fill="none" stroke="#3d434c" stroke-width="11" stroke-linecap="round">
        <path d="M396 36 h216"/>
      </g>
      <path d="M604 26 c24 0 36 10 36 28 c0 18 -12 28 -36 28 z" fill="none"
            stroke="#3d434c" stroke-width="11" stroke-linecap="round"/>
    `,
  },

  // --- Warden .45 -----------------------------------------------------------
  // M1911A1: 8.625" overall, 5.5" tall, at 52 px/in — a 448 x 286 field.
  // Longer and slimmer than the Glock, squarer slide, exposed hammer, and a
  // slightly flatter rearward grip rake.
  warden: {
    box: [-6, -8, 470, 306],
    mounts: { rail: [190, 4], muzzle: [0, 34], under: [110, 88], mag: [366, 268] },
    body: `
      <!-- barrel bushing and recoil spring plug -->
      <path d="M0 12 h28 v48 h-28 z" fill="url(#pgSteelDark)"/>
      <circle cx="12" cy="26" r="7.6" fill="#0b0d10"/>
      <circle cx="12" cy="48" r="6.4" fill="#3a4048"/>
      <!-- slide: rounded top, unlike the Glock's flat one -->
      <path d="M6 6 h370 c9 0 14 5 14 14 v26 c0 9 -5 14 -14 14 h-370
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-42.8 c0 -3.4 2.2 -5.6 5.6 -5.6 z"
            fill="url(#pgBlued)"/>
      <path d="M6 6 h370 c9 0 14 5 14 14 v1.6 c-4 -7 -10 -10.6 -19 -10.6 h-370.6
               c0 -3.4 2.2 -5 5.6 -5 z" fill="#8d97a5" opacity=".38"/>
      <path d="M0 54 h390 c-1 4 -6 6 -14 6 h-370 c-3.4 0 -5.6 -1.6 -5.6 -4 z"
            fill="#0b0d10" opacity=".35"/>
      <path d="M222 14 h80 c3.4 0 5.6 2.2 5.6 5.6 v15 c0 3.4 -2.2 5.6 -5.6 5.6 h-80
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-15 c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="#101317"/>
      <g fill="#101317" opacity=".7">
        <rect x="324" y="12" width="5" height="44" rx="2.4"/>
        <rect x="336" y="12" width="5" height="44" rx="2.4"/>
        <rect x="348" y="12" width="5" height="44" rx="2.4"/>
        <rect x="360" y="12" width="5" height="44" rx="2.4"/>
        <rect x="372" y="12" width="5" height="44" rx="2.4"/>
      </g>
      <path d="M26 -4 h12 v10 h-12 z" fill="#2a2e34"/>
      <path d="M354 -4 h26 v10 h-26 z" fill="#2a2e34"/>
      <path d="M363 -4 h8 v8 h-8 z" fill="#0b0d10"/>
      <!-- hammer: a spur on a pivot, behind the slide -->
      <path d="M390 16 c15 1.6 24 10.6 25.6 24 c1.2 10 -3.8 16.6 -13 18
               l-2.6 -12.6 c3.8 -.8 5.6 -3.8 5 -8 c-1.2 -8 -7 -12.6 -16 -13.2 z"
            fill="url(#pgBlued)"/>
      <path d="M390 16 c15 1.6 24 10.6 25.6 24 l-5.6 .6 c-1.8 -10.4 -9 -16.6 -20 -17.2 z"
            fill="#8d97a5" opacity=".32"/>
      <circle cx="394" cy="48" r="7.6" fill="#3a4048"/>
      <circle cx="394" cy="48" r="3.2" fill="#101317"/>
      <!-- grip safety, sweeping down into the backstrap -->
      <path d="M362 44 h26 c14 0 22 8 24 22 l5 24 c-8 -18 -22 -28 -40 -30
               l-15 -1.4 z" fill="url(#pgBlued)"/>
      <!-- thumb safety and slide stop -->
      <path d="M330 60 h44 c4.4 0 6.6 2.2 6.6 6.6 c0 4.4 -2.2 6.6 -6.6 6.6 h-44 z"
            fill="url(#pgSteelDark)"/>
      <circle cx="176" cy="70" r="7.4" fill="url(#pgSteelDark)"/>
      <!-- frame: same blued steel as the slide -->
      <path d="M38 60 h130 v26 h-130 c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-14.8
               c0 -3.4 2.2 -5.6 5.6 -5.6 z" fill="url(#pgBlued)"/>
      <path d="M38 60 h130 v3 h-135.6 c0 -1.8 2.2 -3 5.6 -3 z" fill="#8d97a5" opacity=".28"/>
      <!-- trigger guard: round, the 1911 signature -->
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M164 60 h122 v22 h-13 c-3.4 34 -18 49 -42 49 c-24 0 -38 -15 -42 -49 h-25
               c-3.4 0 -5.6 -2.2 -5.6 -5.6 v-10.8 c0 -3.4 2.2 -5.6 5.6 -5.6 z
               M188 82 h72 c-3 26 -14 37 -33 37 c-20 0 -32 -11 -36 -37 z"/>
      <path d="M188 82 h10 c2.6 23 11 33 26 35 l-2 12 c-24 -3 -33 -20 -35 -47 z"
            fill="#12151a" opacity=".5"/>
      <!-- trigger, long and flat with its face grooves -->
      <path d="M196 84 h18 v32 h-18 z" fill="url(#pgSteelDark)"/>
      <g fill="#0b0d10" opacity=".65">
        <rect x="198" y="88" width="14" height="2.6"/>
        <rect x="198" y="97" width="14" height="2.6"/>
        <rect x="198" y="106" width="14" height="2.6"/>
      </g>
      <!-- grip frame: the same rearward rake, a touch flatter -->
      <path d="M286 82
               C290 138 306 218 326 270
               c1.6 4 5.4 6 9.6 5
               l92 -21 c4.6 -1 7 -4.8 6 -9.4
               C420 190 400 132 386 78
               c-1.4 -4.8 -5 -7.2 -10.2 -7.2 h-77 c-9.6 0 -13.2 6 -12.8 11.2 z"
            fill="url(#pgBlued)"/>
      <!-- walnut grip panel, checkered, with its screw -->
      <path d="M300 108 C306 162 320 224 336 264 l78 -18
               C400 200 384 150 370 102 c-1.2 -4 -4 -6 -8 -5.2 l-56 4
               c-4 .4 -6.6 3.4 -6 7.2 z" fill="url(#pgWalnut)"/>
      <path d="M300 108 C306 162 320 224 336 264 l78 -18
               C400 200 384 150 370 102 c-1.2 -4 -4 -6 -8 -5.2 l-56 4
               c-4 .4 -6.6 3.4 -6 7.2 z" fill="url(#pgStipple)"/>
      <circle cx="356" cy="182" r="9" fill="#2f1c0e"/>
      <circle cx="356" cy="182" r="4.6" fill="#9fa9b6" opacity=".5"/>
      <!-- mainspring housing, grooved, down the backstrap -->
      <g stroke="#0b0d10" stroke-width="3.4" opacity=".45" fill="none">
        <path d="M392 100 l4 15"/><path d="M404 146 l4 15"/><path d="M416 192 l4 15"/>
      </g>
      <!-- magazine floorplate -->
      <path d="M328 266 l98 -22 c4.6 -1 7.8 1.4 8.8 6 l1.8 9 c1 4.6 -1.4 8.2 -6 9.2
               l-94 20 c-4.6 1 -8 -1.4 -9 -5.8 l-1.8 -8.4 c-1 -4.6 1.4 -8 1.2 -8 z"
            fill="url(#pgSteelDark)"/>
      <path d="M324 274 l112 -25 .8 3.8 -112 25 z" fill="#9fa9b6" opacity=".3"/>
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

  // --- Adder Bullpup --------------------------------------------------------
  // Steyr AUG: 31.1" overall on a 20" barrel, 11" tall with a magazine in, at
  // 24 px/in. The whole point of a bullpup is that the action sits BEHIND the
  // trigger, so the trigger is unusually far forward and the magazine is almost
  // at the butt — get those two wrong and it just reads as a short rifle.
  adder: {
    box: [-10, -18, 776, 300],
    mounts: { rail: [400, 30], muzzle: [8, 86], under: [200, 128], mag: [520, 246] },
    body: `
      <!-- barrel, out front of the housing -->
      <path d="M46 77 h176 v20 h-176 z" fill="url(#pgSteelDark)"/>
      <path d="M46 77 h176 v4 h-176 z" fill="#b6c0cc" opacity=".22"/>
      <path d="M8 72 h40 v30 h-40 z" fill="#2a2e34"/>
      <circle cx="18" cy="87" r="8" fill="#0b0d10"/>
      <path d="M140 62 h30 v52 h-30 z" fill="#2f353d"/>
      <path d="M146 50 h18 v14 h-18 z" fill="#20242a"/>
      <!-- ONE moulded housing: trigger group, action and butt are all this part -->
      <path d="M206 58 h520 c12 0 18 6 18 18 v96 c0 12 -6 18 -18 18 h-520
               c-12 0 -18 -6 -18 -18 v-96 c0 -12 6 -18 18 -18 z"
            fill="url(#pgPoly)"/>
      <path d="M206 58 h520 c12 0 18 6 18 18 v5 h-556 c0 -16 6 -23 18 -23 z"
            fill="#7c8794" opacity=".22"/>
      <!-- the hump: optic housing / carry handle, the AUG's whole silhouette -->
      <path d="M296 34 h212 c10 0 15 5 15 14 v10 h-242 v-10 c0 -9 5 -14 15 -14 z"
            fill="url(#pgPolyLt)"/>
      <path d="M296 34 h212 c10 0 15 5 15 14 v3 h-242 c0 -12 5 -17 15 -17 z"
            fill="#8d97a5" opacity=".25"/>
      <circle cx="306" cy="46" r="9" fill="#101317"/>
      <circle cx="306" cy="46" r="5" fill="#4e6a86" opacity=".8"/>
      <circle cx="512" cy="46" r="9" fill="#101317"/>
      <!-- folding vertical foregrip, under the barrel where it belongs -->
      <path d="M176 100 h48 c8 0 12 5 12 13 v56 c0 8 -4 12 -12 12 h-48
               c-8 0 -12 -4 -12 -12 v-56 c0 -8 4 -13 12 -13 z" fill="url(#pgPoly)"/>
      <path d="M172 116 h32 c6 20 7 42 4 60 h-34 c4 -19 3 -40 -2 -60 z"
            fill="url(#pgStipple)" opacity=".7"/>
      <!-- the housing is a big moulded slab; these are the seams and the port -->
      <path d="M230 152 h480 v5 h-480 z" fill="#0b0d10" opacity=".35"/>
      <path d="M560 66 h96 c5 0 8 3 8 8 v22 c0 5 -3 8 -8 8 h-96 c-5 0 -8 -3 -8 -8
               v-22 c0 -5 3 -8 8 -8 z" fill="#101317"/>
      <path d="M672 70 h40 v14 h-40 z" fill="#4b525c"/>
      <!-- trigger, well forward of the action -->
      <path fill-rule="evenodd" fill="url(#pgPoly)"
            d="M340 190 h100 v20 h-10 c-3 26 -15 36 -32 36 c-19 0 -29 -11 -32 -36 h-12 z
               M362 210 h56 c-2 17 -10 25 -23 25 c-14 0 -22 -8 -24 -25 z"/>
      <path d="M372 192 h14 v26 h-14 z" fill="#20242a"/>
      <!-- magazine, almost at the butt -->
      <path d="M478 180 h84 v62 c0 9 -6 14 -15 14 h-54 c-9 0 -15 -5 -15 -14 z"
            fill="url(#pgPoly)"/>
      <path d="M478 180 h16 v76 h-1 c-9 0 -15 -5 -15 -14 z" fill="#8d97a5" opacity=".2"/>
      <path d="M494 200 h52 v42 h-52 z" fill="#0b0d10" opacity=".3"/>
      <!-- butt pad -->
      <path d="M726 58 c12 0 18 6 18 18 v96 c0 12 -6 18 -18 18 l-6 -1 v-130 z"
            fill="#15171b"/>
      <path d="M722 58 h6 v132 h-6 z" fill="#d5dde6" opacity=".18"/>
    `,
  },

  // --- Praetor .308 ---------------------------------------------------------
  // FN FAL: 43" overall on a 21" barrel, at 19 px/in. Half the gun is forward
  // of the receiver — laid out short it reads as a carbine, which is what the
  // first pass did. The other half of the job is the stock: a battle rifle's
  // butt is in line with the bore with a comb and a wrist, not a plank.
  praetor: {
    box: [-12, -22, 850, 272],
    mounts: { rail: [500, 44], muzzle: [8, 82], under: [300, 122], mag: [486, 226] },
    body: `
      <!-- flash hider -->
      <path d="M8 68 h50 v32 h-50 z" fill="#2f353d"/>
      <g fill="#0b0d10">
        <rect x="16" y="72" width="7" height="10" rx="2"/>
        <rect x="32" y="72" width="7" height="10" rx="2"/>
        <rect x="16" y="86" width="7" height="10" rx="2"/>
        <rect x="32" y="86" width="7" height="10" rx="2"/>
      </g>
      <!-- 21" of barrel: most of the gun sits forward of the action -->
      <path d="M56 74 h300 v20 h-300 z" fill="url(#pgSteelDark)"/>
      <path d="M56 74 h300 v4 h-300 z" fill="#b6c0cc" opacity=".2"/>
      <!-- gas block and the front sight on top of it -->
      <path d="M86 58 h26 v22 h-26 z" fill="#2f353d"/>
      <path d="M94 40 h10 v18 h-10 z" fill="#20242a"/>
      <path d="M88 40 h22 v6 h-22 z" fill="#20242a"/>
      <!-- ribbed handguard -->
      <path d="M214 60 h182 c9 0 14 5 14 14 v34 c0 9 -5 14 -14 14 h-182
               c-9 0 -14 -5 -14 -14 v-34 c0 -9 5 -14 14 -14 z" fill="url(#pgPoly)"/>
      <path d="M214 60 h182 c9 0 14 5 14 14 v4 h-210 c0 -13 5 -18 14 -18 z"
            fill="#7c8794" opacity=".2"/>
      <g fill="#0b0d10" opacity=".42">
        <rect x="208" y="72" width="192" height="5" rx="2.5"/>
        <rect x="208" y="85" width="192" height="5" rx="2.5"/>
        <rect x="208" y="98" width="192" height="5" rx="2.5"/>
      </g>
      <!-- receiver -->
      <path d="M392 52 h234 c11 0 16 5 16 16 v62 c0 11 -5 16 -16 16 h-234
               c-11 0 -16 -5 -16 -16 v-62 c0 -11 5 -16 16 -16 z" fill="url(#pgBlued)"/>
      <path d="M392 52 h234 c11 0 16 5 16 16 v4 h-266 c0 -15 5 -20 16 -20 z"
            fill="#8d97a5" opacity=".22"/>
      <!-- dust cover, with the carry handle folded flat on it -->
      <path d="M416 42 h172 c7 0 11 4 11 11 v-1 h-194 c0 -7 4 -10 11 -10 z"
            fill="#3d434c"/>
      <path d="M438 30 h124 c8 0 12 4 12 12 h-148 c0 -8 4 -12 12 -12 z" fill="#2a2e34"/>
      <path d="M436 30 h8 v12 h-8 z" fill="#20242a"/>
      <!-- rear sight -->
      <path d="M600 34 h20 v18 h-20 z" fill="#20242a"/>
      <!-- charging handle, forward on the left side -->
      <path d="M400 62 h70 v13 h-70 z" fill="#4b525c"/>
      <path d="M400 62 h70 v4 h-70 z" fill="#7c8794" opacity=".3"/>
      <!-- 20 rounds of .308: a steel box, raked forward the way it rocks in -->
      <path d="M440 144 h98 l-13 68 c-1.5 8 -7 12 -15 12 h-48 c-8 0 -13 -4 -12 -12 z"
            fill="url(#pgMag)"/>
      <path d="M440 144 h18 l-11 80 h-3 c-8 0 -13 -4 -12 -12 z" fill="#8d97a5" opacity=".2"/>
      <g fill="#0b0d10" opacity=".35">
        <rect x="450" y="164" width="78" height="5" rx="2.5" transform="rotate(-6 489 166)"/>
        <rect x="447" y="188" width="74" height="5" rx="2.5" transform="rotate(-6 484 190)"/>
      </g>
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M546 144 h96 v22 h-10 c-3 30 -16 42 -36 42 c-22 0 -33 -13 -36 -42 h-14 z
               M570 166 h54 c-2 20 -11 30 -26 30 c-16 0 -26 -10 -28 -30 z"/>
      <path d="M578 168 h14 v30 h-14 z" fill="#20242a"/>
      <path d="M620 142 h50 c9 0 13 5 11 14 l-18 76 c-2 9 -9 13 -18 13 h-30
               c-9 0 -13 -5 -11 -14 l14 -76 c1.6 -9 5 -13 6 -13 z" fill="url(#pgPoly)"/>
      <path d="M626 164 c13 22 16 50 12 74 l-26 3 c7 -26 8 -52 4 -77 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- Straight stock, in line with the bore. Cut like a stock: the wrist is
           narrow where the hand goes, the comb runs back level, and the butt
           drops below the bore line at the toe. A plain rectangle here is what
           made the first pass look like a plank screwed on the back. -->
      <path d="M622 52 h158 c12 0 18 6 18 18
               v68 c0 12 -6 18 -18 18 h-58
               c-30 0 -52 -10 -66 -30
               c-8 -12 -20 -18 -34 -18 z" fill="url(#pgWalnut)"/>
      <path d="M622 52 h158 c12 0 18 6 18 18
               v68 c0 12 -6 18 -18 18 h-58
               c-30 0 -52 -10 -66 -30
               c-8 -12 -20 -18 -34 -18 z" fill="url(#pgGrain)"/>
      <path d="M622 52 h158 c9 0 14 3 16 10 C736 56 676 54 624 54 z"
            fill="#a4652f" opacity=".3"/>
      <!-- the undercut behind the wrist, shaded so the shape reads -->
      <path d="M622 108 c14 0 26 6 34 18 l-14 9 c-6 -9 -12 -13 -20 -13 z"
            fill="#26150a" opacity=".42"/>
      <path d="M700 78 h56 v24 h-56 z" fill="#26150a" opacity=".4"/>
      <path d="M780 52 c12 0 18 6 18 18 v68 c0 12 -6 18 -18 18 l-8 0 v-104 z"
            fill="#15171b"/>
      <path d="M774 52 h7 v104 h-7 z" fill="#d5dde6" opacity=".2"/>
    `,
  },

  // --- Longshot .50 ---------------------------------------------------------
  // Barrett M82A1: 57" overall on a 29" barrel, 13" tall with glass, at 15
  // px/in. Almost five feet of gun, so it is drawn LONG and low — the mistake
  // would be to make it look chunky, because at this length it doesn't.
  longshot: {
    box: [-12, -22, 900, 300],
    mounts: { rail: [570, 26], muzzle: [8, 96], under: [214, 138], mag: [530, 232] },
    body: `
      <!-- the arrowhead muzzle brake, the one part everyone recognises -->
      <path d="M6 78 h74 v40 h-74 l14 -20 z" fill="#2f353d"/>
      <g fill="#0b0d10">
        <rect x="26" y="82" width="8" height="10" rx="2"/>
        <rect x="46" y="82" width="8" height="10" rx="2"/>
        <rect x="26" y="104" width="8" height="10" rx="2"/>
        <rect x="46" y="104" width="8" height="10" rx="2"/>
      </g>
      <!-- fluted barrel -->
      <path d="M78 84 h382 v28 h-382 z" fill="url(#pgSteelDark)"/>
      <path d="M78 84 h382 v5 h-382 z" fill="#b6c0cc" opacity=".2"/>
      <g fill="#0b0d10" opacity=".35">
        <rect x="130" y="94" width="300" height="4"/>
        <rect x="130" y="102" width="300" height="4"/>
      </g>
      <!-- bipod, splayed -->
      <path d="M196 112 h34 v18 h-34 z" fill="#3d434c"/>
      <g stroke="#3d434c" stroke-width="9" stroke-linecap="round" fill="none">
        <path d="M208 128 l-44 78"/>
        <path d="M220 128 l44 78"/>
      </g>
      <path d="M144 202 h44 v10 h-44 z" fill="#2a2e34"/>
      <path d="M240 202 h44 v10 h-44 z" fill="#2a2e34"/>
      <!-- upper receiver: one long box the rail sits on and the stock leaves -->
      <path d="M454 66 h292 c12 0 18 6 18 18 v82 c0 12 -6 18 -18 18 h-292
               c-12 0 -18 -6 -18 -18 v-82 c0 -12 6 -18 18 -18 z" fill="url(#pgBlued)"/>
      <path d="M454 66 h292 c12 0 18 6 18 18 v5 h-328 c0 -17 6 -23 18 -23 z"
            fill="#8d97a5" opacity=".2"/>
      <g fill="#0b0d10" opacity=".4">
        <rect x="474" y="150" width="252" height="6" rx="3"/>
      </g>
      <!-- full-length top rail -->
      <path d="M410 52 h322 v14 h-322 z" fill="#2f353d"/>
      <g fill="#0b0d10" opacity=".5">
        <rect x="420" y="52" width="5" height="14"/>
        <rect x="446" y="52" width="5" height="14"/>
        <rect x="472" y="52" width="5" height="14"/>
        <rect x="498" y="52" width="5" height="14"/>
        <rect x="524" y="52" width="5" height="14"/>
        <rect x="550" y="52" width="5" height="14"/>
        <rect x="576" y="52" width="5" height="14"/>
        <rect x="602" y="52" width="5" height="14"/>
        <rect x="628" y="52" width="5" height="14"/>
        <rect x="654" y="52" width="5" height="14"/>
        <rect x="680" y="52" width="5" height="14"/>
        <rect x="706" y="52" width="5" height="14"/>
      </g>
      <!-- built-in glass, because it ships with it -->
      <path d="M492 18 h176 v26 h-176 z" fill="url(#pgSteelDark)"/>
      <path d="M476 12 h32 v38 h-32 z" fill="#2a2e34"/>
      <path d="M656 8 h40 v46 h-40 z" fill="#2a2e34"/>
      <circle cx="678" cy="31" r="15" fill="#101317"/>
      <circle cx="678" cy="31" r="10" fill="#4e6a86" opacity=".85"/>
      <path d="M506 44 h20 v12 h-20 z" fill="#3d434c"/>
      <path d="M634 44 h20 v12 h-20 z" fill="#3d434c"/>
      <!-- ten rounds of .50, and it shows -->
      <path d="M478 184 h104 v52 c0 10 -7 16 -17 16 h-70 c-10 0 -17 -6 -17 -16 z"
            fill="url(#pgMag)"/>
      <path d="M478 184 h20 v68 h-3 c-10 0 -17 -6 -17 -16 z" fill="#8d97a5" opacity=".2"/>
      <g fill="#0b0d10" opacity=".35">
        <rect x="490" y="202" width="80" height="6" rx="3"/>
        <rect x="490" y="222" width="80" height="6" rx="3"/>
      </g>
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M592 184 h92 v22 h-10 c-3 30 -16 42 -35 42 c-21 0 -32 -13 -35 -42 h-12 z
               M614 206 h52 c-2 20 -11 30 -25 30 c-15 0 -25 -10 -27 -30 z"/>
      <path d="M622 208 h14 v30 h-14 z" fill="#20242a"/>
      <path d="M662 182 h50 c9 0 13 5 11 14 l-18 72 c-2 9 -9 13 -18 13 h-30
               c-9 0 -13 -5 -11 -14 l12 -72 c1.6 -9 5 -13 6 -13 z" fill="url(#pgPoly)"/>
      <path d="M668 204 c13 22 16 48 12 70 l-26 3 c7 -25 8 -50 4 -75 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- skeleton butt with a monopod under it -->
      <path d="M764 66 h66 c12 0 18 6 18 18 v82 c0 12 -6 18 -18 18 h-66 z"
            fill="url(#pgPoly)"/>
      <path d="M764 66 h66 c12 0 18 6 18 18 v4 h-84 z" fill="#7c8794" opacity=".22"/>
      <path d="M776 94 h52 v46 h-52 z" fill="#0b0d10" opacity=".5"/>
      <path d="M830 66 c12 0 18 6 18 18 v82 c0 12 -6 18 -18 18 l-8 -1 v-116 z"
            fill="#15171b"/>
      <path d="M796 184 h18 v46 h-18 z" fill="#3d434c"/>
      <path d="M782 226 h46 v10 h-46 z" fill="#2a2e34"/>
    `,
  },

  // --- Whisper .300 ---------------------------------------------------------
  // Integrally suppressed bolt gun: 42" overall, at 19 px/in. "Integrally"
  // means the can is not screwed on the end — the barrel lives inside a tube
  // nearly two inches across that runs from the muzzle back to the receiver.
  // Drawn at barrel diameter it just looks like a rifle, which is what the
  // first pass looked like, so the shroud is the thickest thing on the gun.
  whisper: {
    box: [-12, -22, 840, 276],
    mounts: { rail: [430, 30], muzzle: [10, 88], under: [230, 132], mag: [420, 226] },
    body: `
      <!-- the shroud: one unbroken tube, muzzle to receiver, and FAT -->
      <path d="M18 54 h300 v68 h-300 c-8 0 -14 -6 -14 -14 v-40 c0 -8 6 -14 14 -14 z"
            fill="url(#pgSteelDark)"/>
      <path d="M18 54 h300 v9 h-310 c1 -6 5 -9 10 -9 z" fill="#b6c0cc" opacity=".2"/>
      <path d="M4 108 h314 v14 h-300 c-8 0 -14 -6 -14 -14 z" fill="#0b0d10" opacity=".35"/>
      <circle cx="16" cy="88" r="9" fill="#0b0d10"/>
      <!-- the welded end cap and the shoulder where it meets the barrel nut -->
      <path d="M4 54 h20 v68 h-20 z" fill="#20242a"/>
      <path d="M306 50 h24 v76 h-24 z" fill="#3d434c"/>
      <g fill="#0b0d10" opacity=".28">
        <rect x="44" y="70" width="252" height="4"/>
        <rect x="44" y="86" width="252" height="4"/>
        <rect x="44" y="102" width="252" height="4"/>
      </g>
      <!-- chassis handguard clamped around the back half of the shroud -->
      <path d="M168 46 h150 c9 0 14 5 14 14 v56 c0 9 -5 14 -14 14 h-150
               c-9 0 -14 -5 -14 -14 v-56 c0 -9 5 -14 14 -14 z" fill="url(#pgPoly)"/>
      <g fill="#0b0d10" opacity=".45">
        <rect x="176" y="56" width="18" height="58" rx="5"/>
        <rect x="208" y="56" width="18" height="58" rx="5"/>
        <rect x="240" y="56" width="18" height="58" rx="5"/>
        <rect x="272" y="56" width="18" height="58" rx="5"/>
        <rect x="304" y="56" width="18" height="58" rx="5"/>
      </g>
      <!-- receiver -->
      <path d="M326 52 h222 c11 0 16 5 16 16 v58 c0 11 -5 16 -16 16 h-222
               c-11 0 -16 -5 -16 -16 v-58 c0 -11 5 -16 16 -16 z" fill="url(#pgBlued)"/>
      <path d="M326 52 h222 c11 0 16 5 16 16 v4 h-254 c0 -15 5 -20 16 -20 z"
            fill="#8d97a5" opacity=".22"/>
      <!-- bolt handle: out of the receiver, swept back, knob on the end.
           This is the one shape that says bolt-action rather than semi. -->
      <path d="M498 96 h46 c9 0 15 6 15 15 v10 h-22 v-8 c0 -4 -2 -6 -6 -6 h-33 z"
            fill="#5a626d"/>
      <circle cx="548" cy="134" r="15" fill="#6d7684"/>
      <circle cx="544" cy="130" r="6" fill="#b6c0cc" opacity=".35"/>
      <!-- glass, on rings, because it ships with it -->
      <path d="M352 30 h186 v24 h-186 z" fill="url(#pgSteelDark)"/>
      <path d="M352 30 h186 v5 h-186 z" fill="#b6c0cc" opacity=".2"/>
      <path d="M336 24 h30 v36 h-30 z" fill="#2a2e34"/>
      <path d="M522 20 h36 v44 h-36 z" fill="#2a2e34"/>
      <circle cx="540" cy="42" r="14" fill="#101317"/>
      <circle cx="540" cy="42" r="9" fill="#4e6a86" opacity=".85"/>
      <path d="M372 54 h20 v12 h-20 z" fill="#3d434c"/>
      <path d="M494 54 h20 v12 h-20 z" fill="#3d434c"/>
      <!-- short box magazine -->
      <path d="M390 140 h72 v52 c0 9 -6 14 -15 14 h-42 c-9 0 -15 -5 -15 -14 z"
            fill="url(#pgPoly)"/>
      <path d="M390 140 h14 v66 h-1 c-9 0 -15 -5 -15 -14 z" fill="#8d97a5" opacity=".2"/>
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M474 140 h92 v22 h-10 c-3 28 -16 40 -35 40 c-21 0 -32 -12 -35 -40 h-12 z
               M496 162 h52 c-2 19 -11 28 -25 28 c-15 0 -25 -9 -27 -28 z"/>
      <path d="M504 164 h14 v28 h-14 z" fill="#20242a"/>
      <path d="M544 138 h48 c9 0 13 5 11 14 l-18 70 c-2 9 -9 13 -18 13 h-28
               c-9 0 -13 -5 -11 -14 l12 -70 c1.6 -9 5 -13 6 -13 z" fill="url(#pgPoly)"/>
      <path d="M550 160 c13 21 16 46 12 68 l-25 3 c7 -24 8 -48 4 -72 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- chassis stock: ONE piece, comb rising out of the body rather than
           parked on top of it, and a hook under the toe -->
      <path d="M556 52 h84 v-14 c0 -9 5 -14 14 -14 h84 c9 0 14 5 14 14 v14
               h30 c12 0 18 6 18 18 v68 c0 12 -6 18 -18 18 h-226 z"
            fill="url(#pgPolyLt)"/>
      <path d="M556 52 h84 v-14 c0 -9 5 -14 14 -14 h84 c9 0 14 5 14 14 v4
               h-112 v10 h-84 z" fill="#8d97a5" opacity=".25"/>
      <path d="M640 38 h12 v14 h-12 z" fill="#0b0d10" opacity=".3"/>
      <path d="M752 38 h12 v14 h-12 z" fill="#0b0d10" opacity=".3"/>
      <path d="M642 86 h72 v46 h-72 z" fill="#0b0d10" opacity=".42"/>
      <path d="M782 52 c12 0 18 6 18 18 v68 c0 12 -6 18 -18 18 l-8 -1 v-102 z"
            fill="#15171b"/>
      <path d="M776 52 h7 v104 h-7 z" fill="#d5dde6" opacity=".2"/>
      <path d="M706 156 h54 v22 c0 9 -6 14 -15 14 h-39 z" fill="url(#pgPoly)"/>
    `,
  },

  // --- Hammerfall -----------------------------------------------------------
  // Belt-fed GPMG on the M240 pattern: 49" overall on a 24" barrel, at 17
  // px/in. Two thirds of that length is BARREL — laid out with a long receiver
  // and a short barrel it reads as a bullpup, which is what the first pass did.
  // The other half of the job is the ammunition: a belt gun without a belt
  // hanging out of it in the open is just a heavy rifle.
  hammerfall: {
    box: [-14, -24, 920, 340],
    mounts: { rail: [510, 28], muzzle: [10, 84], under: [210, 126], mag: [400, 166] },
    body: `
      <path d="M8 68 h52 v34 h-52 z" fill="#2f353d"/>
      <g fill="#0b0d10">
        <rect x="18" y="72" width="7" height="11" rx="2"/>
        <rect x="38" y="72" width="7" height="11" rx="2"/>
        <rect x="18" y="88" width="7" height="11" rx="2"/>
        <rect x="38" y="88" width="7" height="11" rx="2"/>
      </g>
      <!-- 24" of heavy barrel, which is most of the gun -->
      <path d="M58 74 h360 v24 h-360 z" fill="url(#pgSteelDark)"/>
      <path d="M58 74 h360 v5 h-360 z" fill="#b6c0cc" opacity=".2"/>
      <g fill="#0b0d10" opacity=".3">
        <rect x="180" y="82" width="200" height="4"/>
        <rect x="180" y="90" width="200" height="4"/>
      </g>
      <path d="M78 60 h20 v18 h-20 z" fill="#2f353d"/>
      <path d="M82 44 h12 v18 h-12 z" fill="#20242a"/>
      <!-- quick-change carry handle, folded up over the barrel -->
      <path d="M196 40 h124 c9 0 14 5 14 14 v6 h-152 v-6 c0 -9 5 -14 14 -14 z"
            fill="#3d434c"/>
      <path d="M196 40 h124 c9 0 14 5 14 14 v3 h-152 c0 -12 5 -17 14 -17 z"
            fill="#b6c0cc" opacity=".2"/>
      <path d="M210 60 h16 v16 h-16 z" fill="#2a2e34"/>
      <!-- bipod on the barrel, out near the front -->
      <path d="M120 98 h34 v16 h-34 z" fill="#3d434c"/>
      <g stroke="#3d434c" stroke-width="10" stroke-linecap="round" fill="none">
        <path d="M131 112 l-48 96"/>
        <path d="M145 112 l48 96"/>
      </g>
      <path d="M62 204 h46 v10 h-46 z" fill="#2a2e34"/>
      <path d="M170 204 h46 v10 h-46 z" fill="#2a2e34"/>
      <!-- receiver: the box the belt feeds into and the stock comes out of -->
      <path d="M410 54 h240 c12 0 18 6 18 18 v78 c0 12 -6 18 -18 18 h-240
               c-12 0 -18 -6 -18 -18 v-78 c0 -12 6 -18 18 -18 z" fill="url(#pgBlued)"/>
      <path d="M410 54 h240 c12 0 18 6 18 18 v5 h-276 c0 -17 6 -23 18 -23 z"
            fill="#8d97a5" opacity=".2"/>
      <!-- top cover, hinged at the front, latched at the back -->
      <path d="M418 32 h214 c10 0 15 5 15 15 v7 h-244 v-7 c0 -10 5 -15 15 -15 z"
            fill="url(#pgSteelDark)"/>
      <path d="M418 32 h214 c10 0 15 5 15 15 v3 h-244 c0 -12 5 -18 15 -18 z"
            fill="#b6c0cc" opacity=".2"/>
      <circle cx="430" cy="44" r="7" fill="#0b0d10"/>
      <path d="M620 36 h24 v18 h-24 z" fill="#20242a"/>
      <path d="M590 14 h20 v18 h-20 z" fill="#20242a"/>
      <!-- feed tray mouth, so the belt has somewhere to come from -->
      <path d="M406 106 h38 v26 h-38 z" fill="#101317"/>
      <!-- the belt: a spine of links with a round across each one. Drawn as a
           single fat stroke it reads as a grey crescent, and with the rounds
           radiating outward it reads as a saw blade — both of which the first
           passes did. It has to hang and sag, and the rounds sit ACROSS it. -->
      <path d="M422 122 C384 168 352 238 398 304" fill="none" stroke="#252a31"
            stroke-width="15" stroke-linecap="round"/>
      <g>
        <g transform="translate(422.0 122.0) rotate(219.6)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(410.9 136.5) rotate(215.5)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(400.5 152.3) rotate(211.0)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(391.4 169.1) rotate(205.8)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(383.9 186.9) rotate(199.6)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(378.5 205.5) rotate(192.5)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(375.6 224.7) rotate(184.3)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(375.7 244.3) rotate(175.1)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(379.2 264.1) rotate(165.1)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(386.5 284.1) rotate(154.9)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
        <g transform="translate(398.0 304.0) rotate(145.1)">
          <rect x="-13" y="-8" width="22" height="16" rx="4" fill="#39404a"/>
          <rect x="2" y="-5.5" width="22" height="11" rx="2" fill="#c79a44"/>
          <path d="M24 -5.5 l11 5.5 l-11 5.5 z" fill="#a87f33"/>
          <rect x="2" y="-5.5" width="22" height="3.2" rx="1.6" fill="#e6c078" opacity=".5"/>
        </g>
      </g>
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M556 168 h96 v22 h-10 c-3 30 -16 42 -36 42 c-22 0 -33 -13 -36 -42 h-14 z
               M580 190 h54 c-2 20 -11 30 -26 30 c-16 0 -26 -10 -28 -30 z"/>
      <path d="M588 192 h14 v30 h-14 z" fill="#20242a"/>
      <path d="M630 166 h50 c9 0 13 5 11 14 l-18 74 c-2 9 -9 13 -18 13 h-30
               c-9 0 -13 -5 -11 -14 l12 -74 c1.6 -9 5 -13 6 -13 z" fill="url(#pgPoly)"/>
      <path d="M636 188 c13 22 16 50 12 72 l-26 3 c7 -26 8 -52 4 -77 z"
            fill="url(#pgStipple)" opacity=".75"/>
      <!-- buttstock with the shoulder hook under the toe -->
      <path d="M644 54 h178 c12 0 18 6 18 18 v78 c0 12 -6 18 -18 18 h-178 z"
            fill="url(#pgPoly)"/>
      <path d="M644 54 h178 c12 0 18 6 18 18 v4 h-196 z" fill="#7c8794" opacity=".22"/>
      <path d="M706 78 h82 v42 h-82 z" fill="#0b0d10" opacity=".38"/>
      <path d="M822 54 c12 0 18 6 18 18 v78 c0 12 -6 18 -18 18 l-8 -1 v-112 z"
            fill="#15171b"/>
      <path d="M816 54 h7 v114 h-7 z" fill="#d5dde6" opacity=".18"/>
      <path d="M706 168 h58 v22 c0 9 -6 14 -15 14 h-43 z" fill="url(#pgPoly)"/>
    `,
  },

  // --- Reaper LMG -----------------------------------------------------------
  // Squad gun on the RPK pattern: 40" overall on a 23" heavy barrel, at 20
  // px/in. A drum instead of a belt, which is why it is the cheaper one to
  // build — and the drum sitting proud under the receiver is the silhouette.
  reaper: {
    box: [-14, -20, 840, 320],
    mounts: { rail: [430, 44], muzzle: [10, 80], under: [200, 118], mag: [430, 148] },
    body: `
      <path d="M8 64 h42 v32 h-42 z" fill="#2f353d"/>
      <circle cx="20" cy="80" r="8" fill="#0b0d10"/>
      <!-- heavy barrel -->
      <path d="M48 70 h242 v22 h-242 z" fill="url(#pgSteelDark)"/>
      <path d="M48 70 h242 v5 h-242 z" fill="#b6c0cc" opacity=".2"/>
      <path d="M62 52 h20 v20 h-20 z" fill="#2f353d"/>
      <path d="M68 38 h10 v16 h-10 z" fill="#20242a"/>
      <!-- gas block and tube, high over the barrel -->
      <path d="M200 48 h30 v24 h-30 z" fill="#2f353d"/>
      <path d="M226 50 h104 v18 h-104 z" fill="#3d434c"/>
      <path d="M226 50 h104 v4 h-104 z" fill="#b6c0cc" opacity=".18"/>
      <!-- bipod, folded down off the front of the barrel -->
      <path d="M84 92 h30 v14 h-30 z" fill="#3d434c"/>
      <g stroke="#3d434c" stroke-width="9" stroke-linecap="round" fill="none">
        <path d="M93 104 l-40 92"/>
        <path d="M105 104 l40 92"/>
      </g>
      <path d="M34 192 h40 v9 h-40 z" fill="#2a2e34"/>
      <path d="M126 192 h40 v9 h-40 z" fill="#2a2e34"/>
      <!-- wooden handguard -->
      <path d="M232 74 h96 c8 0 12 4 12 12 v26 c0 8 -4 12 -12 12 h-96
               c-8 0 -12 -4 -12 -12 v-26 c0 -8 4 -12 12 -12 z" fill="url(#pgWalnut)"/>
      <path d="M232 74 h96 c8 0 12 4 12 12 v26 c0 8 -4 12 -12 12 h-96
               c-8 0 -12 -4 -12 -12 v-26 c0 -8 4 -12 12 -12 z" fill="url(#pgGrain)"/>
      <path d="M232 74 h96 c8 0 12 4 12 12 v3 h-120 c0 -11 4 -15 12 -15 z"
            fill="#b87c42" opacity=".35"/>
      <!-- receiver -->
      <path d="M322 58 h250 c11 0 16 5 16 16 v58 c0 11 -5 16 -16 16 h-250
               c-11 0 -16 -5 -16 -16 v-58 c0 -11 5 -16 16 -16 z" fill="url(#pgBlued)"/>
      <path d="M322 58 h250 c11 0 16 5 16 16 v4 h-282 c0 -15 5 -20 16 -20 z"
            fill="#8d97a5" opacity=".22"/>
      <path d="M336 44 h180 c7 0 11 4 11 11 v3 h-202 v-3 c0 -7 4 -11 11 -11 z"
            fill="#3d434c"/>
      <path d="M540 40 h22 v18 h-22 z" fill="#20242a"/>
      <!-- charging handle -->
      <path d="M566 66 h48 v14 h-48 z" fill="#4b525c"/>
      <!-- the drum, proud under the receiver -->
      <circle cx="430" cy="212" r="64" fill="url(#pgMag)"/>
      <circle cx="430" cy="212" r="64" fill="none" stroke="#0b0d10" stroke-width="3"/>
      <circle cx="430" cy="212" r="44" fill="none" stroke="#0b0d10" stroke-width="2" opacity=".55"/>
      <g fill="none" stroke="#0b0d10" stroke-width="3" opacity=".35">
        <path d="M430 158 a54 54 0 0 1 38 92"/>
        <path d="M430 176 a36 36 0 0 1 25 61"/>
      </g>
      <path d="M386 172 a64 64 0 0 1 30 -22 l5 14 a50 50 0 0 0 -23 17 z"
            fill="#8d97a5" opacity=".18"/>
      <path d="M394 148 h72 v24 h-72 z" fill="url(#pgMag)"/>
      <path d="M392 156 a64 64 0 0 1 32 -8 l0 14 a50 50 0 0 0 -24 6 z"
            fill="#8d97a5" opacity=".2"/>
      <circle cx="430" cy="212" r="15" fill="#3d434c"/>
      <path d="M422 197 h16 v30 h-16 z" fill="#2a2e34"/>
      <path fill-rule="evenodd" fill="url(#pgBlued)"
            d="M486 134 h92 v22 h-10 c-3 30 -16 42 -35 42 c-21 0 -32 -13 -35 -42 h-12 z
               M508 156 h52 c-2 20 -11 30 -25 30 c-15 0 -25 -10 -27 -30 z"/>
      <path d="M532 158 h14 v30 h-14 z" fill="#20242a"/>
      <path d="M556 130 h50 c9 0 13 5 11 14 l-18 76 c-2 9 -9 13 -18 13 h-30
               c-9 0 -13 -5 -11 -14 l12 -76 c1.6 -9 5 -13 6 -13 z" fill="url(#pgWalnut)"/>
      <path d="M556 130 h50 c9 0 13 5 11 14 l-18 76 c-2 9 -9 13 -18 13 h-30
               c-9 0 -13 -5 -11 -14 l12 -76 c1.6 -9 5 -13 6 -13 z" fill="url(#pgGrain)"/>
      <!-- Clubfoot stock. The RPK's is a straight comb with the wrist cut
           in hard behind the receiver and the toe swelling down at the back —
           that undercut is the whole shape. Drawn as a wedge that just gets
           fatter toward the butt it reads as a lump of wood, which it did. -->
      <path d="M590 58 H762 c11 0 17 6 17 17
               v70 c0 11 -6 17 -17 17 H700
               C672 162 650 146 640 122
               C632 104 616 94 590 92 z" fill="url(#pgWalnut)"/>
      <path d="M590 58 H762 c11 0 17 6 17 17
               v70 c0 11 -6 17 -17 17 H700
               C672 162 650 146 640 122
               C632 104 616 94 590 92 z" fill="url(#pgGrain)"/>
      <path d="M590 58 H762 c8 0 13 3 15 9 C716 63 650 60 592 60 z"
            fill="#a4652f" opacity=".3"/>
      <!-- the undercut, shaded so the wrist reads as cut away -->
      <path d="M590 92 c26 2 42 12 50 30 l-16 6 c-8 -16 -20 -24 -34 -26 z"
            fill="#26150a" opacity=".4"/>
      <!-- sling slot through the butt -->
      <path d="M672 96 h58 v26 h-58 z" fill="#26150a" opacity=".45"/>
      <path d="M762 58 c11 0 17 6 17 17 v70 c0 11 -6 17 -17 17 l-8 0 v-104 z"
            fill="#15171b"/>
      <path d="M756 58 h7 v104 h-7 z" fill="#d5dde6" opacity=".18"/>
    `,
  },
};

export const DETAIL_IDS = Object.keys(GUN_DETAIL);

// ---------------------------------------------------------------------------
// The attachments.
//
// A gun's drawing is fitted to the field, so every pattern ends up at a
// different scale. The parts are NOT — a scope authored per-gun would have to
// be redrawn twenty-two times. Instead each part is drawn once in its own
// space at a stated pixels-per-inch, and placed at the gun's own mount point:
//
// `mount`  which of the gun's four mount points it hangs on
// `scale`  native px -> field units (all authored at 20 px/in, so 0.08)
// `origin` the point in native space that lands ON the mount — for a can that
//          is its rear face, for a magazine the top of the body, for glass the
//          underside of the ring base. Get this wrong and the part floats.
// ---------------------------------------------------------------------------

const PART_SCALE = 0.08;

export const ATTACH_DETAIL = {
  optic: {
    mount: 'rail',
    scale: PART_SCALE,
    origin: [106, 88],
    body: `
      <!-- objective bell -->
      <path d="M6 8 h34 v54 h-34 c-4 0 -6 -2 -6 -6 v-42 c0 -4 2 -6 6 -6 z"
            fill="url(#pgSteelDark)"/>
      <path d="M6 8 h34 v6 h-40 c0 -4 2 -6 6 -6 z" fill="#b6c0cc" opacity=".22"/>
      <ellipse cx="7" cy="35" rx="6" ry="24" fill="#101317"/>
      <ellipse cx="8" cy="35" rx="4" ry="19" fill="#4e6a86" opacity=".85"/>
      <ellipse cx="7" cy="26" rx="2" ry="6" fill="#cfe3f2" opacity=".45"/>
      <!-- main tube -->
      <path d="M40 20 h128 v30 h-128 z" fill="url(#pgSteelDark)"/>
      <path d="M40 20 h128 v6 h-128 z" fill="#b6c0cc" opacity=".2"/>
      <!-- turret housing, with the elevation cap standing on top -->
      <path d="M88 14 h34 v42 h-34 z" fill="#3d434c"/>
      <path d="M94 0 h22 v14 h-22 z" fill="#2a2e34"/>
      <path d="M94 0 h22 v3 h-22 z" fill="#b6c0cc" opacity=".25"/>
      <!-- eyepiece -->
      <path d="M168 12 h34 c4 0 6 2 6 6 v34 c0 4 -2 6 -6 6 h-34 z"
            fill="url(#pgSteelDark)"/>
      <path d="M168 12 h34 c4 0 6 2 6 6 v4 h-40 z" fill="#b6c0cc" opacity=".22"/>
      <path d="M198 16 h8 v38 h-8 z" fill="#101317"/>
      <!-- rings and the base that clamps to the rail -->
      <path d="M56 18 h22 v60 h-22 z" fill="#2f353d"/>
      <path d="M132 18 h22 v60 h-22 z" fill="#2f353d"/>
      <path d="M50 76 h114 c4 0 6 2 6 6 v6 h-126 v-6 c0 -4 2 -6 6 -6 z" fill="#252a31"/>
    `,
  },

  suppressor: {
    mount: 'muzzle',
    scale: PART_SCALE,
    origin: [164, 17],
    extend: true,
    body: `
      <path d="M10 0 h150 v34 h-150 c-7 0 -10 -3 -10 -10 v-14 c0 -7 3 -10 10 -10 z"
            fill="url(#pgSteelDark)"/>
      <path d="M10 0 h150 v6 h-160 c1 -4 4 -6 10 -6 z" fill="#b6c0cc" opacity=".2"/>
      <path d="M0 28 h160 v6 h-150 c-7 0 -10 -3 -10 -10 z" fill="#0b0d10" opacity=".35"/>
      <circle cx="9" cy="17" r="6" fill="#0b0d10"/>
      <!-- the knurled band at the rear, where it screws on -->
      <path d="M140 0 h24 v34 h-24 z" fill="#3d434c"/>
      <g fill="#0b0d10" opacity=".45">
        <rect x="144" y="2" width="3" height="30"/>
        <rect x="151" y="2" width="3" height="30"/>
        <rect x="158" y="2" width="3" height="30"/>
      </g>
      <g fill="#0b0d10" opacity=".25">
        <rect x="26" y="9" width="104" height="3.5"/>
        <rect x="26" y="21" width="104" height="3.5"/>
      </g>
    `,
  },

  compensator: {
    mount: 'muzzle',
    scale: PART_SCALE,
    origin: [62, 19],
    extend: true,
    body: `
      <path d="M4 2 h58 v34 h-58 c-3 0 -4 -1 -4 -4 v-26 c0 -3 1 -4 4 -4 z"
            fill="#2f353d"/>
      <path d="M4 2 h58 v5 h-62 c0 -3 1 -5 4 -5 z" fill="#b6c0cc" opacity=".25"/>
      <circle cx="8" cy="19" r="6" fill="#0b0d10"/>
      <!-- the ports on top, which is the whole point of one -->
      <g fill="#0b0d10">
        <rect x="16" y="2" width="7" height="12" rx="2"/>
        <rect x="29" y="2" width="7" height="12" rx="2"/>
        <rect x="42" y="2" width="7" height="12" rx="2"/>
      </g>
      <g fill="#0b0d10" opacity=".5">
        <rect x="16" y="26" width="7" height="10" rx="2"/>
        <rect x="42" y="26" width="7" height="10" rx="2"/>
      </g>
    `,
  },

  extmag: {
    mount: 'mag',
    scale: PART_SCALE,
    origin: [16, 2],
    body: `
      <!-- a long stick, curved the way a high-capacity magazine has to be -->
      <path d="M0 0 h32 v96 c0 26 -6 44 -18 58 c-7 8 -17 8 -22 0
               c-5 -8 -4 -16 2 -24 c6 -8 8 -20 8 -36 z" fill="url(#pgMag)"/>
      <path d="M0 0 h12 v94 c0 18 -3 32 -9 42 c-5 -8 -4 -16 2 -24
               c6 -8 8 -20 8 -36 z" fill="#8d97a5" opacity=".22"/>
      <g fill="#0b0d10" opacity=".35">
        <rect x="5" y="26" width="22" height="5" rx="2.5"/>
        <rect x="5" y="50" width="22" height="5" rx="2.5"/>
        <rect x="5" y="74" width="22" height="5" rx="2.5"/>
        <rect x="4" y="98" width="22" height="5" rx="2.5"/>
      </g>
      <path d="M-8 148 c6 8 16 8 22 0 l4 8 c-10 12 -22 12 -30 0 z" fill="#20242a"/>
    `,
  },

  foregrip: {
    mount: 'under',
    scale: PART_SCALE,
    origin: [15, 0],
    body: `
      <path d="M0 0 h30 v10 h-30 z" fill="#3d434c"/>
      <path d="M2 10 h26 c4 0 6 3 6 7 v56 c0 10 -6 16 -19 16 c-13 0 -19 -6 -19 -16
               v-56 c0 -4 2 -7 6 -7 z" fill="url(#pgPoly)"/>
      <path d="M2 10 h26 c4 0 6 3 6 7 v3 h-38 c0 -7 2 -10 6 -10 z"
            fill="#7c8794" opacity=".22"/>
      <path d="M2 24 h30 v44 h-30 z" fill="url(#pgStipple)" opacity=".7"/>
      <path d="M-4 78 h38 c-2 8 -8 11 -19 11 c-11 0 -17 -3 -19 -11 z"
            fill="#15171b"/>
    `,
  },

  laser: {
    mount: 'under',
    scale: PART_SCALE,
    origin: [32, 0],
    body: `
      <path d="M4 0 h56 c4 0 6 2 6 6 v22 c0 4 -2 6 -6 6 h-56 c-4 0 -6 -2 -6 -6
               v-22 c0 -4 2 -6 6 -6 z" fill="url(#pgPoly)"/>
      <path d="M4 0 h56 c4 0 6 2 6 6 v3 h-68 c0 -6 2 -9 6 -9 z"
            fill="#7c8794" opacity=".25"/>
      <path d="M-10 10 h12 v14 h-12 z" fill="#2f353d"/>
      <circle cx="-6" cy="17" r="4.5" fill="#c8443c"/>
      <circle cx="-7" cy="16" r="2" fill="#ffb3ad" opacity=".8"/>
      <path d="M40 8 h16 v6 h-16 z" fill="#0b0d10" opacity=".5"/>
      <!-- the beam, so it reads as a laser and not a battery box -->
      <path d="M-12 17 h-40" stroke="#e0574f" stroke-width="3"
            stroke-linecap="round" opacity=".65"/>
    `,
  },
};

export const ATTACH_DETAIL_IDS = Object.keys(ATTACH_DETAIL);

/**
 * The transform that lands a part's origin on one of a gun's mount points.
 *
 * `at` is already in field coordinates — `mountInField` did that work — so the
 * only thing left is to back off by where the part's own origin sits inside
 * its native drawing, scaled.
 */
export function attachTransform(part, at) {
  const s = part.scale;
  const [ox, oy] = part.origin;
  return `translate(${(at[0] - ox * s).toFixed(3)} ${(at[1] - oy * s).toFixed(3)})`
    + ` scale(${s})`;
}

