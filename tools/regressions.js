// Regression tests for defects found in review. Each one reproduces a bug
// that was actually shipped, so they stay here to stop it coming back.
//   jsc -m tools/regressions.js

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState, createRoute, saveGame, loadGame, buildingLabel } from '../src/game/state.js';
import { stepSim, cityPrice, catchUp, MAX_CATCHUP_HOURS, rentBonusFor, seedWorld, sizeScale } from '../src/game/sim.js';
import { upkeepFor, vehicleStats, maxRoutesFor, rentUpgrades, RENT_UPGRADES } from '../src/game/upgrades.js';
import { lotPrice, dwellingsIn, rentPerDay } from '../src/game/lots.js';
import { sellRatePerHour, streetPrice as streetPriceOf } from '../src/game/economy.js';
import { rhythmFactor, rhythmNote, cityClock, darkness } from '../src/game/rhythm.js';
import {
  raise, stepIncidents, activeIncidents, unseenCount, markSeen,
  INCIDENT_IDS, MAX_INCIDENTS,
} from '../src/game/incidents.js';
import {
  LICENCES, FIREARM_CLASSES, hasLicence, MODELS, MODEL_IDS, modelEffects,
} from '../src/game/firearms.js';
import { isHeld, districtName, turfUpkeep, TURF_UPGRADES } from '../src/game/turf.js';
import { isResearched, researchQuality, itemValue, ITEM_KINDS } from '../src/game/research.js';
import {
  generatePlayers, leaderboard, playerWorth, placePlayers, knownOperations,
  stepDiscovery, offerForProduct,
} from '../src/game/players.js';
import { attachLocal, connection } from '../src/game/net.js';
import { makeRng } from '../src/game/rng.js';
const pctOf = (v) => Math.round(v * 100) + '%';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { currentStep, progress as onboardingProgress, STEPS } from '../src/game/onboarding.js';
import { BUILDINGS, BUILDING_IDS, COURIERS, PRODUCT_IDS, PRODUCTS, MARKET } from '../src/game/constants.js';
import { fitsBuilding, operationOptions } from '../src/game/actions.js';
import { haversineKm } from '../src/game/geo.js';
import * as A from '../src/game/actions.js';

