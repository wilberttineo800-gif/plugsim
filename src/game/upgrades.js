// Per-building upgrades. Every type has its own list, because what makes a
// grow house better is not what makes a laundromat better.
//
// Effects are multiplicative and stack:
//   yieldMult    throughput / output
//   capacityMult how much it holds
//   qualityAdd   flat bump to product quality
//   heatMult     how much attention it draws
//   raidResist   0..1 share of raid risk removed
//   revenueMult  legitimate takings
//   launderMult  how much street cash it can wash
//   upkeepAdd    extra running cost per day

import { BUILDINGS } from './constants.js';

/** Common shapes, so fifteen building types don't need fifteen hand-written sets. */
const security = (cost, name, blurb) => ({
  id: 'security', name, cost, blurb,
  effects: { raidResist: 0.45, upkeepAdd: 267 },
});
const quiet = (cost, name, blurb) => ({
  id: 'quiet', name, cost, blurb,
  effects: { heatMult: 0.55, upkeepAdd: 367 },
});

/** A legitimate business improves in the same three ways whatever it sells. */
const legitSet = (label, refitCost, bookCost) => [
  {
    id: 'refit', name: 'Full Refit', cost: refitCost,
    blurb: `Better fittings and a proper ${label}. Lifts takings across the board.`,
    effects: { revenueMult: 1.35, upkeepAdd: 467 },
  },
  {
    id: 'staff', name: 'More Staff', cost: Math.round(refitCost * 0.7),
    blurb: 'Longer hours, shorter queues, more money through the till.',
    effects: { revenueMult: 1.28, upkeepAdd: 933 },
  },
  {
    id: 'books', name: 'Second Set of Books', cost: bookCost,
    blurb: 'A bookkeeper who does not ask questions. Washes far more street cash.',
    effects: { launderMult: 1.8, upkeepAdd: 600 },
  },
  {
    id: 'regulars', name: 'Neighbourhood Standing', cost: Math.round(refitCost * 1.2),
    blurb: 'Sponsor the local team. People look out for you instead of at you.',
    effects: { heatMult: 0.6, revenueMult: 1.1, upkeepAdd: 400 },
  },
  security(Math.round(refitCost * 0.8), 'Shutters & Cameras',
    'Nobody walks in after hours, and the footage is yours.'),
];

