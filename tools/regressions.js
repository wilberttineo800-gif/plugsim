// Regression tests for defects found in review. Each one reproduces a bug
// that was actually shipped, so they stay here to stop it coming back.
//   jsc -m tools/regressions.js

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState, createRoute } from '../src/game/state.js';
import { stepSim, cityPrice } from '../src/game/sim.js';
import { upkeepFor } from '../src/game/upgrades.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { BUILDINGS, COURIERS, PRODUCT_IDS } from '../src/game/constants.js';
import { haversineKm } from '../src/game/geo.js';
import * as A from '../src/game/actions.js';

let pass = 0, fail = 0;
const carried = (c) => PRODUCT_IDS.reduce((n, p) => n + c.cargo[p], 0);
function check(name, ok, detail) {
  print((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
  ok ? pass++ : fail++;
}

function world() {
  const origin = { lat: 39.2904, lng: -76.6122 };
  const districts = generateDistricts(origin, [], 'us');
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);
  const lots = syntheticLots(districts);
  const st = createState({ origin, cityName: 'T', countryCode: 'us', districts, crews, lots });
  st.cash.clean = 900000;
  // Vehicles need a bay before they can be bought at all.
  const park = cheapestLotFor(st, BUILDINGS.depot);
  A.buyLot(st, park.id);
  A.developLot(st, park.id, 'depot');
  return st;
}
function open(st, type) {
  const lot = cheapestLotFor(st, BUILDINGS[type]);
  A.buyLot(st, lot.id);
  return A.developLot(st, lot.id, type).building;
}
function wire(st, fromId, toType, toId, cargo, product, km) {
  const r = createRoute({ fromId, toType, toId, cargo, product });
  const from = st.buildings.find(b => b.id === fromId).latlng;
  const to = toType === 'district' ? st.districts.find(d => d.id === toId).center
                                   : st.buildings.find(b => b.id === toId).latlng;
  r.points = [from, to]; r.km = km || Math.max(2, haversineKm(from, to) * 1.35); r.realRoad = false;
  st.routes.push(r);
  return r;
}

print('=== 1. editRoute: self-route rejected ===');
{
  const st = world();
  const grow = open(st, 'grow_house'), lab = open(st, 'lab');
  const r = wire(st, grow.id, 'building', lab.id, 'raw', 'any');
  const res = A.editRoute(st, r.id, { fromId: lab.id });
  check('a route to itself is refused', !res.ok, res.error || '');
  check('route unchanged after refusal', r.fromId === grow.id && r.toId === lab.id);
}

print('');
print('=== 2. editRoute: a cargo swap cannot convert raw into packs ===');
{
  const st = world();
  const grow = open(st, 'grow_house'), lab = open(st, 'lab');
  grow.raw.weed = 500;
  const r = wire(st, grow.id, 'building', lab.id, 'raw', 'any', 6); // long leg
  const c = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, c.id, A.hireDriver(st).driver.id);
  A.assignCourier(st, c.id, r.id);
  let ticks = 0;
  while ((c.phase !== 'outbound' || carried(c) < 1) && ticks < 4000) { stepSim(st, 0.05, {}); ticks++; }
  const load = carried(c);
  check('courier is airborne with raw', c.phase === 'outbound' && load > 0,
        'phase=' + c.phase + ' carrying ' + load.toFixed(1));

  const packsBefore = lab.packs.weed, rawBefore = lab.raw.weed, growBefore = grow.raw.weed;
  A.editRoute(st, r.id, { cargo: 'packs' });
  const packsAfter = lab.packs.weed;
  check('no instant conversion on the swap', Math.abs(packsAfter - packsBefore) < 0.01,
        'lab packs ' + packsBefore.toFixed(1) + ' -> ' + packsAfter.toFixed(1));
  check('load handed back to source as raw', grow.raw.weed >= growBefore + load - 0.01,
        'grow raw ' + growBefore.toFixed(1) + ' -> ' + grow.raw.weed.toFixed(1) + ' (+' + load.toFixed(1) + ' expected)');
  check('courier emptied', carried(c) < 0.01);
}

print('');
print('=== 3. loadCargo: a laden courier cannot exceed capacity ===');
{
  const st = world();
  const grow = open(st, 'grow_house'), lab = open(st, 'lab');
  grow.raw.weed = 5000;
  const r = wire(st, grow.id, 'building', lab.id, 'raw', 'any');
  const c = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, c.id, A.hireDriver(st).driver.id);
  A.assignCourier(st, c.id, r.id);
  let peak = 0;
  for (let h = 0; h < 120; h += 0.05) {
    stepSim(st, 0.05, {});
    peak = Math.max(peak, PRODUCT_IDS.reduce((n, p) => n + c.cargo[p], 0));
  }
  check('never over capacity', peak <= COURIERS.sedan.capacity + 0.01,
        'peak ' + peak.toFixed(1) + ' of ' + COURIERS.sedan.capacity);
}

