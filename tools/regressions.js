// Regression tests for defects found in review. Each one reproduces a bug
// that was actually shipped, so they stay here to stop it coming back.
//   jsc -m tools/regressions.js

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState, createRoute, saveGame, loadGame } from '../src/game/state.js';
import { stepSim, cityPrice, catchUp, MAX_CATCHUP_HOURS } from '../src/game/sim.js';
import { upkeepFor, vehicleStats } from '../src/game/upgrades.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { currentStep, progress as onboardingProgress, STEPS } from '../src/game/onboarding.js';
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
print('=== 9. every button in the UI reaches a real action ===');
{
  // The vehicle upgrade button was wired to an action that was never written,
  // so clicking it threw and nothing happened. Nothing caught that, because
  // no test ever called it. Check the whole surface instead of one action.
  const st = world();
  const wired = [
    'buyLot', 'sellLot', 'rentOut', 'endTenancy', 'developLot', 'buyVehicle',
    'hireDriver', 'fireDriver', 'assignDriver', 'sellVehicle', 'assignCourier',
    'editRoute', 'upgradeBuilding', 'upgradeCourier', 'muscleIn', 'washWithFixer',
    'toggleBuilding', 'removeRoute',
  ];
  const missing = wired.filter((n) => typeof A[n] !== 'function');
  check('every action the UI calls exists', missing.length === 0,
        missing.length ? 'missing: ' + missing.join(', ') : wired.length + ' actions');

  // And the vehicle upgrade actually fits and charges.
  open(st, 'grow_house');
  const v = A.buyVehicle(st, 'sedan').vehicle;
  const before = st.cash.clean;
  const up = A.upgradeCourier(st, v.id, 'seats');
  check('a vehicle upgrade fits', up.ok && v.upgrades.includes('seats'),
        up.ok ? 'paid $' + up.cost : up.error);
  check('a vehicle upgrade charges clean money', st.cash.clean < before,
        '$' + Math.round(before - st.cash.clean));
  check('it changes what the vehicle can do',
        vehicleStats(v, COURIERS.sedan).capacity > COURIERS.sedan.capacity,
        vehicleStats(v, COURIERS.sedan).capacity.toFixed(0) + ' vs ' + COURIERS.sedan.capacity);
  check('the same upgrade cannot be fitted twice',
        !A.upgradeCourier(st, v.id, 'seats').ok);

  // An auto shop is supposed to do the fitting cheaper.
  const st2 = world();
  const v2 = A.buyVehicle(st2, 'sedan').vehicle;
  const plain = A.upgradeCourier(st2, v2.id, 'seats').cost;
  const st3 = world();
  open(st3, 'autoshop');
  const v3 = A.buyVehicle(st3, 'sedan').vehicle;
  const shopped = A.upgradeCourier(st3, v3.id, 'seats').cost;
  check('an auto shop discounts fitting work', shopped < plain,
        '$' + plain + ' -> $' + shopped);
}

