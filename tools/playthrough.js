// How long does it actually take to finish the game?
//
// starter-check.js only proves the opening is solvent over 30 days. This plays
// on from there — reinvesting the way a real player would — and measures the
// days to every milestone up to the hardest thing in the game: the
// Pharmaceutical Plant, which needs 20 properties AND $220,000,000 banked
// before it will even appear, then $48,000,000 to build.
//
// The bot is deliberately unclever. It buys the biggest production building it
// can afford, keeps enough drivers to move what it makes, and never does
// anything a first-time player couldn't work out. If THIS can finish, the game
// is finishable; if it takes 900 days, that is the real number.

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState, createRoute } from '../src/game/state.js';
import { stepSim, seedWorld } from '../src/game/sim.js';
import { syntheticLots } from './fixtures.js';
import { BUILDINGS, START_CASH_CLEAN } from '../src/game/constants.js';
import { haversineKm } from '../src/game/geo.js';
import * as A from '../src/game/actions.js';
import { lotResale } from '../src/game/lots.js';

const GOAL = 'pharma_plant';
const MAX_DAYS = 1000; // four game years; past that it isn't a game any more

function netWorth(st) {
  let n = st.cash.clean + st.cash.dirty;
  for (const l of st.lots || []) {
    if (!l.owned) continue;
    n += lotResale(l, st.districts.find((d) => d.id === l.districtId));
  }
  return n;
}

function openWorld() {
  const origin = { lat: 41.7658, lng: -72.6734 };
  const districts = generateDistricts(origin, [], 'us');
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);
  // A generous lot supply: we are measuring the economy, not the map.
  const lots = syntheticLots(districts, 60);
  return createState({ origin, cityName: 'Hartford', countryCode: 'us', districts, crews, lots });
}

/** Biggest affordable lot for a type — size now drives output, so size is the play. */
function bestLotFor(st, type, budget) {
  const def = BUILDINGS[type];
  if (!def) return null;
  return (st.lots || [])
    .filter((l) => !l.owned && l.kind !== 'parking'
      && l.areaM2 >= def.minAreaM2
      && (!def.maxAreaM2 || l.areaM2 <= def.maxAreaM2)
      && l.price + def.cost <= budget)
    .sort((a, b) => b.areaM2 - a.areaM2)[0] || null;
}

function smallestLotFor(st, type) {
  const def = BUILDINGS[type];
  return (st.lots || [])
    .filter((l) => !l.owned && l.kind !== 'parking'
      && l.areaM2 >= def.minAreaM2 && (!def.maxAreaM2 || l.areaM2 <= def.maxAreaM2))
    .sort((a, b) => a.areaM2 - b.areaM2)[0];
}

function wire(st, fromId, toType, toId, cargo) {
  const r = createRoute({ fromId, toType, toId, cargo, product: 'any' });
  const from = st.buildings.find((b) => b.id === fromId).latlng;
  const to = toType === 'district'
    ? st.districts.find((d) => d.id === toId).center
    : st.buildings.find((b) => b.id === toId).latlng;
  r.points = [from, to];
  r.km = haversineKm(from, to);
  r.driveMinutes = (r.km / 28) * 60;
  r.active = true;
  st.routes.push(r);
  return r;
}

function owned(st) { return (st.lots || []).filter((l) => l.owned).length; }
function has(st, type) { return st.buildings.filter((b) => b.type === type).length; }

// --- the opening, exactly as Ray walks you through it ----------------------
seedWorld(4242);
const st = openWorld();
const milestones = [];
function mark(day, what) {
  milestones.push([day, what]);
  print('  day ' + String(day).padStart(4) + '  ' + what);
}

const hqLot = smallestLotFor(st, 'hq');
A.buyLot(st, hqLot.id); A.developLot(st, hqLot.id, 'hq');
A.setHeadquarters(st, st.buildings[st.buildings.length - 1].id);

const growLot = smallestLotFor(st, 'closet_grow');
A.buyLot(st, growLot.id);
const grow0 = A.developLot(st, growLot.id, 'closet_grow').building;

