// Drive-it-yourself check.
//   jsc -m tools/drivecheck.js
//
// Taking a run yourself is meant to change what the road does to you, not how
// fast the van goes. This runs the same seeded 90 days three ways — a hired
// driver, you unarmed, you armed — and prints what actually differed. Blocks
// are held near max heat on purpose: this measures the STOP BRANCH, not the
// heat model, which is tuned elsewhere and currently almost never fires.
//
// What to look for:
//   - "in person" should equal your stops and be zero for a hired driver
//   - "talked out of it" should land near 70% of your stops on a healthy body
//     (0.35 + deal*0.35, and a fresh `deal` is 1.0)
//   - "packs seized" should be LOWER for you than for staff — that is the
//     whole economic case for driving
//   - wounds should be zero unarmed, non-zero armed. takeFire had exactly one
//     call site before this feature; the armed row is the second door.

import { HEAT, YOU_DRIVING } from '../src/game/constants.js';
import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { createState, createRoute } from '../src/game/state.js';
import { BUILDINGS } from '../src/game/constants.js';
import { stepSim, seedWorld } from '../src/game/sim.js';
import { armedWith, characterOf } from '../src/game/character.js';
import * as A from '../src/game/actions.js';
import { takeFire, reportFire } from '../src/game/actions.js';
import { haversineKm } from '../src/game/geo.js';

const log = (...a) => print(a.join(' '));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

function scenario(mode, seed) {
  const drivenByYou = mode !== 'hired';
  seedWorld(seed);
  const origin = { lat: 42.3314, lng: -83.0458 };
  const districts = generateDistricts(origin, []);
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);
  const lots = syntheticLots(districts);
  const state = createState({ origin, cityName: 'Detroit', districts, crews, lots });
  state.cash.clean = 5_000_000; state.cash.dirty = 500_000;

  // A grow and a stash, wired straight together.
  const mk = (type) => {
    const lot = cheapestLotFor(state, BUILDINGS[type]);
    if (!lot) { print('  no lot for ' + type); return null; }
    const b = A.buyLot(state, lot.id);
    if (!b.ok) { print('  buyLot: ' + b.error); return null; }
    const f = A.developLot(state, lot.id, type);
    if (!f.ok) { print('  developLot: ' + f.error); return null; }
    return f.building;
  };
  const grow = mk('grow_house');
  const lab = mk('lab');
  const depot = mk('depot');
  if (!grow || !lab || !depot) return null;

  // Sell routes into every district, so cargo is always moving.
  const routes = [];
  const wire = (fromLL, toLL, r) => {
    r.points = [fromLL, toLL];
    r.km = haversineKm(fromLL, toLL) * 1.35;
    r.realRoad = false;
    state.routes.push(r);
    return r;
  };
  const feed = wire(grow.latlng, lab.latlng,
    createRoute({ fromId: grow.id, toType: 'building', toId: lab.id, cargo: 'raw', product: 'any' }));
  for (const d of districts.slice(0, 4)) {
    const r = createRoute({ fromId: lab.id, toType: 'district', toId: d.id, cargo: 'packs', product: 'any' });
    const from = lab.latlng;
    r.points = [from, d.center];
    r.km = haversineKm(from, d.center) * 1.35;
    r.realRoad = false;
    state.routes.push(r);
    routes.push(r);
  }

  const feeder = A.buyVehicle(state, 'sedan');
  if (feeder.ok) {
    const fd = A.hireDriver(state);
    A.assignDriver(state, feeder.vehicle.id, fd.driver.id);
    A.assignCourier(state, feeder.vehicle.id, feed.id);
  }
  const veh = A.buyVehicle(state, 'sedan');
  if (!veh.ok) { print('  buyVehicle: ' + veh.error); return null; }
  if (drivenByYou) {
    A.assignDriver(state, veh.vehicle.id, YOU_DRIVING);
  } else {
    const d = A.hireDriver(state);
    A.assignDriver(state, veh.vehicle.id, d.driver.id);
  }
  for (const r of routes) A.assignCourier(state, veh.vehicle.id, r.id);

  if (mode === 'armed') {
    // Straight into the cabinet: the harness needs something in your hand,
    // not a firearms production line.
    state.armoury = state.armoury || [];
    const piece = { id: 'p_test', kind: 'gun', classId: 'handgun', modelId: null, quality: 0.6, serialised: false, value: 800 };
    state.armoury.push(piece);
    characterOf(state).equipped.sidearm = piece.id;
    if (!(armedWith(state) > 0)) print('  ! harness failed to arm you — armed row is meaningless');
  }

  // Force every block hot enough that stops are near-certain over the run.
  // We are testing the branch, not the heat model.
  for (const d of state.districts) d.heat = HEAT.max;

  const hooks = { onIncident: () => {} };
  for (let i = 0; i < 90 * 24; i++) {
    for (const d of state.districts) d.heat = Math.max(d.heat, HEAT.max * 0.9);
    stepSim(state, 1, hooks);
  }
  const sale = state.couriers.find((x) => x.id === veh.vehicle.id);
  state._sale = sale;
  return state;
}

