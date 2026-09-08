// The simulation tick. Everything advances in game-hours so tuning numbers in
// constants.js read as "per hour" / "per day" and mean exactly that.

import {
  BUILDINGS,
  COURIERS,
  CRIME,
  HEAT,
  HQ_HEAT_RELIEF,
  MARKET,
  PRODUCTS,
  PRODUCT_IDS,
  RIVALS,
  MARKET_PROPERTY,
  LEGIT_WEALTH_SWING,
} from './constants.js';
import { clamp, clamp01, makeRng } from './rng.js';
import { blendQuality, sellRatePerHour, streetPrice } from './economy.js';
import { pathLengthKm, pointAlongPath, haversineKm } from './geo.js';
import { checkUnlocks } from './progression.js';
import { LICENCES, classOf, hasLicence, legalPriceFactor } from './firearms.js';
import { turfEffects, turfUpkeep } from './turf.js';
import { stepPlayers, snapshotPlayers, stepDiscovery } from './players.js';
import {
  RESEARCH, projectById, rollDiscovery, nameFor, tierById, ITEM_KINDS,
  researchQuality, researchYield, researchEffects,
} from './research.js';
import { effectsFor, upkeepFor, vehicleStats } from './upgrades.js';
import { rentPerDay } from './lots.js';
import {
  buildingById,
  districtById,
  logEvent,
  routeById,
  parkedPosition,
  clockOf,
} from './state.js';

let rng = makeRng(Date.now() & 0xffffffff);

/**
 * Fix the world's randomness. Only for harnesses that need to compare two runs
 * that differ by one thing; the game never calls it.
 */
export function seedWorld(seed) {
  rng = makeRng(seed >>> 0);
}

/** Pay an operating cost: street money first, clean money only if it must. */
export function paySoft(state, amount) {
  if (amount <= 0) return true;
  const fromDirty = Math.min(state.cash.dirty, amount);
  state.cash.dirty -= fromDirty;
  const remainder = amount - fromDirty;
  if (remainder <= 0) return true;
  state.cash.clean -= remainder;
  return state.cash.clean >= 0;
}

function totalPacks(container) {
  return PRODUCT_IDS.reduce((sum, p) => sum + container[p], 0);
}

function buildingDef(b) {
  return BUILDINGS[b.type];
}

/** How much a building's floorplate lifts its throughput. */
export function sizeScale(b) {
  return b && b.scale ? b.scale : 1;
}

/**
 * How much it lifts its storage. Kept separate from throughput because floor
 * space translates almost directly into how much product fits, while output
 * is limited by equipment and hands.
 */
export function sizeCapacity(b) {
  return b && b.capScale ? b.capScale : sizeScale(b);
}

// Buildings no longer improve on a flat level curve — see upgrades.js, where
// each type has its own list and every effect is explicit.

// ---------------------------------------------------------------------------

const MAX_STEP_HOURS = 0.25;

// Accumulated progress is a sum of floats, so a cycle that divides evenly into
// the step size lands a hair under 1 and never completes: 24 × (0.25/6) is
// 0.9999999999999999, and a six-hour grow caught up in quarter-hour slices
// would sit at "finished" forever without ever harvesting. Compare with a
// tolerance rather than exactly.
const DONE = 1 - 1e-9;

/**
 * Advance the world. Large jumps are sliced: a courier only advances one phase
 * per tick, probabilities are computed per-tick, and capacity is checked at the
 * top of a tick — so a single 24-hour step would stall logistics, overshoot
 * storage and turn per-hour risks into certainties.
 */
/**
 * Run the world forward over the real time the player was away, and describe
 * what changed. The world is meant to keep living without you — a busy empire
 * costs about 100 ms for a full week, so this runs the real simulation rather
 * than estimating it.
 */
export const MAX_CATCHUP_HOURS = 24 * 7;

export function catchUp(state, awayMs, hooks = {}) {
  // At 1x a game second is a real second, so away time converts directly.
  const rawHours = awayMs / 3600000;
  if (!(rawHours > 0.02)) return null;

  const hours = Math.min(rawHours, MAX_CATCHUP_HOURS);
  const before = {
    clean: state.cash.clean,
    dirty: state.cash.dirty,
    trips: (state.couriers || []).reduce((n, c) => n + (c.tripsCompleted || 0), 0),
    day: clockOf(state.minutes).day,
  };
  const events = [];
  stepSim(state, hours, {
    ...hooks,
    onIncident: (...args) => { events.push(args[0]); hooks.onIncident?.(...args); },
  });

  return {
    hours,
    capped: rawHours > MAX_CATCHUP_HOURS,
    awayHours: rawHours,
    earnedClean: state.cash.clean - before.clean,
    earnedDirty: state.cash.dirty - before.dirty,
    trips: (state.couriers || []).reduce((n, c) => n + (c.tripsCompleted || 0), 0) - before.trips,
    days: clockOf(state.minutes).day - before.day,
    incidents: events.length,
  };
}

export function stepSim(state, dtHours, hooks = {}) {
  if (dtHours <= 0) return;
  let left = dtHours;
  while (left > 0) {
    const slice = Math.min(left, MAX_STEP_HOURS);
    stepOnce(state, slice, hooks);
    left -= slice;
  }
}

function stepOnce(state, dtHours, hooks = {}) {

  const prevDay = Math.floor(state.minutes / 1440);
  state.minutes += dtHours * 60;
  const newDay = Math.floor(state.minutes / 1440);

  stepProduction(state, dtHours);
  stepLabs(state, dtHours);
  stepCouriers(state, dtHours, hooks);
  stepStorefronts(state, dtHours);
  stepMarkets(state, dtHours);
  stepLegit(state, dtHours);
  stepPropertyMarket(state, dtHours);
  maybeRecordPrices(state);
  stepRents(state, dtHours);
  stepTurf(state, dtHours);
  stepResearch(state, dtHours);
  stepHeat(state, dtHours);
  stepEnforcement(state, dtHours);

  if (newDay > prevDay) {
    for (let d = prevDay; d < newDay; d++) settleDay(state);
  }
}

