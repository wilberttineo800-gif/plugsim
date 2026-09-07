// ---------------------------------------------------------------------------
// Tuning + content definitions. Everything balance-related lives here so the
// game can be re-tuned without touching simulation code.
// ---------------------------------------------------------------------------

// Time: the sim advances in game-minutes. At 1x, one real second = 2 game
// minutes, so a full game day takes 12 real minutes.
export const GAME_MINUTES_PER_REAL_SECOND = 2;
export const TICK_MS = 100;
export const SPEEDS = [0, 1, 3, 10];

// Enough for a minimum viable chain — one grow, one lab, one courier — with a
// thin buffer for the first few cycles of supplies. Anything more is earned.
export const START_CASH_DIRTY = 0;
export const START_CASH_CLEAN = 18000;

// --- Products ---------------------------------------------------------------
// Each product moves through the chain as RAW units (harvested, unsellable)
// then PACKAGED units (what customers actually buy).
export const PRODUCTS = {
  weed: {
    id: 'weed',
    name: 'Cannabis',
    short: 'WEED',
    color: '#6fbf5b',
    rawName: 'Wet Flower',
    packName: 'Cured Packs',
    packsPerRaw: 6, // trim + cure yield
    basePrice: 40, // $ per packaged unit at neutral demand
    heatPerPackSold: 0.10,
    // Demand spread across districts: broad, low margin, high volume.
    demandBase: [1.0, 6.0],
  },
  shrooms: {
    id: 'shrooms',
    name: 'Psilocybin',
    short: 'SHRM',
    color: '#b48cd8',
    rawName: 'Fresh Flush',
    packName: 'Dried Packs',
    packsPerRaw: 4,
    basePrice: 115,
    heatPerPackSold: 0.17,
    // Narrower customer base, but each sale is worth far more.
    demandBase: [0.25, 2.0],
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS);

// --- Buildings --------------------------------------------------------------
export const BUILDINGS = {
  grow_house: {
    id: 'grow_house',
    kind: 'production',
    name: 'Grow House',
    blurb: 'Runs continuous cannabis cycles. Output is raw and unsellable until cured.',
    icon: 'leaf',
    product: 'weed',
    cost: 2100,
    minAreaM2: 55,
    referenceAreaM2: 130,
    upkeepPerDay: 130,
    slots: 4,
    cycleHours: 6,
    rawPerSlot: 2.5,
    supplyCostPerSlot: 110, // charged at the start of every cycle
    baseQuality: 0.5,
    heatPerDay: 0.6,
    capacity: 120, // raw units it can hold before production stalls
  },
  fungi_room: {
    id: 'fungi_room',
    kind: 'production',
    name: 'Fruiting Room',
    blurb: 'Slower cycles, smaller flushes, but the product is worth three times as much.',
    icon: 'spore',
    product: 'shrooms',
    cost: 3300,
    minAreaM2: 55,
    referenceAreaM2: 130,
    upkeepPerDay: 175,
    slots: 3,
    cycleHours: 9,
    rawPerSlot: 1.6,
    supplyCostPerSlot: 165,
    baseQuality: 0.5,
    heatPerDay: 0.5,
    capacity: 80,
  },
  lab: {
    id: 'lab',
    kind: 'processing',
    name: 'Processing Lab',
    blurb: 'Turns raw harvest into packaged product. Your chain is only as fast as this.',
    icon: 'flask',
    cost: 4300,
    minAreaM2: 135,
    referenceAreaM2: 420,
    upkeepPerDay: 210,
    rawPerHour: 3.2, // raw units consumed per game hour
    costPerRaw: 30,
    qualityBonus: 0.15,
    heatPerDay: 0.35,
    capacity: 400, // packaged units held on site
  },
  stash: {
    id: 'stash',
    kind: 'storage',
    name: 'Stash House',
    blurb: 'Buffer storage close to your customers. Cuts the distance couriers cover.',
    icon: 'box',
    cost: 1500,
    minAreaM2: 90,
    referenceAreaM2: 320,
    upkeepPerDay: 65,
    heatPerDay: 0.15,
    capacity: 600,
  },
  // --- Legitimate businesses ------------------------------------------------
  // These earn CLEAN money on their own, slowly and safely, and they wash
  // street cash on the side. They're never raided and they cool a block down.
  // Legal income is the patient way to afford property; the chain is the fast
  // way, and it costs you heat.
  bodega: {
    id: 'bodega',
    kind: 'front',
    name: 'Corner Store',
    blurb: 'Small, legal, boring. Turns a modest clean profit and quietly washes street cash.',
    icon: 'store',
    cost: 3200,
    minAreaM2: 45,
    referenceAreaM2: 120,
    upkeepPerDay: 210,
    revenuePerDay: 640,
    launderPerDay: 2600,
    cut: 0.24,
    heatPerDay: -0.25,
    capacity: 0,
  },
  laundromat: {
    id: 'laundromat',
    kind: 'front',
    name: 'Laundromat',
    blurb: 'Thin margins, but nobody blinks at a cash business. Washes far more than it earns.',
    icon: 'washer',
    cost: 5200,
    minAreaM2: 90,
    referenceAreaM2: 200,
    upkeepPerDay: 290,
    revenuePerDay: 810,
    launderPerDay: 6200,
    cut: 0.19,
    heatPerDay: -0.45,
    capacity: 0,
  },
  autoshop: {
    id: 'autoshop',
    kind: 'front',
    name: 'Auto Shop',
    blurb: 'Needs real space. The best earner you can run legally, and the best laundry.',
    icon: 'wrench',
    cost: 7800,
    minAreaM2: 200,
    referenceAreaM2: 430,
    upkeepPerDay: 390,
    revenuePerDay: 1320,
    launderPerDay: 9200,
    cut: 0.17,
    heatPerDay: -0.55,
    capacity: 0,
  },
  cafe: {
    id: 'cafe',
    kind: 'front',
    name: 'Coffee Bar',
    blurb: 'Lives or dies on the block around it. Excellent on money streets, pointless on poor ones.',
    icon: 'cup',
    cost: 6400,
    minAreaM2: 60,
    referenceAreaM2: 150,
    upkeepPerDay: 350,
    revenuePerDay: 980,
    // Twice as sensitive to how much money lives on the block as the others.
    wealthSensitivity: 2,
    launderPerDay: 3400,
    cut: 0.26,
    heatPerDay: -0.35,
    capacity: 0,
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS);

// --- Couriers ---------------------------------------------------------------
export const COURIERS = {
  bike: {
    id: 'bike',
    name: 'Bike Courier',
    cost: 900,
    wagePerDay: 90,
    capacity: 40,
    speedKph: 18,
    stealth: 0.85, // higher = less likely to be stopped
  },
  sedan: {
    id: 'sedan',
    name: 'Beater Sedan',
    cost: 3400,
    wagePerDay: 165,
    capacity: 140,
    speedKph: 38,
    stealth: 0.62,
  },
  van: {
    id: 'van',
    name: 'Panel Van',
    cost: 9200,
    wagePerDay: 260,
    capacity: 480,
    speedKph: 32,
    stealth: 0.45,
  },
};

export const COURIER_IDS = Object.keys(COURIERS);

// --- Heat & enforcement -----------------------------------------------------
export const HEAT = {
  // Proportional, not flat: a quiet block sheds almost nothing while a hot one
  // cools fast. Flat decay silently deleted heat once it spread out.
  decayPerDay: 0.22,
  // Fraction of a block's heat that migrates to its neighbours each day, so
  // pressure blooms outward instead of staying pinned to one hex.
  diffusePerDay: 0.18,
  max: 100,
  // Chance per game-hour that a building in a hot district gets raided.
  raidChanceAtMaxHeat: 0.10,
  raidHeatFloor: 28, // below this, no raids
  // Chance a courier passing through gets pulled over, scaled by heat.
  stopChanceAtMaxHeat: 0.22,
  stopHeatFloor: 20,
  finePerPackSeized: 45,
};

// --- Real estate ------------------------------------------------------------
// Properties are real OSM buildings. Price comes from footprint area, the
// block's rent level, and what sort of premises it is.
export const LOTS = {
  pricePerM2: 21,
  minPrice: 1400,
  maxPrice: 140000,
  resaleRate: 0.62,
  minAreaM2: 30,
  maxAreaM2: 26000,
  industrialAreaM2: 1400,
  perDistrict: 34,
  fetchCap: 2600,
};

// --- Rival crews ------------------------------------------------------------
export const RIVALS = {
  strengthRange: [0.45, 0.92],
  reachKmRange: [1.6, 3.2],
  // Share of a block's demand a crew takes at full control. Never all of it —
  // even their turf has customers willing to buy from someone new.
  demandCapture: 0.72,
  // How fast control drifts back toward its natural level, per day.
  regainPerDay: 0.16,
  // Selling on a block erodes their grip; this is the pressure your street
  // reputation applies to their baseline.
  repPressure: 0.85,
  // Contested blocks draw police attention on their own.
  frictionHeatPerDay: 2.4,
  contestedBand: [0.18, 0.75],
  // Shaking you down: chance per game-hour a courier unloading on their turf
  // gets taxed, scaled by control and their aggression.
  shakedownChanceAtFullControl: 0.16,
  shakedownFloor: 0.3,
  tributeRate: 0.55, // share of the load they take
  // Muscling in
  muscleBaseCost: 2200,
  muscleCostPerControl: 9000,
  muscleKnockdown: [0.22, 0.46],
  muscleHeat: 9,
  muscleBackfireCost: 0.5, // you still pay this share when it goes wrong
};

// --- The fixer --------------------------------------------------------------
// Always available, no building required, and deliberately a bad deal. He
// exists so a player who sinks everything into production can still claw back
// enough clean money to buy a real Front instead of dead-ending.
export const FIXER = {
  dailyLimit: 2500,
  cut: 0.4,
};

// How hard a legitimate business leans on the wealth of its block.
export const LEGIT_WEALTH_SWING = 0.55;

// --- Market -----------------------------------------------------------------
export const MARKET = {
  // Street supply above this many hours of demand crushes the price.
  saturationHours: 8,
  minPriceMultiplier: 0.35,
  // How fast reputation in a district builds and decays.
  repGainPerSale: 0.0016,
  repDecayPerDay: 0.03,
  repPriceBonus: 0.22, // full reputation is worth +22% price
  qualityPriceSwing: 0.55, // quality 0 -> -27%, quality 1 -> +27%
};

export const DISTRICT_RADIUS_KM = 0.62; // hex circumradius
export const DISTRICT_RINGS = 3; // 3 rings = 37 districts
