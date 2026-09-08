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
    // Slide, frame, trigger guard, grip raked back the way a pistol sits.
    path: `
      M14 9 h30 a2 2 0 0 1 2 2 v4 h-4 v-2 h-24 v2 h-2 l-1 3
      h-6 l-4 9 h-7 l3 -12 a3 3 0 0 1 3 -2 h2 v-2 a2 2 0 0 1 2 -2 z
      M20 18 h9 a1 1 0 0 1 0 2 h-9 z
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
    // Flat-top receiver, handguard, angled magazine, collapsible stock.
    path: `
      M6 11 h34 v4 h-34 z
      M2 11 h4 v4 h-4 z
      M18 8 h14 v3 h-14 z
      M22 15 l3 10 h6 l-2 -10 z
      M40 10 h8 v7 h-8 z
      M48 11 h5 v5 h-5 z
      M53 10 h9 v7 h-9 z
      M36 17 h4 v5 h-4 z
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
    extmag: '21 14 13 16', foregrip: '12 14 7 11', laser: '9 14 20 7',
  };
  const paint = a.stroked
    ? `stroke="${color}" stroke-width="1.4" fill="none" stroke-linecap="round"`
    : `fill="${color}"`;
  return `<svg class="art art--attach" viewBox="${boxes[id] || '0 0 64 32'}"
    width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"
    ><path d="${a.path.replace(/\s+/g, ' ').trim()}" ${paint}/></svg>`;
}