// --- Production -------------------------------------------------------------

function stepProduction(state, dt) {
  for (const b of state.buildings) {
    if (b.kind !== 'production') continue;
    const def = buildingDef(b);
    b.stalledReason = null;

    if (!b.active) { b.stalledReason = 'Shut down'; continue; }

    // A licensed workshop is only a workshop while the licence holds.
    const needs = def.needsLicence;
    if (needs && !hasLicence(state, needs)) {
      b.stalledReason = `No ${LICENCES[needs].short} — the line is shut until it's in force`;
      continue;
    }

    const fx = effectsFor(b);
    const cap = def.capacity * fx.capacityMult * sizeCapacity(b);
    if (b.raw[def.product] >= cap) {
      b.stalledReason = 'Storage full — move the harvest out';
      continue;
    }

    // Buying in supplies kicks off a cycle.
    if (!b.cycleStarted) {
      const cost = def.supplyCostPerSlot * def.slots;
      if (state.cash.dirty + state.cash.clean < cost) {
        b.stalledReason = 'Can’t cover supplies';
        continue;
      }
      paySoft(state, cost);
      b.cycleStarted = true;
      b.cycleProgress = 0;
    }

    b.cycleProgress += dt / (def.cycleHours * researchEffects(state).cycleMult);
    if (b.cycleProgress >= DONE) {
      b.cycleProgress = 0;
      b.cycleStarted = false;
      // A firearms shop makes whatever it's tooled for, and a shotgun is not a
      // suppressor: simpler things come off the line faster.
      const lineMult = def.product === 'iron' ? classOf(b).yieldMult : 1;
      // Anything you've developed applies to every site that makes that product,
      // plus whatever one-off is fitted to this particular building.
      const item = itemEffectsFor(state, b);
      const yieldAmount = def.slots * def.rawPerSlot * fx.yieldMult * sizeScale(b)
        * lineMult * researchYield(state, def.product) * item.yieldMult;
      // A rifle line turns out fewer, better units than a shotgun line; that
      // shows up as quality, which is what the market actually prices.
      const lineQuality = def.product === 'iron' ? (classOf(b).valueMult - 1) * 0.12 : 0;
      const quality = clamp01(
        def.baseQuality + fx.qualityAdd + lineQuality
        + researchQuality(state, def.product) + item.qualityAdd
      );
      const room = Math.max(0, cap - b.raw[def.product]);
      const added = Math.min(yieldAmount, room);
      b.rawQuality[def.product] = blendQuality(
        b.raw[def.product], b.rawQuality[def.product], added, quality
      );
      b.raw[def.product] += added;
      b.lastHarvest = state.minutes;
    }
  }
}

// --- Processing -------------------------------------------------------------

function stepLabs(state, dt) {
  for (const b of state.buildings) {
    if (b.kind !== 'processing') continue;
    const def = buildingDef(b);
    b.stalledReason = null;
    if (!b.active) { b.stalledReason = 'Shut down'; continue; }

    // A licensed workshop is only a workshop while the licence holds.
    const needs = def.needsLicence;
    if (needs && !hasLicence(state, needs)) {
      b.stalledReason = `No ${LICENCES[needs].short} — the line is shut until it's in force`;
      continue;
    }

    const fx = effectsFor(b);
    const packCap = def.capacity * fx.capacityMult * sizeCapacity(b);
    if (totalPacks(b.packs) >= packCap) {
      b.stalledReason = 'Packaged stock full — ship it out';
      continue;
    }

    const budget = def.rawPerHour * fx.yieldMult * sizeScale(b) * dt;
    let didWork = false;

    // Split the line's time across whatever is waiting, in proportion to how
    // much of each is backed up. Running strictly in product order let a big
    // cannabis backlog eat the whole budget and starve psilocybin forever.
    const waiting = PRODUCT_IDS.filter((pid) => b.raw[pid] > 0.0001);
    const totalWaiting = waiting.reduce((n, pid) => n + b.raw[pid], 0);

    for (const pid of waiting) {
      const available = b.raw[pid];
      const share = budget * (available / totalWaiting);
      const take = Math.min(available, share);
      if (take <= 0.0001) continue;
      // Recovering your solvent is the biggest saving available in processing.
      const cost = take * def.costPerRaw * researchEffects(state).processCostMult
        * itemEffectsFor(state, b).costMult;
      if (state.cash.dirty + state.cash.clean < cost) {
        b.stalledReason = 'Can’t cover processing costs';
        break;
      }
      paySoft(state, cost);

      const packs = take * PRODUCTS[pid].packsPerRaw;
      const quality = clamp01(b.rawQuality[pid] + def.qualityBonus + fx.qualityAdd);
      b.packQuality[pid] = blendQuality(b.packs[pid], b.packQuality[pid], packs, quality);
      b.raw[pid] -= take;
      b.packs[pid] += packs;
      didWork = true;
    }

    if (!didWork && !b.stalledReason) b.stalledReason = 'Idle — no raw harvest delivered';
  }
}

// --- Logistics --------------------------------------------------------------

/**
 * The line this vehicle is working. Kept honest against the circuit, so a
 * deleted route or a stale pointer resolves rather than stalling the vehicle.
 */
function currentRoute(state, c) {
  const circuit = (c.routeIds || []).filter((id) => routeById(state, id));
  if (circuit.length !== (c.routeIds || []).length) {
    c.routeIds = circuit;
    c.routeIndex = 0;
  }
  if (!circuit.length) { c.routeId = null; return null; }
  if (c.routeIndex >= circuit.length) c.routeIndex = 0;
  c.routeId = circuit[c.routeIndex];
  return routeById(state, c.routeId);
}

