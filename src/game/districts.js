// District generation. A hex grid is laid over the real map around whatever
// point the player picked, and every cell's character is derived from its true
// latitude/longitude — so the same corner of the world always produces the same
// city, and two players who start in the same place get the same map.

import { DISTRICT_RADIUS_KM, DISTRICT_RINGS, PRODUCTS, PRODUCT_IDS } from './constants.js';
import { fbm, hashUnit, clamp01, lerp } from './rng.js';
import { regionMultiplier } from './progression.js';
import {
  hexRing,
  hexCenterKm,
  hexCornersKm,
  localKmToLatLng,
  haversineKm,
} from './geo.js';

const NAME_HEADS = [
  'North', 'South', 'East', 'West', 'Upper', 'Lower', 'Old', 'New', 'Port', 'Fort',
];
const NAME_BODIES = [
  'Vale', 'Ridge', 'Harbor', 'Mill', 'Kings', 'Ash', 'Cedar', 'Granite', 'Iron',
  'Halden', 'Brook', 'Marsh', 'Foundry', 'Corby', 'Lark', 'Sable', 'Verde',
  'Halloway', 'Dunmore', 'Rookery', 'Basin', 'Quarry', 'Wexley', 'Tannery',
];
const NAME_TAILS = ['', '', '', ' Heights', ' Flats', ' Yard', ' Row', ' Point', ' Park', ' End'];

function proceduralName(lat, lng, i) {
  const k = Math.round((lat + lng) * 10000) + i * 7919;
  const a = hashUnit(k, i, 11);
  const b = hashUnit(k, i, 29);
  const c = hashUnit(k, i, 47);
  const d = hashUnit(k, i, 71);
  const body = NAME_BODIES[Math.floor(b * NAME_BODIES.length)];
  const tail = NAME_TAILS[Math.floor(c * NAME_TAILS.length)];
  const head = d < 0.28 ? NAME_HEADS[Math.floor(a * NAME_HEADS.length)] + ' ' : '';
  return `${head}${body}${tail}`;
}

/**
 * Build the district grid. `placeNames` is the (optional) list of real OSM
 * places; each is claimed by its nearest district so real neighbourhood names
 * land where they actually belong.
 */
export function generateDistricts(origin, placeNames = [], countryCode = null) {
  const cells = hexRing(DISTRICT_RINGS);
  const districts = cells.map((cell, i) => {
    const { x, y } = hexCenterKm(cell.q, cell.r, DISTRICT_RADIUS_KM);
    const center = localKmToLatLng(origin, x, y);
    const corners = hexCornersKm(x, y, DISTRICT_RADIUS_KM).map((p) =>
      localKmToLatLng(origin, p.x, p.y)
    );

    // Sample the noise field in degrees so the character of a district is tied
    // to its real position on Earth, not to its index in the grid.
    const nx = center.lng * 55;
    const ny = center.lat * 55;
    const distFromCore = Math.hypot(x, y) / (DISTRICT_RADIUS_KM * DISTRICT_RINGS * 1.75);

    // Density peaks at the centre of the play area and falls off outward.
    const density = clamp01(fbm(nx, ny, 101, 3) * 0.65 + (1 - clamp01(distFromCore)) * 0.55);
    const wealth = clamp01(fbm(nx + 40, ny - 17, 233, 3) * 0.9 + 0.05);
    // Money and police go together, with a lot of local variation.
    const policing = clamp01(wealth * 0.45 + fbm(nx - 80, ny + 61, 389, 2) * 0.55);
    const rentIndex = clamp01(wealth * 0.7 + density * 0.3);

    const demand = {};
    for (const pid of PRODUCT_IDS) {
      const p = PRODUCTS[pid];
      const field = fbm(nx + (pid === 'weed' ? 200 : -200), ny + 90, pid === 'weed' ? 521 : 733, 3);
      // Weed sells everywhere and skews to dense blocks; psilocybin skews to
      // wealthier, younger-money districts and is far pickier.
      const skew = pid === 'weed'
        ? density * 0.65 + field * 0.35
        : wealth * 0.5 + field * 0.5;
      const [lo, hi] = p.demandBase;
      demand[pid] = lerp(lo, hi, clamp01(skew * 0.85 + 0.1)) * lerp(0.55, 1.35, density)
        * regionMultiplier(countryCode, pid);
    }

    return {
      id: `d${i}`,
      index: i,
      q: cell.q,
      r: cell.r,
      name: proceduralName(center.lat, center.lng, i),
      realName: false,
      center,
      corners,
      // Static character
      density,
      wealth,
      policing,
      rentIndex,
      demandPerHour: demand,
      // Live state
      heat: 0,
      rep: 0,
      supply: Object.fromEntries(PRODUCT_IDS.map((p) => [p, 0])),
      supplyQuality: Object.fromEntries(PRODUCT_IDS.map((p) => [p, 0.5])),
      soldTotal: Object.fromEntries(PRODUCT_IDS.map((p) => [p, 0])),
      revenueTotal: 0,
      discovered: false,
    };
  });

  assignRealNames(districts, placeNames);
  linkNeighbours(districts);
  return districts;
}

// Axial hex neighbours. Stored as plain ids so a save stays JSON.
const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

function linkNeighbours(districts) {
  const byCell = new Map(districts.map((d) => [`${d.q},${d.r}`, d]));
  for (const d of districts) {
    d.neighbourIds = HEX_DIRS
      .map(([dq, dr]) => byCell.get(`${d.q + dq},${d.r + dr}`))
      .filter(Boolean)
      .map((n) => n.id);
  }
}

/**
 * Give each district the closest real place name. Better-ranked places (an
 * actual neighbourhood beats a whole borough) win ties, and no name is used
 * twice.
 */
function assignRealNames(districts, placeNames) {
  if (!placeNames.length) return;

  const claims = [];
  for (const place of placeNames) {
    let best = null;
    let bestKm = Infinity;
    for (const d of districts) {
      const km = haversineKm(d.center, place);
      if (km < bestKm) {
        bestKm = km;
        best = d;
      }
    }
    // Only claim if the place actually sits in (or right beside) the district.
    if (best && bestKm <= DISTRICT_RADIUS_KM * 1.25) {
      claims.push({ district: best, place, km: bestKm });
    }
  }

  claims.sort((a, b) => a.place.rank - b.place.rank || a.km - b.km);
  const takenDistricts = new Set();
  const takenNames = new Set();
  for (const claim of claims) {
    if (takenDistricts.has(claim.district.id)) continue;
    if (takenNames.has(claim.place.name)) continue;
    takenDistricts.add(claim.district.id);
    takenNames.add(claim.place.name);
    claim.district.name = claim.place.name;
    claim.district.realName = true;
  }
}

/** Which district contains this point, if any. */
export function districtAt(districts, latlng) {
  let best = null;
  let bestKm = Infinity;
  for (const d of districts) {
    const km = haversineKm(d.center, latlng);
    if (km < bestKm) {
      bestKm = km;
      best = d;
    }
  }
  // A point outside the grid entirely belongs to no district.
  return bestKm <= DISTRICT_RADIUS_KM * 1.02 ? best : null;
}

export function districtById(districts, id) {
  return districts.find((d) => d.id === id) || null;
}
