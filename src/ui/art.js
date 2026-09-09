// Artwork.
//
// Everything here is inline SVG on purpose. The game is build-free and static,
// the content-security rules block outside images, and a player on a phone
// shouldn't wait on a sprite sheet — so the pictures ship as geometry.
//
// Drawn as silhouettes on a 64x32 field (guns) or 32x32 (goods), because a
// side profile is what makes a shotgun read as a shotgun at 40 pixels wide.

const GUN_VIEWBOX = '0 0 64 32';

/**
 * Firearm categories, drawn in side profile. These match the four production
 * lines a firearms shop can be tooled for.
 */
export const GUN_ART = {
  handgun: {
    label: 'Handgun',
    // Muzzle left, grip raked back right — slide, frame, trigger guard, grip.
    // Kept inside the 64x32 field so nothing is cut off at small sizes.
    path: `
      M5 9 h40 a1 1 0 0 1 1 1 v5 a1 1 0 0 1 -1 1 h-40 z
      M9 7 h2 v2 h-2 z
      M18 16 h24 v4 h-24 z
      M32 20 h10 l3 10 h-11 z
      M22 20 h9 v2 h-7 l-2 3 h-2 z
    `,
  },
  shotgun: {
    label: 'Shotgun',
    // Long smooth barrel, pump under the fore-end, straight comb stock.
    path: `
      M2 12 h40 v3 h-40 z
      M10 15 h13 v4 h-13 z
      M42 11 h8 v6 h-8 z
      M50 12 l12 -3 v5 l-8 2 v6 l8 3 v4 l-12 -4 z
      M40 17 h4 v4 h-4 z
    `,
  },
  rifle: {
    label: 'Rifle',
    // Barrel and handguard, flat-top receiver with a rail, angled magazine,
    // raked pistol grip and — the part that was missing — a proper buttstock.
    // Without it the silhouette just read as an oversized handgun.
    path: `
      M2 12 h24 v4 h-24 z
      M26 10 h18 v7 h-18 z
      M24 8 h16 v2 h-16 z
      M30 17 l2 10 h6 l-2 -10 z
      M40 17 h6 l-2 9 h-6 z
      M44 11 h5 v6 h-5 z
      M49 12 h13 v5 h-13 z
      M49 17 h5 v3 h-5 z
    `,
  },
  smg: {
    label: 'Submachine Gun',
    // Compact, magazine through the grip, folding stock.
    path: `
      M6 12 h8 v4 h-8 z
      M14 10 h22 v7 h-22 z
      M16 8 h14 v2 h-14 z
      M20 17 l2 11 h6 l-2 -11 z
      M32 17 h6 l-2 9 h-6 z
      M36 11 h4 v5 h-4 z
      M40 12 h14 v3 h-14 z
      M54 10 h3 v8 h-3 z
    `,
  },
  revolver: {
    label: 'Revolver',
    // Cylinder, top strap and a rounded butt.
    path: `
      M8 12 h20 v4 h-20 z
      M28 10 a6 6 0 1 1 0 12 a6 6 0 0 1 0 -12 z
      M34 11 h10 v5 h-10 z
      M40 16 h6 l3 10 a5 5 0 0 1 -9 2 z
      M30 16 h8 v2 h-8 z
      M22 10 h4 v2 h-4 z
    `,
  },
  precision: {
    label: 'Precision Rifle',
    // Long heavy barrel, bipod, thumbhole stock.
    path: `
      M1 13 h30 v3 h-30 z
      M31 10 h14 v8 h-14 z
      M33 18 l1 8 h5 l-1 -8 z
      M45 11 h4 v7 h-4 z
      M49 12 h13 v5 h-13 z
      M49 17 h6 v4 h-6 z
      M12 16 l-4 8 M12 16 l4 8
    `,
  },
  machinegun: {
    label: 'Machine Gun',
    // Belt-fed, heavy barrel with a shroud, bipod and box.
    path: `
      M2 13 h6 v4 h-6 z
      M8 12 h4 v6 h-4 z M14 12 h4 v6 h-4 z M20 12 h4 v6 h-4 z
      M24 11 h20 v8 h-20 z
      M28 19 h10 v6 h-10 z
      M44 12 h5 v6 h-5 z
      M49 13 h12 v4 h-12 z
      M49 17 h5 v4 h-5 z
      M18 18 l-4 8 M18 18 l4 8
    `,
  },
  nfa: {
    label: 'NFA Item',
    // A suppressor can on a short barrel — the shape the tax stamp is for.
    path: `
      M4 10 h26 a3 3 0 0 1 3 3 v6 a3 3 0 0 1 -3 3 h-26 a3 3 0 0 1 -3 -3
      v-6 a3 3 0 0 1 3 -3 z
      M8 13 v6 M13 13 v6 M18 13 v6 M23 13 v6
      M33 13 h9 v6 h-9 z
      M42 11 h6 v10 h-6 z
      M48 14 h6 v4 h-6 z
      M54 12 l8 -2 v12 l-8 -2 z
    `,
    stroked: true,
  },
};