/** Move to the next line on the circuit. */
function advanceCircuit(state, c) {
  const circuit = c.routeIds || [];
  if (circuit.length < 2) return;
  c.routeIndex = (c.routeIndex + 1) % circuit.length;
  c.routeId = circuit[c.routeIndex];
}

function stepCouriers(state, dt, hooks) {
  for (const c of state.couriers) {
    const base = COURIERS[c.type];
    // Whatever is fitted to this vehicle changes what it can do.
    const def = { ...base, ...vehicleStats(c, base) };
    const route = currentRoute(state, c);

    // An asset with nobody driving it just sits in its bay.
    if (!c.driverId || !route || !route.active) {
      c.phase = 'idle';
      c.position = parkedPosition(state, c) || c.position;
      continue;
    }
    if (!route.points) continue; // route still being fetched

    const source = buildingById(state, route.fromId);
    if (!source) { c.phase = 'idle'; continue; }

    // Air goes straight over everything; everything else follows the roads at
    // OSRM's own estimated pace, scaled by what this vehicle is.
    const ends = [route.points[0], route.points[route.points.length - 1]];
    const straightKm = haversineKm(ends[0], ends[1]);
    const legHours = def.direct
      ? Math.max(0.02, straightKm / (def.airKph || 45))
      : Math.max(0.02, ((route.driveMinutes != null ? route.driveMinutes : (route.km / 22) * 60)
          * (def.paceFactor || 1)) / 60);

    switch (c.phase) {
      case 'idle':
      case 'loading': {
        c.position = source.latlng;
        // Nothing to pick up yet. With a circuit there's somewhere else to be,
        // so try the next line instead of standing at an empty door.
        if (!c.dwellLeft) {
          const loaded = loadCargo(state, c, def, route, source);
          if (loaded <= 0) {
            advanceCircuit(state, c);
            break;
          }
          c.dwellLeft = (def.loadMinutes || 0) / 60;
        }
        c.dwellLeft -= dt;
        if (c.dwellLeft <= 0) {
          c.dwellLeft = 0;
          c.phase = 'outbound';
          c.progress = 0;
        }
        break;
      }
      case 'outbound': {
        c.progress += legHours > 0 ? dt / legHours : 1;
        c.position = def.direct
          ? straightLine(ends[0], ends[1], clamp01(c.progress))
          : pointAlongPath(route.points, clamp01(c.progress));
        // Nothing on the road to be pulled over by.
        if (!def.direct) maybeGetStopped(state, c, def, dt, hooks);
        if (c.progress >= DONE) {
          c.phase = 'unloading';
          c.dwellLeft = (def.unloadMinutes || 0) / 60;
        }
        break;
      }
      case 'unloading': {
        c.position = pointAlongPath(route.points, 1);
        c.dwellLeft -= dt;
        if (c.dwellLeft <= 0) {
          c.dwellLeft = 0;
          unloadCargo(state, c, route, hooks, def);
          c.phase = 'returning';
          c.progress = 0;
          c.tripsCompleted++;
        }
        break;
      }
      case 'returning': {
        c.progress += legHours > 0 ? dt / legHours : 1;
        c.position = def.direct
          ? straightLine(ends[0], ends[1], 1 - clamp01(c.progress))
          : pointAlongPath(route.points, 1 - clamp01(c.progress));
        if (c.progress >= DONE) {
          c.phase = 'loading';
          c.progress = 0;
          // A vehicle big enough to hold several lines works round them in
          // turn, rather than running one forever.
          advanceCircuit(state, c);
        }
        break;
      }
      default:
        c.phase = 'idle';
    }
  }
}

/** Straight-line interpolation, for anything that doesn't use roads. */
function straightLine(a, b, t) {
  const f = clamp01(t);
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
}

function loadCargo(state, c, def, route, source) {
  const pool = route.cargo === 'raw' ? source.raw : source.packs;
  const qualityPool = route.cargo === 'raw' ? source.rawQuality : source.packQuality;
  const wanted = route.product === 'any' ? PRODUCT_IDS : [route.product];

  // Whatever is already on board still takes up room — without this,
  // rerouting a laden courier let it load a second full payload.
  const aboard = totalPacks(c.cargo);
  let space = Math.max(0, def.capacity - aboard);
  let loaded = 0;
  if (aboard <= 0.0001) c.cargoKind = route.cargo;

  for (const pid of wanted) {
    if (space <= 0) break;
    const take = Math.min(pool[pid], space);
    if (take <= 0.0001) continue;
    c.cargoQuality[pid] = blendQuality(c.cargo[pid], c.cargoQuality[pid], take, qualityPool[pid]);
    c.cargo[pid] += take;
    pool[pid] -= take;
    space -= take;
    loaded += take;
  }
  return loaded;
}