log('=== DRIVE IT YOURSELF ===');
log('40 paired runs, same seeds every row. Only the driver changes.');

for (const [label, mode] of [['hired driver', 'hired'], ['you, unarmed', 'you'], ['you, armed', 'armed']]) {
  const t = { stops: 0, inPerson: 0, talked: 0, seized: 0, tribute: 0, gross: 0, trips: 0, wounds: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const s = scenario(mode, seed * 7919);
    if (!s) { log(`${label}: setup failed`); break; }
    const st = s.stats;
    t.stops += st.stops || 0;
    t.inPerson += st.stoppedInPerson || 0;
    t.talked += st.talkedDown || 0;
    t.seized += st.seizedOnRoad || 0;
    t.tribute += st.tributePaid || 0;
    t.gross += st.grossRevenue || 0;
    t.trips += s._sale.tripsCompleted || 0;
    t.wounds += ((s.character && s.character.body && s.character.body.wounds) || []).length;
  }
  log('');
  log(`--- ${label} (40 runs x 90 days) ---`);
  log(`  trips by that vehicle  ${t.trips}`);
  log(`  police stops           ${t.stops}`);
  log(`    of those, in person  ${t.inPerson}`);
  log(`    talked out of it     ${t.talked}` + (t.inPerson ? ` (${Math.round(t.talked / t.inPerson * 100)}% of in-person)` : ''));
  log(`  packs seized ON ROAD   ${t.seized.toFixed(1)}`);
  log(`  tribute paid           ${t.tribute.toFixed(1)} packs`);
  log(`  gross                  ${money(t.gross)}`);
  log(`  wounds taken           ${t.wounds}`);
}

// The sim rows above prove the branch is REACHED. They can't prove the door
// opens: 70% of your stops end in talk, so only a couple of searches a run
// ever reach an armed roll. This hits takeFire directly, the way the stop
// does, and confirms a round actually lands on a body.
log('');
log('--- the door itself: 200 rounds straight into takeFire ---');
{
  seedWorld(4242);
  const origin = { lat: 42.3314, lng: -83.0458 };
  const districts = generateDistricts(origin, []);
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);
  const st = createState({ origin, cityName: 'Detroit', districts, crews, lots: syntheticLots(districts) });
  let logged = 0;
  const before = (st.log || []).length;
  for (let i = 0; i < 200; i++) {
    const hurt = takeFire(st, { rounds: 1, heat: 60 });
    reportFire(st, hurt);
    if (hurt.wounds.length) logged++;
    if (hurt.died) break;
  }
  const body = characterOf(st).body;
  log(`  rounds that wounded    ${logged}/200`);
  log(`  wounds on the body     ${(body.wounds || []).length}`);
  log(`  log lines written      ${(st.log || []).length - before}`);
  log(`  dead                   ${body.deadAt != null ? 'yes' : 'no'}`);
}
