// Player actions. Each one validates, charges, mutates state and returns
// { ok, error } so the UI can report a reason without knowing the rules.

import { BUILDINGS, BUILDING_IDS, COURIERS, FIXER, RIVALS, MARKET_PROPERTY } from './constants.js';
import {
  lotById, areaScale, areaCapacityScale, lotResale, marketValue, rentPerDay, lotPnL,
} from './lots.js';
import { fetchRoute } from './geo.js';
import { clamp01 } from './rng.js';
import { unlockStatus } from './progression.js';
import { upgradeById, availableUpgrades, effectsFor } from './upgrades.js';
import {
  buildingById,
  canAfford,
  createBuilding,
  createCourier,
  createRoute,
  courierById,
  districtById,
  logEvent,
  routeById,
  spendClean,
} from './state.js';

/** Buy a real building. You own the premises; what runs inside is a separate call. */
export function buyLot(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (lot.owned) return { ok: false, error: 'You already own that one.' };

  const district = districtById(state, lot.districtId);
  const price = marketValue(lot, district);
  if (!canAfford(state, price)) {
    return { ok: false, error: `Need $${price.toLocaleString()} clean for that property.` };
  }

  spendClean(state, price);
  lot.owned = true;
  // What you actually paid, so profit or loss on the way out is real.
  lot.paidPrice = price;
  if (district) district.discovered = true;
  logEvent(
    state,
    `Bought ${lot.name} in ${district ? district.name : 'the city'} for $${price.toLocaleString()}.`,
    'good'
  );
  return { ok: true, lot, price };
}

/**
 * Sell a property you own but aren't running anything in. You get today's
 * market value less the agent's cut, which may be more or less than you paid.
 */
export function sellLot(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!lot.owned) return { ok: false, error: 'You don’t own that.' };
  if (lot.buildingId) {
    return { ok: false, error: 'Shut the operation down first — sell it from the building.' };
  }

  const district = districtById(state, lot.districtId);
  const proceeds = lotResale(lot, district);
  const pnl = lotPnL(lot, district);

  state.cash.clean += proceeds;
  state.stats.propertyPnL = (state.stats.propertyPnL || 0) + (pnl ? pnl.delta : 0);
  lot.owned = false;
  lot.rented = false;
  lot.paidPrice = null;

  const verdict = pnl
    ? (pnl.delta >= 0
      ? `up $${Math.abs(pnl.delta).toLocaleString()} on what you paid`
      : `down $${Math.abs(pnl.delta).toLocaleString()} on what you paid`)
    : '';
  logEvent(state, `Sold ${lot.name} for $${proceeds.toLocaleString()} — ${verdict}.`,
    pnl && pnl.delta >= 0 ? 'good' : 'bad');
  return { ok: true, proceeds, pnl };
}

/** Put a tenant in. Quiet, legal, and it pays every day without you touching it. */
export function rentOut(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!lot.owned) return { ok: false, error: 'Buy it first.' };
  if (lot.buildingId) return { ok: false, error: 'Something is already running there.' };
  if (lot.rented) return { ok: false, error: 'Already let out.' };

  lot.rented = true;
  lot.tenantSince = state.minutes;
  const d = districtById(state, lot.districtId);
  logEvent(state, `${lot.name} let out at $${rentPerDay(lot, d).toLocaleString()}/day.`, 'good');
  return { ok: true, rent: rentPerDay(lot, d) };
}

/** End a tenancy so the building is yours to use again. Costs a settlement. */
export function endTenancy(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!lot.rented) return { ok: false, error: 'Nobody is renting it.' };

  const d = districtById(state, lot.districtId);
  const fee = Math.round(rentPerDay(lot, d) * 30 * MARKET_PROPERTY.tenancyBuyout);
  if (!canAfford(state, fee)) {
    return { ok: false, error: `Settling with the tenant costs $${fee.toLocaleString()} clean.` };
  }
  spendClean(state, fee);
  lot.rented = false;
  logEvent(state, `Tenant out of ${lot.name}. Settlement cost $${fee.toLocaleString()}.`, 'info');
  return { ok: true, fee };
}

/** What can legally go into a building you own, and why not. */
export function operationOptions(lot, state = null) {
  return BUILDING_IDS.map((id) => {
    const def = BUILDINGS[id];
    const fits = lot.areaM2 >= def.minAreaM2;
    const gate = state ? unlockStatus(state, id) : null;
    const locked = !!(gate && gate.locked);
    return {
      id,
      def,
      fits,
      locked,
      gate,
      reason: locked
        ? gate.reason
        : fits ? null : `Needs ${def.minAreaM2} m² — this is ${Math.round(lot.areaM2)} m²`,
      scale: areaScale(lot, def.referenceAreaM2),
      capScale: areaCapacityScale(lot, def.referenceAreaM2),
    };
  });
}