function unloadCargo(state, c, route, hooks = {}, def = null) {
  const carried = totalPacks(c.cargo);
  if (carried <= 0) return;

  if (route.toType === 'district') {
    const d = districtById(state, route.toId);
    if (!d) return;
    // Raw harvest has no street value — it goes back rather than being sold
    // at packaged prices.
    if (c.cargoKind === 'raw') {
      const source = buildingById(state, route.fromId);
      for (const pid of PRODUCT_IDS) {
        if (source) source.raw[pid] += c.cargo[pid];
        c.cargo[pid] = 0;
      }
      return;
    }
    // Whoever holds the block gets their cut before the customers see any of it.
    maybeShakedown(state, c, d, hooks);
    for (const pid of PRODUCT_IDS) {
      const amount = c.cargo[pid];
      if (amount <= 0) continue;
      // A refrigerated load doesn't degrade on the way.
      const arriving = def && def.preservesQuality
        ? c.cargoQuality[pid]
        : Math.max(0, c.cargoQuality[pid] - 0.02);
      d.supplyQuality[pid] = blendQuality(d.supply[pid], d.supplyQuality[pid], amount, arriving);
      d.supply[pid] += amount;
      c.cargo[pid] = 0;
    }
    d.discovered = true;
  } else {
    const target = buildingById(state, route.toId);
    if (!target) return;
    const def = BUILDINGS[target.type];
    const pool = route.cargo === 'raw' ? target.raw : target.packs;
    const qualityPool = route.cargo === 'raw' ? target.rawQuality : target.packQuality;
    const cap = def.capacity * effectsFor(target).capacityMult * sizeCapacity(target);
    for (const pid of PRODUCT_IDS) {
      const amount = c.cargo[pid];
      if (amount <= 0) continue;
      const used = route.cargo === 'raw' ? totalPacks(target.raw) : totalPacks(target.packs);
      const room = Math.max(0, cap - used);
      const accepted = Math.min(amount, room);
      if (accepted > 0) {
        qualityPool[pid] = blendQuality(pool[pid], qualityPool[pid], accepted, c.cargoQuality[pid]);
        pool[pid] += accepted;
      }
      // Anything that doesn't fit stays on the truck for the next run.
      c.cargo[pid] = amount - accepted;
    }
  }
}

function maybeGetStopped(state, c, def, dt, hooks) {
  const carried = totalPacks(c.cargo);
  if (carried <= 0) return;
  const here = c.position;
  if (!here) return;

  const d = nearestDistrict(state, here);
  if (!d || d.heat < HEAT.stopHeatFloor) return;

  const heatFactor = (d.heat - HEAT.stopHeatFloor) / (HEAT.max - HEAT.stopHeatFloor);
  const stats = vehicleStats(c, COURIERS[c.type]);
  // Driving through a block you've arranged is safer than driving through one
  // you haven't.
  const turf = turfEffects(d);
  const perHour = HEAT.stopChanceAtMaxHeat * clamp01(heatFactor) * (1 - stats.stealth)
    * (1 - clamp01(turf.stopResist))
    * (1 - turf.policeSuppression);
  if (rng() < perHour * dt) {
    const fine = Math.round(carried * HEAT.finePerPackSeized);
    for (const pid of PRODUCT_IDS) c.cargo[pid] = 0;
    paySoft(state, fine);
    state.stats.seized += carried;
    state.stats.stops++;
    d.heat = clamp(d.heat + 6, 0, HEAT.max);
    c.lastEvent = 'Pulled over';
    logEvent(
      state,
      `${def.name} stopped in ${d.name} — ${Math.round(carried)} packs seized, $${fine.toLocaleString()} gone.`,
      'bad'
    );
    hooks.onIncident?.(here, 'stop');
  }
}

function nearestDistrict(state, latlng) {
  let best = null;
  let bestKm = Infinity;
  for (const d of state.districts) {
    const km = haversineKm(d.center, latlng);
    if (km < bestKm) { bestKm = km; best = d; }
  }
  return bestKm < 1.4 ? best : null;
}

// --- Selling from your own premises -----------------------------------------

/**
 * A stash house sitting on a block can serve that block directly, feeding its
 * packs onto the street without a courier making the last hop. It's metered:
 * the place can only move so much a day, and never more than the block will
 * actually absorb.
 */
function stepStorefronts(state, dt) {
  for (const b of state.buildings) {
    if (b.kind !== 'storage' || !b.active || b.selling === false) continue;
    const def = buildingDef(b);
    if (!def.sellsPerHour) continue;
    const d = districtById(state, b.districtId);
    if (!d) continue;

    // Bigger premises shift more, and upgrades help.
    const fx = effectsFor(b);
    let budget = def.sellsPerHour * fx.yieldMult * Math.sqrt(sizeCapacity(b)) * dt;

    for (const pid of PRODUCT_IDS) {
      if (budget <= 0) break;
      const have = b.packs[pid];
      if (have <= 0.0001) continue;
      // Never push more onto the block than it can take.
      const room = Math.max(0, sellRatePerHour(d, pid) * MARKET.saturationHours - d.supply[pid]);
      const move = Math.min(have, budget, room);
      if (move <= 0.0001) continue;

      // Selling off your own premises is still selling on someone's block.
      const tribute = crewCut(state, d);
      const taken = move * tribute;
      const reaching = move - taken;
      if (taken > 0.01) {
        state.stats.tributePaid = (state.stats.tributePaid || 0) + taken;
      }

      d.supplyQuality[pid] = blendQuality(d.supply[pid], d.supplyQuality[pid], reaching, b.packQuality[pid]);
      d.supply[pid] += reaching;
      b.packs[pid] -= move;
      b.soldToday = (b.soldToday || 0) + move;
      budget -= move;
      d.discovered = true;
    }
  }
}

/** The share a crew skims off anything moved on turf they hold. */
function crewCut(state, district) {
  const control = district.rivalControl || 0;
  if (control < RIVALS.shakedownFloor) return 0;
  const crew = (state.crews || []).find((c) => c.id === district.crewId);
  if (!crew) return 0;
  return Math.min(0.6, control * crew.aggression * RIVALS.tributeRate);
}

// --- Street sales -----------------------------------------------------------

