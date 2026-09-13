// Shared test fixtures. JavaScriptCore has no fetch, so the harnesses can't
// pull real OSM footprints — these stand in for them with the same shape and a
// realistic spread of sizes (rowhouse → warehouse).

import { classify, lotPrice, parkingSpaces, levelsOf, dwellingsIn } from '../src/game/lots.js';
import { offsetKm } from '../src/game/geo.js';

const SIZES = [28, 40, 55, 70, 95, 140, 260, 340, 480, 700, 900, 2200];

/** A believable set of buildings for every district. */
export function syntheticLots(districts, perDistrict = 12) {
  const lots = [];
  let n = 0;
  for (const d of districts) {
    for (let i = 0; i < perDistrict; i++) {
      const areaM2 = SIZES[i % SIZES.length];
      // Square footprint of the right area, offset a little from the centre.
      const side = Math.sqrt(areaM2) / 1000; // km
      const c = offsetKm(d.center, (i % 3) * 0.05 - 0.05, Math.floor(i / 3) * 0.05 - 0.05);
      const polygon = [
        offsetKm(c, -side / 2, -side / 2),
        offsetKm(c, side / 2, -side / 2),
        offsetKm(c, side / 2, side / 2),
        offsetKm(c, -side / 2, side / 2),
      ];
      // Every ninth footprint is a car park, so the fleet has somewhere to live
      // — the real map is full of them.
      const isParking = i === perDistrict - 1 || i === 2;
      const tags = isParking ? { amenity: 'parking', parking: 'surface' } : { building: 'yes' };
      const kind = classify(tags, areaM2);
      // A believable spread of heights, so rent and value see real storeys.
      if (!isParking) tags['building:levels'] = String(1 + (i % 5));
      const levels = isParking ? 1 : levelsOf(tags, kind);
      const units = dwellingsIn(kind, areaM2, levels);
      lots.push({
        // Namespaced by district, which is itself namespaced by city — a bare
        // counter restarts on every call, so a second city's lots reuse the
        // first's ids and buyLot silently buys the wrong property.
        id: `L${d.id}-${n++}`,
        osmId: n,
        polygon,
        center: c,
        areaM2,
        kind,
        parkingType: isParking ? 'surface' : null,
        levels,
        units,
        rentUpgrades: [],
        spaces: isParking ? parkingSpaces(tags, areaM2) : 0,
        address: `${100 + i * 7} Test Street`,
        districtId: d.id,
        name: `${100 + i * 7} Test Street`,
        price: lotPrice(kind, areaM2, d, levels),
        owned: false,
        buildingId: null,
      });
    }
  }
  return lots;
}

/** Cheapest lot in the whole city that can host the given operation. */
export function cheapestLotFor(state, def, districtFilter = null) {
  const need = def.requiresKind || null;
  return (state.lots || [])
    .filter((l) => (need ? l.kind === need : l.kind !== 'parking'))
    // Operations now have a ceiling as well as a floor.
    .filter((l) => !l.owned && l.areaM2 >= def.minAreaM2
      && (!def.maxAreaM2 || l.areaM2 <= def.maxAreaM2))
    .filter((l) => !districtFilter || l.districtId === districtFilter)
    .sort((a, b) => a.price - b.price)[0] || null;
}

/**
 * Buy a car park and fit it out, so a harness can put vehicles on the road.
 * Nothing can be bought without a bay to keep it in.
 */
export function openDepot(state, { buyLot, developLot }, BUILDINGS) {
  const lot = cheapestLotFor(state, BUILDINGS.depot);
  if (!lot) return null;
  buyLot(state, lot.id);
  developLot(state, lot.id, 'depot');
  return state.buildings.find((b) => b.lotId === lot.id) || null;
}
