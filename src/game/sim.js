// The simulation tick. Everything advances in game-hours so tuning numbers in
// constants.js read as "per hour" / "per day" and mean exactly that.

import {
  BUILDINGS,
  COURIERS,
  HEAT,
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
import { effectsFor, upkeepFor } from './upgrades.js';
import { rentPerDay } from './lots.js';
import {
  buildingById,
  districtById,
  logEvent,
  routeById,
} from './state.js';

const rng = makeRng(Date.now() & 0xffffffff);

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

export function stepSim(state, dtHours, hooks = {}) {
  if (dtHours <= 0) return;

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

    b.cycleProgress += dt / def.cycleHours;
    if (b.cycleProgress >= 1) {
      b.cycleProgress = 0;
      b.cycleStarted = false;
      const yieldAmount = def.slots * def.rawPerSlot * fx.yieldMult * sizeScale(b);
      const quality = clamp01(def.baseQuality + fx.qualityAdd);
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
      const cost = take * def.costPerRaw;
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

function stepCouriers(state, dt, hooks) {
  for (const c of state.couriers) {
    const def = COURIERS[c.type];
    const route = routeById(state, c.routeId);

    if (!route || !route.active) {
      c.phase = 'idle';
      const home = buildingById(state, c.homeBuildingId);
      c.position = home ? home.latlng : c.position;
      continue;
    }
    if (!route.points) continue; // route still being fetched

    const source = buildingById(state, route.fromId);
    if (!source) { c.phase = 'idle'; continue; }

    const legHours = route.km / Math.max(1, def.speedKph);

    switch (c.phase) {
      case 'idle':
      case 'loading': {
        c.position = source.latlng;
        const loaded = loadCargo(state, c, def, route, source);
        if (loaded > 0) {
          c.phase = 'outbound';
          c.progress = 0;
        }
        break;
      }
      case 'outbound': {
        c.progress += legHours > 0 ? dt / legHours : 1;
        c.position = pointAlongPath(route.points, clamp01(c.progress));
        maybeGetStopped(state, c, def, dt, hooks);
        if (c.progress >= 1) {
          unloadCargo(state, c, route, hooks);
          c.phase = 'returning';
          c.progress = 0;
          c.tripsCompleted++;
        }
        break;
      }
      case 'returning': {
        c.progress += legHours > 0 ? dt / legHours : 1;
        c.position = pointAlongPath(route.points, 1 - clamp01(c.progress));
        if (c.progress >= 1) {
          c.phase = 'loading';
          c.progress = 0;
        }
        break;
      }
      default:
        c.phase = 'idle';
    }
  }
}

function loadCargo(state, c, def, route, source) {
  const pool = route.cargo === 'raw' ? source.raw : source.packs;
  const qualityPool = route.cargo === 'raw' ? source.rawQuality : source.packQuality;
  const wanted = route.product === 'any' ? PRODUCT_IDS : [route.product];

  let space = def.capacity;
  let loaded = 0;
  c.cargoKind = route.cargo;

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

function unloadCargo(state, c, route, hooks = {}) {
  const carried = totalPacks(c.cargo);
  if (carried <= 0) return;

  if (route.toType === 'district') {
    const d = districtById(state, route.toId);
    if (!d) return;
    // Whoever holds the block gets their cut before the customers see any of it.
    maybeShakedown(state, c, d, hooks);
    for (const pid of PRODUCT_IDS) {
      const amount = c.cargo[pid];
      if (amount <= 0) continue;
      d.supplyQuality[pid] = blendQuality(d.supply[pid], d.supplyQuality[pid], amount, c.cargoQuality[pid]);
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
  const perHour = HEAT.stopChanceAtMaxHeat * clamp01(heatFactor) * (1 - COURIERS[c.type].stealth);
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

      d.supplyQuality[pid] = blendQuality(d.supply[pid], d.supplyQuality[pid], move, b.packQuality[pid]);
      d.supply[pid] += move;
      b.packs[pid] -= move;
      b.soldFromHere = (b.soldFromHere || 0) + move;
      budget -= move;
    }
    d.discovered = true;
  }
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

// --- Property market --------------------------------------------------------

/**
 * Block values drift toward what the block deserves. Legitimate business and
 * occupied buildings lift a street; police pressure and rival control sink it.
 * Clean a place up and the property you already hold is worth more.
 */
function stepPropertyMarket(state, dt) {
  const days = dt / 24;
  for (const d of state.districts) {
    const legit = state.buildings.filter(
      (b) => b.districtId === d.id && b.kind === 'front' && b.active
    ).length;
    const rented = (state.lots || []).filter((l) => l.districtId === d.id && l.rented).length;

    const target = 1
      + legit * MARKET_PROPERTY.legitLift
      + rented * MARKET_PROPERTY.rentedMarketLift
      + clamp01(d.rep) * MARKET_PROPERTY.repLift
      - (d.heat / 100) * MARKET_PROPERTY.heatDrag
      - clamp01(d.rivalControl || 0) * MARKET_PROPERTY.rivalDrag;

    const previous = d.marketIndex || 1;
    const drift = (target - previous) * MARKET_PROPERTY.driftPerDay * days;
    const noise = (rng() - 0.5) * 2 * MARKET_PROPERTY.noisePerDay * days;
    d.marketIndex = clamp(previous + drift + noise, MARKET_PROPERTY.min, MARKET_PROPERTY.max);
    // Remembered so the UI can show which way a block is heading.
    d.marketTrend = d.marketIndex - previous;
  }
}

/** Rent from anything you've let out. Clean money, no heat, no risk. */
function stepRents(state, dt) {
  const days = dt / 24;
  for (const lot of state.lots || []) {
    if (!lot.owned || !lot.rented) continue;
    const d = districtById(state, lot.districtId);
    const daily = rentPerDay(lot, d);
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
  for (const d of state.districts) {
    d.heat = clamp(d.heat * (1 - HEAT.decayPerDay * (dt / 24)), 0, HEAT.max);
    d.rep = clamp01(d.rep - MARKET.repDecayPerDay * (dt / 24));
  }

  for (const b of state.buildings) {
    if (!b.active) continue;
    const def = buildingDef(b);
    const d = districtById(state, b.districtId);
    if (!d) continue;
    // A building's own footprint, amplified by how heavily policed the block is.
    const policeFactor = 0.6 + d.policing * 0.9;
    d.heat = clamp(d.heat + def.heatPerDay * effectsFor(b).heatMult * policeFactor * (dt / 24), 0, HEAT.max);
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
    const perHour = HEAT.raidChanceAtMaxHeat * clamp01(factor) * (0.5 + d.policing)
      * (1 - effectsFor(b).raidResist);
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
        if (!routeById(state, c.routeId)) { c.routeId = null; c.phase = 'idle'; }
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
 * One price sample per game-day, city-wide, weighted by how much each block
 * actually absorbs — so the chart reflects what you could really sell at, not
 * an average over blocks nobody buys from.
 */
const PRICE_SAMPLE_HOURS = 6;

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
    const series = state.priceHistory[pid] || (state.priceHistory[pid] = []);
    series.push({
      day: Math.floor(state.minutes / 1440) + 1,
      hour: Math.floor((state.minutes % 1440) / 60),
      avg: weight ? weighted / weight : 0,
      best,
    });
    if (series.length > 60) series.shift();
  }
}

// --- Daily settlement -------------------------------------------------------

function settleDay(state) {
  state.fixerUsedToday = 0;
  checkUnlocks(state);

  let upkeep = 0;
  for (const b of state.buildings) {
    b.launderedToday = 0;
    b.earnedToday = 0;
    if (!b.active) continue;
    upkeep += upkeepFor(b);
  }
  let wages = 0;
  for (const c of state.couriers) wages += COURIERS[c.type].wagePerDay;

  const total = Math.round(upkeep + wages);
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
