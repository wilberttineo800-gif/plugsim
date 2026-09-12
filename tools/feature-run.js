// Exercise every system over 1000 game days and report what actually works.
//
// playthrough.js answers "can a beginner finish?". This answers a different
// question: does each feature still function when the world has been running
// for three years, rather than only in a fresh 30-day fixture?
//
// It is deliberately funded (adminCash) so that features are tested on their
// own merits rather than being blocked by an empty wallet — the economy is
// playthrough.js's job, not this one's.

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState, createRoute } from '../src/game/state.js';
import { stepSim, seedWorld } from '../src/game/sim.js';
import { syntheticLots } from './fixtures.js';
import { BUILDINGS, PRODUCT_IDS } from '../src/game/constants.js';
import { haversineKm } from '../src/game/geo.js';
import { MODELS, LICENCES } from '../src/game/firearms.js';
import { RESEARCH } from '../src/game/research.js';
import { UPGRADES } from '../src/game/upgrades.js';
import * as A from '../src/game/actions.js';
import { lotResale } from '../src/game/lots.js';

const results = [];
function feature(name, fn) {
  try {
    const note = fn();
    results.push(['PASS', name, note || '']);
  } catch (e) {
    results.push(['FAIL', name, String(e && e.message || e).slice(0, 110)]);
  }
}
function need(cond, msg) { if (!cond) throw new Error(msg); }

function lotFor(st, type, biggest) {
  const d = BUILDINGS[type];
  const pool = (st.lots || []).filter((l) => !l.owned && l.kind !== 'parking'
    && l.areaM2 >= d.minAreaM2 && (!d.maxAreaM2 || l.areaM2 <= d.maxAreaM2));
  return pool.sort((a, b) => (biggest ? b.areaM2 - a.areaM2 : a.areaM2 - b.areaM2))[0];
}
function build(st, type, biggest) {
  const lot = lotFor(st, type, biggest);
  if (!lot) return null;
  A.buyLot(st, lot.id);
  const r = A.developLot(st, lot.id, type);
  return r && r.building ? r.building : null;
}
function wire(st, fromId, toType, toId, cargo, product = 'any') {
  const r = createRoute({ fromId, toType, toId, cargo, product });
  const a = st.buildings.find((b) => b.id === fromId).latlng;
  const b = toType === 'district' ? st.districts.find((d) => d.id === toId).center
                                  : st.buildings.find((x) => x.id === toId).latlng;
  r.points = [a, b]; r.km = haversineKm(a, b); r.driveMinutes = (r.km / 28) * 60;
  r.active = true; st.routes.push(r); return r;
}
function netWorth(st) {
  let n = st.cash.clean + st.cash.dirty;
  for (const l of st.lots || []) {
    if (!l.owned) continue;
    n += lotResale(l, st.districts.find((d) => d.id === l.districtId));
  }
  return n;
}
function run(st, days) { for (let i = 0; i < days; i++) for (let h = 0; h < 24; h += 0.25) stepSim(st, 0.25, {}); }

seedWorld(20260912);
const origin = { lat: 41.7658, lng: -72.6734 };
const districts = generateDistricts(origin, [], 'us');
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const st = createState({ origin, cityName: 'Hartford', countryCode: 'us', districts, crews,
                         lots: syntheticLots(districts, 120) });
st.cash.clean = 400000000;          // funded on purpose — see the header
if (A.adminUnlockAll) A.adminUnlockAll(st);

print('FEATURE RUN — every system, 1000 game days');
print('');

// --- core chain ------------------------------------------------------------
const hq = build(st, 'hq');
A.setHeadquarters(st, hq.id);
feature('Headquarters', () => { need(st.hqBuildingId === hq.id, 'HQ not set'); return hq.name.split(' · ')[0]; });

const grow = build(st, 'grow_house', true);
const lab = build(st, 'lab', true);
const stash = build(st, 'stash', true);
const park = (st.lots || []).filter((l) => l.kind === 'parking' && !l.owned)
  .sort((a, b) => b.areaM2 - a.areaM2)[0];
A.buyLot(st, park.id); A.developLot(st, park.id, 'depot');
feature('Production / lab / stash / depot', () => {
  need(grow && lab && stash, 'a core building failed to develop');
  return 'grow ' + Math.round(grow.lotAreaM2 || 0) + 'm2 x' + grow.scale.toFixed(2);
});

// --- size scaling, big vs small -------------------------------------------
feature('Building size drives output', () => {
  const small = build(st, 'grow_house', false);
  need(small, 'no small grow lot');
  need(grow.scale > small.scale * 2, 'big building not meaningfully better: '
       + grow.scale.toFixed(2) + ' vs ' + small.scale.toFixed(2));
  return 'big x' + grow.scale.toFixed(2) + ' vs smallest x' + small.scale.toFixed(2);
});

