// A survey, kept.
//
// Overpass is the only source of real buildings and it is the least reliable
// thing this game depends on: measured in a live session, overpass-api.de was
// answering HTTP 504 and the first mirror was aborting outright, and the
// result was a city with three buildings in it. Every reload started that
// fight again from nothing.
//
// So a tile that was successfully surveyed once is written down. It is real
// geography — a building that stood at these coordinates yesterday stands
// there today — and the only reason it was ever re-fetched is that nobody
// kept it.
//
// Deliberately its own localStorage key and its own shape, NOT part of the
// save (`SAVE_KEY` / `SAVE_VERSION` in state.js). Starting a new game, or a
// save-version bump, must not throw away a survey that is still perfectly
// good — the same reasoning dev.js and premium.js use for their flags.
//
// Everything here is wrapped: localStorage throws outright in a private
// window and in some embedded contexts, and a cache that cannot be read is a
// slower game, not a broken one.

const CACHE_KEY = 'plugsim.tiles.v1';
/** Well inside a 5 MB localStorage budget, leaving room for the save itself. */
const MAX_BYTES = 2_500_000;

function readAll() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * The ways surveyed for a tile, or null if it has never been fetched.
 *
 * Null and an empty array mean different things and the caller must keep them
 * apart: an empty array is a real answer — open country, a lake, an airfield —
 * and re-asking Overpass about it forever is exactly the behaviour this is
 * here to stop.
 */
export function cachedTile(key) {
  const all = readAll();
  const hit = all[key];
  if (!hit || !Array.isArray(hit.ways)) return null;
  return hit.ways;
}

/**
 * Write a surveyed tile down, evicting the least recently used if it won't fit.
 *
 * An EMPTY survey is never written. One Overpass mirror answers HTTP 200 with
 * an empty element list instead of failing, and at this layer that is
 * indistinguishable from genuinely open country — so caching it turned a dead
 * mirror into a permanently unstartable city. Refused here as well as at the
 * call site, because the cost of being wrong is a player's whole game.
 */
export function cacheTile(key, ways) {
  if (!Array.isArray(ways) || !ways.length) return false;
  const all = readAll();
  all[key] = { ways, at: Date.now() };

  // Trim oldest-first until it fits. A rough byte count beats measuring
  // exactly: the point is to stay well under quota, not to hit it precisely.
  let payload = JSON.stringify(all);
  if (payload.length > MAX_BYTES) {
    const order = Object.keys(all).sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
    for (const k of order) {
      if (k === key) continue; // never evict what we were just asked to keep
      delete all[k];
      payload = JSON.stringify(all);
      if (payload.length <= MAX_BYTES) break;
    }
  }
  return writeAll(all);
}

/** What is being held, for a readout. */
export function cacheStats() {
  const all = readAll();
  const keys = Object.keys(all);
  let ways = 0;
  for (const k of keys) ways += (all[k].ways || []).length;
  let bytes = 0;
  try { bytes = (localStorage.getItem(CACHE_KEY) || '').length; } catch (err) { bytes = 0; }
  return { tiles: keys.length, ways, bytes };
}

export function clearTileCache() {
  try { localStorage.removeItem(CACHE_KEY); return true; } catch (err) { return false; }
}
