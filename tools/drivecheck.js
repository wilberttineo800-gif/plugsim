// Does taking a run yourself actually change what the road does to you?
//   jsc -m tools/drivecheck.js
//
// This harness has been audited twice and was wrong in six separate ways.
// Every one is fixed below and named where it was fixed, because the failure
// mode here is not "the test fails" — it is "the test passes and the number it
// prints is an artifact". Each of these produced a confident figure:
//
//   1. It looped assignCourier over four routes. assignCourier REPLACES a
//      vehicle's circuit (actions.js:1043), so three of the four were silently
//      discarded and the van shuttled one glutted route with a permanently full
//      load. Every stop therefore seized a MAXIMAL cargo, inflating every
//      published figure roughly eightfold. It uses addRouteToVehicle now.
//   2. It read state.stats.seized, which building RAIDS also write to. Raids
//      were 45-74% of the headline and had nothing to do with who was driving.
//      Attributed per vehicle now, so the feeder van cannot contaminate it
//      either — it was 12.5% of the "you" figure.
//   3. It pinned every district near HEAT.max every tick, which also maxes the
//      raid model: all three buildings were gone by day 2.9 and the test
//      vehicle lost its route on day 1.6. "40 runs x 90 days" was really 40
//      runs of about two days' driving followed by 88 days of an idle van.
//      Heat is still pinned — that is the point — but buildings are held
//      standing so the run is actually 90 days of driving.
//   4. n=40 gave a 95% interval spanning "twice as bad" to "perfect"
//      (p = 0.098). n=200 now, with a bootstrap interval printed beside the
//      point estimate rather than a bare ratio.
//   5. It counted wounds by reading body.wounds at the END of a run — but
//      resolveDeath fits a new body (actions.js:2064), so a run that shot you
//      dead reported zero wounds. The harness was hiding its own best evidence.
//      Counted as they happen now.
//   6. A 200-round block called takeFire directly and reported "120 log lines".
//      120 is the ring-buffer cap (state.js:345), not a measurement. And it
//      only ever proved takeFire works in isolation, which was never in doubt.
//      Deleted; the sim rows carry the claim themselves.
//
// It also runs a boxtruck arm, because the talk-down scales against how much
// you are carrying and a sedan caps at 140 packs — nowhere near enough to move
// the odds. The change that was supposed to stop driving being a free win is
// only visible on a big load.

import { HEAT, YOU_DRIVING } from '../src/game/constants.js';
import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { createState, createRoute } from '../src/game/state.js';
import { BUILDINGS } from '../src/game/constants.js';
import { stepSim, seedWorld } from '../src/game/sim.js';
import { characterOf } from '../src/game/character.js';
import { haversineKm } from '../src/game/geo.js';
import * as A from '../src/game/actions.js';

const log = (...a) => print(a.join(' '));
const money = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
const RUNS = 200;
const DAYS = 90;

/**
 * A 95% interval by bootstrap. The per-run figures are wildly over-dispersed —
 * most runs have no seizure at all and one has an enormous one — so a mean
 * without an interval is a number with no error bar pretending to be a result.
 * That is precisely how the first version of this harness reported a 41%
 * effect that a proper interval showed was consistent with no effect at all.
 */
function bootstrapMean(xs, resamples = 4000) {
  if (!xs.length) return { mean: 0, lo: 0, hi: 0 };
  const means = new Array(resamples);
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < resamples; r++) {
    let t = 0;
    for (let i = 0; i < xs.length; i++) t += xs[(rnd() * xs.length) | 0];
    means[r] = t / xs.length;
  }
  means.sort((a, b) => a - b);
  return {
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
    lo: means[Math.floor(resamples * 0.025)],
    hi: means[Math.floor(resamples * 0.975)],
  };
}

