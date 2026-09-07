// Headless balance harness. Runs the real simulation with no browser:
//   jsc -m tools/simtest.js
// Routes are wired directly (no network) so this exercises pure game logic.

import { PRODUCT_IDS, PRODUCTS, BUILDINGS } from '../src/game/constants.js';
import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { BUILDINGS as BDEFS } from '../src/game/constants.js';
import { haversineKm } from '../src/game/geo.js';
import { createState, createRoute, logEvent, clockOf } from '../src/game/state.js';
import { stepSim } from '../src/game/sim.js';
import * as A from '../src/game/actions.js';
import { streetPrice, sellRatePerHour, rivalShare } from '../src/game/economy.js';

const log = (...a) => print(a.join(' '));
const fmt = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
const u = (n) => n.toFixed(1);

// --- Setup ------------------------------------------------------------------

const origin = { lat: 42.3314, lng: -83.0458 }; // Detroit
const districts = generateDistricts(origin, []);
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const lots = syntheticLots(districts);
const state = createState({ origin, cityName: 'Detroit', districts, crews, lots });

log('=== GENERATION ===');
log(`districts: ${districts.length}`);
const wealths = districts.map((d) => d.wealth);
const demandsW = districts.map((d) => d.demandPerHour.weed);
const demandsS = districts.map((d) => d.demandPerHour.shrooms);
const span = (arr) => `${Math.min(...arr).toFixed(2)}–${Math.max(...arr).toFixed(2)} (avg ${(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)})`;
log(`wealth       ${span(wealths)}`);
log(`weed dmd/h   ${span(demandsW)}`);
log(`shroom dmd/h ${span(demandsS)}`);
log(`total weed demand/day: ${u(demandsW.reduce((a, b) => a + b, 0) * 24)} packs`);
log(`total shrm demand/day: ${u(demandsS.reduce((a, b) => a + b, 0) * 24)} packs`);
log(`lots on the market: ${lots.length}`);
log('');
log('=== CREWS ===');
crews.forEach((c) => {
  const home = districts.find((d) => d.id === c.homeDistrictId);
  log(`${c.name.padEnd(24)} str ${c.strength.toFixed(2)} reach ${c.reachKm.toFixed(1)}km aggr ${c.aggression.toFixed(2)} home ${home.name}`);
});
const held = districts.filter((d) => d.rivalControl > 0.05);
log(`blocks under rival control: ${held.length}/${districts.length}`);
log(`control span: ${Math.min(...held.map(d=>d.rivalControl)).toFixed(2)}-${Math.max(...districts.map(d=>d.rivalControl)).toFixed(2)}`);
log(`fully open blocks: ${districts.filter((d) => d.rivalControl <= 0.05).length}`);

// Pick a cheap district to produce in and rich ones to sell in.
const byRent = [...districts].sort((a, b) => a.rentIndex - b.rentIndex);
const cheap = byRent[0];
const sellIn = [...districts].sort(
  (a, b) => streetPrice(b, 'weed') * sellRatePerHour(b, 'weed') - streetPrice(a, 'weed') * sellRatePerHour(a, 'weed')
).slice(0, 3);
// Deliberately also work one heavily-held block, so shakedowns and muscling
// actually get exercised instead of quietly never firing.
const contested = [...districts].sort((a, b) => b.rivalControl - a.rivalControl)[0];
sellIn.push(contested);
log(`contested test block: ${contested.name} @ ${(contested.rivalControl*100).toFixed(0)}% held`);

log('');
log('=== OPENING MOVES ===');
log(`start cash: ${fmt(state.cash.clean)} clean`);

function build(type, district) {
  const def = BDEFS[type];
  const lot = cheapestLotFor(state, def, district ? district.id : null)
    || cheapestLotFor(state, def);
  if (!lot) { log(`  ! no premises anywhere big enough for ${def.name}`); return null; }

  const bought = A.buyLot(state, lot.id);
  if (!bought.ok) { log(`  ! ${lot.name}: ${bought.error}`); return null; }
  const fitted = A.developLot(state, lot.id, type);
  if (!fitted.ok) { log(`  ! ${def.name} at ${lot.name}: ${fitted.error}`); return null; }

  log(`  ${def.name} at ${lot.name} (${Math.round(lot.areaM2)} m², ${lot.kind}) — ` +
      `${fmt(lot.price)} property + ${fmt(def.cost)} fit-out, x${fitted.building.scale.toFixed(2)} output`);
  return fitted.building;
}

