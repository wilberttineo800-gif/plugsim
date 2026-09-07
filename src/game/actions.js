// Player actions. Each one validates, charges, mutates state and returns
// { ok, error } so the UI can report a reason without knowing the rules.

import { BUILDINGS, BUILDING_IDS, COURIERS, FIXER, RIVALS } from './constants.js';
import { lotById, areaScale, areaCapacityScale, lotResale } from './lots.js';
import { fetchRoute } from './geo.js';
import { clamp01 } from './rng.js';
import { unlockStatus } from './progression.js';
import { upgradeCost } from './sim.js';
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
  if (!canAfford(state, lot.price)) {
    return { ok: false, error: `Need $${lot.price.toLocaleString()} clean for that property.` };
  }

  spendClean(state, lot.price);
  lot.owned = true;
  const district = districtById(state, lot.districtId);
  if (district) district.discovered = true;
  logEvent(
    state,
    `Bought ${lot.name} in ${district ? district.name : 'the city'} for $${lot.price.toLocaleString()}.`,
    'good'
  );
  return { ok: true, lot };
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

export function upgradeBuilding(state, buildingId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'Property is gone.' };
  if (b.level >= 5) return { ok: false, error: 'Already fully built out.' };

  const cost = upgradeCost(b);
  if (!canAfford(state, cost)) {
    return { ok: false, error: `Need $${cost.toLocaleString()} clean to upgrade.` };
  }
  spendClean(state, cost);
  b.level++;
  logEvent(state, `${b.name} upgraded to level ${b.level}.`, 'good');
  return { ok: true, cost };
}

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
  // You get the property back plus scrap value on the fit-out.
  const refund = Math.round(
    (lot ? lotResale(lot) : 0) + BUILDINGS[b.type].cost * 0.4 * (1 + (b.level - 1) * 0.4)
  );
  if (lot) { lot.owned = false; lot.buildingId = null; }

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
