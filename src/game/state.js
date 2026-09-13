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
export const SAVE_VERSION = 22;

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
    // Where you operate. The first is where you started; the rest you opened.
    cities: [{
      id: 'city-home',
      name: cityName,
      origin,
      countryCode,
      foundedDay: 0,
      home: true,
    }],
    // Consignments in the wind between cities. Not routes — you are betting on
    // arrival, not watching a delivery.
    shipments: [],
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
    licences: {},
    research: [],        // projects finished
    researchActive: [],  // projects under way
    items: [],           // things only you have made
    incidents: [],       // things happening, on the map
    players: [],         // other operations, AI for now
    aiDisabled: false,
    playerProfile: { name: null, lastWeekWorth: null, history: [] },

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

// Names for the places you run. A grow called "The Greenhouse" is somewhere you
// remember; "Grow House · Detached house · 122 m²" is a database row.
const PLACE_WORDS = {
  production: ['The Greenhouse', 'Eden', 'The Allotment', 'Backroom', 'The Nursery',
    'Long Acre', 'The Glasshouse', 'Sunnyside', 'The Patch', 'Verdant'],
  processing: ['The Kitchen', 'The Bench', 'Cold Room', 'The Works', 'Alchemy',
    'The Still', 'Reduction', 'The Dry Room', 'Fractions', 'The Line'],
  storage: ['The Vault', 'Lock-Up', 'The Hold', 'Safe House', 'The Cellar',
    'Deep Store', 'The Annexe', 'Cold Storage', 'The Rack', 'The Pantry'],
  front: ['Marlow & Sons', 'The Corner', 'Halcyon', 'Fairweather', 'The Ivy',
    'Kestrel & Co', 'Bright Street', 'The Meridian', 'Pemberton', 'Silverline'],
  depot: ['The Yard', 'Motor Pool', 'The Garage', 'Dispatch', 'The Lot',
    'Wheelhouse', 'The Depot', 'Transit', 'The Ramp', 'Roadside'],
  research: ['The Lab', 'Skunkworks', 'The Study', 'Blue Sky', 'The Workshop',
    'Prototype', 'The Drawing Room', 'Test Bench'],
  hq: ['Home', 'The Office', 'Head Office', 'The House', 'Base', 'The Room'],
};

function placeName(def) {
  const list = PLACE_WORDS[def.kind] || PLACE_WORDS.front;
  return list[Math.floor(Math.random() * list.length)];
}