const grow = build('grow_house', cheap);
const lab = build('lab', cheap);
log(`cash after opening: ${fmt(state.cash.clean)} clean`);

if (!grow || !lab) { log('FAILED to open — cannot continue'); throw new Error('setup'); }

// Wire routes by hand (no network in jsc).
function wire(fromId, toType, toId, cargo, product) {
  const r = createRoute({ fromId, toType, toId, cargo, product });
  const from = state.buildings.find((b) => b.id === fromId).latlng;
  const to = toType === 'district'
    ? state.districts.find((d) => d.id === toId).center
    : state.buildings.find((b) => b.id === toId).latlng;
  r.points = [from, to];
  r.km = haversineKm(from, to) * 1.35;
  r.realRoad = false;
  state.routes.push(r);
  return r;
}

const rGrowLab = wire(grow.id, 'building', lab.id, 'raw', 'any');
const saleRoutes = sellIn.slice(0, 4).map((d) => wire(lab.id, 'district', d.id, 'packs', 'any'));

const c1 = A.hireCourier(state, 'bike');
const c2 = A.hireCourier(state, 'bike');
if (c1.ok) A.assignCourier(state, c1.courier.id, rGrowLab.id);
else log(`  !! COULD NOT HIRE: ${c1.error}`);
if (c2.ok) A.assignCourier(state, c2.courier.id, saleRoutes[0].id);
else log(`  !! COULD NOT HIRE: ${c2.error}`);
log(`couriers on payroll: ${state.couriers.length}; cash now ${fmt(state.cash.clean)} clean`);
if (!state.couriers.length) log('  !! nothing can move — the run below is meaningless');
log(`sell routes: ${saleRoutes.map((r) => state.districts.find((d) => d.id === r.toId).name + ' ' + r.km.toFixed(1) + 'km').join(', ')}`);

// A competent player spreads the load and reinvests. This models that.
let nextSaleRoute = 1;
function playTurn() {
  // Wash whatever the fixer will take, every day.
  A.washWithFixer(state);

  // Put another courier on the next unsold district when we can afford one.
  if (state.cash.clean >= 900 && nextSaleRoute < saleRoutes.length) {
    const hire = A.hireCourier(state, 'bike');
    if (hire.ok) {
      A.assignCourier(state, hire.courier.id, saleRoutes[nextSaleRoute].id);
      nextSaleRoute++;
    }
  }
  // Buy a Front the moment it's affordable — it replaces the fixer.
  if (!state.buildings.some((b) => b.type === 'front') && state.cash.clean >= 13000) {
    build('front', cheap);
  }
  // Keep scaling production once the money is there.
  if (state.cash.clean >= 16000 && state.buildings.filter((b) => b.type === 'grow_house').length < 4) {
    const g2 = build('grow_house', byRent[state.buildings.length % 6]);
    if (g2) {
      const r = wire(g2.id, 'building', lab.id, 'raw', 'any');
      const hire = A.hireCourier(state, 'sedan');
      if (hire.ok) A.assignCourier(state, hire.courier.id, r.id);
    }
  }
  // Once there's rep and money, try running the crew off the contested block.
  if (state.cash.clean >= 20000 && contested.rivalControl > 0.1 && contested.rep > 0.2) {
    const r = A.muscleIn(state, contested.id);
    if (r.ok) {
      log(`  muscle on ${contested.name}: ${r.won ? 'WON' : 'lost'} (-${fmt(r.cost)}) -> ${(contested.rivalControl*100).toFixed(0)}% held`);
    }
  }
  // Then diversify into the high-margin product.
  if (state.buildings.some((b) => b.type === 'front')
      && !state.buildings.some((b) => b.type === 'fungi_room')
      && state.cash.clean >= 12000) {
    const fungi = build('fungi_room', cheap);
    if (fungi) {
      const r = wire(fungi.id, 'building', lab.id, 'raw', 'any');
      const hire = A.hireCourier(state, 'bike');
      if (hire.ok) A.assignCourier(state, hire.courier.id, r.id);
      log('  → diversified into psilocybin');
    }
  }
}

// --- Run --------------------------------------------------------------------

const DT = 0.05; // game hours per step
const DAYS = 30;
log('');
log('=== RUN ===');
log('day |      clean |     street |   gross |  sold(w/s) | peakHeat | raids/stops');

