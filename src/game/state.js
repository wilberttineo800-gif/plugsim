// The single mutable game state, plus save/load. Everything the simulation
// touches lives on this object so a save is just a JSON snapshot.

import {
  BUILDINGS,
  COURIERS,
  DRIVERS,
  PRODUCT_IDS,
  START_CASH_CLEAN,
  START_CASH_DIRTY,
} from './constants.js';

const SAVE_KEY = 'plugsim.save.v1';
export const SAVE_VERSION = 14;

let idCounter = 1;
export function nextId(prefix) {
  return `${prefix}${idCounter++}`;
}

function emptyProductMap(value = 0) {
  return Object.fromEntries(PRODUCT_IDS.map((p) => [p, value]));
}

export function createState({ origin, cityName, countryCode = null, districts, crews = [], lots = [] }) {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    origin,
    cityName,
    countryCode,
    districts,
    crews,
    lots,
    drivers: [],
    buildings: [],
    couriers: [],
    routes: [],
    // Total elapsed game minutes since day 1, 06:00.
    minutes: 6 * 60,
    // Opens at 60x — a day in 24 minutes. 1x is real time, which looks
    // frozen to someone who has just arrived; it is there to watch a
    // delivery happen, not to start on.
    speedIndex: 3,
    cash: { clean: START_CASH_CLEAN, dirty: START_CASH_DIRTY },
    hqBuildingId: null,
    playerAt: origin ? { ...origin } : null,
    followMe: false,
    tutorialDone: [],
    tutorialDismissed: false,
    stats: {
      packsSold: emptyProductMap(),
      grossRevenue: 0,
      legalRevenue: 0,
      rentCollected: 0,
      propertyPnL: 0,
      laundered: 0,
      seized: 0,
      raids: 0,
      stops: 0,
      spent: 0,
      tributePaid: 0,
      blocksTaken: 0,
    },
    log: [],
    unlocked: [],
    priceHistory: {},
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
    upgrades: [],
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
    capScale: 1,
    // Storage selling to its own block
    selling: true,
    soldFromHere: 0,
    // Fronts
    launderedToday: 0,
    earnedToday: 0,
    stalledReason: null,
    builtAtMinute: 0,
  };
}

/** A vehicle you own. It sits parked until a driver is put in it. */
export function createVehicle(typeId, homeBuildingId) {
  const def = COURIERS[typeId];
  return {
    id: nextId('v'),
    type: typeId,
    name: def.name,
    driverId: null,
    routeId: null,      // the line it's working right now
    routeIds: [],       // the circuit it's been given
    routeIndex: 0,
    phase: 'idle', // idle | loading | outbound | unloading | returning
    progress: 0, // 0..1 along the current leg
    position: null,
    cargo: emptyProductMap(),
    cargoKind: 'packs',
    cargoQuality: emptyProductMap(0.5),
    homeBuildingId,
    parkSlot: 0, // which bay it sits in, so parked vehicles don't stack up
    upgrades: [],
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
    driveMinutes: null, // OSRM's real drive time for these roads
    realRoad: false,
    active: true,
  };
}

const FIRST_NAMES = [
  'Marcus', 'Dee', 'Rashid', 'Yolanda', 'Tavo', 'Kenji', 'Ana', 'Boris',
  'Femi', 'Luz', 'Sasha', 'Omar', 'Priya', 'Vince', 'Nadia', 'Carlos',
  'Ida', 'Tobias', 'Rea', 'Milo', 'Zara', 'Hakim', 'June', 'Petra',
];
const LAST_NAMES = [
  'Reyes', 'Okafor', 'Novak', 'Duran', 'Sattar', 'Marsh', 'Vega', 'Lindqvist',
  'Adeyemi', 'Kowal', 'Bright', 'Serrano', 'Halim', 'Boone', 'Ferro', 'Nash',
];