export const UPGRADES = {
  grow_house: [
    { id: 'lights', name: 'LED Lighting', cost: 340000,
      blurb: 'Denser canopy, faster cycles, and a fraction of the power draw.',
      effects: { yieldMult: 1.35, upkeepAdd: 267 } },
    { id: 'racks', name: 'Vertical Racks', cost: 420000,
      blurb: 'Grow upward. Far more plants and far more room to hold the harvest.',
      effects: { yieldMult: 1.2, capacityMult: 1.9, upkeepAdd: 367 } },
    { id: 'climate', name: 'Climate Control', cost: 560000,
      blurb: 'Held temperature and humidity. The product comes out noticeably better.',
      effects: { qualityAdd: 0.16, yieldMult: 1.1, upkeepAdd: 600 } },
    quiet(4800, 'Carbon Scrubbers', 'Kills the smell that carries three streets over.'),
    security(3900, 'Reinforced Door', 'Buys you the minutes it takes to clear the place.'),
  ],
  fungi_room: [
    { id: 'sterile', name: 'Sterile Bench', cost: 380000,
      blurb: 'Fewer failed flushes. Cleaner work means a cleaner product.',
      effects: { qualityAdd: 0.18, yieldMult: 1.12, upkeepAdd: 333 } },
    { id: 'shelves', name: 'Fruiting Shelves', cost: 440000,
      blurb: 'Triple the growing surface in the same footprint.',
      effects: { yieldMult: 1.3, capacityMult: 1.8, upkeepAdd: 400 } },
    { id: 'humidity', name: 'Humidity Rig', cost: 520000,
      blurb: 'Automated misting. Bigger flushes, and far fewer of them lost.',
      effects: { yieldMult: 1.25, upkeepAdd: 567 } },
    quiet(4600, 'Air Filtration', 'Spores and smell both stay inside the room.'),
    security(3900, 'Blackout Door', 'No light, no noise, no reason to look twice.'),
  ],
  press_room: [
    { id: 'hydraulic', name: 'Hydraulic Press', cost: 620000,
      blurb: 'Even pressure, denser slabs, and a great deal more of them per shift.',
      effects: { yieldMult: 1.4, upkeepAdd: 467 } },
    { id: 'curing', name: 'Curing Room', cost: 700000,
      blurb: 'Time and steady air. The difference between passable and sought-after.',
      effects: { qualityAdd: 0.2, capacityMult: 1.6, upkeepAdd: 633 } },
    quiet(5400, 'Sealed Extraction', 'Vents scrubbed and sealed. Nothing reaches the street.'),
    security(4600, 'Vault Door', 'A day of stock behind eight inches of steel.'),
  ],
  pill_press: [
    { id: 'dies', name: 'Precision Dies', cost: 950000,
      blurb: 'Consistent stamps and consistent doses. Buyers pay for reliability.',
      effects: { qualityAdd: 0.2, yieldMult: 1.2, upkeepAdd: 867 } },
    { id: 'cooling', name: 'Cooling System', cost: 1100000,
      blurb: 'Run the line all day instead of in short bursts.',
      effects: { yieldMult: 1.45, upkeepAdd: 1267 } },
    { id: 'sorting', name: 'Sorting Floor', cost: 820000,
      blurb: 'Somewhere to put it all before it moves.',
      effects: { capacityMult: 2.1, upkeepAdd: 600 } },
    quiet(10500, 'Industrial Ventilation', 'The smell of a running press is unmistakable. This kills it.'),
    security(8800, 'Blast Door', 'Slows a raid down long enough to matter.'),
  ],
  machine_shop: [
    { id: 'cnc', name: 'CNC Mill', cost: 2600000,
      blurb: 'Machine parts to tolerance instead of by hand. Doubles what you turn out.',
      effects: { yieldMult: 1.9, qualityAdd: 0.12, upkeepAdd: 2800 } },
    { id: 'jigs', name: 'Jig & Fixture Set', cost: 1400000,
      blurb: 'Every unit identical. Fewer rejects, better reputation, higher prices.',
      effects: { qualityAdd: 0.22, yieldMult: 1.15, upkeepAdd: 1067 } },
    { id: 'store', name: 'Parts Store', cost: 1250000,
      blurb: 'Racked and inventoried, so a run never stops halfway.',
      effects: { capacityMult: 2.4, upkeepAdd: 933 } },
    quiet(19000, 'Sound Insulation', 'A machine shop that nobody can hear working at 3am.'),
    security(16000, 'Armoured Shutter', 'The single most raided thing you will ever own.'),
  ],
  lab: [
    { id: 'line', name: 'Second Line', cost: 760000,
      blurb: 'Run two batches at once. The most direct fix for a backlog.',
      effects: { yieldMult: 1.75, upkeepAdd: 1267 } },
    { id: 'sealer', name: 'Vacuum Sealer', cost: 430000,
      blurb: 'Packs tighter and keeps longer. More finished stock on site.',
      effects: { capacityMult: 1.8, qualityAdd: 0.08, upkeepAdd: 400 } },
    { id: 'qa', name: 'QA Bench', cost: 610000,
      blurb: 'Nothing substandard leaves the building. Word gets around.',
      effects: { qualityAdd: 0.2, upkeepAdd: 733 } },
    quiet(5900, 'Extraction Hood', 'Takes the smell of processing out of the air.'),
    security(4800, 'Steel Door', 'Product sits here in bulk. Worth protecting.'),
  ],
  stash: [
    { id: 'shelving', name: 'Racked Shelving', cost: 260000,
      blurb: 'Floor to ceiling. More than doubles what the place holds.',
      effects: { capacityMult: 2.3, upkeepAdd: 200 } },
    { id: 'climate', name: 'Climate Seal', cost: 340000,
      blurb: 'Stock does not degrade sitting here waiting for a courier.',
      effects: { qualityAdd: 0.1, capacityMult: 1.3, upkeepAdd: 367 } },
    { id: 'decoy', name: 'Decoy Wall', cost: 520000,
      blurb: 'A false back. Most of what you hold survives a search.',
      effects: { raidResist: 0.65, upkeepAdd: 300 } },
    quiet(3100, 'Quiet Hours', 'Deliveries at sensible times, by people who blend in.'),
  ],
  closet_grow: [
    { id: 'lights', name: 'Better Lights', cost: 90000,
      blurb: 'Swap the bulbs for a proper panel. Small room, much bigger yield.',
      effects: { yieldMult: 1.4, upkeepAdd: 133 } },
    { id: 'tent', name: 'Sealed Tent', cost: 120000,
      blurb: 'Contained, filtered and quiet. Keeps the whole thing invisible.',
      effects: { heatMult: 0.5, qualityAdd: 0.12, upkeepAdd: 167 } },
    { id: 'shelf', name: 'Shelf Tier', cost: 80000,
      blurb: 'A second level in the same cupboard.',
      effects: { yieldMult: 1.2, capacityMult: 1.7, upkeepAdd: 100 } },
  ],
  lockup: [
    { id: 'racking', name: 'Racking', cost: 70000,
      blurb: 'Stack it properly and the unit holds three times as much.',
      effects: { capacityMult: 2.6, upkeepAdd: 100 } },
    { id: 'falseback', name: 'False Back', cost: 160000,
      blurb: 'A stud wall a foot from the real one. Most of it survives a search.',
      effects: { raidResist: 0.6, upkeepAdd: 133 } },
    quiet(900, 'Unmarked Door', 'No signage, no pattern, no reason to look.'),
  ],
  phoneshop: legitSet('counter', 1500, 2200),
  checkcashing: legitSet('booth', 2600, 4400),
  bodega: legitSet('shopfront', 2600, 3400),
  laundromat: legitSet('service counter', 3800, 5200),
  autoshop: legitSet('workshop', 5600, 7400),
  cafe: legitSet('front of house', 4600, 5000),
  barbershop: legitSet('chair line', 2900, 3600),
  carwash: legitSet('forecourt', 6200, 8600),
  gym: legitSet('training floor', 7400, 9200),
  nightclub: legitSet('room', 16000, 21000),
};

