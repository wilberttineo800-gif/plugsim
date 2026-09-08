// Is the opening actually solvent?
//
// The onboarding walks a new player down a fixed path: a base, a small grow, a
// small depot, a lab, one vehicle and one driver. If that path can't turn a
// profit the game is unwinnable from the front door, and no amount of later
// balance fixes it. This measures exactly that.

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState, createRoute } from '../src/game/state.js';
import { stepSim, seedWorld } from '../src/game/sim.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { BUILDINGS, START_CASH_CLEAN } from '../src/game/constants.js';
import { haversineKm } from '../src/game/geo.js';
import * as A from '../src/game/actions.js';
import { lotResale } from '../src/game/lots.js';

// The only number that matters: everything you have, at what it would fetch.
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
  const lots = syntheticLots(districts, 12);
  return createState({ origin, cityName: 'Hartford', countryCode: 'us', districts, crews, lots });
}

function smallest(st, type) {
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

seedWorld(4242);
const st = openWorld();
const spend = [];
const cash0 = st.cash.clean;

// Exactly what Ray tells you to do, at the small end of every choice.
const hqLot = smallest(st, 'hq');
A.buyLot(st, hqLot.id); A.developLot(st, hqLot.id, 'hq');
const hq = st.buildings[st.buildings.length - 1];
A.setHeadquarters(st, hq.id);

const growLot = smallest(st, 'grow_house');
A.buyLot(st, growLot.id);
const grow = A.developLot(st, growLot.id, 'grow_house').building;

const park = (st.lots || []).filter((l) => l.kind === 'parking' && !l.owned)
  .sort((a, b) => a.price - b.price)[0];
A.buyLot(st, park.id); A.developLot(st, park.id, 'depot');

const labLot = smallest(st, 'lab');
A.buyLot(st, labLot.id);
const lab = A.developLot(st, labLot.id, 'lab').building;

const v = A.buyVehicle(st, 'scooter').vehicle;
A.assignDriver(st, v.id, A.hireDriver(st).driver.id);

const target = [...st.districts].sort((a, b) => b.demandPerHour.weed - a.demandPerHour.weed)[0];
const r1 = wire(st, grow.id, 'building', lab.id, 'raw');
const r2 = wire(st, lab.id, 'district', target.id, 'packs');
A.assignCourier(st, v.id, r1.id);
A.addRouteToVehicle(st, v.id, r2.id);

print('THE OPENING, PLAYED AS THE GAME DESCRIBES IT');
print('  start                 $' + cash0.toLocaleString());
print('  after Ray\'s seven     $' + Math.round(st.cash.clean).toLocaleString());
print('  spent                 $' + Math.round(cash0 - st.cash.clean).toLocaleString());
print('  grow is               x' + grow.scale.toFixed(2) + ' on ' + Math.round(growLot.areaM2) + ' m2');
print('  lines on one vehicle  ' + (v.routeIds || []).length);
print('');
const worth0 = netWorth(st);
print('  net worth now         $' + Math.round(worth0).toLocaleString() +
      '  (fit-outs and hires are sunk)');
print('');
print(' day |      clean |     street |    net worth | note');

let worst = Infinity;
let broke = null;
for (let day = 1; day <= 30; day++) {
  for (let h = 0; h < 24; h += 0.25) stepSim(st, 0.25, {});
  const worth = netWorth(st);
  worst = Math.min(worst, st.cash.clean);
  const stalled = st.buildings.filter((b) => b.stalledBroke).length;
  if (stalled && !broke) broke = day;
  if (day % 5 === 0 || day <= 3) {
    print(String(day).padStart(4) + ' | ' +
      ('$' + Math.round(st.cash.clean).toLocaleString()).padStart(10) + ' | ' +
      ('$' + Math.round(st.cash.dirty).toLocaleString()).padStart(10) + ' | ' +
      ('$' + Math.round(worth).toLocaleString()).padStart(12) + ' | ' +
      (stalled ? 'STOPPED — no money for supplies' : ''));
  }
}

// Where did it all go?
print('');
print('WHERE THE MONEY WENT OVER 30 DAYS');
const S = st.stats;
const income = [
  ['street sales', S.grossRevenue || 0],
  ['legitimate', S.legalRevenue || 0],
];
const propertyHeld = (st.lots || []).filter((l) => l.owned).length;
for (const [k, v] of income) print('  + ' + k.padEnd(18) + '$' + Math.round(v).toLocaleString());
print('  - ' + 'everything out'.padEnd(18) + '$' + Math.round(S.spent || 0).toLocaleString());
print('  ' + 'packs sold'.padEnd(20) + Object.entries(S.packsSold || {})
  .filter(([, n]) => n > 0.5).map(([k, n]) => k + ' ' + Math.round(n)).join(', '));
print('  ' + 'property held'.padEnd(20) + propertyHeld);
print('');
const perDayIn = (S.grossRevenue || 0) / 30;
const perDayOut = (S.spent || 0) / 30;
print('  tribute to crews   ' + Math.round(S.tributePaid || 0) + ' packs');
print('  seized             ' + Math.round(S.seized || 0) + ' packs');
print('  laundered          $' + Math.round(S.laundered || 0).toLocaleString());
print('  raids/stops        ' + (S.raids || 0) + '/' + (S.stops || 0));
// What one day actually costs, computed the way the sim charges it.
const gdef = BUILDINGS.grow_house;
const ldef = BUILDINGS.lab;
const supplies = gdef.supplyCostPerSlot * gdef.slots * (grow.scale) * (24 / gdef.cycleHours);
const rawPerDay = gdef.slots * gdef.rawPerSlot * grow.scale * (24 / gdef.cycleHours);
const processing = rawPerDay * ldef.costPerRaw;
const upkeep = BUILDINGS.hq.upkeepPerDay + gdef.upkeepPerDay
  + BUILDINGS.depot.upkeepPerDay + ldef.upkeepPerDay;
print('');
print('  WHAT A DAY COSTS');
print('    supplies         $' + Math.round(supplies).toLocaleString());
print('    processing       $' + Math.round(processing).toLocaleString());
print('    upkeep           $' + Math.round(upkeep).toLocaleString());
print('    wages + vehicle  $' + Math.round(130 + 18).toLocaleString());
print('    total            $' + Math.round(supplies + processing + upkeep + 148).toLocaleString());
print('    the grow makes   ' + rawPerDay.toFixed(1) + ' raw/day -> ' + (rawPerDay * 2).toFixed(1) + ' packs');
print('    sold per day     ' + Math.round((S.packsSold.weed || 0) / 30) + ' packs at $' +
      Math.round((S.grossRevenue || 0) / Math.max(1, S.packsSold.weed || 1)) + ' each');
print('');
print('  a day in           $' + Math.round(perDayIn).toLocaleString());
print('  a day out          $' + Math.round(perDayOut).toLocaleString());
print('  margin             $' + Math.round(perDayIn - perDayOut).toLocaleString() + '/day');

const finalWorth = netWorth(st);
print('');
print('  lowest clean ever     $' + Math.round(worst).toLocaleString());
print('  first stopped on day  ' + (broke || 'never'));
print('  net worth after 30d   $' + Math.round(finalWorth).toLocaleString() +
      '  (was $' + Math.round(worth0).toLocaleString() + ' once set up)');
print('  the operation ' + (finalWorth >= worth0 ? 'made' : 'lost') + '  $' +
      Math.round(Math.abs(finalWorth - worth0)).toLocaleString() + ' over 30 days, or $' +
      Math.round(Math.abs(finalWorth - worth0) / 30).toLocaleString() + '/day');
print('');
const perDay = (finalWorth - worth0) / 30;
const verdict = broke ? 'FAILS — the opening starves itself'
  : perDay >= 400 ? 'GOOD — you can save for a second grow inside a fortnight'
  : perDay > 0 ? 'THIN — it grows, but too slowly to feel like progress'
  : 'LOSES — the opening cannot pay for itself';
print('  ' + verdict);
print('');
// A gate, not just a report: the game must be winnable from its own front door.
if (broke) {
  print('STARTER CHECK FAILED — the opening starves itself');
} else if (perDay <= 0) {
  print('STARTER CHECK FAILED — the opening cannot pay for itself ($' +
        Math.round(perDay) + '/day)');
} else if (perDay < 250) {
  print('STARTER CHECK FAILED — too slow to feel like progress ($' +
        Math.round(perDay) + '/day, want $250+)');
} else {
  print('starter check passed — $' + Math.round(perDay) + '/day on the opening');
}