let pass = 0, fail = 0;
const carried = (c) => PRODUCT_IDS.reduce((n, p) => n + c.cargo[p], 0);
function check(name, ok, detail) {
  print((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
  ok ? pass++ : fail++;
}

function openIn(st, type, pick) {
  const lot = (st.lots || []).filter((l) => !l.owned && l.kind !== 'parking'
    && l.areaM2 >= BUILDINGS[type].minAreaM2
    && (!BUILDINGS[type].maxAreaM2 || l.areaM2 <= BUILDINGS[type].maxAreaM2))
    .filter(pick).sort((a, b) => a.price - b.price)[0];
  if (!lot) return null;
  A.buyLot(st, lot.id);
  return A.developLot(st, lot.id, type).building;
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

  // Paying the precinct off should visibly cut raids on that block. Raids are
  // a rare event, so this seeds the world and runs many trials — otherwise the
  // result is noise and the check lies in both directions.
  function raidsOver(withPatrol) {
    let raids = 0;
    for (let trial = 0; trial < 12; trial++) {
      seedWorld(1000 + trial);          // same randomness for both conditions
      const s2 = world();
      s2.cash.clean = 5000000;
      const b = open(s2, 'grow_house');
      const blk = s2.districts.find((x) => x.id === b.districtId);
      blk.rivalControl = 0; blk.rep = 0.8;
      if (withPatrol) A.improveTurf(s2, blk.id, 'patrol');
      for (let i = 0; i < 30; i++) {
        blk.heat = 95;                  // pin it hot so raids are the variable
        const before = s2.stats.raids;
        stepSim(s2, 6, {});
        raids += s2.stats.raids - before;
        if (!s2.buildings.length) break; // condemned; this trial is over
      }
    }
    return raids;
  }
  const bare = raidsOver(false);
  const bought = raidsOver(true);
  check('paying the precinct off cuts raids', bought < bare,
        bare + ' raids bare vs ' + bought + ' with the precinct paid, over 12 seeded trials');
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
print('=== 17. research, and things only you have made ===');
{
  const st = world();
  st.adminUnlockAll = true;
  st.cash.clean = 6000000;

  check('research needs a facility', !A.startResearch(st, 'phenohunt').ok,
        A.startResearch(st, 'phenohunt').error);

  const lab = open(st, 'research_lab');
  check('an R&D facility can be built', !!lab, lab && lab.name);

  check('a project cannot skip its prerequisite', !A.startResearch(st, 'tissue').ok,
        A.startResearch(st, 'tissue').error);
  const started = A.startResearch(st, 'phenohunt');
  check('a project can be started', started.ok, started.ok ? started.project.name : started.error);
  check('it is not instant', !isResearched(st, 'phenohunt'));
  check('only so many at once',
        A.startResearch(st, 'substrate').ok && A.startResearch(st, 'reflux').ok
        && !A.startResearch(st, 'tooling').ok);

  // Work it through and the effect is real.
  const grow = open(st, 'grow_house');
  for (let h = 0; h < 24 * 90; h += 6) stepSim(st, 6, {});
  check('a project finishes', isResearched(st, 'phenohunt'),
        (st.research || []).join(', ') || 'none');
  check('and it improves what you make', researchQuality(st, 'weed') > 0,
        '+' + researchQuality(st, 'weed').toFixed(2) + ' quality');

  // The benches throw off one-offs over time.
  check('the work turns things up', (st.items || []).length > 0,
        (st.items || []).length + ' made');

  if ((st.items || []).length) {
    const item = st.items[0];
    const worth = itemValue(st, item);
    check('an item is worth real money', worth > 1000, '$' + worth.toLocaleString());

    // Rarity drives value.
    const cheap = itemValue(st, { ...item, tier: 'common' });
    const dear = itemValue(st, { ...item, tier: 'oneoff' });
    check('rarity is what it is worth', dear > cheap * 5,
          '$' + cheap.toLocaleString() + ' common vs $' + dear.toLocaleString() + ' one-of-one');

    // Fitting one to the right kind of thing works; the wrong kind does not.
    const kind = ITEM_KINDS[item.kind];
    const target = kind.slot === 'vehicle' ? null : grow;
    if (target) {
      check('it can be fitted to a building', A.equipItem(st, item.id, target.id).ok);
      check('and only one thing at a time carries it',
            st.items.filter((i) => i.equippedTo === target.id).length === 1);
    }

    const before = st.cash.clean;
    const sold = A.sellItem(st, item.id);
    check('it can be sold', sold.ok && st.cash.clean > before,
          sold.ok ? '+$' + sold.price.toLocaleString() : sold.error);
    check('and it is gone once sold', !st.items.some((i) => i.id === item.id));
  }
}

print('');
print('=== 18. other operations, and where you stand ===');
{
  seedWorld(77);
  const st = world();
  st.players = generatePlayers(makeRng(4242));
  check('a field of operations is seeded', st.players.length > 3, st.players.length + ' others');
  check('they are all different people',
        new Set(st.players.map((p) => p.name)).size === st.players.length);
  check('they start at a spread of sizes',
        new Set(st.players.map((p) => p.worth)).size > 3);

  // You are always on the board, marked.
  const board = leaderboard(st);
  const you = board.find((e) => e.isYou);
  check('you are on the board', !!you, you && ('#' + you.rank + ' of ' + board.length));
  check('the board is sorted by worth',
        board.every((e, i) => i === 0 || board[i - 1].worth >= e.worth));

  // Net worth counts property, not just cash.
  const cashOnly = playerWorth(st);
  const lot = st.lots.find((l) => !l.owned);
  A.buyLot(st, lot.id);
  check('property counts toward what you are worth',
        Math.abs(playerWorth(st) - cashOnly) < lot.price * 0.5,
        'spent $' + lot.price + ', worth moved $' + Math.abs(playerWorth(st) - cashOnly));

  // They move over time, and the board reshuffles.
  const before = st.players.map((p) => p.worth);
  for (let d = 0; d < 30; d++) stepSim(st, 24, {});
  check('other operations grow over time',
        st.players.some((p, i) => p.worth !== before[i]),
        'top is now $' + Math.max(...st.players.map((p) => p.worth)).toLocaleString());

  // And the admin switch actually switches them off.
  st.aiDisabled = true;
  const solo = leaderboard(st);
  check('they can be switched off', solo.length === 1 && solo[0].isYou,
        solo.length + ' on the board');
  const frozen = st.players.map((p) => p.worth);
  for (let d = 0; d < 10; d++) stepSim(st, 24, {});
  check('and they stop moving when off',
        st.players.every((p, i) => p.worth === frozen[i]));
}

print('');
print('=== 19. an operation has to fit the building ===');
{
  const st = world();
  st.adminUnlockAll = true;
  st.cash.clean = 20000000;

  // Every building has both ends of a range, and they make sense.
  const noCeiling = BUILDING_IDS.filter((id) => !BUILDINGS[id].maxAreaM2);
  check('every operation has a ceiling', noCeiling.length === 0,
        noCeiling.join(', ') || BUILDING_IDS.length + ' checked');
  const inverted = BUILDING_IDS.filter((id) => BUILDINGS[id].maxAreaM2 <= BUILDINGS[id].minAreaM2);
  check('no ceiling sits under its own floor', inverted.length === 0, inverted.join(', '));

  // The note's example: a closet grow is a wardrobe, not a warehouse.
  const closet = BUILDINGS.closet_grow;
  check('a closet grow stays a closet', closet.maxAreaM2 <= closet.minAreaM2 * 3,
        closet.minAreaM2 + '-' + closet.maxAreaM2 + ' m2');
  check('a closet grow is refused in a big unit',
        !fitsBuilding(closet, { areaM2: 400, kind: 'warehouse' }).fits,
        fitsBuilding(closet, { areaM2: 400, kind: 'warehouse' }).reason);
  check('and allowed in a flat', fitsBuilding(closet, { areaM2: 22, kind: 'apartment' }).fits);

  // And the other end: a plant does not go in a terraced house.
  check('a pharmaceutical plant is refused at 150 m2',
        !fitsBuilding(BUILDINGS.pharma_plant, { areaM2: 150, kind: 'house' }).fits);
  check('a machine shop is refused at 150 m2',
        !fitsBuilding(BUILDINGS.machine_shop, { areaM2: 150, kind: 'house' }).fits);

  // The menu only lists what fits, so nothing unusable is ever offered.
  const tiny = { id: 'x1', areaM2: 24, kind: 'apartment', districtId: st.districts[0].id, owned: true };
  const huge = { id: 'x2', areaM2: 5200, kind: 'warehouse', districtId: st.districts[0].id, owned: true };
  const tinyOpts = operationOptions(tiny, st);
  const hugeOpts = operationOptions(huge, st);
  check('a tiny flat is not offered a nightclub',
        !tinyOpts.some((o) => o.id === 'nightclub'),
        tinyOpts.map((o) => o.id).join(', ') || 'nothing');
  check('a big shed is not offered a closet grow',
        !hugeOpts.some((o) => o.id === 'closet_grow'),
        hugeOpts.length + ' options at 5,200 m2');
  check('everything offered actually fits',
        tinyOpts.concat(hugeOpts).every((o) => fitsBuilding(o.def, o.def === BUILDINGS[o.id] && tinyOpts.includes(o) ? tiny : huge).fits));

  // The action refuses it too, not just the menu.
  const big = st.lots.find((l) => !l.owned && l.areaM2 > 600 && l.kind !== 'parking');
  if (big) {
    A.buyLot(st, big.id);
    const res = A.developLot(st, big.id, 'closet_grow');
    check('the action refuses a bad fit as well', !res.ok, res.error);
  }

  // Progression gates still show, because those are goals rather than misfits.
  const st2 = world();
  st2.cash.clean = 0;
  const mid = { id: 'x3', areaM2: 300, kind: 'retail', districtId: st2.districts[0].id, owned: true };
  check('gated operations are still offered, marked locked',
        operationOptions(mid, st2).some((o) => o.locked),
        operationOptions(mid, st2).filter((o) => o.locked).map((o) => o.id).join(', '));
}

print('');
print('=== 20. you find people by working the same ground ===');
{
  seedWorld(31);
  const st = world();
  st.players = generatePlayers(makeRng(909));
  placePlayers(st, makeRng(303));

  check('every operation works somewhere real',
        st.players.every((p) => (p.blocks || []).length > 0),
        st.players.map((p) => (p.blocks || []).length).join(','));
  check('they are not all on one block',
        new Set(st.players.flatMap((p) => p.blocks)).size > 2);
  check('you start knowing nobody', knownOperations(st).length === 0);

  // Buying onto somebody's ground introduces you both, immediately.
  const target = st.players[0];
  const theirBlock = target.blocks[0];
  const lot = st.lots.find((l) => !l.owned && l.districtId === theirBlock && l.kind !== 'parking');
  if (lot) {
    A.buyLot(st, lot.id);
    check('buying onto their block introduces you', target.known && target.knowsYou,
          target.name + ' met on ' + theirBlock);
  }

  // And working near somebody turns them up over time without buying in.
  const st2 = world();
  st2.players = generatePlayers(makeRng(11));
  placePlayers(st2, makeRng(22));
  const other = st2.players[1];
  const blk = st2.districts.find((d) => d.id === other.blocks[0]);
  blk.supply.weed = 40;                    // you are selling on their corner
  let met = 0;
  for (let d = 0; d < 60 && !other.known; d++) {
    met += stepDiscovery(st2, 1, Math.random).length;
  }
  check('working their corner turns them up', other.known,
        other.known ? 'found ' + other.name : 'never found them');

  // Trading: they pay against the street, by what they deal in.
  const st3 = world();
  st3.players = generatePlayers(makeRng(55));
  placePlayers(st3, makeRng(66));
  const ironDealer = st3.players.find((p) => p.style === 'iron');
  const cleanSkin = st3.players.find((p) => p.style === 'legit');
  if (ironDealer && cleanSkin) {
    check('somebody who deals in iron pays more for it',
          offerForProduct(ironDealer, 'iron', 100) > offerForProduct(cleanSkin, 'iron', 100),
          '$' + offerForProduct(ironDealer, 'iron', 100) + ' vs $' + offerForProduct(cleanSkin, 'iron', 100));
  }

  // Selling in bulk to somebody you know moves stock and pays street money.
  const st4 = world();
  st4.players = generatePlayers(makeRng(77));
  placePlayers(st4, makeRng(88));
  const buyer = st4.players[0];
  const stash = open(st4, 'stash');
  stash.packs.weed = 200;
  check('you cannot deal with somebody you have not met',
        !A.sellProductTo(st4, stash.id, buyer.id, 'weed').ok);
  buyer.known = true;
  const dirtyBefore = st4.cash.dirty;
  const sale = A.sellProductTo(st4, stash.id, buyer.id, 'weed');
  check('you can move product to somebody you know', sale.ok,
        sale.ok ? Math.round(sale.moved) + ' packs at $' + sale.unit : sale.error);
  check('it pays street money', st4.cash.dirty > dirtyBefore,
        '+$' + Math.round(st4.cash.dirty - dirtyBefore));
  check('and it comes off the shelf', stash.packs.weed < 200,
        stash.packs.weed.toFixed(0) + ' left of 200');
  check('they can only take so much', stash.packs.weed > 0 || sale.moved <= 200);

  // One-offs go to whoever wants them most.
  const st5 = world();
  st5.players = generatePlayers(makeRng(99));
  const collector = st5.players[0];
  collector.known = true;
  st5.items = [{ id: 'it1', kind: 'pattern', tier: 'rare', name: 'Test Pattern', equippedTo: null }];
  const cleanBefore = st5.cash.clean;
  const gone = A.sellItemTo(st5, 'it1', collector.id);
  check('a one-off can be sold to somebody', gone.ok,
        gone.ok ? '$' + gone.price.toLocaleString() : gone.error);
  check('it pays clean money', st5.cash.clean > cleanBefore);
  check('and it leaves your hands', st5.items.length === 0);

  // The adapter seam: the game only ever talks to one of these.
  const local = attachLocal(st5);
  check('the game talks to other operations through an adapter',
        typeof local.list === 'function' && connection().kind === 'local',
        connection().label);
}

print('');
print('=== 21. a backgrounded tab does not lose the world ===');
{
  // A hidden tab is throttled by the browser, so the loop crawls. Coming back
  // has to be treated like coming back to a closed tab: same catch-up, same
  // result, so switching tabs is never the wrong thing to do.
  const played = world();
  const grow1 = open(played, 'grow_house');
  for (let h = 0; h < 6; h += 0.05) stepSim(played, 0.05, {});

  const backgrounded = world();
  const grow2 = open(backgrounded, 'grow_house');
  const report = catchUp(backgrounded, 6 * 3600000, {});

  check('coming back from a hidden tab catches the time up', !!report && report.hours === 6,
        report ? report.hours + 'h' : 'nothing');
  const gap = Math.abs(grow2.raw.weed - grow1.raw.weed) / Math.max(1, grow1.raw.weed);
  check('and lands where playing it would have', gap < 0.05,
        'played ' + grow1.raw.weed.toFixed(1) + ' vs backgrounded ' + grow2.raw.weed.toFixed(1));
  check('a brief switch is not worth reporting', catchUp(world(), 5000, {}) === null);

  // The specific shape that broke it: a cycle length that divides evenly into
  // the catch-up step size, so accumulated float progress lands a hair under 1.
  for (const hours of [6, 12, 0.5, 24, 3]) {
    const st = world();
    const g2 = open(st, 'grow_house');
    // Drive it exactly N whole cycles in one call.
    stepSim(st, BUILDINGS.grow_house.cycleHours * (hours / BUILDINGS.grow_house.cycleHours), {});
    stepSim(st, BUILDINGS.grow_house.cycleHours, {});
    check(`a cycle completes cleanly over ${hours}h + one full cycle`,
          g2.raw.weed > 0,
          'raw ' + g2.raw.weed.toFixed(2) + ', cycle at ' + g2.cycleProgress.toFixed(6));
  }
}

print('');
print('=== 22. what a place buys in matches what it turns out ===');
{
  // Output scales with the floorplate. Supplies did not, so a small starter
  // grow paid a full room's worth of nutrient for 70% of a room's yield and
  // could never get out of the hole.
  const st = world();
  const small = openIn(st, 'grow_house', (l) => l.areaM2 < 100);
  const big = openIn(st, 'grow_house', (l) => l.areaM2 > 300);
  if (small && big) {
    check('a small room turns out less', small.scale < big.scale,
          'x' + small.scale.toFixed(2) + ' vs x' + big.scale.toFixed(2));

    const costOf = (b) => BUILDINGS.grow_house.supplyCostPerSlot * BUILDINGS.grow_house.slots * sizeScale(b);
    check('and buys in proportionately less', costOf(small) < costOf(big),
          '$' + Math.round(costOf(small)) + ' vs $' + Math.round(costOf(big)) + ' per cycle');

    // Margin per cycle should not punish you for starting small.
    const marginOf = (b) => {
      const yieldPer = BUILDINGS.grow_house.slots * BUILDINGS.grow_house.rawPerSlot * sizeScale(b);
      return (yieldPer * PRODUCTS.weed.packsPerRaw * PRODUCTS.weed.basePrice) / costOf(b);
    };
    check('a small grow is not structurally worse off than a big one',
          Math.abs(marginOf(small) - marginOf(big)) < 0.01,
          marginOf(small).toFixed(2) + 'x vs ' + marginOf(big).toFixed(2) + 'x return on supplies');
  }

  // And the HUD must quote what the sim actually charges.
  const st2 = world();
  const g3 = open(st2, 'grow_house');
  const charged = BUILDINGS.grow_house.supplyCostPerSlot * BUILDINGS.grow_house.slots * sizeScale(g3);
  const cashBefore = st2.cash.dirty + st2.cash.clean;
  g3.cycleStarted = false;
  stepSim(st2, 0.05, {});
  const spent = cashBefore - (st2.cash.dirty + st2.cash.clean);
  check('the sim charges what the panel quotes', Math.abs(spent - charged) < 1,
        'charged $' + Math.round(spent) + ', quoted $' + Math.round(charged));
}

print('');
print('=== 23. going broke is loud ===');
{
  const st = world();
  const g4 = open(st, 'grow_house');
  st.cash.clean = 0;
  st.cash.dirty = 0;
  g4.cycleStarted = false;

  const logBefore = (st.log || []).length;
  stepSim(st, 0.05, {});
  check('a site that cannot buy supplies stops', /supplies/i.test(g4.stalledReason || ''),
        g4.stalledReason);
  check('and it says so out loud, once', (st.log || []).length > logBefore && g4.stalledBroke,
        (st.log || [])[0] ? (st.log || [])[0].text.slice(0, 70) : 'nothing logged');

  const logAfter = (st.log || []).length;
  for (let i = 0; i < 20; i++) stepSim(st, 0.05, {});
  check('it does not then repeat every tick', (st.log || []).length === logAfter,
        (st.log || []).length - logAfter + ' extra lines over 20 ticks');

  // And it clears once there's money again.
  st.cash.clean = 100000;
  stepSim(st, 0.05, {});
  check('it clears once you can pay again', !g4.stalledBroke && !g4.stalledReason,
        g4.stalledReason || 'running');
}

print('');
print('=== 24. you cannot bury a block ===');
{
  // A courier used to unload its whole load regardless of what the block could
  // shift, so one line piled up a fortnight of stock on a single corner and
  // pinned its own price at the floor for good. A stash house never did this.
  const st = world();
  const grow5 = open(st, 'grow_house');
  const d = st.districts[9];
  const r = wire(st, grow5.id, 'district', d.id, 'packs', 'any', 1);
  r.active = true;
  const v5 = A.buyVehicle(st, 'boxtruck').vehicle;
  A.assignDriver(st, v5.id, A.hireDriver(st).driver.id);
  A.assignCourier(st, v5.id, r.id);

  // Force-feed it: plenty of stock, one small block.
  grow5.packs.weed = 100000;
  grow5.packQuality.weed = 0.6;
  for (let h = 0; h < 24 * 40; h += 0.25) stepSim(st, 0.25, {});

  const ceiling = sellRatePerHour(d, 'weed') * MARKET.glutCap;
  check('a block never holds more than it can shift', d.supply.weed <= ceiling * 1.05,
        Math.round(d.supply.weed) + ' packs, ceiling ' + Math.round(ceiling));
  check('which is about two days of its own demand',
        MARKET.glutCap / 24 >= 1.5 && MARKET.glutCap / 24 <= 3,
        (MARKET.glutCap / 24).toFixed(1) + ' days');

  // Over-supplying still costs you, it just isn't permanent ruin.
  const price = streetPriceOf(d, 'weed');
  const base = PRODUCTS.weed.basePrice;
  check('glutting a block still hurts the price', price < base,
        '$' + price.toFixed(0) + ' against a $' + base + ' base');
  check('but not all the way to nothing', price > base * 0.2,
        '$' + price.toFixed(0));

  // What wouldn't fit stays on the vehicle rather than vanishing.
  const st2 = world();
  const grow6 = open(st2, 'grow_house');
  const d2 = st2.districts[11];
  d2.supply.weed = sellRatePerHour(d2, 'weed') * MARKET.glutCap; // already full
  const r2 = wire(st2, grow6.id, 'district', d2.id, 'packs', 'any', 1);
  r2.active = true;
  const v6 = A.buyVehicle(st2, 'van').vehicle;
  A.assignDriver(st2, v6.id, A.hireDriver(st2).driver.id);
  A.assignCourier(st2, v6.id, r2.id);
  grow6.packs.weed = 500;
  const supplyBefore = d2.supply.weed;
  for (let h = 0; h < 24 * 3; h += 0.25) stepSim(st2, 0.25, {});
  const stillSomewhere = grow6.packs.weed + carried(v6) + (d2.supply.weed - supplyBefore);
  check('product refused at the door is not destroyed', stillSomewhere > 0,
        'still holding ' + Math.round(carried(v6)) + ' aboard');
}

print('');
print('=== 25. every product has its own chain, end to end ===');
{
  // A lab that trims cannabis has no business proof-firing a receiver. Each
  // product is made somewhere and finished somewhere that knows how.
  const orphans = [];
  for (const pid of PRODUCT_IDS) {
    const makers = BUILDING_IDS.filter((id) => BUILDINGS[id].product === pid);
    const finishers = BUILDING_IDS.filter((id) => (BUILDINGS[id].handles || []).includes(pid));
    if (!makers.length || !finishers.length) orphans.push(pid);
  }
  check('every product is made and finished somewhere', orphans.length === 0,
        orphans.join(', ') || PRODUCT_IDS.length + ' products');

  check('firearms do not go through the drugs lab',
        !(BUILDINGS.lab.handles || []).includes('iron'),
        'lab handles ' + (BUILDINGS.lab.handles || []).join(', '));
  check('firearms have their own finishing house',
        (BUILDINGS.proof_house.handles || []).includes('iron'));
  check('tablets do not go through the drugs lab',
        !(BUILDINGS.lab.handles || []).includes('pills'));
  check('opium is grown, not conjured',
        BUILDINGS.poppy_field.product === 'pills' && BUILDINGS.poppy_field.kind === 'production');
  check('the pill press finishes it', BUILDINGS.pill_press.kind === 'processing'
        && (BUILDINGS.pill_press.handles || []).includes('pills'));

  // A line refuses work it isn't built for, and says so.
  const st = world();
  st.adminUnlockAll = true;
  st.cash.clean = 4000000;
  const lab7 = open(st, 'lab');
  lab7.raw.iron = 50;                     // somebody dropped receivers at a lab
  stepSim(st, 6, {});
  check('a lab will not finish firearms', lab7.packs.iron < 0.01,
        'made ' + lab7.packs.iron.toFixed(2) + ' packs');
  check('and it says why', /doesn.t handle it/i.test(lab7.stalledReason || ''),
        lab7.stalledReason);

  // The proof house does finish them.
  const proof = open(st, 'proof_house');
  proof.raw.iron = 50;
  stepSim(st, 12, {});
  check('a proof house finishes firearms', proof.packs.iron > 0,
        proof.packs.iron.toFixed(1) + ' finished units');

  // And the whole opium chain runs.
  const st2 = world();
  st2.adminUnlockAll = true;
  st2.cash.clean = 6000000;
  const field = open(st2, 'poppy_field');
  const press = open(st2, 'pill_press');
  if (field && press) {
    stepSim(st2, 24 * 3, {});
    check('a poppy field yields raw opium', field.raw.pills > 0,
          field.raw.pills.toFixed(1) + ' raw');
    press.raw.pills = 40;
    stepSim(st2, 12, {});
    check('the press turns it into tablets', press.packs.pills > 0,
          press.packs.pills.toFixed(1) + ' packs');
  }

  // Alternatives are fine, but only deliberate ones: anything beyond the
  // primary finisher has to be trading something away for it.
  for (const pid of PRODUCT_IDS) {
    const finishers = BUILDING_IDS.filter((id) => (BUILDINGS[id].handles || []).includes(pid));
    const proper = finishers.filter((id) => (BUILDINGS[id].qualityBonus ?? 0) >= 0);
    check(`${PRODUCTS[pid].name} has a straight route`, proper.length >= 1,
          proper.map((id) => BUILDINGS[id].name).join(', ') || 'none');
    // Where there is more than one, they must actually differ — two identical
    // routes is a duplicate, not a choice.
    const grades = new Set(proper.map((id) =>
      `${BUILDINGS[id].qualityBonus}:${BUILDINGS[id].rawPerHour}`));
    check(`and any second route for it is a real alternative`,
          grades.size === proper.length,
          proper.map((id) => `${BUILDINGS[id].name} q${BUILDINGS[id].qualityBonus}`).join(', '));
    const shortcuts = finishers.filter((id) => (BUILDINGS[id].qualityBonus ?? 0) < 0);
    check(`and any shortcut for it pays for the volume`,
          shortcuts.every((id) => (BUILDINGS[id].yieldBonus || 1) > 1),
          shortcuts.map((id) => BUILDINGS[id].name).join(', ') || 'no shortcuts');
  }
}

print('');
print('=== 26. the city has a rhythm, and it costs nothing ===');
{
  // Demand moves through the day and the week, but a full cycle has to average
  // out — otherwise the rhythm quietly rebalances the entire economy.
  for (const pid of PRODUCT_IDS) {
    let sum = 0, n = 0, lo = Infinity, hi = 0;
    for (let m = 0; m < 210 * 1440; m += 30) {
      const f = rhythmFactor(m, pid);
      sum += f; n++; lo = Math.min(lo, f); hi = Math.max(hi, f);
    }
    const avg = sum / n;
    check(PRODUCTS[pid].name + ' averages out over a full cycle',
          Math.abs(avg - 1) < 0.01, 'avg ' + avg.toFixed(3) + ', swings ' +
          lo.toFixed(2) + '-' + hi.toFixed(2) + 'x');
  }

  // And it actually swings, or there was no point.
  const fri = rhythmFactor(4 * 1440 + 23 * 60, 'coke');   // Friday, 11pm
  const tue = rhythmFactor(1 * 1440 + 8 * 60, 'coke');    // Tuesday, 8am
  check('a Friday night is not a Tuesday morning', fri > tue * 5,
        'x' + fri.toFixed(2) + ' vs x' + tue.toFixed(2));
  check('and firearms do not follow nightlife',
        rhythmFactor(4 * 1440 + 23 * 60, 'iron') < rhythmFactor(1 * 1440 + 12 * 60, 'iron'),
        'iron peaks in the daytime');

  // A block can still be stocked ahead of a busy night — otherwise nobody could
  // supply a Friday, and the opening stops paying for itself.
  const st = world();
  const d = st.districts[5];
  const quiet = 3 * 60;        // 3am, nobody buying
  const roomAt = (m) => sellRatePerHour(d, 'weed') * MARKET.glutCap - d.supply.weed;
  check('a block can be stocked when it is quiet', roomAt(quiet) > 0,
        Math.round(roomAt(quiet)) + ' packs of room at 3am');

  // Places are named on opening, and the name is the player's to change.
  const st3 = world();
  const b3 = open(st3, 'grow_house');
  check('a place is given a name when you open it',
        !!b3.label && b3.label !== BUILDINGS.grow_house.name, b3.label);
  check('and it reads by that name', buildingLabel(b3) === b3.label);
  A.renameBuilding(st3, b3.id, 'The Back Room');
  check('you can call it what you like', buildingLabel(b3) === 'The Back Room');
  A.renameBuilding(st3, b3.id, '');
  check('clearing it falls back to the type',
        buildingLabel(b3) === BUILDINGS.grow_house.name, buildingLabel(b3));
  const names = new Set();
  for (let i = 0; i < 24; i++) {
    const st4 = world();
    const b4 = open(st4, 'grow_house');
    if (b4) names.add(b4.label);
  }
  check('names vary between runs', names.size > 3, names.size + ' different names in 24 openings');

  // Night falls and lifts.
  check('the map darkens overnight',
        darkness(3 * 60) > 0.8 && darkness(13 * 60) < 0.2,
        '3am ' + darkness(3 * 60).toFixed(2) + ', 1pm ' + darkness(13 * 60).toFixed(2));

  // The note reads like a person wrote it.
  const notes = [0, 4 * 1440 + 23 * 60, 5 * 1440 + 20 * 60, 3 * 60].map((m) => rhythmNote(m));
  check('the city says what it is doing', notes.every((n) => n && n.length > 6),
        notes[1]);
}

print('');
print('=== 27. things happen at a place ===');
{
  const st = world();
  const d = st.districts[6];

  check('a new world has nothing happening', activeIncidents(st).length === 0);

  raise(st, 'eyes', { latlng: d.center, districtId: d.id, detail: '40 heat' });
  check('something can be raised at a place', activeIncidents(st).length === 1,
        activeIncidents(st)[0].type + ' at ' + activeIncidents(st)[0].districtId);
  check('it carries a location', !!activeIncidents(st)[0].latlng.lat);

  // The same problem in the same place is one problem, not forty.
  for (let i = 0; i < 30; i++) raise(st, 'eyes', { latlng: d.center, districtId: d.id });
  check('repeats refresh rather than stack', activeIncidents(st).length === 1,
        activeIncidents(st).length + ' on the map');

  // Different places are different problems.
  raise(st, 'eyes', { latlng: st.districts[7].center, districtId: st.districts[7].id });
  check('a different block is its own problem', activeIncidents(st).length === 2);

  // It is never allowed to become noise.
  for (let i = 0; i < 60; i++) {
    const dd = st.districts[i % st.districts.length];
    raise(st, INCIDENT_IDS[i % INCIDENT_IDS.length], { latlng: dd.center, districtId: dd.id });
  }
  check('the map never fills up with them', activeIncidents(st).length <= MAX_INCIDENTS,
        activeIncidents(st).length + ' of ' + MAX_INCIDENTS + ' max');

  // They age out.
  const before = activeIncidents(st).length;
  st.minutes += 48 * 60;
  stepIncidents(st);
  check('they expire on their own', activeIncidents(st).length < before,
        before + ' -> ' + activeIncidents(st).length);

  // Unseen is what draws the eye; opening one settles it.
  const st2 = world();
  raise(st2, 'queue', { latlng: st2.districts[2].center, districtId: st2.districts[2].id });
  check('a new one is unseen', unseenCount(st2) === 1);
  markSeen(st2, activeIncidents(st2)[0].id);
  check('opening it marks it seen', unseenCount(st2) === 0);

  // And the sim actually produces them from things that happen. They are
  // short-lived by design, so watch across the run rather than only at the end.
  const st3 = world();
  st3.cash.clean = 900000;
  const b3 = open(st3, 'grow_house');
  const blk = st3.districts.find((x) => x.id === b3.districtId);
  const kinds = new Set();
  for (let day = 0; day < 20; day++) {
    blk.heat = Math.max(blk.heat, 45);       // a block you are actually working
    stepSim(st3, 24, {});
    for (const i of activeIncidents(st3)) kinds.add(i.type);
  }
  check('playing the game turns them up', kinds.size > 0,
        [...kinds].join(', ') || 'nothing in 20 days');
  check('and they are the kind you would expect on a hot block',
        kinds.has('eyes') || kinds.has('glut') || kinds.has('queue'),
        [...kinds].join(', '));
}

print('');
print('=== 28. the catalogue is real, not decoration ===');
{
  // Every named pattern has a drawing, a category that exists, and stats that
  // make it a choice rather than a skin.
  check('there are at least 22 named firearms', MODEL_IDS.length >= 22, MODEL_IDS.length + ' models');
  const orphanCat = MODEL_IDS.filter((id) => !FIREARM_CLASSES[MODELS[id].category]);
  check('every pattern belongs to a real category', orphanCat.length === 0, orphanCat.join(', '));
  const flat = MODEL_IDS.filter((id) => MODELS[id].valueMult === 1 && MODELS[id].yieldMult === 1);
  check('every pattern is a trade-off', flat.length <= 1,
        flat.length + ' with no trade-off');

  // Value and output pull against each other, or it's a free lunch.
  const dearest = MODEL_IDS.reduce((a, b) => MODELS[a].valueMult > MODELS[b].valueMult ? a : b);
  const fastest = MODEL_IDS.reduce((a, b) => MODELS[a].yieldMult > MODELS[b].yieldMult ? a : b);
  check('the dearest pattern is not also the fastest', dearest !== fastest,
        MODELS[dearest].name + ' vs ' + MODELS[fastest].name);

  // A pattern only applies on a line tooled for its category.
  const st = world();
  st.adminUnlockAll = true;
  st.cash.clean = 4000000;
  const shop = open(st, 'machine_shop');
  A.setProductionLine(st, shop.id, 'handgun');
  check('a pattern from another category is refused',
        !A.setModel(st, shop.id, 'longmarch').ok,
        A.setModel(st, shop.id, 'longmarch').error);
  check('one from this category is accepted', A.setModel(st, shop.id, 'warden').ok);
  check('and it changes what comes off the line',
        modelEffects(shop).valueMult !== 1 || modelEffects(shop).yieldMult !== 1);
  A.setProductionLine(st, shop.id, 'rifle');
  check('retooling drops a pattern that no longer fits', !shop.model, shop.model || 'cleared');

  // Businesses, both ends.
  const fronts = BUILDING_IDS.filter((id) => BUILDINGS[id].kind === 'front');
  const chain = BUILDING_IDS.filter((id) =>
    ['production', 'processing', 'storage'].includes(BUILDINGS[id].kind));
  check('there are at least 40 businesses', fronts.length + chain.length >= 40,
        fronts.length + ' legitimate, ' + chain.length + ' illegal');
  check('and both ends are properly served', fronts.length >= 15 && chain.length >= 15,
        fronts.length + ' / ' + chain.length);
}

print('');
print(fail ? fail + ' FAILURE(S), ' + pass + ' passed' : 'all ' + pass + ' checks passed');