/** Someone willing to drive, and to keep quiet about it. */
export function createDriver(index) {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return {
    id: nextId('d'),
    name: `${first} ${last}`,
    // What they cost to keep, set when hired and fixed thereafter.
    wagePerDay: Math.round(DRIVERS.baseWagePerDay * Math.pow(DRIVERS.wageGrowth, index)),
    hiredAtMinute: 0,
    vehicleId: null,
  };
}

/** What the next driver will want up front. They get scarcer as you hire. */
export function nextDriverHireFee(state) {
  return Math.round(DRIVERS.baseHireFee * Math.pow(DRIVERS.hireGrowth, (state.drivers || []).length));
}

export function driverById(state, id) {
  return (state.drivers || []).find((d) => d.id === id) || null;
}

// --- Lookups ----------------------------------------------------------------

/**
 * Where a parked vehicle actually sits. Bays are laid out on a small grid
 * inside the car park's own footprint, so a yard with six vehicles in it looks
 * like a yard with six vehicles in it rather than one marker stacked six deep.
 */
export function parkedPosition(state, vehicle) {
  const home = buildingById(state, vehicle.homeBuildingId);
  if (!home) return vehicle.position || null;
  const lot = (state.lots || []).find((l) => l.id === home.lotId);
  const centre = (lot && lot.center) || home.latlng;
  if (!centre) return vehicle.position || null;

  const slot = vehicle.parkSlot || 0;
  const perRow = 4;
  const gapM = 7;
  // Centre the grid on the lot rather than growing off one corner.
  const dx = ((slot % perRow) - (perRow - 1) / 2) * gapM;
  const dy = (Math.floor(slot / perRow) - 0.5) * gapM;
  const latPerM = 1 / 111320;
  const lngPerM = 1 / (111320 * Math.max(0.2, Math.cos(centre.lat * Math.PI / 180)));
  return { lat: centre.lat + dy * latPerM, lng: centre.lng + dx * lngPerM };
}

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
    // Unowned buildings are re-fetched from OSM on demand; storing every one
    // would blow past the storage quota within a couple of city blocks.
    const snapshot = {
      ...state,
      selection: null,
      idCounter,
      // Wall-clock stamp, so the world can catch up on what it missed.
      savedAt: Date.now(),
      lots: (state.lots || []).filter((l) => l.owned),
      loadedTiles: [],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    console.warn('[state] save failed', err);
    return false;
  }
}

/**
 * Bring an older save forward rather than throwing a run away. Only additive
 * changes are handled — anything that would need real reshaping returns false
 * and the save is dropped, which is the honest outcome.
 */
const MIGRATABLE_FROM = 11;

function migrate(data) {
  if (typeof data.version !== 'number' || data.version < MIGRATABLE_FROM) return false;
  if (data.version > SAVE_VERSION) return false;

  if (data.version < 14) {
    // Vehicles gained a circuit in 14; an existing one keeps the single line
    // it was already running.
    for (const c of data.couriers || []) {
      if (!Array.isArray(c.routeIds)) c.routeIds = c.routeId ? [c.routeId] : [];
      if (typeof c.routeIndex !== 'number') c.routeIndex = 0;
    }
  }

  if (data.version < 13) {
    // Onboarding and the HQ arrived in 13; a run in progress simply has none.
    if (data.hqBuildingId === undefined) data.hqBuildingId = null;
    if (!data.playerAt) data.playerAt = data.origin ? { ...data.origin } : null;
    if (!Array.isArray(data.tutorialDone)) data.tutorialDone = [];
    // An established run shouldn't be handed a beginner's checklist.
    if ((data.buildings || []).length > 2) data.tutorialDismissed = true;
  }

  if (data.version < 12) {
    // Depots and parking arrived in 12. Existing vehicles keep the home they
    // had, and existing lots simply aren't car parks.
    for (const l of data.lots || []) {
      if (l.spaces == null) l.spaces = 0;
      if (l.parkingType === undefined) l.parkingType = null;
    }
    (data.couriers || []).forEach((c, i) => { if (c.parkSlot == null) c.parkSlot = i; });
  }

  data.version = SAVE_VERSION;
  return true;
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SAVE_VERSION && !migrate(data)) return null;
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