export function createBuilding(typeId, latlng, districtId) {
  const def = BUILDINGS[typeId];
  return {
    id: nextId('b'),
    type: typeId,
    kind: def.kind,
    name: def.name,
    // What the player calls it. Given one on opening, theirs to change.
    label: placeName(def),
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

/**
 * What to call a place: the player's own name for it, else a name that matches
 * how big the place actually is.
 *
 * A grow on a 600 m2 warehouse and a grow in a box room are the same building
 * TYPE, and calling both of them "Grow House" made the property size — the
 * thing you are actually buying — invisible in every list it appears in.
 */
export function buildingLabel(b) {
  if (!b) return '';
  return b.label || typeLabel(b) || b.name || '';
}

/**
 * What KIND of place this is, named for how big it actually turned out.
 *
 * A grow on a 600 m2 warehouse and a grow in a box room are the same building
 * type, so both read as "Closet Grow" in every panel — which hides the property
 * size, the thing you actually chose. `sizeNames` on the definition bands the
 * type name by `b.scale`; anything without bands keeps its single name.
 */
export function typeLabel(b) {
  return typeLabelFor(BUILDINGS[(b && b.type) || ''], (b && b.scale) || 1);
}

/**
 * The same banding, for a building that doesn't exist yet — so the build menu
 * can tell you it's about to be a Warehouse Grow rather than a Closet Grow.
 */
export function typeLabelFor(def, scale = 1) {
  if (!def) return '';
  if (!Array.isArray(def.sizeNames) || !def.sizeNames.length) return def.name || '';
  for (const [upTo, name] of def.sizeNames) {
    if (scale < upTo) return name;
  }
  return def.sizeNames[def.sizeNames.length - 1][1];
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

  if (data.version < 22) {
    // Three more trades arrived, and firearms lines gained a named pattern.
    const NEW = ['meth', 'acid', 'ket'];
    const fill = (m, v) => { if (m) for (const k of NEW) if (m[k] === undefined) m[k] = v; };
    for (const d of data.districts || []) {
      fill(d.supply, 0); fill(d.supplyQuality, 0.5); fill(d.demandPerHour, 0.25);
    }
    for (const b of data.buildings || []) {
      fill(b.raw, 0); fill(b.packs, 0); fill(b.rawQuality, 0.5); fill(b.packQuality, 0.5);
      if (b.model === undefined) b.model = null;
    }
    for (const c of data.couriers || []) { fill(c.cargo, 0); fill(c.cargoQuality, 0.5); }
    if (data.stats) fill(data.stats.packsSold, 0);
    for (const k of NEW) if (data.priceHistory && !data.priceHistory[k]) data.priceHistory[k] = [];
  }

  if (data.version < 21) {
    if (!Array.isArray(data.incidents)) data.incidents = [];
  }

  if (data.version < 20) {
    // Places got names you can change. Anything already built gets one.
    for (const b of data.buildings || []) {
      if (!b.label) b.label = (BUILDINGS[b.type] || {}).name || 'The Place';
    }
  }

  if (data.version < 19) {
    // Cocaine arrived, and pills moved onto their own chain. Existing product
    // maps need the new key, and an old pill press is now a processor.
    const fill = (m, v) => { if (m && m.coke === undefined) m.coke = v; };
    for (const d of data.districts || []) {
      fill(d.supply, 0); fill(d.supplyQuality, 0.5); fill(d.demandPerHour, 0.3);
    }
    for (const b of data.buildings || []) {
      fill(b.raw, 0); fill(b.packs, 0); fill(b.rawQuality, 0.5); fill(b.packQuality, 0.5);
      // A pill press built under the old rules made pills outright; it now
      // finishes opium. Keep the building, change what it is.
      if (b.type === 'pill_press' && b.kind === 'production') b.kind = 'processing';
    }
    for (const c of data.couriers || []) { fill(c.cargo, 0); fill(c.cargoQuality, 0.5); }
    if (data.stats) fill(data.stats.packsSold, 0);
    if (data.priceHistory && !data.priceHistory.coke) data.priceHistory.coke = [];
  }

  if (data.version < 18) {
    // Operations gained a place on the map, and you gained a way to meet them.
    // placePlayers fills the blocks in at boot when they're empty.
    for (const p of data.players || []) {
      if (!Array.isArray(p.blocks)) p.blocks = [];
      if (typeof p.known !== 'boolean') p.known = false;
      if (typeof p.knowsYou !== 'boolean') p.knowsYou = false;
      if (!Array.isArray(p.offers)) p.offers = [];
    }
  }

  if (data.version < 17) {
    // Other operations and the board arrived in 17.
    if (!Array.isArray(data.players)) data.players = [];
    if (typeof data.aiDisabled !== 'boolean') data.aiDisabled = false;
    if (!data.playerProfile) data.playerProfile = { name: null, lastWeekWorth: null, history: [] };
  }

  if (data.version < 16) {
    // Research and one-off items arrived in 16.
    if (!Array.isArray(data.research)) data.research = [];
    if (!Array.isArray(data.researchActive)) data.researchActive = [];
    if (!Array.isArray(data.items)) data.items = [];
  }

  if (data.version < 15) {
    // Firearms licensing arrived in 15; an existing run simply holds none.
    if (!data.licences) data.licences = {};
  }

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
