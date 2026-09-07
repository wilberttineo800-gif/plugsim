// Real-world geography helpers: distance, a hex grid laid over actual
// coordinates, and the three OSM services the game talks to (geocoding,
// neighbourhood names, driving routes). Every network call degrades gracefully
// so the game stays playable offline apart from the map tiles themselves.

const EARTH_R_KM = 6371.0088;
const DEG = Math.PI / 180;

export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(s));
}

/** Length of a multi-point path in km. */
export function pathLengthKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

/** Offset a lat/lng by a local metric vector, in km. */
export function offsetKm(origin, eastKm, northKm) {
  const lat = origin.lat + (northKm / EARTH_R_KM) / DEG;
  const lng = origin.lng + (eastKm / (EARTH_R_KM * Math.cos(origin.lat * DEG))) / DEG;
  return { lat, lng };
}

/** Local metric offset of `p` from `origin`, in km. */
export function toLocalKm(origin, p) {
  return {
    x: (p.lng - origin.lng) * DEG * EARTH_R_KM * Math.cos(origin.lat * DEG),
    y: (p.lat - origin.lat) * DEG * EARTH_R_KM,
  };
}

/** Interpolate along a polyline at fraction t of its total length. */
export function pointAlongPath(points, t) {
  if (points.length === 1) return { ...points[0] };
  const total = pathLengthKm(points);
  if (total <= 0) return { ...points[0] };
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const seg = haversineKm(points[i - 1], points[i]);
    if (target <= seg || i === points.length - 1) {
      const f = seg > 0 ? target / seg : 0;
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * f,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * f,
      };
    }
    target -= seg;
  }
  return { ...points[points.length - 1] };
}

// --- Hex grid ---------------------------------------------------------------
// Flat-top axial hexes laid out in local km space around the chosen origin.

export function hexRing(rings) {
  const cells = [];
  for (let q = -rings; q <= rings; q++) {
    const r1 = Math.max(-rings, -q - rings);
    const r2 = Math.min(rings, -q + rings);
    for (let r = r1; r <= r2; r++) cells.push({ q, r });
  }
  return cells;
}

export function hexCenterKm(q, r, radiusKm) {
  return {
    x: radiusKm * 1.5 * q,
    y: radiusKm * Math.sqrt(3) * (r + q / 2),
  };
}

export function hexCornersKm(cx, cy, radiusKm) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push({ x: cx + radiusKm * Math.cos(a), y: cy + radiusKm * Math.sin(a) });
  }
  return pts;
}

export function localKmToLatLng(origin, x, y) {
  return offsetKm(origin, x, y);
}

// --- OSM services -----------------------------------------------------------

const UA_NOTE = 'plugsim-local-game';