function stepMarkets(state, dt) {
  for (const d of state.districts) {
    for (const pid of PRODUCT_IDS) {
      const stock = d.supply[pid];
      if (stock <= 0.0001) continue;

      const sold = Math.min(stock, sellRatePerHour(d, pid) * dt);
      if (sold <= 0) continue;

      const price = streetPrice(d, pid);
      const revenue = sold * price;

      d.supply[pid] -= sold;
      d.soldTotal[pid] += sold;
      d.revenueTotal += revenue;
      // Selling under a heavier patrol draws more attention per pack moved.
      const notice = 0.6 + d.policing * 0.8;
      d.heat = clamp(d.heat + sold * PRODUCTS[pid].heatPerPackSold * notice, 0, HEAT.max);
      d.rep = clamp01(d.rep + sold * MARKET.repGainPerSale);

      state.cash.dirty += revenue;
      state.stats.grossRevenue += revenue;
      state.stats.packsSold[pid] += sold;
    }
  }
}

// --- Laundering -------------------------------------------------------------

/**
 * Legitimate trade. A real business earns clean money on its own — slower than
 * the chain, but it's spendable the moment it lands and nothing can be seized
 * for it. Whatever capacity is left over washes street cash.
 */
function stepLegit(state, dt) {
  for (const b of state.buildings) {
    if (b.kind !== 'front' || !b.active) continue;
    const def = buildingDef(b);
    const d = districtById(state, b.districtId);
    b.stalledReason = null;

    // A licensed counter is the other way out for firearms: less money than the
    // street pays, but it's clean, it's quiet, and nobody gets raided for it.
    if (def.sellsLegally) {
      if (!hasLicence(state, def.needsLicence)) {
        b.stalledReason = `No ${LICENCES[def.needsLicence].short} — the counter is shut`;
        continue;
      }
      const pid = def.sellsLegally;
      const stock = b.packs ? b.packs[pid] : 0;
      if (stock > 0.0001) {
        const fxL = effectsFor(b);
        const rate = (def.capacity / 24) * 0.28 * fxL.yieldMult * sizeScale(b) * dt;
        const move = Math.min(stock, rate);
        // Legal price is the street price less what the paperwork costs you.
        // Priced off what the block pays, less what the paperwork costs you.
        // Quality still counts — a licensed shop sells a better unit.
        const quality = b.packQuality ? b.packQuality[pid] : 0.6;
        const unit = streetPrice(d, pid) * legalPriceFactor(b) * (0.75 + quality * 0.5);
        const takings = move * unit;
        b.packs[pid] -= move;
        b.soldToday = (b.soldToday || 0) + move;
        state.cash.clean += takings;
        state.stats.legalRevenue = (state.stats.legalRevenue || 0) + takings;
        state.stats.legalUnitsSold = (state.stats.legalUnitsSold || 0) + move;
        b.earnedToday = (b.earnedToday || 0) + takings;
      }
    }

    // Takings scale with the money on the block, the floorplate and upgrades.
    const wealth = d ? d.wealth : 0.5;
    const swing = LEGIT_WEALTH_SWING * (def.wealthSensitivity || 1);
    const pull = clamp(1 + (wealth - 0.5) * 2 * swing, 0.25, 2.2);
    const fx = effectsFor(b);
    const takings = def.revenuePerDay * pull * fx.revenueMult * sizeScale(b) * (dt / 24);

    state.cash.clean += takings;
    b.earnedToday = (b.earnedToday || 0) + takings;
    state.stats.legalRevenue = (state.stats.legalRevenue || 0) + takings;

    // Then wash what the books can absorb.
    const capacity = def.launderPerDay * fx.launderMult * sizeScale(b) * (dt / 24);
    const amount = Math.min(state.cash.dirty, capacity);
    if (amount <= 0) {
      b.stalledReason = 'Trading legally — no street cash to wash';
      continue;
    }
    state.cash.dirty -= amount;
    state.cash.clean += amount * (1 - def.cut);
    state.stats.laundered += amount;
    b.launderedToday += amount;
  }
}

/** What a one-off fitted to this building or vehicle does. */
export function itemEffectsFor(state, target) {
  const fx = { yieldMult: 1, qualityAdd: 0, costMult: 1, capacityMult: 1, paceMult: 1 };
  for (const it of state.items || []) {
    if (it.equippedTo !== target.id) continue;
    const kind = ITEM_KINDS[it.kind];
    if (!kind) continue;
    // Rarity is the whole point: a one-of-one is worth several commons.
    const power = 1 + (tierById(it.tier).value - 1) * 0.14;
    const e = kind.effect || {};
    if (e.yieldMult) fx.yieldMult *= 1 + (e.yieldMult - 1) * power;
    if (e.qualityAdd) fx.qualityAdd += e.qualityAdd * power;
    if (e.costMult) fx.costMult *= 1 - (1 - e.costMult) * power;
    if (e.capacityMult) fx.capacityMult *= 1 + (e.capacityMult - 1) * power;
    if (e.paceMult) fx.paceMult *= 1 - (1 - e.paceMult) * power;
  }
  return fx;
}

// --- Research ---------------------------------------------------------------

/**
 * Projects advance while a facility runs, and the work throws off the
 * occasional one-off. Both are driven by the same building, because in practice
 * a discovery is a by-product of doing the work.
 */
function stepResearch(state, dt) {
  const labs = (state.buildings || []).filter((b) => b.kind === 'research' && b.active);
  if (!labs.length) return;

  // Several facilities work in parallel; the biggest carries the most weight.
  const power = labs.reduce((n, b) => n + sizeScale(b), 0);
  state.researchActive = state.researchActive || [];
  state.research = state.research || [];

  for (let i = state.researchActive.length - 1; i >= 0; i--) {
    const job = state.researchActive[i];
    const def = projectById(job.id);
    if (!def) { state.researchActive.splice(i, 1); continue; }
    job.hoursDone = (job.hoursDone || 0) + dt * RESEARCH.basePerHour * power;
    if (job.hoursDone >= def.hours) {
      state.researchActive.splice(i, 1);
      state.research.push(def.id);
      logEvent(state, `${def.name} is finished. ${def.result}`, 'good');
    }
  }
}