print('');
print('=== 4. stepSim slices a big jump ===');
{
  function run(step) {
    const st = world();
    const grow = open(st, 'grow_house'), lab = open(st, 'lab');
    grow.raw.weed = 400;
    const r = wire(st, grow.id, 'building', lab.id, 'raw', 'any');
    const c = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, c.id, A.hireDriver(st).driver.id);
    A.assignCourier(st, c.id, r.id);
    if (step >= 24) stepSim(st, 24, {});
    else for (let h = 0; h < 24; h += step) stepSim(st, step, {});
    return { trips: c.tripsCompleted, packs: lab.packs.weed, cap: BUILDINGS.lab.capacity };
  }
  const big = run(24), small = run(0.05);
  check('a 24h jump still moves couriers', big.trips > 0,
        'trips ' + big.trips + ' vs ' + small.trips + ' in small steps');
  check('lab capacity respected in a 24h jump', big.packs <= big.cap * 3,
        'packs ' + big.packs.toFixed(0));
}

print('');
print('=== 5. couriers have real load/unload time ===');
{
  const st = world();
  const grow = open(st, 'grow_house'), lab = open(st, 'lab');
  grow.raw.weed = 100000;
  const r = wire(st, grow.id, 'building', lab.id, 'raw', 'any');
  r.km = 0.4;
  const c = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, c.id, A.hireDriver(st).driver.id);
  A.assignCourier(st, c.id, r.id);
  for (let h = 0; h < 24; h += 0.05) stepSim(st, 0.05, {});
  const def = COURIERS.sedan;
  // Travel is OSRM's drive time scaled by the vehicle; the harness has no
  // router, so the fallback (distance over 22 km/h) applies.
  const legH = ((0.4 / 22) * 60 * def.paceFactor) / 60;
  const expected = 24 / (legH * 2 + (def.loadMinutes + def.unloadMinutes) / 60);
  check('trips/day is sane on a 400 m route', c.tripsCompleted < 40,
        c.tripsCompleted + ' trips (was 1140 before; theory ' + expected.toFixed(0) + ')');
}

print('');
print('=== 6. HUD projection matches what the sim charges ===');
{
  const st = world();
  const g = open(st, 'grow_house');
  A.upgradeBuilding(st, g.id, 'lights');
  A.upgradeBuilding(st, g.id, 'racks');
  const def = BUILDINGS[g.type];
  const oldFormula = def.upkeepPerDay * (1 + (g.level - 1) * 0.35);
  check('upkeepFor is the single source', Math.abs(upkeepFor(g) - 225) < 1,
        'sim charges $' + upkeepFor(g) + ', old formula gave $' + oldFormula.toFixed(0));
}

print('');
print('=== 7. raw dropped on a district is conserved, not sold ===');
{
  const st = world();
  const grow = open(st, 'grow_house');
  grow.raw.weed = 200;
  grow.active = false; // freeze production so the accounting is exact
  const d = st.districts[10];
  const r = wire(st, grow.id, 'district', d.id, 'raw', 'any', 3);
  const c = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, c.id, A.hireDriver(st).driver.id);
  A.assignCourier(st, c.id, r.id);
  const cashBefore = st.cash.dirty;
  for (let h = 0; h < 24; h += 0.05) stepSim(st, 0.05, {});
  const total = grow.raw.weed + carried(c);
  check('no street supply from raw', d.supply.weed < 0.01, 'supply ' + d.supply.weed.toFixed(2));
  check('no money made from raw', st.cash.dirty - cashBefore < 0.01,
        'dirty +' + (st.cash.dirty - cashBefore).toFixed(2));
  check('raw conserved across the system', Math.abs(total - 200) < 0.5,
        'grow ' + grow.raw.weed.toFixed(1) + ' + courier ' + carried(c).toFixed(1) + ' = ' + total.toFixed(1) + ' of 200');
}

print('');
print('=== 8. market headline matches the recorded series ===');
{
  const st = world();
  open(st, 'grow_house');
  for (let h = 0; h < 48; h += 0.25) stepSim(st, 0.25, {});
  const live = cityPrice(st, 'weed').avg;
  const last = st.priceHistory.weed[st.priceHistory.weed.length - 1].avg;
  check('same metric both places', Math.abs(live - last) / last < 0.02,
        'live $' + live.toFixed(2) + ' vs series $' + last.toFixed(2));
}

print('');
print(fail ? fail + ' FAILURE(S), ' + pass + ' passed' : 'all ' + pass + ' checks passed');