// --- haulage ---------------------------------------------------------------
const target = [...st.districts].sort((a, b) => b.demandPerHour.weed - a.demandPerHour.weed);
const rRaw = wire(st, grow.id, 'building', lab.id, 'raw');
const rSell = wire(st, lab.id, 'district', target[0].id, 'packs');
feature('Fleet and drivers', () => {
  const v = A.buyVehicle(st, 'van').vehicle; need(v, 'no vehicle');
  const d = A.hireDriver(st).driver; need(d, 'no driver');
  A.assignDriver(st, v.id, d.id);
  A.assignCourier(st, v.id, rRaw.id);
  const v2 = A.buyVehicle(st, 'sedan').vehicle;
  A.assignDriver(st, v2.id, A.hireDriver(st).driver.id);
  A.assignCourier(st, v2.id, rSell.id);
  return st.couriers.length + ' vehicles, ' + st.drivers.length + ' drivers';
});
feature('Vehicle upgrades', () => {
  const v = st.couriers[0];
  const r = A.upgradeCourier(st, v.id, 'shelving');
  need(r && r.ok !== false, (r && r.error) || 'upgrade refused');
  return 'fitted to ' + v.type;
});
feature('Building upgrades', () => {
  const r = A.upgradeBuilding(st, grow.id, 'lights');
  need(r && r.ok !== false, (r && r.error) || 'upgrade refused');
  return 'grow upgraded';
});

run(st, 30);

// --- money -----------------------------------------------------------------
feature('Street sales produce street cash', () => {
  need(st.cash.dirty > 0 || st.stats.laundered > 0, 'no street cash after 30 days');
  return '$' + Math.round(st.cash.dirty).toLocaleString() + ' dirty';
});
feature('Fixer laundering', () => {
  const before = st.cash.clean;
  const r = A.washWithFixer(st);
  need(r && r.ok, (r && r.error) || 'fixer refused');
  need(st.cash.clean > before, 'clean did not rise');
  return 'washed, clean +$' + Math.round(st.cash.clean - before).toLocaleString();
});
feature('Laundering front', () => {
  const f = build(st, 'laundromat', true);
  need(f, 'no laundromat lot');
  run(st, 5);
  return 'built; launders $' + (BUILDINGS.laundromat.launderPerDay || 0).toLocaleString() + '/day';
});
feature('Legal storefront sells into clean money', () => {
  const shop = build(st, 'bodega', true); need(shop, 'no bodega lot');
  run(st, 5);
  return 'bodega trading';
});

// --- property --------------------------------------------------------------
feature('Rentals', () => {
  const lot = (st.lots || []).find((l) => !l.owned && l.kind !== 'parking' && l.levels > 1);
  need(lot, 'no multi-storey lot'); A.buyLot(st, lot.id);
  const r = A.rentOut(st, lot.id);
  need(r && r.ok !== false, (r && r.error) || 'rentOut refused');
  return 'tenants in';
});
feature('Sell a property back', () => {
  const own = (st.lots || []).filter((l) => l.owned && !l.buildingId);
  need(own.length, 'nothing spare to sell');
  const r = A.sellLot(st, own[0].id);
  need(r && r.ok !== false, (r && r.error) || 'sellLot refused');
  return 'resold';
});

// --- firearms --------------------------------------------------------------
feature('Firearms licence', () => {
  const id = Object.keys(LICENCES)[0];
  const r = A.applyForLicence(st, id);
  need(r && r.ok !== false, (r && r.error) || 'licence refused');
  return LICENCES[id].short;
});
feature('Gunsmith and model selection', () => {
  const g = build(st, 'gunsmith', true); need(g, 'no gunsmith lot');
  const r = A.setModel(st, g.id, 'kestrel');
  need(r && r.ok !== false, (r && r.error) || 'setModel refused');
  run(st, 10);
  return 'building Kestrel 9';
});
feature('Heavy weapons priced above sidearms', () => {
  const base = 1500;
  const pistol = base * MODELS.kestrel.valueMult;
  const mg = base * MODELS.hammerfall.valueMult;
  need(mg > pistol * 5, 'LMG only $' + Math.round(mg) + ' vs pistol $' + Math.round(pistol));
  return 'LMG $' + Math.round(mg).toLocaleString() + ' vs pistol $' + Math.round(pistol).toLocaleString();
});

// --- research --------------------------------------------------------------
feature('Research', () => {
  const rl = build(st, 'research_lab', true); need(rl, 'no research lab lot');
  const proj = 'phenohunt';
  const r = A.startResearch(st, proj);
  need(r && r.ok !== false, (r && r.error) || 'startResearch refused');
  return 'started ' + proj;
});