const park = (st.lots || []).filter((l) => l.kind === 'parking' && !l.owned)
  .sort((a, b) => a.price - b.price)[0];
A.buyLot(st, park.id); A.developLot(st, park.id, 'depot');

const labLot = smallestLotFor(st, 'lab');
A.buyLot(st, labLot.id);
const lab0 = A.developLot(st, labLot.id, 'lab').building;

const v0 = A.buyVehicle(st, 'scooter').vehicle;
A.assignDriver(st, v0.id, A.hireDriver(st).driver.id);
const target0 = [...st.districts].sort((a, b) => b.demandPerHour.weed - a.demandPerHour.weed)[0];
const ra = wire(st, grow0.id, 'building', lab0.id, 'raw');
const rb = wire(st, lab0.id, 'district', target0.id, 'packs');
A.assignCourier(st, v0.id, ra.id);
A.addRouteToVehicle(st, v0.id, rb.id);

print('A COMPLETE BEGINNER, PLAYING ON UNTIL THE GAME IS FINISHED');
print('');
print('Start: $' + START_CASH_CLEAN.toLocaleString() + ', Ray\'s opening path.');
print('Goal:  ' + (BUILDINGS[GOAL] ? BUILDINGS[GOAL].name : GOAL) + ' — '
      + (BUILDINGS[GOAL] ? BUILDINGS[GOAL].unlock.properties : '?') + ' properties + $'
      + (BUILDINGS[GOAL] ? BUILDINGS[GOAL].unlock.cash.toLocaleString() : '?') + ' banked.');
print('');
print('MILESTONES');
mark(0, 'opened up: HQ, closet grow, depot, lab, one scooter — on $'
     + START_CASH_CLEAN.toLocaleString());

// --- play on ---------------------------------------------------------------
// Reinvest order: keep the chain fed first, then add capacity, then reach for
// whatever the bankroll has newly unlocked.
// Only things this operation can actually feed. A hash press with no hash, or
// a pill press with no precursor, is a building that pays rent to produce
// nothing — which is how the bot kept bankrupting itself while "expanding".
const LADDER = ['grow_house', 'fungi_room', 'lab', 'stash',
                'holding_co', 'terminal', 'members_club', 'pharma_plant'];

let sold = 0;
let done = null;
let lastReport = 0;
const seenUnlocked = new Set();