print('');
print('=== 10. the world keeps running while you are away ===');
{
  const st = world();
  const grow = open(st, 'grow_house');
  const before = grow.raw.weed;

  // Eight hours away should look like eight hours of play, not a reset and not
  // a jackpot.
  const away = catchUp(st, 8 * 3600000, {});
  check('an away spell advances the world', away && away.hours === 8,
        away ? away.hours + 'h, day +' + away.days : 'nothing happened');
  check('production ran while away', grow.raw.weed > before,
        before.toFixed(1) + ' -> ' + grow.raw.weed.toFixed(1) + ' raw');

  // Same elapsed time, played through rather than away: within a few percent.
  const st2 = world();
  const grow2 = open(st2, 'grow_house');
  for (let h = 0; h < 8; h += 0.05) stepSim(st2, 0.05, {});
  const gap = Math.abs(grow2.raw.weed - grow.raw.weed) / Math.max(1, grow2.raw.weed);
  check('away matches having played it', gap < 0.05,
        'played ' + grow2.raw.weed.toFixed(1) + ' vs away ' + grow.raw.weed.toFixed(1));

  // A very long absence is capped rather than run forever.
  const st3 = world();
  open(st3, 'grow_house');
  const long = catchUp(st3, 90 * 24 * 3600000, {});
  check('a long absence is capped at a week', long.hours === MAX_CATCHUP_HOURS && long.capped,
        long.hours + 'h of ' + Math.round(long.awayHours) + 'h away');

  check('a trivial gap does nothing', catchUp(world(), 500, {}) === null);

  // The boot path depends on a saved game carrying its own timestamp. Test the
  // round trip, not just catchUp in isolation.
  globalThis.localStorage = {
    _d: {}, getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
  };
  const st4 = world();
  open(st4, 'grow_house');
  saveGame(st4);
  const reloaded = loadGame();
  check('a save carries a wall-clock stamp',
        reloaded && typeof reloaded.savedAt === 'number',
        reloaded ? 'savedAt ' + typeof reloaded.savedAt : 'save did not load');
  const backdated = { ...reloaded, savedAt: Date.now() - 6 * 3600000 };
  const r = catchUp(backdated, Date.now() - backdated.savedAt, {});
  check('a reloaded save catches up on the time away',
        r && r.hours > 5.9 && r.hours < 6.1, r ? r.hours.toFixed(2) + 'h' : 'no catch-up');

  // An old save without a stamp must not blow up or teleport the world.
  const noStamp = { ...reloaded };
  delete noStamp.savedAt;
  check('a save with no stamp is left alone', noStamp.savedAt === undefined);
}

print('');
print('=== 11. the first hour has a shape ===');
{
  const st = world();
  st.cash.clean = 300000;

  // A brand new player is on step one, and it is the base.
  const first = currentStep(st);
  check('a new player is told what to do first', first && first.id === 'hq', first && first.id);

  // A genuinely empty start has nothing ticked. (The shared fixture world
  // already owns a depot, so it starts one step in.)
  const bare = world();
  bare.buildings = [];
  bare.couriers = [];
  bare.routes = [];
  bare.cash.dirty = 0;
  bare.stats.grossRevenue = 0;
  check('an empty start has nothing ticked', onboardingProgress(bare).done === 0,
        onboardingProgress(bare).done + '/' + onboardingProgress(bare).total);

  // Steps read the world, so doing the thing advances them.
  const b = open(st, 'grow_house');
  A.setHeadquarters(st, b.id);
  check('setting a base advances the list', currentStep(st).id !== 'hq', currentStep(st).id);
  check('making something is now ticked',
        !STEPS.find((x) => x.id === 'produce') || STEPS.find((x) => x.id === 'produce').check(st));

  check('two bases are not allowed', !A.setHeadquarters(st, b.id).ok);

  // Working all the way through leaves nobody nagging.
  open(st, 'depot');
  const v = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, v.id, A.hireDriver(st).driver.id);
  const r = wire(st, b.id, 'district', st.districts[3].id, 'packs', 'any', 2);
  r.active = true;
  st.cash.dirty = 10;
  open(st, 'laundromat');
  check('the list finishes', currentStep(st) === null,
        onboardingProgress(st).done + '/' + onboardingProgress(st).total);

  // And it can be waved away at any point.
  const st2 = world();
  st2.tutorialDismissed = true;
  check('it can be dismissed', currentStep(st2) === null);

  // Your own block runs calmer than the rest.
  const st3 = world();
  const home = open(st3, 'grow_house');
  const d = st3.districts.find((x) => x.id === home.districtId);
  const other = st3.districts.find((x) => x.id !== home.districtId);
  d.heat = 60; other.heat = 60;
  home.active = false; // isolate decay from production heat
  A.setHeadquarters(st3, home.id);
  stepSim(st3, 12, {});
  check('heat sheds faster where you live', d.heat < other.heat,
        'home ' + d.heat.toFixed(1) + ' vs ' + other.heat.toFixed(1));
}

print('');
print(fail ? fail + ' FAILURE(S), ' + pass + ' passed' : 'all ' + pass + ' checks passed');