function scenario(mode, vehicle, seed) {
  seedWorld(seed);
  const drivenByYou = mode !== 'hired';
  const origin = { lat: 42.3314, lng: -83.0458 };
  const districts = generateDistricts(origin, []);
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);
  const state = createState({
    origin, cityName: 'Detroit', districts, crews, lots: syntheticLots(districts),
  });
  state.cash.clean = 20_000_000;
  state.cash.dirty = 500_000;

  const mk = (type) => {
    const lot = cheapestLotFor(state, BUILDINGS[type]);
    if (!lot) return null;
    if (!A.buyLot(state, lot.id).ok) return null;
    const f = A.developLot(state, lot.id, type);
    return f.ok ? f.building : null;
  };
  const grow = mk('grow_house');
  const lab = mk('lab');
  const depot = mk('depot');
  if (!grow || !lab || !depot) return null;

  const wire = (fromLL, toLL, r) => {
    r.points = [fromLL, toLL];
    r.km = haversineKm(fromLL, toLL) * 1.35;
    r.realRoad = false;
    state.routes.push(r);
    return r;
  };
  const feed = wire(grow.latlng, lab.latlng, createRoute({
    fromId: grow.id, toType: 'building', toId: lab.id, cargo: 'raw', product: 'any',
  }));
  const sells = state.districts.slice(0, 4).map((d) => wire(lab.latlng, d.center, createRoute({
    fromId: lab.id, toType: 'district', toId: d.id, cargo: 'packs', product: 'any',
  })));

  const feeder = A.buyVehicle(state, 'sedan');
  if (feeder.ok) {
    const fd = A.hireDriver(state);
    if (fd.ok) A.assignDriver(state, feeder.vehicle.id, fd.driver.id);
    A.assignCourier(state, feeder.vehicle.id, feed.id);
  }

  const veh = A.buyVehicle(state, vehicle);
  if (!veh.ok) return null;
  if (drivenByYou) {
    A.assignDriver(state, veh.vehicle.id, YOU_DRIVING);
  } else {
    const d = A.hireDriver(state);
    if (d.ok) A.assignDriver(state, veh.vehicle.id, d.driver.id);
  }
  if (mode === 'armed') {
    // Straight into the cabinet: the harness needs something in your hand, not
    // a firearms production line.
    state.armoury = state.armoury || [];
    const piece = {
      id: 'p_test', kind: 'gun', classId: 'handgun', modelId: null,
      quality: 0.6, serialised: false, value: 800,
    };
    state.armoury.push(piece);
    characterOf(state).equipped.sidearm = piece.id;
  }

  // FIX 1 — see the header. assignCourier replaces, addRouteToVehicle extends.
  A.assignCourier(state, veh.vehicle.id, sells[0].id);
  for (let i = 1; i < sells.length; i++) {
    A.addRouteToVehicle(state, veh.vehicle.id, sells[i].id);
  }

  const target = state.couriers.find((c) => c.id === veh.vehicle.id);

  let wounds = 0;          // FIX 5 — counted as they happen, not read at the end
  let deaths = 0;
  const seenWounds = new Set();

  // FIX 3, properly. Holding heat at the ceiling makes stops likely, but the
  // same dial makes RAIDS certain, and a raid splices the building out of the
  // array and filters its routes away (sim.js:1612-1613) — so setting
  // `b.active = true` did nothing at all, the lab was simply gone. Measured on
  // the old harness: every building lost by day 2.9 and the circuit lost by
  // day 1.6, so "200 runs of 90 days" was really 200 runs of two days' driving
  // and 88 days of an idle van parked in a dead city.
  //
  // This harness is a test of the STOP branch, not of the raid model, so the
  // operation is held standing: anything raided away is put back, and the
  // circuit is re-pinned if it is ever emptied.
  const premises = state.buildings.slice();
  const lines = state.routes.slice();
  const circuitWanted = (target.routeIds || []).slice();
  const holdOperationUp = () => {
    for (const b of premises) {
      if (!state.buildings.includes(b)) state.buildings.push(b);
      b.active = true;
    }
    for (const r of lines) {
      if (!state.routes.includes(r)) state.routes.push(r);
      r.active = true;
    }
    if (!(target.routeIds || []).length && circuitWanted.length) {
      target.routeIds = circuitWanted.slice();
      target.routeIndex = 0;
      target.routeId = circuitWanted[0];
      if (target.phase === 'idle') target.phase = 'loading';
    }
  };

  const hooks = { onIncident: () => {} };
  for (let i = 0; i < DAYS * 24; i++) {
    for (const d of state.districts) d.heat = Math.max(d.heat, HEAT.max * 0.9);
    holdOperationUp();
    stepSim(state, 1, hooks);
    const body = characterOf(state).body;
    for (const w of body.wounds || []) {
      if (!seenWounds.has(w)) { seenWounds.add(w); wounds++; }
    }
    if (body.deadAt != null) deaths++;
    if (state.gameOver) break;
  }

  return {
    // FIX 2 — the sim now records this per vehicle (sim.js, maybeGetStopped),
    // so it cannot be contaminated by the feeder van or by building raids, and
    // nothing has to guess whether cargo fell because of a stop or an unload.
    seizedHere: target.seizedTotal || 0,
    stopsHere: target.stopsTotal || 0,
    wounds,
    deaths,
    inPerson: state.stats.stoppedInPerson || 0,
    talked: state.stats.talkedDown || 0,
    trips: target.tripsCompleted || 0,
    circuit: (target.routeIds || []).length,
    net: state.cash.clean + state.cash.dirty,
    standing: state.buildings.length,
  };
}