/** Once a day, see whether the benches turned anything up. */
function rollResearchDiscoveries(state) {
  const labs = (state.buildings || []).filter((b) => b.kind === 'research' && b.active);
  for (const lab of labs) {
    // A facility works whichever field its current project belongs to, and
    // botany by default.
    const job = (state.researchActive || [])[0];
    const field = job && projectById(job.id) ? projectById(job.id).field : 'botany';
    const found = rollDiscovery(state, { field }, sizeScale(lab), rng);
    if (!found) continue;

    const item = {
      id: nextItemId(state),
      kind: found.kind,
      tier: found.tier,
      name: nameFor(found.kind, rng),
      madeAt: state.minutes,
      equippedTo: null,
    };
    state.items = state.items || [];
    state.items.push(item);
    const tier = tierById(item.tier);
    logEvent(state,
      `${lab.name} turned something up: ${item.name} — ${tier.name.toLowerCase()} ${ITEM_KINDS[item.kind].name.toLowerCase()}.`,
      tier.value >= 6 ? 'good' : 'info');
  }
}

function nextItemId(state) {
  state.itemCounter = (state.itemCounter || 0) + 1;
  return `it${state.itemCounter}`;
}

// --- Property market --------------------------------------------------------

/**
 * Block values drift toward what the block deserves. Legitimate business and
 * occupied buildings lift a street; police pressure and rival control sink it.
 * Clean a place up and the property you already hold is worth more.
 */
function stepPropertyMarket(state, dt) {
  const days = dt / 24;
  for (const d of state.districts) {
    // Crime chases what the block is actually like: poverty and weak policing
    // underneath, plus whatever heat and rival pressure sit on top of it.
    const baseline = clamp01(0.62 - d.wealth * 0.45 - d.policing * 0.20);
    const crimeTarget = clamp01(
      baseline
      + (d.heat / 100) * CRIME.fromHeat
      + clamp01(d.rivalControl || 0) * CRIME.fromRivals
      - d.policing * CRIME.policingRelief * 0.5
    );
    const turfFx = turfEffects(d);
    const wasCrime = d.crime == null ? baseline : d.crime;
    d.crime = clamp01(
      (wasCrime + (crimeTarget - wasCrime) * CRIME.driftPerDay * days) - turfFx.crimeRelief * days * 0.5
    );
    const legit = state.buildings.filter(
      (b) => b.districtId === d.id && b.kind === 'front' && b.active
    ).length;
    const rented = (state.lots || []).filter((l) => l.districtId === d.id && l.rented).length;

    const target = 1
      + legit * MARKET_PROPERTY.legitLift
      + rented * MARKET_PROPERTY.rentedMarketLift
      + clamp01(d.rep) * MARKET_PROPERTY.repLift
      - (d.heat / 100) * MARKET_PROPERTY.heatDrag
      - clamp01(d.rivalControl || 0) * MARKET_PROPERTY.rivalDrag
      // Nobody pays top money to live somewhere that gets turned over.
      - d.crime * CRIME.valueDrag
      + turfFx.marketLift;

    const previous = d.marketIndex || 1;
    const drift = (target - previous) * MARKET_PROPERTY.driftPerDay * days;
    const noise = (rng() - 0.5) * 2 * MARKET_PROPERTY.noisePerDay * days;
    d.marketIndex = clamp(previous + drift + noise, MARKET_PROPERTY.min, MARKET_PROPERTY.max);
    // Remembered so the UI can show which way a block is heading.
    d.marketTrend = d.marketIndex - previous;
  }
}

/**
 * What a corporate landlord adds on top. Owning the structure that holds the
 * portfolio is worth more than owning the buildings one at a time.
 */
export function rentBonusFor(state) {
  let best = 0;
  for (const b of state.buildings || []) {
    if (!b.active) continue;
    const def = BUILDINGS[b.type];
    if (def && def.rentBonus) best = Math.max(best, def.rentBonus);
  }
  return best;
}

/** Rent from anything you've let out. Clean money, no heat, no risk. */
function stepRents(state, dt) {
  const days = dt / 24;
  for (const lot of state.lots || []) {
    if (!lot.owned || !lot.rented) continue;
    const d = districtById(state, lot.districtId);
    // A holding company gets better terms on everything you let.
    const daily = rentPerDay(lot, d) * (1 + rentBonusFor(state));
    const amount = daily * days;
    state.cash.clean += amount;
    state.stats.rentCollected = (state.stats.rentCollected || 0) + amount;
    state.stats.legalRevenue = (state.stats.legalRevenue || 0) + amount;
  }
}

// --- Turf -------------------------------------------------------------------

/**
 * Rival grip on each block. Their natural hold pulls control back up; your
 * street reputation pushes it down. Contested ground generates its own heat,
 * because two crews working the same corner is exactly what draws police.
 */
function stepTurf(state, dt) {
  if (!state.crews || !state.crews.length) return;
  const [lo, hi] = RIVALS.contestedBand;

  for (const d of state.districts) {
    if (!d.crewId) continue;

    // Your standing on the block suppresses how much of it they can hold.
    const suppressed = (d.baseControl || 0) * (1 - clamp01(d.rep) * RIVALS.repPressure);
    const current = d.rivalControl || 0;
    const rate = RIVALS.regainPerDay * (dt / 24);

    // Control eases toward the suppressed baseline from either direction.
    d.rivalControl = clamp01(current + (suppressed - current) * rate);

    // A block neither side owns outright is a block police are watching.
    if (d.rivalControl > lo && d.rivalControl < hi && d.rep > 0.05) {
      d.heat = clamp(d.heat + RIVALS.frictionHeatPerDay * (dt / 24), 0, HEAT.max);
    }
  }
}

