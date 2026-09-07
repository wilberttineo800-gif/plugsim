// Real buildings as real estate. Every purchasable property in the game is an
// actual building traced in OpenStreetMap — its true footprint, its true street
// address, its true size. Nothing here is generated except the price.
//
// Google's Maps API can't back this: it needs a billed key, its terms don't
// permit this kind of derivative use, and it doesn't expose queryable building
// footprints anyway. OSM gives the geometry and the tags for free.

import { LOTS, MARKET_PROPERTY } from './constants.js';
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

/** What a square metre of each kind of premises costs, before the block. */
const KIND_PRICE_MULT = {
  industrial: 0.72, // big but unglamorous — cheap per square metre
  commercial: 1.15,
  retail: 1.3,
  apartments: 0.95,
  house: 1.0,
  rowhouse: 0.9,
  garage: 0.8,
};

export const SQFT_PER_M2 = 10.7639;
export const sqft = (m2) => m2 * SQFT_PER_M2;

/**
 * Effective area for pricing. Floor space gets cheaper per square metre once a
 * building is genuinely big, the way real commercial space does — otherwise a
 * 20,000 m² warehouse would be priced like 280 rowhouses.
 */
export function pricedArea(areaM2) {
  if (areaM2 <= LOTS.scaleBreakM2) return areaM2;
  const over = areaM2 - LOTS.scaleBreakM2;
  return LOTS.scaleBreakM2 + Math.pow(over, LOTS.scaleExponent);
}

/** The full breakdown, so the UI can show why a building costs what it does. */
export function priceBreakdown(kind, areaM2, district) {
  const rent = district ? district.rentIndex : 0.5;
  const kindMult = KIND_PRICE_MULT[kind] || 1;
  const blockMult = lerp(0.7, 1.65, rent);
  const effective = pricedArea(areaM2);
  const raw = effective * LOTS.pricePerM2 * kindMult * blockMult;
  const price = Math.round(clamp(raw, LOTS.minPrice, LOTS.maxPrice) / 10) * 10;
  return {
    price,
    kindMult,
    blockMult,
    ratePerM2: price / Math.max(1, areaM2),
    ratePerSqft: price / Math.max(1, sqft(areaM2)),
    discounted: effective < areaM2,
  };
}

export function lotPrice(kind, areaM2, district) {
  return priceBreakdown(kind, areaM2, district).price;
}

/**
 * What a property is worth today. `lot.price` is the standing assessment; the
 * block's market index is what actually moves.
 */
export function marketValue(lot, district) {
  const idx = district && district.marketIndex ? district.marketIndex : 1;
  return Math.round(lot.price * idx / 10) * 10;
}

/** What a sale nets you, after the agent takes their cut. */
export function lotResale(lot, district) {
  return Math.round(marketValue(lot, district) * (1 - MARKET_PROPERTY.agentFee));
}

/** What a tenant would pay per day for this building. */
export function rentPerDay(lot, district) {
  const wealth = district ? district.wealth : 0.5;
  const pull = 1 + (wealth - 0.5) * 2 * MARKET_PROPERTY.rentWealthSwing;
  return Math.round(marketValue(lot, district) * MARKET_PROPERTY.rentYieldPerDay * pull);
}