/**
 * Vehicle upgrades, by class. A truck tier has no business appearing on a
 * bicycle, so each class carries its own short list and they stay short.
 *
 *   capacityMult  how much it carries
 *   paceMult      travel time: below 1 is quicker
 *   turnaroundMult  loading and unloading time
 *   stealthAdd    how much less likely it is to be pulled over
 */
export const VEHICLE_UPGRADES = {
  foot: [
    { id: 'bag', name: 'Bigger Bag', cost: 20000,
      blurb: 'A holdall instead of pockets. Twice as much per trip.',
      effects: { capacityMult: 2 } },
    { id: 'route', name: 'Knows the Cuts', cost: 35000,
      blurb: 'Alleys, fences and shortcuts nobody else uses.',
      effects: { paceMult: 0.78 } },
  ],
  twowheel: [
    { id: 'panniers', name: 'Panniers', cost: 70000,
      blurb: 'Frame bags either side. Far more per run.',
      effects: { capacityMult: 1.8, paceMult: 1.05 } },
    { id: 'tuned', name: 'Tuned', cost: 140000,
      blurb: 'Derestricted and geared for the city.',
      effects: { paceMult: 0.8 } },
    { id: 'plates', name: 'Swapped Plates', cost: 110000,
      blurb: 'Nothing on it matches anything on record.',
      effects: { stealthAdd: 0.08 } },
  ],
  car: [
    { id: 'seats', name: 'Seats Out', cost: 120000,
      blurb: 'Rear seats gone, floor flattened. Room where passengers were.',
      effects: { capacityMult: 1.6, turnaroundMult: 0.9 } },
    { id: 'engine', name: 'Engine Work', cost: 420000,
      blurb: 'It moves like something far more expensive.',
      effects: { paceMult: 0.82 } },
    { id: 'trap', name: 'Hidden Compartment', cost: 560000,
      blurb: 'A void behind the panels that a search rarely finds.',
      effects: { stealthAdd: 0.2, capacityMult: 0.9, turnaroundMult: 1.3 } },
    { id: 'armour', name: 'Armour', cost: 900000,
      blurb: 'Plated doors and run-flats. Heavy, and it drives like it.',
      effects: { stealthAdd: 0.1, paceMult: 1.22, capacityMult: 0.85 } },
  ],
  van: [
    { id: 'shelving', name: 'Racked Out', cost: 220000,
      blurb: 'Proper racking. More in, and quicker to load.',
      effects: { capacityMult: 1.5, turnaroundMult: 0.75 } },
    { id: 'livery', name: 'Trade Livery', cost: 310000,
      blurb: 'Signwritten as a plumber. It belongs on any street.',
      effects: { stealthAdd: 0.22 } },
    { id: 'suspension', name: 'Heavy Suspension', cost: 480000,
      blurb: 'Carries a full load without sitting on the bump stops.',
      effects: { capacityMult: 1.35, paceMult: 0.94 } },
    { id: 'falsefloor', name: 'False Floor', cost: 740000,
      blurb: 'The load sits under the load.',
      effects: { stealthAdd: 0.18, turnaroundMult: 1.25 } },
  ],
  air: [
    { id: 'battery', name: 'Extended Battery', cost: 380000,
      blurb: 'It stops turning back early. Longer hops, same load.',
      effects: { paceMult: 0.85 } },
    { id: 'cradle', name: 'Payload Cradle', cost: 520000,
      blurb: 'A proper slung crate rather than taped-on boxes.',
      effects: { capacityMult: 1.7, paceMult: 1.08 } },
    { id: 'quiet', name: 'Low-Noise Rotors', cost: 690000,
      blurb: 'You hear it only once it has already gone.',
      effects: { stealthAdd: 0.05 } },
  ],
  truck: [
    { id: 'trailer', name: 'Longer Trailer', cost: 1200000,
      blurb: 'More again, at the cost of getting it round corners.',
      effects: { capacityMult: 1.6, paceMult: 1.12 } },
    { id: 'liftgate', name: 'Lift Gate', cost: 850000,
      blurb: 'Loading stops being the whole job.',
      effects: { turnaroundMult: 0.55 } },
    { id: 'logbook', name: 'Clean Logbook', cost: 1500000,
      blurb: 'Papers, plates and a haulage name that checks out.',
      effects: { stealthAdd: 0.28 } },
    { id: 'refit', name: 'Engine Refit', cost: 1800000,
      blurb: 'It will never be quick, but it stops being the slowest thing on the road.',
      effects: { paceMult: 0.85 } },
  ],
};