export const GUN_IDS = Object.keys(GUN_ART);

/**
 * One firearm, drawn. `size` is the width in pixels; height follows the
 * silhouette's 2:1 field.
 */
export function gunArt(id, { size = 56, color = 'currentColor', className = '' } = {}) {
  const art = GUN_ART[id] || GUN_ART.handgun;
  const stroke = art.stroked
    ? ` stroke="${color}" stroke-width="1.4" fill="none" stroke-linecap="round"`
    : ` fill="${color}"`;
  return `<svg class="art art--gun ${className}" viewBox="${GUN_VIEWBOX}"
    width="${size}" height="${Math.round(size / 2)}" aria-hidden="true"
    ><path d="${art.path.replace(/\s+/g, ' ').trim()}"${stroke}/></svg>`;
}

/**
 * What each product looks like. A player should be able to tell cannabis from
 * pills without reading, especially on a phone.
 */
export const PRODUCT_ART = {
  weed: {
    // A seven-leaflet fan, symmetrical about the stem.
    path: `
      M16 30 v-8
      M16 22 c-1 -4 -1 -8 0 -12 c1 4 1 8 0 12 z
      M16 21 c-3 -3 -5 -6 -6 -10 c3 2 5 5 6 10 z
      M16 21 c3 -3 5 -6 6 -10 c-3 2 -5 5 -6 10 z
      M16 23 c-4 -2 -7 -4 -9 -8 c4 1 7 3 9 8 z
      M16 23 c4 -2 7 -4 9 -8 c-4 1 -7 3 -9 8 z
      M16 25 c-4 -1 -8 -2 -10 -5 c4 0 8 1 10 5 z
      M16 25 c4 -1 8 -2 10 -5 c-4 0 -8 1 -10 5 z
    `,
    stroked: true,
  },
  shrooms: {
    // Domed cap, gills, tapering stem.
    path: `
      M6 15 a10 8 0 0 1 20 0 z
      M13 15 h6 v9 a3 3 0 0 1 -6 0 z
      M11 16 h10
    `,
  },
  hash: {
    // A pressed slab seen at an angle, scored across the top.
    path: `
      M6 12 l10 -5 l10 5 l-10 5 z
      M6 12 v8 l10 5 v-8 z
      M26 12 v8 l-10 5 v-8 z
      M10 10 l10 5 M12 9 l10 5
    `,
    stroked: true,
  },
  pills: {
    // Two capsules, one on its side.
    path: `
      M7 10 a4 4 0 0 1 6 5 l-5 5 a4 4 0 0 1 -6 -5 z
      M10 13 l-5 5
      M19 17 a4 4 0 0 1 6 5 l-1 1 a4 4 0 0 1 -6 -5 z
      M17 24 h12
    `,
    stroked: true,
  },
  iron: {
    // The firearms product uses the handgun silhouette, scaled to the square.
    path: GUN_ART.handgun.path,
    wide: true,
  },
};

/** One product, drawn. */
export function productArt(id, { size = 32, color = 'currentColor', className = '' } = {}) {
  const art = PRODUCT_ART[id];
  if (!art) return '';
  const box = art.wide ? GUN_VIEWBOX : '0 0 32 32';
  const w = art.wide ? size * 1.6 : size;
  const h = art.wide ? size * 0.8 : size;
  const paint = art.stroked
    ? ` stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"`
    : ` fill="${color}"`;
  return `<svg class="art art--product ${className}" viewBox="${box}"
    width="${Math.round(w)}" height="${Math.round(h)}" aria-hidden="true"
    ><path d="${art.path.replace(/\s+/g, ' ').trim()}"${paint}/></svg>`;
}


// --- Attachments ------------------------------------------------------------
//
// Drawn in the same 64x32 field as the guns so they composite straight on top.
// Each one sits where it would actually sit: an optic on the receiver, a can on
// the muzzle, a magazine below the well.