/** Roll for a crew taxing a delivery made onto their turf. */
function maybeShakedown(state, courier, district, hooks) {
  const control = district.rivalControl || 0;
  if (control < RIVALS.shakedownFloor) return false;

  const crew = (state.crews || []).find((c) => c.id === district.crewId);
  if (!crew) return false;

  const chance = RIVALS.shakedownChanceAtFullControl * control * crew.aggression;
  if (rng() >= chance) return false;

  let taken = 0;
  for (const pid of PRODUCT_IDS) {
    const cut = courier.cargo[pid] * RIVALS.tributeRate;
    courier.cargo[pid] -= cut;
    taken += cut;
  }
  if (taken <= 0.01) return false;

  state.stats.tributePaid = (state.stats.tributePaid || 0) + taken;
  district.heat = clamp(district.heat + 3, 0, HEAT.max);
  logEvent(
    state,
    `${crew.name} taxed a drop in ${district.name} — ${Math.round(taken)} packs gone.`,
    'bad'
  );
  hooks.onIncident?.(district.center, 'shakedown');
  return true;
}

// --- Heat -------------------------------------------------------------------

function stepHeat(state, dt) {
  // Knowing people where you live is worth something.
  const hq = state.hqBuildingId ? buildingById(state, state.hqBuildingId) : null;
  const homeDistrict = hq ? hq.districtId : null;

  for (const d of state.districts) {
    const turf = turfEffects(d);
    const decay = (d.id === homeDistrict ? HEAT.decayPerDay * (1 + HQ_HEAT_RELIEF) : HEAT.decayPerDay)
      * (1 + turf.heatRelief);
    d.heat = clamp(d.heat * (1 - decay * (dt / 24)), 0, HEAT.max);
    d.rep = clamp01(d.rep - MARKET.repDecayPerDay * (dt / 24));
    // Looking after people keeps your standing from sliding away.
    if (turf.repFloor) d.rep = Math.max(d.rep, turf.repFloor);
  }

  for (const b of state.buildings) {
    if (!b.active) continue;
    const def = buildingDef(b);
    const d = districtById(state, b.districtId);
    if (!d) continue;
    // A building's own footprint, amplified by how heavily policed the block is.
    const policeFactor = 0.6 + d.policing * 0.9;
    const lineHeat = def.product === 'iron' ? classOf(b).heatMult : 1;
    d.heat = clamp(
      d.heat + def.heatPerDay * effectsFor(b).heatMult * lineHeat * policeFactor * (dt / 24),
      0, HEAT.max);
  }

  // Attention bleeds outward. Without this you could dump on a hot block
  // forever while your grow sat one hex away and never got touched.
  const byId = new Map(state.districts.map((d) => [d.id, d]));
  const delta = new Map(state.districts.map((d) => [d.id, 0]));
  const share = HEAT.diffusePerDay * (dt / 24);
  for (const d of state.districts) {
    const neighbours = d.neighbourIds || [];
    if (!neighbours.length || d.heat <= 0) continue;
    const moved = d.heat * share;
    delta.set(d.id, delta.get(d.id) - moved);
    const each = moved / neighbours.length;
    for (const nid of neighbours) {
      if (delta.has(nid)) delta.set(nid, delta.get(nid) + each);
    }
  }
  for (const [id, change] of delta) {
    const d = byId.get(id);
    if (d) d.heat = clamp(d.heat + change, 0, HEAT.max);
  }

  reportHeatShifts(state);
}

// There's no heat gauge in the UI, so police pressure has to reach the player
// as news on the radio instead. Only band changes are reported, so the ticker
// stays quiet until something actually shifts.
const HEAT_BANDS = [
  { at: 0, key: 'quiet' },
  { at: 22, key: 'watched', up: (n) => `Patrols are getting thicker around ${n}.` },
  { at: 46, key: 'hot', up: (n) => `${n} is hot — plainclothes on the corners. Ease off or you'll lose a house.` },
  { at: 72, key: 'boiling', up: (n) => `${n} is crawling with police. Anything you keep there is a sitting duck.` },
];

function bandFor(heat) {
  let band = HEAT_BANDS[0];
  for (const b of HEAT_BANDS) if (heat >= b.at) band = b;
  return band;
}

function reportHeatShifts(state) {
  for (const d of state.districts) {
    const band = bandFor(d.heat);
    const previous = d.heatBand || 'quiet';
    if (band.key === previous) continue;

    const rising = HEAT_BANDS.findIndex((b) => b.key === band.key)
      > HEAT_BANDS.findIndex((b) => b.key === previous);

    if (rising && band.up) {
      logEvent(state, band.up(d.name), 'bad');
    } else if (!rising && band.key === 'quiet') {
      logEvent(state, `${d.name} has cooled off. Police have moved on.`, 'good');
    }
    d.heatBand = band.key;
  }
}

function stepEnforcement(state, dt, hooks = {}) {
  for (let i = state.buildings.length - 1; i >= 0; i--) {
    const b = state.buildings[i];
    if (!b.active || b.kind === 'front') continue;
    const d = districtById(state, b.districtId);
    if (!d || d.heat < HEAT.raidHeatFloor) continue;

    const factor = (d.heat - HEAT.raidHeatFloor) / (HEAT.max - HEAT.raidHeatFloor);
    // What you've arranged on the block counts as much as what you've fitted
    // to the building. A bought precinct is quiet, not absent.
    const turf = turfEffects(d);
    const perHour = HEAT.raidChanceAtMaxHeat * clamp01(factor) * (0.5 + d.policing)
      * (1 - effectsFor(b).raidResist)
      * (1 - clamp01(turf.raidResist))
      * (1 - turf.policeSuppression);
    if (rng() >= perHour * dt) continue;

    const lostRaw = totalPacks(b.raw);
    const lostPacks = totalPacks(b.packs);
    for (const pid of PRODUCT_IDS) { b.raw[pid] = 0; b.packs[pid] = 0; }
    state.stats.raids++;
    state.stats.seized += lostPacks;
    d.heat = clamp(d.heat - 18, 0, HEAT.max); // the raid itself burns off pressure

    const condemned = rng() < 0.3;
    if (condemned) {
      state.buildings.splice(i, 1);
      state.routes = state.routes.filter((r) => r.fromId !== b.id && r.toId !== b.id);
      for (const c of state.couriers) {
        // Drop the dead lines from the circuit, keep whatever survives.
        c.routeIds = (c.routeIds || []).filter((id) => routeById(state, id));
        if (!routeById(state, c.routeId)) {
          c.routeIndex = 0;
          c.routeId = c.routeIds[0] || null;
          if (!c.routeId) c.phase = 'idle';
        }
      }
      logEvent(state, `RAID — ${b.name} in ${d.name} was seized and shut down.`, 'bad');
    } else {
      logEvent(
        state,
        `RAID — ${b.name} in ${d.name} hit. Lost ${Math.round(lostRaw)} raw and ${Math.round(lostPacks)} packs.`,
        'bad'
      );
    }
  }
}