/** What can still be done to this vehicle. */
export function vehicleUpgrades(courier, def) {
  const list = VEHICLE_UPGRADES[def.class] || [];
  const owned = new Set(courier.upgrades || []);
  return list.map((u) => ({ ...u, owned: owned.has(u.id) }));
}

export function vehicleUpgradeById(cls, id) {
  return (VEHICLE_UPGRADES[cls] || []).find((u) => u.id === id) || null;
}

/** Everything installed on this vehicle, combined. */
export function vehicleEffects(courier, def) {
  const e = { capacityMult: 1, paceMult: 1, turnaroundMult: 1, stealthAdd: 0 };
  for (const id of courier.upgrades || []) {
    const u = vehicleUpgradeById(def.class, id);
    if (!u) continue;
    const fx = u.effects || {};
    e.capacityMult *= fx.capacityMult ?? 1;
    e.paceMult *= fx.paceMult ?? 1;
    e.turnaroundMult *= fx.turnaroundMult ?? 1;
    e.stealthAdd += fx.stealthAdd ?? 0;
  }
  return e;
}

/** The vehicle's numbers with everything fitted to it. */
export function vehicleStats(courier, def) {
  const fx = vehicleEffects(courier, def);
  return {
    capacity: def.capacity * fx.capacityMult,
    paceFactor: def.paceFactor * fx.paceMult,
    loadMinutes: def.loadMinutes * fx.turnaroundMult,
    unloadMinutes: def.unloadMinutes * fx.turnaroundMult,
    stealth: Math.min(0.97, def.stealth + fx.stealthAdd),
  };
}