export const ATTACHMENT_ART = {
  optic: {
    label: 'Optic',
    // Tube sight on a mount, over the receiver.
    path: 'M22 2 h16 v5 h-16 z M25 7 h3 v3 h-3 z M33 7 h3 v3 h-3 z',
  },
  suppressor: {
    label: 'Suppressor',
    // A can forward of the muzzle.
    path: 'M-6 9 h10 v6 h-10 z M-3 9 v6 M0 9 v6',
    stroked: true,
    extend: true,
  },
  compensator: {
    label: 'Compensator',
    path: 'M-3 10 h6 v4 h-6 z M-1 8 v2 M1 8 v2',
    stroked: true,
    extend: true,
  },
  extmag: {
    label: 'Extended Magazine',
    // Hangs below the well, longer than standard.
    path: 'M22 15 l4 14 h7 l-3 -14 z',
  },
  foregrip: {
    label: 'Foregrip',
    path: 'M13 15 h4 v9 a2 2 0 0 1 -4 0 z',
  },
  laser: {
    label: 'Laser',
    path: 'M10 16 h6 v3 h-6 z M16 17 h12',
    stroked: true,
  },
};

export const ATTACHMENT_IDS = Object.keys(ATTACHMENT_ART);

/**
 * A firearm with whatever is bolted to it. The viewBox widens when something
 * hangs off the muzzle, so a suppressor isn't clipped.
 */