log('=== DRIVE IT YOURSELF ===');
log(`${RUNS} paired runs of ${DAYS} days per row, same seeds on every row.`);
log('Blocks are held hot deliberately: this measures the STOP BRANCH, not the');
log('heat model, which in unforced play almost never reaches the stop floor.');

const ARMS = [
  ['sedan · hired', 'hired', 'sedan'],
  ['sedan · you, unarmed', 'you', 'sedan'],
  ['sedan · you, armed', 'armed', 'sedan'],
  ['boxtruck · hired', 'hired', 'boxtruck'],
  ['boxtruck · you, unarmed', 'you', 'boxtruck'],
];

const perArm = {};
for (const [label, mode, vehicle] of ARMS) {
  const per = [];
  const t = {
    stops: 0, inPerson: 0, talked: 0, trips: 0, wounds: 0, deaths: 0,
    net: 0, runs: 0, circuit: 0,
  };
  for (let s = 1; s <= RUNS; s++) {
    const r = scenario(mode, vehicle, s * 7919);
    if (!r) continue;
    t.runs++;
    t.stops += r.stopsHere;
    t.inPerson += r.inPerson;
    t.talked += r.talked;
    t.trips += r.trips;
    t.wounds += r.wounds;
    t.deaths += r.deaths;
    t.net += r.net;
    t.circuit += r.circuit;
    per.push(r.seizedHere);
  }
  perArm[label] = per;
  const ci = bootstrapMean(per);
  log('');
  log(`--- ${label} (${t.runs} runs) ---`);
  log(`  circuit length           ${(t.circuit / Math.max(1, t.runs)).toFixed(2)} routes (want 3-4)`);
  log(`  trips by that vehicle    ${t.trips}`);
  log(`  its own stops            ${t.stops}`);
  log(`    of those, in person    ${t.inPerson}`);
  log(`    talked out of it       ${t.talked}`
    + (t.inPerson ? ` (${Math.round(t.talked / t.inPerson * 100)}% of in-person)` : ''));
  log(`  packs seized off IT      mean ${ci.mean.toFixed(2)}/run`
    + `  95% CI ${ci.lo.toFixed(2)}-${ci.hi.toFixed(2)}`);
  log(`  wounds / deaths          ${t.wounds} / ${t.deaths}`);
  log(`  net cash per run         ${money(t.net / Math.max(1, t.runs))}`);
}

log('');
log('--- the actual claim, with an error bar on it ---');
for (const v of ['sedan', 'boxtruck']) {
  const hk = Object.keys(perArm).find((k) => k.startsWith(v) && k.includes('hired'));
  const yk = Object.keys(perArm).find((k) => k.startsWith(v) && k.includes('unarmed'));
  if (!hk || !yk) continue;
  const mh = bootstrapMean(perArm[hk]);
  const my = bootstrapMean(perArm[yk]);
  const drop = mh.mean > 0 ? (1 - my.mean / mh.mean) * 100 : 0;
  log(`  ${v.padEnd(9)} hired ${mh.mean.toFixed(2)}/run  vs  you ${my.mean.toFixed(2)}/run`
    + `   ->  ${drop.toFixed(1)}% less cargo lost`);
}
