// Shared test fixtures. JavaScriptCore has no fetch, so the harnesses can't
// pull real OSM footprints — these stand in for them with the same shape and a
// realistic spread of sizes (rowhouse → warehouse).

import { classify, lotPrice } from '../src/game/lots.js';
import { offsetKm } from '../src/game/geo.js';

const SIZES = [70, 95, 140, 260, 340, 480, 700, 900, 2200];

/** A believable set of buildings for every district. */
export function syntheticLots(districts, perDistrict = 9) {
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
      const kind = classify({ building: 'yes' }, areaM2);
      lots.push({
        id: `L${n++}`,
        osmId: n,
        polygon,
        center: c,
        areaM2,
        kind,
        address: `${100 + i * 7} Test Street`,
        districtId: d.id,
        name: `${100 + i * 7} Test Street`,
        price: lotPrice(kind, areaM2, d),
        owned: false,
        buildingId: null,
      });
    }
  }
  return lots;
}

/** Cheapest lot in the whole city that can host the given operation. */
export function cheapestLotFor(state, def, districtFilter = null) {
  return (state.lots || [])
    .filter((l) => !l.owned && l.areaM2 >= def.minAreaM2)
    .filter((l) => !districtFilter || l.districtId === districtFilter)
    .sort((a, b) => a.price - b.price)[0] || null;
}