/** Fit out a building you own so it starts doing something. */
export function developLot(state, lotId, typeId) {
  const lot = lotById(state, lotId);
  const def = BUILDINGS[typeId];
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!def) return { ok: false, error: 'Unknown operation.' };
  if (!lot.owned) return { ok: false, error: 'Buy the property first.' };
  if (lot.buildingId) return { ok: false, error: 'Something is already running there.' };
  const gate = unlockStatus(state, typeId);
  if (gate && gate.locked) return { ok: false, error: gate.reason };
  if (lot.areaM2 < def.minAreaM2) {
    return {
      ok: false,
      error: `${def.name} needs ${def.minAreaM2} m². ${lot.name} is ${Math.round(lot.areaM2)} m².`,
    };
  }
  if (!canAfford(state, def.cost)) {
    return { ok: false, error: `Fitting out a ${def.name} costs $${def.cost.toLocaleString()} clean.` };
  }

  spendClean(state, def.cost);
  const b = createBuilding(typeId, { lat: lot.center.lat, lng: lot.center.lng }, lot.districtId);
  b.lotId = lot.id;
  b.areaM2 = lot.areaM2;
  b.scale = areaScale(lot, def.referenceAreaM2);
  b.capScale = areaCapacityScale(lot, def.referenceAreaM2);
  b.name = `${def.name} · ${lot.name}`;
  b.builtAtMinute = state.minutes;
  state.buildings.push(b);
  lot.buildingId = b.id;

  const district = districtById(state, lot.districtId);
  logEvent(
    state,
    `${def.name} running out of ${lot.name}${district ? `, ${district.name}` : ''}.`,
    'good'
  );
  return { ok: true, building: b, cost: def.cost };
}

export function upgradeBuilding(state, buildingId, upgradeId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'Property is gone.' };

  const u = upgradeById(b.type, upgradeId);
  if (!u) return { ok: false, error: 'No such upgrade.' };
  if ((b.upgrades || []).includes(upgradeId)) {
    return { ok: false, error: 'Already installed.' };
  }
  if (!canAfford(state, u.cost)) {
    return { ok: false, error: `${u.name} costs $${u.cost.toLocaleString()} clean.` };
  }

  spendClean(state, u.cost);
  b.upgrades = (b.upgrades || []).concat(upgradeId);
  // Level is just how built-out the place is, for the marker badge.
  b.level = 1 + b.upgrades.length;
  logEvent(state, `${u.name} installed at ${b.name}.`, 'good');
  return { ok: true, upgrade: u, cost: u.cost };
}

export { availableUpgrades, effectsFor };

export function toggleBuilding(state, buildingId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'Property is gone.' };
  b.active = !b.active;
  return { ok: true, active: b.active };
}

export function sellBuilding(state, buildingId) {
  const idx = state.buildings.findIndex((b) => b.id === buildingId);
  if (idx < 0) return { ok: false, error: 'Property is gone.' };
  const b = state.buildings[idx];
  const lot = b.lotId ? lotById(state, b.lotId) : null;
  const district = districtById(state, b.districtId);
  // Today's market value for the property, plus scrap on the equipment.
  const propertyValue = lot ? lotResale(lot, district) : 0;
  const scrap = Math.round(BUILDINGS[b.type].cost * MARKET_PROPERTY.fitOutScrap);
  const pnl = lot ? lotPnL(lot, district) : null;
  const refund = propertyValue + scrap;
  if (lot) {
    state.stats.propertyPnL = (state.stats.propertyPnL || 0) + (pnl ? pnl.delta : 0);
    lot.owned = false;
    lot.rented = false;
    lot.paidPrice = null;
    lot.buildingId = null;
  }

  state.buildings.splice(idx, 1);
  state.routes = state.routes.filter((r) => r.fromId !== b.id && r.toId !== b.id);
  for (const c of state.couriers) {
    if (c.routeId && !routeById(state, c.routeId)) { c.routeId = null; c.phase = 'idle'; }
    if (c.homeBuildingId === b.id) c.homeBuildingId = state.buildings[0]?.id || null;
  }
  state.cash.clean += refund;
  logEvent(state, `Sold ${b.name} for $${refund.toLocaleString()} clean.`, 'info');
  return { ok: true, refund };
}