/** Everything this building could still have done to it. */
export function availableUpgrades(building) {
  const list = UPGRADES[building.type] || [];
  const owned = new Set(building.upgrades || []);
  return list.map((u) => ({ ...u, owned: owned.has(u.id) }));
}

export function upgradeById(typeId, upgradeId) {
  return (UPGRADES[typeId] || []).find((u) => u.id === upgradeId) || null;
}

/** Aggregate everything installed here into one set of multipliers. */
export function effectsFor(building) {
  const e = {
    yieldMult: 1, capacityMult: 1, qualityAdd: 0, heatMult: 1,
    raidResist: 0, revenueMult: 1, launderMult: 1, upkeepAdd: 1,
  };
  for (const id of building.upgrades || []) {
    const u = upgradeById(building.type, id);
    if (!u) continue;
    const fx = u.effects || {};
    e.yieldMult *= fx.yieldMult ?? 1;
    e.capacityMult *= fx.capacityMult ?? 1;
    e.revenueMult *= fx.revenueMult ?? 1;
    e.launderMult *= fx.launderMult ?? 1;
    e.heatMult *= fx.heatMult ?? 1;
    e.qualityAdd += fx.qualityAdd ?? 0;
    e.upkeepAdd += fx.upkeepAdd ?? 0;
    // Resistances combine as independent chances of surviving.
    e.raidResist = 1 - (1 - e.raidResist) * (1 - (fx.raidResist ?? 0));
  }
  return e;
}

/** Upkeep after everything installed here is accounted for. */
export function upkeepFor(building) {
  return BUILDINGS[building.type].upkeepPerDay + effectsFor(building).upkeepAdd;
}

/** One-line summary of an upgrade's effect, for the UI. */
export function describeEffects(fx = {}) {
  const bits = [];
  if (fx.yieldMult) bits.push(`+${Math.round((fx.yieldMult - 1) * 100)}% output`);
  if (fx.capacityMult) bits.push(`+${Math.round((fx.capacityMult - 1) * 100)}% storage`);
  if (fx.revenueMult) bits.push(`+${Math.round((fx.revenueMult - 1) * 100)}% takings`);
  if (fx.launderMult) bits.push(`+${Math.round((fx.launderMult - 1) * 100)}% laundry`);
  if (fx.qualityAdd) bits.push(`+${Math.round(fx.qualityAdd * 100)} quality`);
  if (fx.heatMult) bits.push(`−${Math.round((1 - fx.heatMult) * 100)}% heat`);
  if (fx.raidResist) bits.push(`−${Math.round(fx.raidResist * 100)}% raid risk`);
  if (fx.upkeepAdd) bits.push(`+$${fx.upkeepAdd}/day upkeep`);
  return bits;
}


/**
 * How many supply lines one vehicle can hold at once. Bigger vehicles carry
 * more in one go, so they're worth sending round a circuit; a runner on foot
 * does one thing at a time.
 */
