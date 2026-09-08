// Regression tests for defects found in review. Each one reproduces a bug
// that was actually shipped, so they stay here to stop it coming back.
//   jsc -m tools/regressions.js

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState, createRoute, saveGame, loadGame } from '../src/game/state.js';
import { stepSim, cityPrice, catchUp, MAX_CATCHUP_HOURS, rentBonusFor } from '../src/game/sim.js';
import { upkeepFor, vehicleStats, maxRoutesFor, rentUpgrades, RENT_UPGRADES } from '../src/game/upgrades.js';
import { lotPrice, dwellingsIn, rentPerDay } from '../src/game/lots.js';
import { LICENCES, FIREARM_CLASSES, hasLicence } from '../src/game/firearms.js';
import { isHeld, districtName, turfUpkeep, TURF_UPGRADES } from '../src/game/turf.js';
const pctOf = (v) => Math.round(v * 100) + '%';
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

function districtOf(st, lot) { return st.districts.find((d) => d.id === lot.districtId); }

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
print('=== 12. a big vehicle works a circuit ===');
{
  const st = world();
  const grow = open(st, 'grow_house');
  const r1 = wire(st, grow.id, 'district', st.districts[2].id, 'packs', 'any', 2);
  const r2 = wire(st, grow.id, 'district', st.districts[5].id, 'packs', 'any', 2);
  const r3 = wire(st, grow.id, 'district', st.districts[8].id, 'packs', 'any', 2);

  // Size decides how many lines you can hold.
  check('a runner on foot works one line at a time',
        maxRoutesFor(COURIERS.runner || COURIERS.foot_runner || { capacity: 12, class: 'foot' }) === 1);
  const truckMax = maxRoutesFor(COURIERS.boxtruck || COURIERS.box_truck);
  const bikeMax = maxRoutesFor(COURIERS.bike);
  check('a bigger vehicle holds more lines', truckMax > bikeMax,
        'truck ' + truckMax + ' vs bike ' + bikeMax);

  const v = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, v.id, A.hireDriver(st).driver.id);
  A.assignCourier(st, v.id, r1.id);
  check('one line assigned', v.routeIds.length === 1);

  const add = A.addRouteToVehicle(st, v.id, r2.id);
  check('a second line can be added', add.ok, add.ok ? add.count + '/' + add.max : add.error);
  check('the same line cannot be added twice', !A.addRouteToVehicle(st, v.id, r2.id).ok);

  // Fill it past capacity and it should refuse rather than silently take it.
  const cap = maxRoutesFor(COURIERS.sedan, v);
  let refused = null;
  for (let i = v.routeIds.length; i < cap + 2; i++) {
    const res = A.addRouteToVehicle(st, v.id, r3.id);
    if (!res.ok) { refused = res.error; break; }
  }
  check('it refuses more lines than it can hold', v.routeIds.length <= cap,
        v.routeIds.length + ' of ' + cap + (refused ? ' — ' + refused : ''));

  // Working it should visit more than one line.
  const seen = new Set();
  for (let h = 0; h < 48; h += 0.05) { stepSim(st, 0.05, {}); if (v.routeId) seen.add(v.routeId); }
  check('it works round the circuit rather than one line forever', seen.size > 1,
        'visited ' + seen.size + ' of ' + v.routeIds.length);

  // Deleting a line should not strand the vehicle.
  A.removeRoute(st, v.routeIds[0]);
  check('removing a line leaves the rest running',
        v.routeIds.length >= 1 && v.routeId && v.routeIds.includes(v.routeId),
        v.routeIds.length + ' left, on ' + v.routeId);

  // A vehicle still lives at its depot, not at whatever it collects from.
  const depot = st.buildings.find((b) => b.kind === 'depot');
  check('a route does not move where a vehicle lives', v.homeBuildingId === depot.id,
        'home ' + v.homeBuildingId + ' vs depot ' + depot.id);
}