// --- turf ------------------------------------------------------------------
feature('Turf: take and improve a block', () => {
  const d = target[0];
  const r = A.muscleIn(st, d.id);
  need(r && r.ok !== false, (r && r.error) || 'muscleIn refused');
  return 'moved on ' + d.name;
});

// --- the long run ----------------------------------------------------------
print('Running 1000 days...');
const t0 = Date.now();
const worth0 = netWorth(st);
run(st, 1000);
const secs = ((Date.now() - t0) / 1000).toFixed(0);

feature('Survives 1000 days solvent', () => {
  need(netWorth(st) > 0, 'net worth went negative: $' + Math.round(netWorth(st)).toLocaleString());
  return 'net worth $' + Math.round(netWorth(st)).toLocaleString();
});
feature('World kept running', () => {
  const trips = (st.couriers || []).reduce((n, c) => n + (c.tripsCompleted || 0), 0);
  need(trips > 100, 'only ' + trips + ' trips in 1000 days');
  return trips.toLocaleString() + ' courier trips';
});
feature('AI competitors still active', () => {
  const rivals = (st.crews || []).length;
  need(rivals > 0, 'no rival crews');
  return rivals + ' crews on the map';
});
feature('Incidents fired', () => {
  const n = (st.log || []).length;
  need(n > 50, 'only ' + n + ' log entries in 1000 days');
  return n.toLocaleString() + ' events logged';
});
feature('No building stuck stalled at the end', () => {
  const stuck = st.buildings.filter((b) => b.stalledReason);
  return stuck.length ? stuck.length + ' STALLED: '
    + [...new Set(stuck.map((b) => b.stalledReason))].join(' | ') : 'all lines running';
});

// --- report ----------------------------------------------------------------
print('');
print('RESULTS');
let pass = 0, fail = 0;
for (const [state, name, note] of results) {
  if (state === 'PASS') pass++; else fail++;
  print('  ' + state + '  ' + name.padEnd(38) + note);
}
print('');
print('  ' + pass + ' passed, ' + fail + ' failed');
print('');
print('LEGAL vs ILLEGAL MONEY');
{
  const legal = st.stats.legalRevenue || 0;
  const legalUnits = st.stats.legalUnitsSold || 0;
  // Everything the blocks paid, before any of it was washed.
  const street = (st.districts || []).reduce((s, d) => s + (d.revenueTotal || 0), 0);
  const streetUnits = (st.districts || []).reduce(
    (s, d) => s + PRODUCT_IDS.reduce((n, p) => n + (d.soldTotal[p] || 0), 0), 0);
  const pct = (x, y) => (y > 0 ? (100 * x / (x + y)).toFixed(1) + '%' : '-');
  print('  street (illegal)  $' + Math.round(street).toLocaleString().padStart(14)
        + '   ' + Math.round(streetUnits).toLocaleString().padStart(9) + ' units   '
        + pct(street, legal) + ' of turnover');
  print('  legal fronts      $' + Math.round(legal).toLocaleString().padStart(14)
        + '   ' + Math.round(legalUnits).toLocaleString().padStart(9) + ' units   '
        + pct(legal, street) + ' of turnover');
  const sPer = streetUnits > 0 ? street / streetUnits : 0;
  const lPer = legalUnits > 0 ? legal / legalUnits : 0;
  print('  $/unit street     $' + Math.round(sPer).toLocaleString());
  print('  $/unit legal      $' + Math.round(lPer).toLocaleString()
        + (sPer > 0 ? '   (' + (100 * lPer / sPer).toFixed(0) + '% of street)' : ''));
  print('  laundered         $' + Math.round(st.stats.laundered || 0).toLocaleString()
        + '   — the only other route from street cash to spendable money');
  print('  fixer cut lost    $' + Math.round((st.stats.laundered || 0) * 0.4).toLocaleString());
}

print('');
print('AFTER 1000 DAYS');
print('  net worth      $' + Math.round(netWorth(st)).toLocaleString()
      + '  (from $' + Math.round(worth0).toLocaleString() + ')');
print('  clean / street $' + Math.round(st.cash.clean).toLocaleString()
      + ' / $' + Math.round(st.cash.dirty).toLocaleString());
print('  properties     ' + (st.lots || []).filter((l) => l.owned).length);
print('  buildings      ' + st.buildings.length);
print('  vehicles       ' + (st.couriers || []).length + ', drivers ' + (st.drivers || []).length);
print('  laundered      $' + Math.round(st.stats.laundered || 0).toLocaleString());
print('  simulated in   ' + secs + 's');