export function maxRoutesFor(def, courier) {
  const cap = courier ? vehicleStats(courier, def).capacity : def.capacity;
  if (def.direct) return 2;          // air is fast but small
  // A courier doing two drops on one round is ordinary. The threshold is set so
  // the cheapest vehicle a new player can buy can work both legs of the chain —
  // needing a second vehicle and a second driver just to get started was a wall
  // nobody could see coming.
  return Math.max(1, Math.min(4, 1 + Math.floor(cap / 60)));
}


// --- Rental upgrades --------------------------------------------------------
//
// The design note asked for rented property to be improvable, with the work
// showing up in the rent. What you can do depends on what the building is: you
// refit a kitchen in a flat and you resurface a loading yard in a warehouse.

const RESIDENTIAL_WORK = [
  { id: 'decorate', name: 'Full Redecoration', cost: 520000,
    blurb: 'New floors, new paint, new kitchen. Lets for more the day it is finished.',
    rentMult: 1.18 },
  { id: 'heating', name: 'Heating and Insulation', cost: 860000,
    blurb: 'Warm, quiet and cheap to run. Tenants stay longer and pay for it.',
    rentMult: 1.15 },
  { id: 'security', name: 'Door Entry and Cameras', cost: 640000,
    blurb: 'Controlled entry on the street door. Worth more on a rough block.',
    rentMult: 1.12, crimeRelief: 0.15 },
  { id: 'convert', name: 'Loft Conversion', cost: 1450000,
    blurb: 'Another front door under the same roof.',
    rentMult: 1.1, addUnits: 1 },
];

const COMMERCIAL_WORK = [
  { id: 'shopfront', name: 'New Shopfront', cost: 740000,
    blurb: 'Glass, signage and a clean frontage. Better class of tenant.',
    rentMult: 1.16 },
  { id: 'services', name: 'Rewire and Plumbing', cost: 980000,
    blurb: 'Brought up to standard, so a real business can actually trade from it.',
    rentMult: 1.19 },
  { id: 'aircon', name: 'Climate and Fit-out', cost: 1260000,
    blurb: 'Comfortable to work in all year. Commands an office rent.',
    rentMult: 1.14 },
];

const YARD_WORK = [
  { id: 'surface', name: 'Resurfaced Yard', cost: 680000,
    blurb: 'Level, drained hardstanding. A haulier will pay for that.',
    rentMult: 1.15 },
  { id: 'dock', name: 'Loading Dock', cost: 1540000,
    blurb: 'Dock-height doors, so a lorry can back straight on.',
    rentMult: 1.24 },
  { id: 'threephase', name: 'Three-Phase Power', cost: 1120000,
    blurb: 'Enough supply to run real machinery.',
    rentMult: 1.17 },
];

export const RENT_UPGRADES = {
  apartment: RESIDENTIAL_WORK,
  tower: RESIDENTIAL_WORK,
  house: RESIDENTIAL_WORK,
  rowhouse: RESIDENTIAL_WORK,
  retail: COMMERCIAL_WORK,
  office: COMMERCIAL_WORK,
  kiosk: COMMERCIAL_WORK,
  warehouse: YARD_WORK,
  industrial: YARD_WORK,
  garage: YARD_WORK,
  shed: YARD_WORK,
};

/** What could still be done to this property, with what is already done marked. */
export function rentUpgrades(lot) {
  const list = RENT_UPGRADES[lot.kind] || [];
  const owned = new Set(lot.rentUpgrades || []);
  return list.map((u) => ({ ...u, owned: owned.has(u.id) }));
}

export function rentUpgradeById(kind, id) {
  return (RENT_UPGRADES[kind] || []).find((u) => u.id === id) || null;
}

/** Everything the work adds up to on one property. */
export function rentEffects(lot) {
  const fx = { rentMult: 1, addUnits: 0, crimeRelief: 0 };
  for (const id of lot.rentUpgrades || []) {
    const u = rentUpgradeById(lot.kind, id);
    if (!u) continue;
    fx.rentMult *= u.rentMult ?? 1;
    fx.addUnits += u.addUnits ?? 0;
    fx.crimeRelief += u.crimeRelief ?? 0;
  }
  return fx;
}