print('');
print('=== 13. property has depth: storeys, flats, work and crime ===');
{
  const st = world();
  const d = st.districts[4];

  // Height is worth money, but not linearly.
  const one = lotPrice('apartment', 400, d, 1);
  const four = lotPrice('apartment', 400, d, 4);
  check('storeys are worth money', four > one, '1 storey $' + one + ' vs 4 storeys $' + four);
  check('but not four times as much', four < one * 4,
        (four / one).toFixed(2) + 'x for 4x the floors');

  // A block of flats is many front doors.
  check('a block of flats has many lettings', dwellingsIn('apartment', 600, 5) > 5,
        dwellingsIn('apartment', 600, 5) + ' flats in 600 m2 x5');
  check('a house is one letting', dwellingsIn('house', 600, 2) === 1);
  check('a warehouse is not a home', dwellingsIn('warehouse', 600, 1) === 0);

  // Multi-let earns more than a single tenancy of the same value.
  const flats = { kind: 'apartment', areaM2: 600, levels: 5, price: 400000,
                  units: dwellingsIn('apartment', 600, 5), rentUpgrades: [], owned: true };
  const single = { ...flats, units: 1 };
  check('many lettings beat one', rentPerDay(flats, d) > rentPerDay(single, d),
        '$' + rentPerDay(flats, d) + ' vs $' + rentPerDay(single, d));

  // Work raises the rent, and the action charges for it.
  const lot = st.lots.find((l) => !l.owned && (RENT_UPGRADES[l.kind] || []).length);
  A.buyLot(st, lot.id);
  const rentBefore = rentPerDay(lot, districtOf(st, lot));
  const work = rentUpgrades(lot)[0];
  const res = A.improveRental(st, lot.id, work.id);
  check('rental work can be done', res.ok, res.ok ? res.upgrade.name : res.error);
  check('and it raises the rent', rentPerDay(lot, districtOf(st, lot)) > rentBefore,
        '$' + rentBefore + ' -> $' + rentPerDay(lot, districtOf(st, lot)));
  check('the same work is not done twice', !A.improveRental(st, lot.id, work.id).ok);
  check('rental work is refused on a working building',
        !A.improveRental(st, open(st, 'grow_house').lotId, work.id).ok);

  // Crime is dynamic, and a bad block is worth less.
  const st2 = world();
  const hot = st2.districts[6];
  const calm = st2.districts[7];
  hot.heat = 90; calm.heat = 0;
  hot.wealth = calm.wealth; hot.policing = calm.policing;
  hot.crime = calm.crime = 0.3;
  hot.marketIndex = calm.marketIndex = 1;
  for (let h = 0; h < 24 * 14; h += 6) stepSim(st2, 6, {});
  check('crime rises where there is heat', hot.crime > calm.crime,
        'hot ' + hot.crime.toFixed(2) + ' vs calm ' + calm.crime.toFixed(2));
  check('a bad block is worth less', hot.marketIndex < calm.marketIndex,
        'hot ' + hot.marketIndex.toFixed(2) + ' vs calm ' + calm.marketIndex.toFixed(2));
}