let lastDay = 1;
for (let h = 0; h < DAYS * 24; h += DT) {
  stepSim(state, DT, {});
  const day = clockOf(state.minutes).day;
  if (day !== lastDay) {
    lastDay = day;
    playTurn();
    const peak = Math.max(...state.districts.map((d) => d.heat));
    log(
      String(day).padStart(3) + ' | ' +
      fmt(state.cash.clean).padStart(10) + ' | ' +
      fmt(state.cash.dirty).padStart(10) + ' | ' +
      fmt(state.stats.grossRevenue).padStart(7) + ' | ' +
      (u(state.stats.packsSold.weed) + '/' + u(state.stats.packsSold.shrooms)).padStart(10) + ' | ' +
      peak.toFixed(1).padStart(8) + ' | ' +
      `${state.stats.raids}/${state.stats.stops}`
    );
  }
}

// --- Report -----------------------------------------------------------------

log('');
log('=== CHAIN STATE ===');
for (const b of state.buildings) {
  const raw = PRODUCT_IDS.map((p) => `${p}:${u(b.raw[p])}`).join(' ');
  const packs = PRODUCT_IDS.map((p) => `${p}:${u(b.packs[p])}`).join(' ');
  log(`${b.name.padEnd(16)} raw[${raw}] packs[${packs}] ${b.stalledReason ? '⚠ ' + b.stalledReason : 'ok'}`);
}

log('');
log('=== COURIERS ===');
for (const c of state.couriers) {
  log(`${c.name.padEnd(16)} ${c.phase.padEnd(10)} trips:${c.tripsCompleted} cargo:${u(PRODUCT_IDS.reduce((n, p) => n + c.cargo[p], 0))}`);
}

log('');
log('=== TOP MARKETS ===');
[...state.districts]
  .filter((d) => d.revenueTotal > 0)
  .sort((a, b) => b.revenueTotal - a.revenueTotal)
  .slice(0, 5)
  .forEach((d) => {
    log(`${d.name.padEnd(20)} rev ${fmt(d.revenueTotal).padStart(9)} price ${fmt(streetPrice(d, 'weed')).padStart(6)} heat ${d.heat.toFixed(1).padStart(5)} rep ${(d.rep * 100).toFixed(0)}% turf ${(d.rivalControl*100).toFixed(0)}% supply ${u(d.supply.weed)}`);
  });

log('');
log('=== BOTTLENECK CHECK ===');
const growDef = BUILDINGS.grow_house;
const labDef = BUILDINGS.lab;
const rawPerDay = growDef.slots * growDef.rawPerSlot * (24 / growDef.cycleHours);
const labPerDay = labDef.rawPerHour * 24;
log(`one grow house produces ${u(rawPerDay)} raw/day`);
log(`one lab consumes       ${u(labPerDay)} raw/day  -> ${u(labPerDay * PRODUCTS.weed.packsPerRaw)} packs/day`);
log(`labs needed per grow:  ${(rawPerDay / labPerDay).toFixed(2)}`);
const totalDemand = districts.reduce((n, d) => n + d.demandPerHour.weed, 0) * 24;
log(`whole city absorbs     ${u(totalDemand)} weed packs/day`);
log(`grows the city supports: ${(totalDemand / (rawPerDay * PRODUCTS.weed.packsPerRaw)).toFixed(2)}`);

log('');
log('=== FINAL ===');
log(`clean ${fmt(state.cash.clean)}  street ${fmt(state.cash.dirty)}  gross ${fmt(state.stats.grossRevenue)}`);
log(`net worth change: ${fmt(state.cash.clean + state.cash.dirty - 16000)} over ${DAYS} days`);
log(`raids ${state.stats.raids} stops ${state.stats.stops} seized ${u(state.stats.seized)}`);
log(`tribute paid to crews: ${u(state.stats.tributePaid || 0)} packs; blocks taken by force: ${state.stats.blocksTaken || 0}`);
const stillHeld = state.districts.filter((d) => d.rivalControl > 0.05);
log(`blocks still under rival control: ${stillHeld.length}/${state.districts.length}`);
const eroded = state.districts.filter((d) => d.rep > 0.1);
log('erosion where you traded:');
eroded.slice(0, 5).forEach((d) => log(`  ${d.name.padEnd(20)} base ${(d.baseControl*100).toFixed(0)}% -> now ${(d.rivalControl*100).toFixed(0)}%  (rep ${(d.rep*100).toFixed(0)}%)`));
log(`unpaid: ${!!state.unpaid}`);
log('');
log('last log lines:');
state.log.slice(0, 6).forEach((e) => log('  ' + e.text));