export function hireCourier(state, typeId) {
  const def = COURIERS[typeId];
  if (!def) return { ok: false, error: 'Unknown vehicle.' };
  if (!canAfford(state, def.cost)) {
    return { ok: false, error: `Need $${def.cost.toLocaleString()} clean.` };
  }
  spendClean(state, def.cost);
  const home = state.buildings[0]?.id || null;
  const c = createCourier(typeId, home);
  c.name = `${def.name} #${state.couriers.filter((x) => x.type === typeId).length + 1}`;
  c.position = home ? buildingById(state, home).latlng : { ...state.origin };
  state.couriers.push(c);
  logEvent(state, `Hired a ${def.name} for $${def.cost.toLocaleString()}.`, 'good');
  return { ok: true, courier: c };
}

export function fireCourier(state, courierId) {
  const idx = state.couriers.findIndex((c) => c.id === courierId);
  if (idx < 0) return { ok: false, error: 'Already gone.' };
  const c = state.couriers[idx];
  state.couriers.splice(idx, 1);
  logEvent(state, `${c.name} is off the payroll.`, 'info');
  return { ok: true };
}

/**
 * Create a standing route. The road geometry is fetched in the background —
 * the route is usable the moment it resolves, and falls back to a padded
 * straight line if the router can't be reached.
 */
export async function addRoute(state, spec, onReady) {
  const from = buildingById(state, spec.fromId);
  if (!from) return { ok: false, error: 'Pick a pickup point.' };

  const toLatLng =
    spec.toType === 'district'
      ? districtById(state, spec.toId)?.center
      : buildingById(state, spec.toId)?.latlng;
  if (!toLatLng) return { ok: false, error: 'Pick a drop-off.' };

  const duplicate = state.routes.find(
    (r) => r.fromId === spec.fromId && r.toId === spec.toId && r.cargo === spec.cargo && r.product === spec.product
  );
  if (duplicate) return { ok: false, error: 'You already run that exact route.' };

  const route = createRoute(spec);
  state.routes.push(route);

  const result = await fetchRoute(from.latlng, toLatLng);
  route.points = result.points;
  route.km = result.km;
  route.realRoad = result.real;
  onReady?.(route);
  return { ok: true, route };
}

export function removeRoute(state, routeId) {
  const idx = state.routes.findIndex((r) => r.id === routeId);
  if (idx < 0) return { ok: false, error: 'Route is gone.' };
  const [route] = state.routes.splice(idx, 1);
  for (const c of state.couriers) {
    if (c.routeId === route.id) { c.routeId = null; c.phase = 'idle'; c.progress = 0; }
  }
  return { ok: true };
}

export function assignCourier(state, courierId, routeId) {
  const c = courierById(state, courierId);
  if (!c) return { ok: false, error: 'Courier is gone.' };
  const route = routeId ? routeById(state, routeId) : null;
  if (routeId && !route) return { ok: false, error: 'Route is gone.' };

  c.routeId = route ? route.id : null;
  c.phase = route ? 'loading' : 'idle';
  c.progress = 0;
  if (route) {
    const from = buildingById(state, route.fromId);
    if (from) { c.homeBuildingId = from.id; c.position = from.latlng; }
  }
  return { ok: true };
}

/** What it costs to run a crew off a block — dearer the harder they hold it. */
export function muscleCost(district) {
  const control = district.rivalControl || 0;
  return Math.round(RIVALS.muscleBaseCost + RIVALS.muscleCostPerControl * control * control);
}

/**
 * Push a rival off a block by force. Odds turn on how hard they hold it and
 * how well the neighbourhood already knows you. Win and their grip drops for
 * good; lose and you're out most of the money with the block hotter than
 * before. Either way the police notice.
 */
export function muscleIn(state, districtId) {
  const d = districtById(state, districtId);
  if (!d) return { ok: false, error: 'No such block.' };
  if (!d.crewId || (d.rivalControl || 0) < 0.05) {
    return { ok: false, error: 'Nobody left to push out here.' };
  }

  const crew = (state.crews || []).find((c) => c.id === d.crewId);
  if (!crew) return { ok: false, error: 'Nobody left to push out here.' };

  const cost = muscleCost(d);
  if (!canAfford(state, cost)) {
    return { ok: false, error: `Need $${cost.toLocaleString()} clean to move on them.` };
  }

  // Your standing on the block is what tips a fight your way.
  const odds = clamp01(0.28 + d.rep * 0.5 - (d.rivalControl - 0.3) * 0.45);
  const won = Math.random() < odds;

  d.heat = Math.min(100, d.heat + RIVALS.muscleHeat);

  if (!won) {
    spendClean(state, Math.round(cost * RIVALS.muscleBackfireCost));
    d.rivalControl = clamp01(d.rivalControl + 0.06);
    logEvent(state, `Move on ${crew.name} in ${d.name} went bad. They held the block.`, 'bad');
    return { ok: true, won: false, cost: Math.round(cost * RIVALS.muscleBackfireCost) };
  }

  spendClean(state, cost);
  const [lo, hi] = RIVALS.muscleKnockdown;
  const knock = lo + Math.random() * (hi - lo);
  d.rivalControl = clamp01(d.rivalControl - knock);
  // Permanent: their natural hold on this block is broken, not just suppressed.
  d.baseControl = clamp01((d.baseControl || 0) - knock * 0.75);
  crew.pushedBack = (crew.pushedBack || 0) + knock;
  state.stats.blocksTaken = (state.stats.blocksTaken || 0) + 1;
  logEvent(state, `Pushed ${crew.name} out of ${d.name}. The block is opening up.`, 'good');
  return { ok: true, won: true, cost, knock };
}