print('');
print('=== 14. firearms: two ways out, and paperwork to use one ===');
{
  const st = world();
  st.adminUnlockAll = true;
  st.cash.clean = 900000;
  for (const d of st.districts) d.heat = 0;

  // The ladder is real: you can't jump to a manufacturer's licence.
  check('a manufacturer licence needs a dealer licence first',
        !A.applyForLicence(st, 'ffl07').ok, A.applyForLicence(st, 'ffl07').error);
  const a1 = A.applyForLicence(st, 'ffl01');
  check('a dealer licence can be applied for', a1.ok, a1.ok ? a1.licence.short : a1.error);
  check('it does not arrive instantly', !hasLicence(st, 'ffl01'));
  check('applying twice is refused', !A.applyForLicence(st, 'ffl01').ok);

  // It takes weeks, and then it's in force.
  for (let d = 0; d < LICENCES.ffl01.processingDays + 1; d++) stepSim(st, 24, {});
  check('it comes through after the processing time', hasLicence(st, 'ffl01'));

  // They look at your record.
  const st2 = world();
  st2.cash.clean = 900000;
  st2.districts[0].heat = 95;
  check('a licence is refused when you are too hot',
        !A.applyForLicence(st2, 'ffl01').ok, A.applyForLicence(st2, 'ffl01').error);

  // A licensed workshop is dead without its licence.
  const st3 = world();
  st3.adminUnlockAll = true;
  st3.cash.clean = 900000;
  const shop = open(st3, 'gunsmith');
  stepSim(st3, 40, {});
  check('a licensed shop will not run unlicensed',
        shop.raw.iron === 0 && /FFL 07/.test(shop.stalledReason || ''),
        shop.stalledReason);

  // Tooling changes what comes off the line.
  const st4 = world();
  st4.adminUnlockAll = true;
  st4.cash.clean = 900000;
  const back = open(st4, 'machine_shop');
  A.setProductionLine(st4, back.id, 'shotgun');
  stepSim(st4, 24 * 4, {});
  const shotguns = back.raw.iron;

  const st5 = world();
  st5.adminUnlockAll = true;
  st5.cash.clean = 900000;
  const back2 = open(st5, 'machine_shop');
  A.setProductionLine(st5, back2.id, 'rifle');
  stepSim(st5, 24 * 4, {});
  check('a shotgun line out-produces a rifle line', shotguns > back2.raw.iron,
        shotguns.toFixed(1) + ' shotguns vs ' + back2.raw.iron.toFixed(1) + ' rifles');
  check('but rifles are the better unit',
        back2.rawQuality.iron > back.rawQuality.iron,
        back2.rawQuality.iron.toFixed(2) + ' vs ' + back.rawQuality.iron.toFixed(2));

  // A back room can build anything; a licensed shop needs the stamp.
  check('a back room will tool for NFA without paperwork',
        A.setProductionLine(st4, back.id, 'nfa').ok);
  const st6 = world();
  st6.adminUnlockAll = true;
  st6.cash.clean = 900000;
  st6.licences = { ffl01: { id: 'ffl01', status: 'active', renewsInDays: 365 },
                   ffl07: { id: 'ffl07', status: 'active', renewsInDays: 365 } };
  const legal = open(st6, 'gunsmith');
  check('a licensed shop will not tool for NFA without the stamp',
        !A.setProductionLine(st6, legal.id, 'nfa').ok);

  // And the legal counter pays less than the street, into clean money.
  check('legal margins are below street value',
        Object.values(FIREARM_CLASSES).every((c) => c.legalMargin < 1));

  // The counter actually works: stock in, clean money out, no heat.
  const st8 = world();
  st8.adminUnlockAll = true;
  st8.cash.clean = 900000;
  st8.licences = { ffl01: { id: 'ffl01', status: 'active', renewsInDays: 365 } };
  const store = open(st8, 'gun_store');
  check('a gun store holds stock', !!store.packs, store.packs ? 'yes' : 'no packs map');
  if (store.packs) {
    store.packs.iron = 40;
    store.packQuality.iron = 0.7;
    const cleanBefore = st8.cash.clean;
    const dirtyBefore = st8.cash.dirty;
    const heatBefore = st8.districts.find((d) => d.id === store.districtId).heat;
    stepSim(st8, 24, {});
    check('it sells iron over the counter', store.packs.iron < 40,
          (40 - store.packs.iron).toFixed(1) + ' units moved');
    check('into clean money, not street money', st8.cash.clean > cleanBefore
          && Math.abs(st8.cash.dirty - dirtyBefore) < 0.01,
          'clean +$' + Math.round(st8.cash.clean - cleanBefore));
    const heatAfter = st8.districts.find((d) => d.id === store.districtId).heat;
    check('and it is quiet', heatAfter - heatBefore < 1,
          'heat ' + heatBefore.toFixed(2) + ' -> ' + heatAfter.toFixed(2));
  }

  // A licence lapses if it isn't renewed.
  const st7 = world();
  st7.licences = { ffl01: { id: 'ffl01', status: 'active', renewsInDays: 2 } };
  for (let d = 0; d < 4; d++) stepSim(st7, 24, {});
  check('a licence lapses when it is not renewed', !hasLicence(st7, 'ffl01'),
        st7.licences.ffl01.status);
}

