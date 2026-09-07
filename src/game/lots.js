// Real buildings as real estate. Every purchasable property in the game is an
// actual building traced in OpenStreetMap — its true footprint, its true street
// address, its true size. Nothing here is generated except the price.
//
// Google's Maps API can't back this: it needs a billed key, its terms don't
// permit this kind of derivative use, and it doesn't expose queryable building
// footprints anyway. OSM gives the geometry and the tags for free.

import { LOTS } from './constants.js';
import { haversineKm } from './geo.js';
import { clamp, clamp01, lerp, hashUnit } from './rng.js';

const EARTH = { latM: 110540, lngM: 111320 };

/** Footprint area in square metres, via the shoelace formula in local metres. */
export function polygonAreaM2(points) {
  if (!points || points.length < 3) return 0;
  const lat0 = points.reduce((n, p) => n + p.lat, 0) / points.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * EARTH.lngM;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += (a.lng * kx) * (b.lat * EARTH.latM) - (b.lng * kx) * (a.lat * EARTH.latM);
  }
  return Math.abs(sum) / 2;
}

export function centroidOf(points) {
  const lat = points.reduce((n, p) => n + p.lat, 0) / points.length;
  const lng = points.reduce((n, p) => n + p.lng, 0) / points.length;
  return { lat, lng };
}

/**
 * Most buildings in OSM are tagged only `building=yes`, so the tag is a hint
 * and the footprint area is the real signal.
 */
export function classify(tags, areaM2) {
  const b = (tags.building || 'yes').toLowerCase();
  if (b === 'warehouse' || b === 'industrial' || b === 'factory') return 'industrial';
  if (b === 'retail' || b === 'shop' || b === 'supermarket') return 'retail';
  if (b === 'commercial' || b === 'office') return 'commercial';
  if (b === 'garage' || b === 'garages' || b === 'shed') return 'garage';
  if (b === 'apartments' || b === 'residential') return 'apartments';
  if (b === 'house' || b === 'detached' || b === 'semidetached_house') return 'house';
  if (b === 'terrace') return 'rowhouse';

  if (areaM2 >= LOTS.industrialAreaM2) return 'industrial';
  if (areaM2 >= 420) return 'commercial';
  if (areaM2 >= 190) return 'retail';
  if (areaM2 >= 110) return 'house';
  if (areaM2 >= 45) return 'rowhouse';
  return 'garage';
}

export const KIND_LABEL = {
  industrial: 'Warehouse',
  commercial: 'Commercial block',
  retail: 'Storefront',
  apartments: 'Apartment building',
  house: 'Detached house',
  rowhouse: 'Rowhouse',
  garage: 'Garage / outbuilding',
};

/** Quiet, roomy, cheap blocks are what an operation actually wants. */
const KIND_PRICE_MULT = {
  industrial: 0.72, // big but unglamorous — cheap per square metre
  commercial: 1.15,
  retail: 1.3,
  apartments: 0.95,
  house: 1.0,
  rowhouse: 0.9,
  garage: 0.8,
};

export function lotPrice(kind, areaM2, district) {
  const rent = district ? district.rentIndex : 0.5;
  const raw =
    areaM2 * LOTS.pricePerM2 * lerp(0.7, 1.65, rent) * (KIND_PRICE_MULT[kind] || 1);
  return Math.round(clamp(raw, LOTS.minPrice, LOTS.maxPrice) / 10) * 10;
}

/** What you'd get back walking away from a property. */
export function lotResale(lot) {
  return Math.round(lot.price * LOTS.resaleRate);
}

function addressOf(tags) {
  const num = tags['addr:housenumber'];
  const street = tags['addr:street'];
  if (num && street) return `${num} ${street}`;
  if (tags.name) return tags.name;
  if (street) return street;
  return null;
}

/**
 * Turn raw Overpass ways into playable lots: classify, price, assign to a
 * district, and thin the crowd down to something a map can actually show.
 */
export function buildLots(ways, districts, { perDistrict = LOTS.perDistrict } = {}) {
  const byDistrict = new Map(districts.map((d) => [d.id, []]));

  for (const w of ways) {
    const geom = w.geometry;
    if (!geom || geom.length < 3) continue;
    const polygon = geom.map((p) => ({ lat: p.lat, lng: p.lon }));
    const areaM2 = polygonAreaM2(polygon);
    if (areaM2 < LOTS.minAreaM2 || areaM2 > LOTS.maxAreaM2) continue;

    const center = centroidOf(polygon);
    const district = nearestDistrict(districts, center);
    if (!district) continue;

    const tags = w.tags || {};
    const kind = classify(tags, areaM2);
    byDistrict.get(district.id).push({
      osmId: w.id,
      polygon,
      center,
      areaM2,
      kind,
      address: addressOf(tags),
      districtId: district.id,
    });
  }

  const lots = [];
  let n = 0;
  for (const [districtId, candidates] of byDistrict) {
    const district = districts.find((d) => d.id === districtId);
    // Keep a usable mix: always some big premises, then a spread of the rest,
    // so every block has something worth buying at both ends of the budget.
    candidates.sort((a, b) => b.areaM2 - a.areaM2);
    const big = candidates.slice(0, Math.ceil(perDistrict * 0.35));
    const rest = candidates.slice(big.length);
    const stride = Math.max(1, Math.floor(rest.length / Math.max(1, perDistrict - big.length)));
    const spread = rest.filter((_, i) => i % stride === 0).slice(0, perDistrict - big.length);

    for (const c of big.concat(spread)) {
      lots.push({
        id: `L${n++}`,
        ...c,
        name: c.address || `${KIND_LABEL[c.kind]} · ${Math.round(c.areaM2)} m²`,
        price: lotPrice(c.kind, c.areaM2, district),
        owned: false,
        buildingId: null,
      });
    }
  }
  return lots;
}

function nearestDistrict(districts, point) {
  let best = null;
  let bestKm = Infinity;
  for (const d of districts) {
    const km = haversineKm(d.center, point);
    if (km < bestKm) { bestKm = km; best = d; }
  }
  return bestKm <= 0.64 ? best : null;
}

/** Bounding box covering the whole play area. */
export function territoryBbox(districts) {
  let s = 90, w = 180, n = -90, e = -180;
  for (const d of districts) {
    for (const c of d.corners) {
      if (c.lat < s) s = c.lat;
      if (c.lat > n) n = c.lat;
      if (c.lng < w) w = c.lng;
      if (c.lng > e) e = c.lng;
    }
  }
  return { south: s, west: w, north: n, east: e };
}

export function lotById(state, id) {
  return (state.lots || []).find((l) => l.id === id) || null;
}

export function lotsInDistrict(state, districtId) {
  return (state.lots || []).filter((l) => l.districtId === districtId);
}

/**
 * How much a building's footprint amplifies whatever you run inside it. A
 * warehouse genuinely outproduces a rowhouse.
 */
export function areaScale(lot, referenceM2) {
  if (!lot) return 1;
  return clamp(Math.sqrt(lot.areaM2 / referenceM2), 0.65, 2.6);
}

export { clamp01, hashUnit };