/** How much the fixer will still take today. */
export function fixerRemaining(state) {
  return Math.max(0, FIXER.dailyLimit - (state.fixerUsedToday || 0));
}

/**
 * Wash street cash without owning a Front. He takes a brutal cut and only
 * handles so much a day, but he keeps a run from dead-ending.
 */
export function washWithFixer(state, requested) {
  const room = fixerRemaining(state);
  if (room <= 0) return { ok: false, error: 'The fixer’s done for today. Come back tomorrow.' };
  if (state.cash.dirty <= 0) return { ok: false, error: 'No street cash to wash.' };

  const amount = Math.min(requested || room, room, state.cash.dirty);
  if (amount <= 0) return { ok: false, error: 'Nothing to wash.' };

  const clean = amount * (1 - FIXER.cut);
  state.cash.dirty -= amount;
  state.cash.clean += clean;
  state.fixerUsedToday = (state.fixerUsedToday || 0) + amount;
  state.stats.laundered += amount;
  logEvent(
    state,
    `Fixer washed $${Math.round(amount).toLocaleString()} — you kept $${Math.round(clean).toLocaleString()}.`,
    'info'
  );
  return { ok: true, amount, clean };
}

/** Change a route in place rather than closing it and building a new one. */
export function editRoute(state, routeId, changes, refetch) {
  const route = routeById(state, routeId);
  if (!route) return { ok: false, error: 'Route is gone.' };

  const nextTo = changes.toKey ? changes.toKey.split(':') : null;
  const movedEnd = nextTo && (nextTo[0] !== route.toType || nextTo[1] !== route.toId);
  const movedStart = changes.fromId && changes.fromId !== route.fromId;

  if (changes.cargo) route.cargo = changes.cargo;
  if (changes.product) route.product = changes.product;
  if (movedStart) route.fromId = changes.fromId;
  if (movedEnd) { route.toType = nextTo[0]; route.toId = nextTo[1]; }

  if (movedStart || movedEnd) {
    // Geometry has to be refetched, and anyone on it starts the new run fresh.
    route.points = null;
    route.km = null;
    for (const c of state.couriers) {
      if (c.routeId === route.id) { c.phase = 'loading'; c.progress = 0; c.dwellLeft = 0; }
    }
    refetch?.(route);
  }
  return { ok: true, route, rerouted: movedStart || movedEnd };
}

// --- Admin -----------------------------------------------------------------
// Testing conveniences. Deliberately separate from the game's own rules so
// nothing here can be reached by ordinary play.

export function adminGrant(state, cleanAmount = 100000, dirtyAmount = 0) {
  state.cash.clean += cleanAmount;
  state.cash.dirty += dirtyAmount;
  logEvent(state, `[admin] granted $${cleanAmount.toLocaleString()} clean.`, 'info');
  return { ok: true };
}

export function adminBuyBlock(state, districtId) {
  const d = districtById(state, districtId);
  if (!d) return { ok: false, error: 'No such block.' };
  d.rivalControl = 0;
  d.baseControl = 0;
  d.heat = 0;
  d.rep = 1;
  logEvent(state, `[admin] took ${d.name} outright.`, 'info');
  return { ok: true };
}

export function adminCoolOff(state) {
  for (const d of state.districts) d.heat = 0;
  logEvent(state, '[admin] all heat cleared.', 'info');
  return { ok: true };
}

export function adminUnlockAll(state) {
  state.unlocked = BUILDING_IDS.slice();
  state.adminUnlockAll = true;
  logEvent(state, '[admin] every operation unlocked.', 'info');
  return { ok: true };
}

/** Describe a route in the words the player thinks in. */
export function routeLabel(state, route) {
  const from = buildingById(state, route.fromId);
  const to =
    route.toType === 'district'
      ? districtById(state, route.toId)
      : buildingById(state, route.toId);
  const cargo = route.cargo === 'raw' ? 'raw' : 'packs';
  const product = route.product === 'any' ? 'all' : route.product;
  return {
    from: from ? from.name : '—',
    to: to ? to.name : '—',
    cargo,
    product,
    km: route.km,
  };
}
