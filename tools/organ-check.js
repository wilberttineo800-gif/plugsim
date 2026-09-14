// The black market in parts.
//
// The thing worth pinning is the cold clock. If the valuable organs did not
// spoil faster than the cheap ones, this would just be free money with a heat
// cost — and the whole decision the mechanic exists to pose would be gone.

import { PRODUCTS, BUILDINGS } from '../src/game/constants.js';
import { ORGANS, ORGAN_IDS, ORGAN_TRADE, viability, organValue, harvest, cullSpoiled, stockValue } from '../src/game/organs.js';
import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { createState } from '../src/game/state.js';
import * as A from '../src/game/actions.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; print('  FAIL ' + m); } };
const seeded = (n) => () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;

// --- Prices and clocks ------------------------------------------------------
ok(ORGAN_IDS.length >= 7, ORGAN_IDS.length + ' kinds');
for (const id of ORGAN_IDS) {
  const d = ORGANS[id];
  ok(d.price[0] < d.price[1] && d.price[0] > 0, `${d.name} has a real price range`);
  ok(d.viabilityHours > 0, `${d.name} has a cold time`);
}

// The central claim: the dearest thing spoils fastest.
const byPrice = ORGAN_IDS.slice().sort((a, b) => ORGANS[b].price[1] - ORGANS[a].price[1]);
ok(ORGANS[byPrice[0]].id === 'heart', 'a heart is the most valuable thing here');
ok(ORGANS[byPrice[0]].viabilityHours <= 6, 'and is good for hours, not days');
ok(ORGANS.cornea.viabilityHours > ORGANS.kidney.viabilityHours * 5,
  'while corneas keep for a fortnight');
// A kidney IS both valuable and keeps a day and a half — that is exactly why
// it is the most trafficked organ there is, and the model should say so. What
// must not exist is something at the very top of the range that also keeps.
const dearAndSlow = ORGAN_IDS.filter((id) =>
  ORGANS[id].price[1] >= 140000 && ORGANS[id].viabilityHours > 24);
ok(dearAndSlow.length === 0,
  'nothing at the top of the range also keeps: ' + (dearAndSlow.join(', ') || 'none'));
ok(ORGANS.kidney.viabilityHours >= 24 && ORGANS.kidney.price[1] >= 100000,
  'a kidney is valuable AND movable, which is why it is the one that actually trades');

// The curve itself: flat, then off a cliff.
ok(viability('heart', 1) === 1, 'a heart is untouched for the first hour');
ok(viability('heart', 4) > 0 && viability('heart', 4) < 1, 'and degrading by the fourth');
ok(viability('heart', 6) === 0, 'and worth nothing past its cold time');
ok(viability('cornea', 200) > 0.35, 'corneas are still worth having after eight days');

const fresh = { organ: 'heart', takenAt: 0, quality: 1 };
ok(organValue(fresh, 0, 1) >= ORGANS.heart.price[1] * 0.95, 'a fresh heart is worth the top of the range');
ok(organValue(fresh, 8, 1) === 0, 'and an hour late it is worth nothing at all');

// --- Yield ------------------------------------------------------------------
let heartsFrom100 = 0, corneasFrom100 = 0;
for (let i = 0; i < 100; i++) {
  const got = harvest(null, { atHour: 0, skill: 0.6, rand: seeded(i + 1) });
  heartsFrom100 += got.filter((p) => p.organ === 'heart').length;
  corneasFrom100 += got.filter((p) => p.organ === 'cornea').length;
}
ok(heartsFrom100 > 0 && heartsFrom100 < 100, `a heart does not come out every time (${heartsFrom100}/100)`);
ok(corneasFrom100 > heartsFrom100, 'and the shallow, robust things come out more often');

// --- Spoilage runs whether you are watching or not --------------------------
const st = { organs: [{ organ: 'heart', takenAt: 0, quality: 1 }, { organ: 'cornea', takenAt: 0, quality: 1 }] };
const gone = cullSpoiled(st, 24);
ok(gone.length === 1 && gone[0].organ === 'heart', 'a day later the heart is refuse');
ok(st.organs.length === 1 && st.organs[0].organ === 'cornea', 'and the corneas are still good');

// --- The cost ---------------------------------------------------------------
const clinic = BUILDINGS.back_clinic;
ok(!!clinic, 'there is somewhere to do it');
ok(clinic.unlock.properties >= 12, 'and it is the last thing that opens up');
const hottest = Object.values(BUILDINGS).every((d) => (d.heatPerDay || 0) <= clinic.heatPerDay);
ok(hottest, 'nothing in the game runs hotter than it does');
ok(ORGAN_TRADE.repHit > 0.25, 'and standing on the block collapses rather than dips');

// --- It cannot happen without the clinic ------------------------------------
const origin = { lat: 42.3314, lng: -83.0458 };
const districts = generateDistricts(origin, []);
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const lots = syntheticLots(districts);
const state = createState({ origin, cityName: 'Detroit', districts, crews, lots });
state.cash.clean = 200000000;
state.adminUnlockAll = true;
ok(!A.hasClinic(state), 'no clinic to begin with');
state.casualties = [{ id: 'c1', districtId: districts[0].id, atHour: 0 }];
ok(!A.harvestCasualty(state, 'c1').ok, 'and nothing can be done with a body without one');

const lot = cheapestLotFor(state, BUILDINGS.back_clinic);
A.buyLot(state, lot.id);
A.developLot(state, lot.id, 'back_clinic');
ok(A.hasClinic(state), 'building one is the opting in');

// Give the block a reason to think well of you first — standing that is
// already nothing cannot fall any further, and that is the correct behaviour
// rather than the thing under test.
districts[0].rep = 0.7;
const repBefore = districts[0].rep, heatBefore = districts[0].heat;
const got = A.harvestCasualty(state, 'c1');
ok(got.ok && got.taken.length > 0, `and then it yields (${got.taken.length})`);
ok(districts[0].rep < repBefore - 0.2,
  `standing on that block collapses (${repBefore.toFixed(2)} -> ${districts[0].rep.toFixed(2)})`);
ok(districts[0].heat > heatBefore, 'and the heat climbs');
ok(state.casualties.length === 0, 'and the body is gone');

const dirtyBefore = state.cash.dirty;
const sale = A.sellOrgans(state);
ok(sale.ok, 'the lot can be moved');
ok(state.cash.dirty > dirtyBefore, 'for street money — there is no clean version of this');
ok(sale.net < sale.gross, `and a broker takes ${Math.round(ORGAN_TRADE.brokerCut * 100)}% off the top`);
ok(!A.sellOrgans(state).ok, 'and then there is nothing left to sell');

print(fail ? `organs: ${fail} FAILED, ${pass} passed` : `organs: all ${pass} checks passed`);