async function fetchJson(url, timeoutMs = 9000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Free-text place search. Returns [{name, lat, lng}]. */
export async function geocode(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' +
    encodeURIComponent(query);
  try {
    const rows = await fetchJson(url, 9000, { headers: { Accept: 'application/json' } });
    return rows.map((r) => ({
      name: r.display_name,
      short: r.name || r.display_name.split(',')[0],
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  } catch (err) {
    console.warn('[geo] geocode failed', err);
    return [];
  }
}

/** Which country a point is in, as a lowercase ISO code. Shapes what sells. */
export async function fetchCountryCode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&lat=${lat}&lon=${lng}`;
  try {
    const r = await fetchJson(url, 9000, { headers: { Accept: 'application/json' } });
    return (r.address && r.address.country_code) ? r.address.country_code.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Reverse geocode a point to a rough place label. */
export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${lat}&lon=${lng}`;
  try {
    const r = await fetchJson(url, 9000, { headers: { Accept: 'application/json' } });
    const a = r.address || {};
    const candidates = [a.city, a.town, a.village, a.municipality, a.county, a.state, r.name];
    // A reverse lookup can resolve to a building and hand back a house number,
    // which then shows up as the city ("Set up shop in 36"). Take the first
    // candidate that actually reads like a place name.
    return candidates.find(isPlaceName) || 'Unknown City';
  } catch {
    return null;
  }
}

/**
 * One Overpass call pulls every named neighbourhood/suburb inside the play
 * area, so districts end up with the real names locals use. Falls back to
 * procedural names if Overpass is slow or unreachable.
 */
export async function fetchPlaceNames(south, west, north, east) {
  const bbox = `${south},${west},${north},${east}`;
  const query =
    `[out:json][timeout:20];(` +
    `node["place"~"^(suburb|neighbourhood|quarter|borough|city_district|town|village|hamlet)$"](${bbox});` +
    `);out body 220;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  for (const endpoint of endpoints) {
    try {
      const data = await fetchJson(endpoint + '?data=' + encodeURIComponent(query), 22000);
      const out = (data.elements || [])
        .filter((e) => e.tags && e.tags.name && Number.isFinite(e.lat))
        .map((e) => ({ name: e.tags.name, lat: e.lat, lng: e.lon, rank: placeRank(e.tags.place) }));
      if (out.length) return out;
    } catch (err) {
      console.warn('[geo] overpass failed at', endpoint, err.message);
    }
  }
  return [];
}

/**
 * Every building footprint in the play area, with its tags. This is what makes
 * the properties real — actual traced outlines and actual street addresses.
 */
export async function fetchBuildings(south, west, north, east, cap = 2600, onRetry) {
  const bbox = `${south},${west},${north},${east}`;
  const query =
    `[out:json][timeout:60];(way["building"](${bbox}););out geom ${cap};`;

  // Overpass grants two query slots per IP. When they're busy it refuses
  // outright, so a transient refusal has to back off and try again rather than
  // fail the whole survey.
  const attempts = [
    { endpoint: 'https://overpass-api.de/api/interpreter', waitMs: 0 },
    { endpoint: 'https://overpass.kumi.systems/api/interpreter', waitMs: 800 },
    { endpoint: 'https://overpass-api.de/api/interpreter', waitMs: 4000 },
    { endpoint: 'https://overpass.kumi.systems/api/interpreter', waitMs: 9000 },
  ];

  let lastError = null;
  for (let i = 0; i < attempts.length; i++) {
    const { endpoint, waitMs } = attempts[i];
    if (waitMs) {
      onRetry?.(i, waitMs);
      await new Promise((r) => setTimeout(r, waitMs));
    }
    try {
      const data = await fetchJson(endpoint, 45000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      const ways = (data.elements || []).filter((e) => e.geometry && e.geometry.length >= 3);
      // An empty result is legitimate for water or parkland — only a thrown
      // error means we should try somewhere else.
      return ways;
    } catch (err) {
      lastError = err;
      console.warn('[geo] building fetch failed at', endpoint, err.message);
    }
  }
  throw lastError || new Error('building survey unavailable');
}

/** Rejects empty values and bare numbers like "36" or "1200". */
function isPlaceName(value) {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  return t.length > 1 && !/^[\d\s\-–/]+$/.test(t);
}

function placeRank(place) {
  switch (place) {
    case 'neighbourhood': return 0;
    case 'quarter': return 1;
    case 'suburb': return 2;
    case 'city_district': return 3;
    case 'borough': return 4;
    default: return 5;
  }
}

/**
 * Real driving route between two points via the public OSRM demo server.
 * Returns {points, km} or null. Results are cached by rounded coordinates so a
 * standing courier route is only ever fetched once.
 */
const routeCache = new Map();

export async function fetchRoute(from, to) {
  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(5)).join(',');
  if (routeCache.has(key)) return routeCache.get(key);

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  let result = null;
  try {
    const data = await fetchJson(url, 10000);
    const route = data.routes && data.routes[0];
    if (route) {
      result = {
        points: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        km: route.distance / 1000,
        real: true,
      };
    }
  } catch (err) {
    console.warn('[geo] routing failed, using direct line', err.message);
  }
  if (!result) {
    // Straight line, padded to approximate the detour a real street grid forces.
    result = { points: [from, to], km: haversineKm(from, to) * 1.35, real: false };
  }
  routeCache.set(key, result);
  return result;
}

export { UA_NOTE };
