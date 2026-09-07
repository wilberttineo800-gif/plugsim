// Rival crews. Somebody already works these blocks, and every district you
// want is a district they're standing on. Crews are generated deterministically
// from the play area's real coordinates, same as the districts themselves.

import { RIVALS } from './constants.js';
import { hashUnit, clamp01, lerp } from './rng.js';
import { haversineKm } from './geo.js';

const CREW_FIRST = [
  'Halstead', 'Verrone', 'Okonkwo', 'Bratva', 'Duval', 'Marchetti', 'Kovač',
  'Serrano', 'Ferreira', 'Bekele', 'Novak', 'Trang', 'Cardoso', 'Aslanov',
];
const CREW_SECOND = [
  'Syndicate', 'Firm', 'Outfit', 'Combine', 'Family', 'Crew', 'Network',
  'Concern', 'Union', 'Office',
];
const PALETTE = ['#d9534f', '#4f8fd9', '#c9a227', '#43a08a', '#9b6bd6'];

/**
 * Seat 2–4 crews around the play area. Each holds a home block and fades in
 * influence with distance from it, so the map has natural soft borders.
 */
export function generateCrews(districts, origin) {
  const seed = Math.round((origin.lat + origin.lng) * 10000);
  const count = 2 + Math.floor(hashUnit(seed, 3, 5) * 3); // 2..4

  // Crews sit on the ground worth holding — dense, lightly policed, with real
  // demand. Seating them on the quiet edge of the map made them irrelevant,
  // because that's exactly where the player never bothers to sell.
  const valued = districts
    .map((d) => {
      const demand = (d.demandPerHour?.weed || 0) + (d.demandPerHour?.shrooms || 0) * 3;
      const worth = d.density * 0.5 + demand * 0.09 - d.policing * 0.35;
      // A little deterministic jitter so the same city isn't always identical.
      return { d, worth: worth + hashUnit(seed, d.index * 37, 23) * 0.18 };
    })
    .sort((a, b) => b.worth - a.worth)
    .map((x) => x.d);

  const crews = [];
  const takenHomes = [];

  for (let i = 0; i < count; i++) {
    // Best remaining block that isn't right on top of another crew.
    let home = valued.find((d) => !takenHomes.some((h) => haversineKm(h.center, d.center) < 1.5))
      || valued[i % valued.length];
    takenHomes.push(home);

    const a = hashUnit(seed, i * 977 + 3, 41);
    const b = hashUnit(seed, i * 613 + 11, 59);
    const c = hashUnit(seed, i * 449 + 19, 83);

    crews.push({
      id: `crew${i}`,
      name: `${CREW_FIRST[Math.floor(a * CREW_FIRST.length)]} ${CREW_SECOND[Math.floor(b * CREW_SECOND.length)]}`,
      color: PALETTE[i % PALETTE.length],
      homeDistrictId: home.id,
      // How hard they hold ground, and how far their reach extends.
      strength: lerp(RIVALS.strengthRange[0], RIVALS.strengthRange[1], c),
      reachKm: lerp(RIVALS.reachKmRange[0], RIVALS.reachKmRange[1], hashUnit(seed, i * 271, 97)),
      aggression: lerp(0.35, 1.0, hashUnit(seed, i * 353, 113)),
      pushedBack: 0, // lifetime ground you've taken off them
    });
  }
  return crews;
}

/**
 * How much of a block a crew would hold if you never showed up. Only the
 * strongest claimant takes a district — overlapping crews get messy to read.
 */
export function baselineControl(district, crews) {
  let best = null;
  let bestValue = 0;
  for (const crew of crews) {
    const home = crew.__home;
    if (!home) continue;
    const km = haversineKm(home.center, district.center);
    const falloff = clamp01(1 - km / crew.reachKm);
    // Crews root harder in dense, poorly policed blocks.
    const terrain = 0.65 + district.density * 0.5 - district.policing * 0.3;
    const value = crew.strength * falloff * falloff * clamp01(terrain);
    if (value > bestValue) {
      bestValue = value;
      best = crew;
    }
  }
  return { crewId: best ? best.id : null, value: clamp01(bestValue) };
}

/** Attach home-district references and seed each district's starting control. */
export function applyInitialControl(districts, crews) {
  const byId = new Map(districts.map((d) => [d.id, d]));
  for (const crew of crews) crew.__home = byId.get(crew.homeDistrictId);

  for (const d of districts) {
    const { crewId, value } = baselineControl(d, crews);
    d.crewId = crewId;
    d.rivalControl = value;
    d.baseControl = value;
  }
  for (const crew of crews) delete crew.__home;
}

/** Rebuild the transient home lookup after a save is loaded. */
export function rehydrateCrews(state) {
  if (!state.crews) state.crews = [];
  for (const d of state.districts) {
    if (d.rivalControl == null) d.rivalControl = 0;
    if (d.baseControl == null) d.baseControl = d.rivalControl;
    if (d.crewId === undefined) d.crewId = null;
  }
}

export function crewById(state, id) {
  return (state.crews || []).find((c) => c.id === id) || null;
}

export { PALETTE };
