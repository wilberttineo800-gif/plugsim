// The single mutable game state, plus save/load. Everything the simulation
// touches lives on this object so a save is just a JSON snapshot.

import {
  BUILDINGS,
  COURIERS,
  PRODUCT_IDS,
  START_CASH_CLEAN,
  START_CASH_DIRTY,
} from './constants.js';

const SAVE_KEY = 'plugsim.save.v1';
export const SAVE_VERSION = 3;

let idCounter = 1;
export function nextId(prefix) {
  return `${prefix}${idCounter++}`;
}

function emptyProductMap(value = 0) {
  return Object.fromEntries(PRODUCT_IDS.map((p) => [p, value]));
}

export function createState({ origin, cityName, districts, crews = [], lots = [] }) {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    origin,
    cityName,
    districts,
    crews,
    lots,
    buildings: [],
    couriers: [],
    routes: [],
    // Total elapsed game minutes since day 1, 06:00.
    minutes: 6 * 60,
    speedIndex: 1,
    cash: { clean: START_CASH_CLEAN, dirty: START_CASH_DIRTY },
    stats: {
      packsSold: emptyProductMap(),
      grossRevenue: 0,
      laundered: 0,
      seized: 0,
      raids: 0,
      stops: 0,
      spent: 0,
      tributePaid: 0,
      blocksTaken: 0,
    },
    log: [],
    selection: null,
  };
}

export function createBuilding(typeId, latlng, districtId) {
  const def = BUILDINGS[typeId];
  return {
    id: nextId('b'),
    type: typeId,
    kind: def.kind,
    name: def.name,
    latlng,
    districtId,
    level: 1,
    active: true,
    // Unified inventory — production fills `raw`, labs convert it into `packs`.
    raw: emptyProductMap(),
    packs: emptyProductMap(),
    rawQuality: emptyProductMap(0.5),
    packQuality: emptyProductMap(0.5),
    // Production sites
    cycleProgress: 0,
    cycleStarted: false,
    // Real building it occupies
    lotId: null,
    areaM2: 0,
    scale: 1,
    // Fronts
    launderedToday: 0,
    stalledReason: null,
    builtAtMinute: 0,
  };
}

export function createCourier(typeId, homeBuildingId) {
  const def = COURIERS[typeId];
  return {
    id: nextId('c'),
    type: typeId,
    name: `${def.name} ${idCounter}`,
    routeId: null,
    phase: 'idle', // idle | loading | outbound | unloading | returning
    progress: 0, // 0..1 along the current leg
    position: null,
    cargo: emptyProductMap(),
    cargoKind: 'packs',
    cargoQuality: emptyProductMap(0.5),
    homeBuildingId,
    tripsCompleted: 0,
    lastEvent: null,
  };
}

export function createRoute({ fromId, toType, toId, cargo, product }) {
  return {
    id: nextId('r'),
    fromId,
    toType, // 'building' | 'district'
    toId,
    cargo, // 'raw' | 'packs'
    product, // product id or 'any'
    points: null, // filled in async by the router
    km: null,
    realRoad: false,
    active: true,
  };
}

// --- Lookups ----------------------------------------------------------------

export function buildingById(state, id) {
  return state.buildings.find((b) => b.id === id) || null;
}

export function routeById(state, id) {
  return state.routes.find((r) => r.id === id) || null;
}

export function courierById(state, id) {
  return state.couriers.find((c) => c.id === id) || null;
}

export function districtById(state, id) {
  return state.districts.find((d) => d.id === id) || null;
}

export function routeEndpoint(state, route) {
  if (!route) return null;
  return route.toType === 'district'
    ? districtById(state, route.toId)?.center || null
    : buildingById(state, route.toId)?.latlng || null;
}

export function couriersOnRoute(state, routeId) {
  return state.couriers.filter((c) => c.routeId === routeId);
}

// --- Money ------------------------------------------------------------------

export function canAfford(state, amount) {
  return state.cash.clean >= amount;
}

export function spendClean(state, amount) {
  state.cash.clean -= amount;
  state.stats.spent += amount;
}

// --- Event log --------------------------------------------------------------

export function logEvent(state, text, tone = 'info') {
  state.log.unshift({ text, tone, minute: state.minutes, at: Date.now() });
  if (state.log.length > 120) state.log.length = 120;
}

// --- Time -------------------------------------------------------------------

export function clockOf(minutes) {
  const day = Math.floor(minutes / 1440) + 1;
  const mins = Math.floor(minutes % 1440);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(Math.floor(mins % 60)).padStart(2, '0');
  return { day, hh, mm, label: `${hh}:${mm}` };
}

// --- Persistence ------------------------------------------------------------

export function saveGame(state) {
  try {
    const snapshot = { ...state, selection: null, idCounter };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    console.warn('[state] save failed', err);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION) return null;
    idCounter = data.idCounter || 1;
    delete data.idCounter;
    data.selection = null;
    return data;
  } catch (err) {
    console.warn('[state] load failed', err);
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}