export function gunWithAttachments(gunId, fitted = [], opts = {}) {
  const { size = 72, color = 'currentColor', accent = null, className = '' } = opts;
  const art = GUN_ART[gunId] || GUN_ART.handgun;
  const list = (fitted || []).filter((id) => ATTACHMENT_ART[id]);
  const extends_ = list.some((id) => ATTACHMENT_ART[id].extend);
  const minX = extends_ ? -8 : 0;
  const width = extends_ ? 72 : 64;
  const box = `${minX} 0 ${width} 32`;

  const gun = art.stroked
    ? `<path d="${art.path.replace(/\s+/g, ' ').trim()}" stroke="${color}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
    : `<path d="${art.path.replace(/\s+/g, ' ').trim()}" fill="${color}"/>`;

  const parts = list.map((id) => {
    const a = ATTACHMENT_ART[id];
    const paint = a.stroked
      ? `stroke="${accent || color}" stroke-width="1.4" fill="none" stroke-linecap="round"`
      : `fill="${accent || color}"`;
    return `<path d="${a.path.replace(/\s+/g, ' ').trim()}" ${paint}/>`;
  }).join('');

  return `<svg class="art art--gun ${className}" viewBox="${box}"
    width="${size}" height="${Math.round((size / width) * 32)}" aria-hidden="true"
    >${gun}${parts}</svg>`;
}

/** One attachment on its own, for a card or a chip. */
export function attachmentArt(id, { size = 34, color = 'currentColor' } = {}) {
  const a = ATTACHMENT_ART[id];
  if (!a) return '';
  // Each is drawn in gun coordinates, so frame it tightly around itself.
  const boxes = {
    optic: '20 0 20 12', suppressor: '-7 7 12 10', compensator: '-4 6 10 10',
    extmag: '21 14 13 16', foregrip: '12 14 7 14', laser: '9 14 20 7',
  };
  const paint = a.stroked
    ? `stroke="${color}" stroke-width="1.4" fill="none" stroke-linecap="round"`
    : `fill="${color}"`;
  return `<svg class="art art--attach" viewBox="${boxes[id] || '0 0 64 32'}"
    width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"
    ><path d="${a.path.replace(/\s+/g, ' ').trim()}" ${paint}/></svg>`;
}


// --- Vehicles ---------------------------------------------------------------
//
// Side profile on the same 64x32 field as the guns. Every model in the
// dealership maps onto one of these bodies, so a box truck reads as a box
// truck at thumbnail size and a sports car doesn't look like a saloon.

export const VEHICLE_ART = {
  person: {
    label: 'On foot',
    path: `M32 5 a3.5 3.5 0 1 1 0 7 a3.5 3.5 0 0 1 0 -7 z
      M30 13 h4 l3 8 h-2.5 l-1.5 -4 v6 l3 9 h-3 l-3 -7.5 l-3 7.5 h-3 l3 -9 v-6 l-1.5 4 h-2.5 z`,
  },
  bicycle: {
    label: 'Bicycle',
    path: `M15 23 a6 6 0 1 0 0.1 0 z M49 23 a6 6 0 1 0 0.1 0 z
      M15 23 l9 -9 h11 l-5 9 z M32 14 l7 9 M28 12 h9 M49 23 l-9 -9 h-5`,
    stroked: true,
  },
  scooter: {
    label: 'Scooter',
    path: `M14 24 a5.5 5.5 0 1 0 0.1 0 z M50 24 a5.5 5.5 0 1 0 0.1 0 z
      M14 24 h7 a11 9 0 0 1 11 -9 h7 l5 9 h6
      M32 15 v-5 h8 M40 10 l5 -4`,
    stroked: true,
  },
  motorcycle: {
    label: 'Motorcycle',
    path: `M14 23 a6.5 6.5 0 1 0 0.1 0 z M50 23 a6.5 6.5 0 1 0 0.1 0 z
      M14 23 l10 -4 h11 l6 -7 h6 l4 11
      M24 19 l5 -8 h10 M41 12 h8`,
    stroked: true,
  },

  // Road vehicles all sit on the same ground line with real wheels — without
  // them a silhouette is just a lump and nothing reads as a car.
  hatchback: {
    label: 'Hatchback',
    path: `M9 21 v-4 l5 -5 h5 l4 -4 h10 l3 4 h7 l5 5 v4 z
      M13 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z
      M37 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z`,
  },
  sedan: {
    label: 'Saloon',
    path: `M5 21 v-4 l6 -4 h5 l5 -4 h12 l4 4 h7 l8 4 v4 z
      M11 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z
      M41 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z`,
  },
  sportscar: {
    label: 'Sports car',
    path: `M3 21 v-3 l7 -3 l7 -4 h14 l7 4 l9 3 v3 z
      M10 24 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 z
      M42 24 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 z`,
  },
  suv: {
    label: 'SUV',
    path: `M7 21 v-7 l4 -4 h5 l3 -3 h12 l3 3 h5 l5 4 v7 z
      M12 24 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0 z
      M38 24 a5.5 5.5 0 1 0 11 0 a5.5 5.5 0 1 0 -11 0 z`,
  },
  van: {
    label: 'Van',
    path: `M5 21 v-12 h26 v3 h6 l6 5 v4 z
      M10 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z
      M36 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z`,
  },
  boxtruck: {
    label: 'Box truck',
    path: `M4 21 v-16 h30 v16 z M34 21 v-8 l4 -4 h8 l6 5 v7 z
      M10 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z
      M40 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z`,
  },
  pickup: {
    label: 'Pickup',
    path: `M5 21 v-6 h18 v-6 l4 -4 h11 l4 4 h4 l4 6 v6 z
      M11 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z
      M37 24 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 z`,
  },
  semi: {
    label: 'Semi',
    path: `M2 21 v-17 h30 v17 z M32 21 v-9 l4 -5 h10 l7 6 v8 z
      M6 24 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 z
      M17 24 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 z
      M42 24 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 z`,
  },
  drone: {
    label: 'Drone',
    // Rotors on booms either side, with a package slung underneath.
    path: `M24 13 h16 v6 h-16 z
      M8 11 h10 M46 11 h10 M13 11 v-2 M51 11 v-2
      M18 11 l6 3 M46 11 l-6 3
      M28 19 v4 h8 v-4 M28 23 h8`,
    stroked: true,
  },
};

export const VEHICLE_ART_IDS = Object.keys(VEHICLE_ART);

/** Which drawing each model in the dealership uses. */
export const VEHICLE_BODY = {
  runner: 'person', jogger: 'person',
  bike: 'bicycle', ebike: 'bicycle',
  scooter: 'scooter', motorcycle: 'motorcycle',
  hatchback: 'hatchback', sedan: 'sedan', cab: 'sedan',
  suv: 'suv', luxury: 'sedan', sportscar: 'sportscar',
  minivan: 'van', van: 'van', chiller: 'van', luton: 'boxtruck',
  pickup: 'pickup', boxtruck: 'boxtruck', flatbed: 'pickup', semi: 'semi',
  drone: 'drone', heavylift: 'drone',
};

export function bodyFor(typeId) {
  return VEHICLE_BODY[typeId] || 'sedan';
}

/** One vehicle, drawn. */
export function vehicleArt(typeId, { size = 64, color = 'currentColor', className = '' } = {}) {
  const art = VEHICLE_ART[bodyFor(typeId)] || VEHICLE_ART.sedan;
  const paint = art.stroked
    ? ` stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"`
    : ` fill="${color}"`;
  return `<svg class="art art--vehicle ${className}" viewBox="0 0 64 32"
    width="${size}" height="${Math.round(size / 2)}" aria-hidden="true"
    ><path d="${art.path.replace(/\s+/g, ' ').trim()}"${paint}/></svg>`;
}