/**
 * A price reading for the whole city, weighted by how much each block actually
 * absorbs, so it reflects what you could really sell at rather than an average
 * over blocks nobody buys from. Exported so the UI compares like with like.
 */
export function cityPrice(state, pid) {
  let weighted = 0;
  let weight = 0;
  let best = 0;
  for (const d of state.districts) {
    const w = d.demandPerHour[pid] || 0;
    if (w <= 0) continue;
    const price = streetPrice(d, pid);
    weighted += price * w;
    weight += w;
    if (price > best) best = price;
  }
  return { avg: weight ? weighted / weight : 0, best };
}

export const PRICE_SAMPLE_HOURS = 6;

/** Sample on a fixed cadence rather than once a day, so a chart fills in fast. */
function maybeRecordPrices(state) {
  const slot = Math.floor(state.minutes / 60 / PRICE_SAMPLE_HOURS);
  if (state.lastPriceSlot === slot) return;
  state.lastPriceSlot = slot;
  recordPrices(state);
}

export function recordPrices(state) {
  state.priceHistory = state.priceHistory || {};
  for (const pid of PRODUCT_IDS) {
    const { avg, best } = cityPrice(state, pid);
    const series = state.priceHistory[pid] || (state.priceHistory[pid] = []);
    series.push({
      day: Math.floor(state.minutes / 1440) + 1,
      hour: Math.floor((state.minutes % 1440) / 60),
      avg,
      best,
    });
    if (series.length > 120) series.shift();
  }
}

// --- Daily settlement -------------------------------------------------------

/**
 * Applications come back, and licences lapse if you don't renew them. Both
 * happen on the day boundary, because that's the pace paperwork moves at.
 */
function stepLicences(state) {
  state.licences = state.licences || {};
  for (const id of Object.keys(state.licences)) {
    const rec = state.licences[id];
    const def = LICENCES[id];
    if (!def || !rec) continue;

    if (rec.status === 'pending') {
      rec.daysLeft -= 1;
      if (rec.daysLeft <= 0) {
        rec.status = 'active';
        rec.daysLeft = 0;
        rec.renewsInDays = 365;
        logEvent(state, `${def.name} came through. You're licensed.`, 'good');
      }
      continue;
    }

    if (rec.status === 'active') {
      rec.renewsInDays = (rec.renewsInDays ?? 365) - 1;
      if (rec.renewsInDays === 30) {
        logEvent(state, `${def.name} is up for renewal in a month — $${def.renewalPerYear.toLocaleString()}.`, 'info');
      }
      if (rec.renewsInDays <= 0) {
        rec.status = 'lapsed';
        logEvent(state, `${def.name} has lapsed. Anything that needed it has stopped.`, 'bad');
      }
    }
  }
}

function settleDay(state) {
  state.fixerUsedToday = 0;
  stepPlayers(state, rng);
  // People find out about each other by working the same ground.
  for (const met of stepDiscovery(state, 1, rng)) {
    logEvent(state,
      met.how === 'ran into'
        ? `You've run into ${met.player.name} — they work the same blocks you do. ${met.player.styleLabel[0].toUpperCase()}${met.player.styleLabel.slice(1)}.`
        : `Word going round about ${met.player.name}. Somebody else building the same thing.`,
      'info');
  }
  // A week's snapshot, so the board can show which way people are going.
  if (clockOf(state.minutes).day % 7 === 0) snapshotPlayers(state);
  checkUnlocks(state);
  stepLicences(state);
  rollResearchDiscoveries(state);

  let upkeep = 0;
  for (const b of state.buildings) {
    b.launderedToday = 0;
    b.earnedToday = 0;
    b.soldToday = 0;
    if (!b.active) continue;
    upkeep += upkeepFor(b);
  }
  let wages = 0;
  for (const d of state.drivers || []) wages += d.wagePerDay;
  for (const v of state.couriers) wages += COURIERS[v.type].upkeepPerDay;

  // Standing arrangements on blocks you hold are a daily bill like any other:
  // stop paying and the lookouts go home.
  const turf = turfUpkeep(state);
  const total = Math.round(upkeep + wages + turf);
  const funded = paySoft(state, total);

  // Being short is a warning, never a lock: each site already stalls on its own
  // when it can't buy supplies, and any stock still in the pipe keeps selling.
  // That's what digs a player back out, so nothing here halts production.
  if (!funded) {
    state.unpaid = true;
    logEvent(
      state,
      `Short on the $${total.toLocaleString()} for upkeep and payroll. Sites will stall until product moves — sell a property if you're stuck.`,
      'bad'
    );
  } else {
    state.unpaid = false;
    logEvent(state, `Day settled — $${total.toLocaleString()} out for upkeep and payroll.`, 'info');
  }
}