for (let day = 1; day <= MAX_DAYS && !done; day++) {
  for (let h = 0; h < 24; h += 0.25) stepSim(st, 0.25, {});

  // Wash every day, first thing. A real player does this constantly.
  // Wash only toward a purchase. Upkeep is paid out of street cash at FULL
  // value (paySoft spends dirty first), while the fixer takes 40% — so washing
  // money you were going to spend on running costs anyway just burns it. Hold
  // dirty for opex; convert only what a building or a front actually needs.
  const WANT_CLEAN = 4000000;
  if (st.cash.clean < WANT_CLEAN && st.cash.dirty > 1000000) {
    for (let i = 0; i < 4 && st.cash.clean < WANT_CLEAN; i++) {
      const res = A.washWithFixer(st);
      if (!res || !res.ok) break;
    }
  }

  const cash = st.cash.clean;
  const props = owned(st);

  // Note the moment each tier becomes reachable, which is the real gate.
  for (const type of LADDER) {
    const def = BUILDINGS[type];
    if (!def || !def.unlock || seenUnlocked.has(type)) continue;
    if (props >= (def.unlock.properties || 0) && cash >= (def.unlock.cash || 0)) {
      seenUnlocked.add(type);
      mark(day, 'unlocked ' + def.name + '  ($' + Math.round(cash).toLocaleString() + ', '
                + props + ' properties)');
      if (type === GOAL) { done = day; break; }
    }
  }
  if (done) break;

  // Every route must have a courier before anything else is considered. An
  // unserved route is a building paying rent to produce stock nobody collects.
  const served = (r) => (st.couriers || []).some(
    (c) => c.routeId === r.id || (c.routeIds || []).includes(r.id));
  const unserved = (st.routes || []).filter((r) => !served(r));
  if (unserved.length && cash > 300000) {
    const veh = A.buyVehicle(st, (st.couriers || []).length < 3 ? 'sedan' : 'van');
    if (veh && veh.vehicle) {
      const hire = A.hireDriver(st);
      if (hire && hire.driver) A.assignDriver(st, veh.vehicle.id, hire.driver.id);
      A.assignCourier(st, veh.vehicle.id, unserved[0].id);
    }
  }

  // Only grow the operation when it is demonstrably healthy: everything is
  // being hauled, and there is real clean money spare after the reserve.
  const healthy = unserved.length === 0 && cash > 2500000;

  // Reserve enough to keep buying supplies, but nothing like the 20-day float
  // that used to stop the bot scaling at all. Falling behind on haulage is the
  // expensive mistake here, not being briefly thin on cash.
  const burn = st.buildings.reduce((s, b) => {
    const d = BUILDINGS[b.type] || {};
    return s + (d.upkeepPerDay || 0)
             + (d.supplyCostPerSlot || 0) * (d.slots || 0) * (24 / (d.cycleHours || 24));
  }, 0);
  const float = Math.max(500000, burn * 3);
  if (healthy && cash > float * 1.5) {
    for (const type of LADDER) {
      const def = BUILDINGS[type];
      if (!def) continue;
      if (def.unlock && (props < (def.unlock.properties || 0) || cash < (def.unlock.cash || 0))) continue;
      if (has(st, type) >= 14) continue;            // spread out rather than stack one type
      const lot = bestLotFor(st, type, cash - float);
      if (!lot) continue;
      A.buyLot(st, lot.id);
      const b = A.developLot(st, lot.id, type).building;
      if (b && def.product) {
        // Spread across blocks. Dumping everything on the hungriest district
        // saturates it, collapses the price and spikes heat until you get
        // raided — which is exactly how the naive run went broke.
        const ranked = [...st.districts]
          .sort((x, y) => (y.demandPerHour[def.product] || 0) - (x.demandPerHour[def.product] || 0));
        const used = new Set((st.routes || []).map((r) => r.toId));
        const d = ranked.find((x) => !used.has(x.id)) || ranked[sold % ranked.length];
        sold++;
        wire(st, b.id, 'district', d.id, 'packs');
      }
      break;                                         // one purchase per day, like a person
    }
  }

  // Fronts, or the dirty pile never becomes spendable money. One per ~$2m of
  // street cash held, which is the bottleneck the naive run never noticed.
  const FRONTS = ['laundromat', 'bodega', 'carwash', 'cafe', 'takeaway', 'nailsalon'];
  const frontCount = st.buildings.filter((b) => (BUILDINGS[b.type] || {}).kind === 'front').length;
  // Fronts bankrupt a SMALL operation — a laundromat is $29,000/day and a
  // bodega $21,000/day — but they are the only way to turn a large street pile
  // into the clean money that property costs. So they are gated on the
  // operation actually being big enough to carry them.
  if (st.cash.dirty > 20000000 && frontCount < 14 && cash > 1500000) {
    for (const f of FRONTS) {
      const def = BUILDINGS[f];
      if (!def) continue;
      if (def.unlock && (props < (def.unlock.properties || 0) || cash < (def.unlock.cash || 0))) continue;
      const lot = bestLotFor(st, f, cash - float);
      if (!lot) continue;
      A.buyLot(st, lot.id);
      A.developLot(st, lot.id, f);
      break;
    }
  }

  // Haulage is the real bottleneck, not money. One starter scooter cannot move
  // what a single grow house makes: stock backs up, storage fills, production
  // halts, and upkeep keeps charging on a dead chain. So buy transport whenever
  // product is visibly piling up, and treat it as a running cost, not a luxury.
  // Open a new outlet ONLY with a vehicle to serve it. A route with nobody
  // driving it is worse than no route: it splits the source building's output
  // across destinations that never get reached. The working ratio is about one
  // vehicle per route — 21 routes behind 6 vans is how the bot strangled itself.
  const unservedNow = unserved;
  if (unservedNow.length === 0 && cash > 900000) {
    for (const b of st.buildings) {
      const bdef = BUILDINGS[b.type] || {};
      if (!bdef.product || !bdef.capacity) continue;
      const held = Object.values(b.packs || {}).reduce((s, n) => s + n, 0)
                 + Object.values(b.raw || {}).reduce((s, n) => s + n, 0);
      if (held < bdef.capacity * 0.4) continue;
      const already = new Set((st.routes || [])
        .filter((r) => r.fromId === b.id).map((r) => r.toId));
      const next = [...st.districts]
        .sort((x, y) => (y.demandPerHour[bdef.product] || 0) - (x.demandPerHour[bdef.product] || 0))
        .find((x) => !already.has(x.id));
      if (!next) continue;
      const veh = A.buyVehicle(st, 'van').vehicle;
      if (!veh) break;
      const hire = A.hireDriver(st);
      if (hire && hire.driver) A.assignDriver(st, veh.id, hire.driver.id);
      const r = wire(st, b.id, 'district', next.id, 'packs');
      A.assignCourier(st, veh.id, r.id);
      break;                      // one new lane per day
    }
  }

  const backedUp = st.buildings.some((b) => {
    const def = BUILDINGS[b.type] || {};
    if (!def.capacity) return false;
    const held = Object.values(b.packs || {}).reduce((s, n) => s + n, 0)
               + Object.values(b.raw || {}).reduce((s, n) => s + n, 0);
    return held > def.capacity * 0.5;
  });
  const couriers = (st.couriers || []).length;
  const idleRoute = unserved[0];

  if ((backedUp || idleRoute) && couriers < 60 && cash > 300000) {
    const veh = A.buyVehicle(st, couriers < 3 ? 'sedan' : couriers < 10 ? 'van' : 'boxtruck');
    if (veh && veh.vehicle) {
      const hire = A.hireDriver(st);
      if (hire && hire.driver) A.assignDriver(st, veh.vehicle.id, hire.driver.id);
      if (idleRoute) A.assignCourier(st, veh.vehicle.id, idleRoute.id);
      else {
        // Double up on the busiest line rather than leaving the vehicle idle.
        const r = (st.routes || [])[couriers % Math.max(1, (st.routes || []).length)];
        if (r) A.assignCourier(st, veh.vehicle.id, r.id);
      }
    }
  }

  if (day - lastReport >= 90 || day === 1) {
    lastReport = day;
    print('  day ' + String(day).padStart(4) + '  $' + Math.round(cash).toLocaleString()
          + ' clean / $' + Math.round(st.cash.dirty).toLocaleString() + ' street, '
          + props + ' props, ' + (st.couriers||[]).length + ' veh, ' + (st.routes||[]).length + ' routes, ' + st.buildings.filter((b)=>(BUILDINGS[b.type]||{}).kind==='front').length
          + ' fronts, worth $' + Math.round(netWorth(st)).toLocaleString());
  }
}

print('');
print('RESULT');
if (done) {
  print('  Finished the game on day ' + done + ' — about '
        + (done / 365).toFixed(1) + ' game years.');
} else {
  print('  NOT finished inside ' + MAX_DAYS + ' days (' + (MAX_DAYS / 365).toFixed(1)
        + ' game years).');
  print('  Reached $' + Math.round(st.cash.clean).toLocaleString() + ' clean, '
        + owned(st) + ' properties, net worth $' + Math.round(netWorth(st)).toLocaleString() + '.');
  const g = BUILDINGS[GOAL];
  if (g) print('  Still needs ' + g.unlock.properties + ' properties and $'
               + g.unlock.cash.toLocaleString() + '.');
}
print('');
print('  At 300x speed a game day is 5 real minutes, so '
      + (done || MAX_DAYS) + ' days is about '
      + (((done || MAX_DAYS) * 5) / 60).toFixed(1) + ' real hours of play.');