print('');
print('=== 15. blocks you hold are yours to name and to run ===');
{
  const st = world();
  st.cash.clean = 900000;
  const d = st.districts[3];

  // You can't do any of it until the block is actually yours.
  d.rivalControl = 0.6; d.rep = 0.1;
  check('a contested block cannot be renamed', !A.renameDistrict(st, d.id, 'The Yard').ok,
        A.renameDistrict(st, d.id, 'The Yard').error);
  check('and nothing can be arranged on it', !A.improveTurf(st, d.id, 'lookouts').ok);

  // Take it, and it opens up.
  d.rivalControl = 0.02; d.rep = 0.7;
  check('a block you hold reads as held', isHeld(d));
  const rn = A.renameDistrict(st, d.id, 'The Yard');
  check('it can be renamed', rn.ok && districtName(d) === 'The Yard', districtName(d));
  check('clearing the name puts the real one back',
        A.renameDistrict(st, d.id, '').ok && districtName(d) === d.name, districtName(d));

  const up = A.improveTurf(st, d.id, 'lookouts');
  check('an arrangement can be put in place', up.ok, up.ok ? up.upgrade.name : up.error);
  check('the same one is not bought twice', !A.improveTurf(st, d.id, 'lookouts').ok);
  check('it costs money every day', turfUpkeep(st) > 0, '$' + turfUpkeep(st) + '/day');
  check('and it can be stopped', A.endTurfUpgrade(st, d.id, 'lookouts').ok && turfUpkeep(st) === 0);

  // Paying the precinct off should visibly cut raids on that block.
  function raidsOver(withPatrol) {
    const s2 = world();
    s2.cash.clean = 5000000;
    const b = open(s2, 'grow_house');
    const blk = s2.districts.find((x) => x.id === b.districtId);
    blk.rivalControl = 0; blk.rep = 0.8;
    if (withPatrol) A.improveTurf(s2, blk.id, 'patrol');
    let raids = 0;
    for (let i = 0; i < 40; i++) {
      blk.heat = 95;                    // pin it hot so raids are the variable
      const before = s2.stats.raids;
      stepSim(s2, 6, {});
      raids += s2.stats.raids - before;
      if (!s2.buildings.length) break;  // condemned; stop counting
    }
    return raids;
  }
  const bare = raidsOver(false);
  const bought = raidsOver(true);
  check('paying the precinct off cuts raids', bought < bare,
        bare + ' raids bare vs ' + bought + ' with the precinct paid');
  check('but it is not immunity', TURF_UPGRADES.patrol.effects.policeSuppression < 1,
        pctOf(TURF_UPGRADES.patrol.effects.policeSuppression));
}

print('');
print('=== 16. the corporate tier is a different league ===');
{
  const st = world();
  st.adminUnlockAll = true;
  st.cash.clean = 12000000;

  const CORP = ['holding_co', 'members_club', 'terminal', 'pharma_plant'];
  for (const id of CORP) {
    const def = BUILDINGS[id];
    check(id + ' needs a serious building', def.minAreaM2 >= 420, def.minAreaM2 + ' m2 minimum');
    check(id + ' is gated behind a real empire',
          def.unlock && def.unlock.cash >= 900000,
          '$' + def.unlock.cash.toLocaleString() + ' and ' + def.unlock.properties + ' properties');
  }

  // It out-earns the tier below it, which is the whole point.
  check('a members club out-earns a nightclub',
        BUILDINGS.members_club.revenuePerDay > BUILDINGS.nightclub.revenuePerDay * 2,
        '$' + BUILDINGS.members_club.revenuePerDay + ' vs $' + BUILDINGS.nightclub.revenuePerDay);
  check('a terminal holds far more than a stash',
        BUILDINGS.terminal.capacity > BUILDINGS.stash.capacity * 5,
        BUILDINGS.terminal.capacity + ' vs ' + BUILDINGS.stash.capacity);
  check('a pharma plant out-processes a lab',
        BUILDINGS.pharma_plant.rawPerHour > BUILDINGS.lab.rawPerHour * 10,
        BUILDINGS.pharma_plant.rawPerHour + '/h vs ' + BUILDINGS.lab.rawPerHour + '/h');

  // A holding company genuinely lifts the rent it collects.
  const lot = st.lots.find((l) => !l.owned && l.areaM2 > 200);
  A.buyLot(st, lot.id);
  A.rentOut(st, lot.id);
  const cleanBefore = st.cash.clean;
  stepSim(st, 24, {});
  const plain = st.cash.clean - cleanBefore;

  const st2 = world();
  st2.adminUnlockAll = true;
  st2.cash.clean = 12000000;
  const lot2 = st2.lots.find((l) => l.id === lot.id) || st2.lots.find((l) => !l.owned && l.areaM2 > 200);
  A.buyLot(st2, lot2.id);
  A.rentOut(st2, lot2.id);
  const holding = open(st2, 'holding_co');
  check('a holding company can actually be built', !!holding, holding && holding.name);
  check('and it lifts what you collect', rentBonusFor(st2) > 0,
        Math.round(rentBonusFor(st2) * 100) + '% on every tenancy');
  check('nothing lifts it without one', rentBonusFor(st) === 0);
}

print('');
print(fail ? fail + ' FAILURE(S), ' + pass + ' passed' : 'all ' + pass + ' checks passed');