/** Profit or loss against what you actually paid. */
export function lotPnL(lot, district) {
  if (!lot.owned || lot.paidPrice == null) return null;
  const now = lotResale(lot, district);
  return { paid: lot.paidPrice, now, delta: now - lot.paidPrice };
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
export function buildLots(ways, districts, { startIndex = 0 } = {}) {
  const lots = [];
  let n = startIndex;

  for (const w of ways) {
    const geom = w.geometry;
    if (!geom || geom.length < 3) continue;
    const polygon = geom.map((p) => ({ lat: p.lat, lng: p.lon }));
    const areaM2 = polygonAreaM2(polygon);
    if (areaM2 < LOTS.minAreaM2 || areaM2 > LOTS.maxAreaM2) continue;

    const center = centroidOf(polygon);
    const district = nearestDistrict(districts, center);
    if (!district) continue; // outside the play area

    const tags = w.tags || {};
    const kind = classify(tags, areaM2);
    const address = addressOf(tags);
    lots.push({
      id: `L${n++}`,
      osmId: w.id,
      polygon,
      center,
      areaM2,
      kind,
      address,
      districtId: district.id,
      name: address || `${KIND_LABEL[kind]} · ${Math.round(areaM2)} m²`,
      price: lotPrice(kind, areaM2, district),
      owned: false,
      paidPrice: null,
      rented: false,
      buildingId: null,
    });
  }
  return lots;
}

// --- Streaming buildings in by area -----------------------------------------

/** Tile key for a coordinate, on a fixed lat/lng grid. */
export function tileKey(lat, lng) {
  const t = LOTS.tileDeg;
  return `${Math.floor(lat / t)}:${Math.floor(lng / t)}`;
}

export function tileBounds(key) {
  const t = LOTS.tileDeg;
  const [y, x] = key.split(':').map(Number);
  return { south: y * t, west: x * t, north: (y + 1) * t, east: (x + 1) * t };
}

/** Every tile overlapping a lat/lng bounds box. */
export function tilesForBounds(south, west, north, east) {
  const t = LOTS.tileDeg;
  const keys = [];
  for (let y = Math.floor(south / t); y <= Math.floor(north / t); y++) {
    for (let x = Math.floor(west / t); x <= Math.floor(east / t); x++) {
      keys.push(`${y}:${x}`);
    }
  }
  return keys;
}

/**
 * Load every building in the given tiles that hasn't been loaded yet. Fetches
 * are sequential and capped per sweep so panning around doesn't hammer
 * Overpass. Returns the newly created lots.
 */
export async function loadTiles(state, keys, fetchBuildings, onProgress) {
  state.loadedTiles = state.loadedTiles || [];
  const done = new Set(state.loadedTiles);
  const todo = keys.filter((k) => !done.has(k)).slice(0, LOTS.maxTilesPerSweep);
  if (!todo.length) return [];

  const seen = new Set((state.lots || []).map((l) => l.osmId));
  const fresh = [];

  for (const key of todo) {
    const b = tileBounds(key);
    let ways = [];
    try {
      ways = await fetchBuildings(b.south, b.west, b.north, b.east, LOTS.tileFetchCap);
    } catch (err) {
      console.warn('[lots] tile fetch failed', key, err);
      continue; // leave it unmarked so it retries later
    }
    state.loadedTiles.push(key);

    const built = buildLots(ways, state.districts, { startIndex: state.lotSeq || 0 })
      .filter((l) => !seen.has(l.osmId));
    for (const l of built) seen.add(l.osmId);
    state.lotSeq = (state.lotSeq || 0) + built.length;
    state.lots.push(...built);
    fresh.push(...built);
    onProgress?.(fresh.length, todo.length);
  }
  return fresh;
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
 * Throughput scaling, per building type.
 *
 * How output tracks floor area depends entirely on what the place does. An
 * auto shop is bays, and bays fit the floor, so it scales nearly linearly. A
 * lab is limited by equipment and trained hands, so doubling the room is worth
 * far less than double. A check-cashing booth barely cares about size at all.
 * Each type carries its own exponent rather than sharing one square root.
 */
export function areaScale(lot, referenceM2, exponent = 0.7) {
  if (!lot) return 1;
  return clamp(Math.pow(lot.areaM2 / referenceM2, exponent), 0.55, 3.2);
}

/**
 * Storage scaling. How much you can hold really is a function of floor space,
 * so this tracks area almost directly — which is what makes a warehouse a
 * warehouse rather than just a slightly better rowhouse.
 */
export function areaCapacityScale(lot, referenceM2) {
  if (!lot) return 1;
  return clamp(lot.areaM2 / referenceM2, 0.45, 8);
}

export { clamp01, hashUnit };
