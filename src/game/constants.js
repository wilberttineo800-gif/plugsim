// ---------------------------------------------------------------------------
// Tuning + content definitions. Everything balance-related lives here so the
// game can be re-tuned without touching simulation code.
// ---------------------------------------------------------------------------

// Time: the sim advances in game-minutes. At 1x, one real second = 2 game
// minutes, so a full game day takes 12 real minutes.
export const GAME_MINUTES_PER_REAL_SECOND = 2;
export const TICK_MS = 100;
export const SPEEDS = [0, 1, 3, 10, 15];

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
  hash: {
    id: 'hash',
    name: 'Hash',
    short: 'HASH',
    color: '#c98f4a',
    rawName: 'Pressed Slab',
    packName: 'Cut Bars',
    packsPerRaw: 5,
    basePrice: 88,
    heatPerPackSold: 0.14,
    demandBase: [0.4, 2.6],
    // Long-established markets pay more and buy more of it.
    regionBoost: { ma: 1.8, es: 1.5, nl: 1.45, gb: 1.3, fr: 1.3, de: 1.2, be: 1.2 },
  },
  pills: {
    id: 'pills',
    name: 'Pills',
    short: 'PILL',
    color: '#63b9d4',
    rawName: 'Raw Batch',
    packName: 'Baggies',
    packsPerRaw: 9,
    basePrice: 62,
    heatPerPackSold: 0.2,
    demandBase: [0.3, 2.2],
    // Nightlife cities move far more of these.
    regionBoost: { nl: 1.9, be: 1.6, de: 1.5, gb: 1.4, es: 1.3, pt: 1.2 },
  },
  iron: {
    id: 'iron',
    name: 'Firearms',
    short: 'IRON',
    color: '#9aa7b5',
    rawName: 'Machined Parts',
    packName: 'Finished Units',
    packsPerRaw: 2,
    basePrice: 640,
    // By far the hottest thing you can move.
    heatPerPackSold: 0.85,
    demandBase: [0.05, 0.5],
    // Demand tracks how armed a society already is.
    regionBoost: { us: 2.4, br: 1.7, za: 1.6, mx: 1.6, ph: 1.4 },
    regionPenalty: 0.35, // everywhere else: a thin, dangerous trade
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
    unlock: { properties: 2 },
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
  closet_grow: {
    id: 'closet_grow',
    kind: 'production',
    name: 'Closet Grow',
    blurb: 'A few lights in a back room. Tiny output, almost no footprint, and nobody notices.',
    icon: 'leaf',
    product: 'weed',
    cost: 700,
    minAreaM2: 13,
    referenceAreaM2: 40,
    upkeepPerDay: 45,
    slots: 2,
    cycleHours: 7,
    rawPerSlot: 1.1,
    supplyCostPerSlot: 60,
    baseQuality: 0.42,
    heatPerDay: 0.15,
    capacity: 30,
  },
  press_room: {
    id: 'press_room',
    kind: 'production',
    name: 'Hash Press',
    blurb: 'Presses trim and resin into slabs. Steady, dense, and worth twice raw flower.',
    icon: 'press',
    product: 'hash',
    unlock: { properties: 3, cash: 30000 },
    cost: 5400,
    minAreaM2: 70,
    referenceAreaM2: 160,
    upkeepPerDay: 240,
    slots: 3,
    cycleHours: 7,
    rawPerSlot: 2.0,
    supplyCostPerSlot: 190,
    baseQuality: 0.55,
    heatPerDay: 0.55,
    capacity: 100,
  },
  pill_press: {
    id: 'pill_press',
    kind: 'production',
    name: 'Pill Press',
    blurb: 'High volume, low unit value, and a smell that carries. Needs a quiet block.',
    icon: 'pill',
    product: 'pills',
    unlock: { properties: 6, cash: 120000 },
    cost: 14500,
    minAreaM2: 120,
    referenceAreaM2: 260,
    upkeepPerDay: 520,
    slots: 4,
    cycleHours: 5,
    rawPerSlot: 2.4,
    supplyCostPerSlot: 260,
    baseQuality: 0.5,
    heatPerDay: 1.1,
    capacity: 150,
  },
  machine_shop: {
    id: 'machine_shop',
    kind: 'production',
    name: 'Machine Shop',
    blurb: 'Turns out untraceable iron. The most valuable thing you can make, and the fastest way to bring the wrong attention.',
    icon: 'gun',
    product: 'iron',
    unlock: { properties: 9, cash: 260000 },
    cost: 38000,
    minAreaM2: 260,
    referenceAreaM2: 520,
    upkeepPerDay: 1250,
    slots: 3,
    cycleHours: 12,
    rawPerSlot: 1.1,
    supplyCostPerSlot: 1400,
    baseQuality: 0.6,
    heatPerDay: 2.6,
    capacity: 60,
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
  lockup: {
    id: 'lockup',
    kind: 'storage',
    name: 'Lockup Garage',
    blurb: 'A roller door and four walls. The cheapest place to park product near a buyer.',
    icon: 'box',
    cost: 600,
    minAreaM2: 11,
    referenceAreaM2: 45,
    upkeepPerDay: 28,
    heatPerDay: 0.08,
    capacity: 150,
  },
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
  phoneshop: {
    id: 'phoneshop',
    kind: 'front',
    name: 'Phone Shop',
    blurb: 'Unlocks, screens and top-ups out of a unit the size of a hallway.',
    icon: 'phone',
    cost: 1900,
    minAreaM2: 20,
    referenceAreaM2: 55,
    upkeepPerDay: 130,
    revenuePerDay: 400,
    launderPerDay: 2200,
    cut: 0.23,
    heatPerDay: -0.15,
    capacity: 0,
  },
  checkcashing: {
    id: 'checkcashing',
    kind: 'front',
    name: 'Check Cashing',
    blurb: 'Barely earns a thing, but moving cash is the entire business. Washes far above its size.',
    icon: 'note',
    cost: 4200,
    minAreaM2: 26,
    referenceAreaM2: 60,
    upkeepPerDay: 210,
    revenuePerDay: 330,
    launderPerDay: 8600,
    cut: 0.14,
    heatPerDay: 0.1,
    capacity: 0,
  },
  barbershop: {
    id: 'barbershop',
    kind: 'front',
    name: 'Barbershop',
    blurb: 'Cash in, cash out, all day. Small money but the books never look odd.',
    icon: 'scissors',
    cost: 3900,
    minAreaM2: 40,
    referenceAreaM2: 110,
    upkeepPerDay: 230,
    revenuePerDay: 700,
    launderPerDay: 4200,
    cut: 0.21,
    heatPerDay: -0.3,
    capacity: 0,
  },
  carwash: {
    id: 'carwash',
    kind: 'front',
    name: 'Car Wash',
    blurb: 'Needs a forecourt. Enormous laundry capacity for what it costs to run.',
    icon: 'droplet',
    cost: 9400,
    minAreaM2: 260,
    referenceAreaM2: 520,
    upkeepPerDay: 420,
    revenuePerDay: 1180,
    launderPerDay: 12500,
    cut: 0.15,
    heatPerDay: -0.5,
    capacity: 0,
  },
  gym: {
    id: 'gym',
    kind: 'front',
    name: 'Boxing Gym',
    blurb: 'Memberships paid in cash, and the neighbourhood likes having you there.',
    icon: 'dumbbell',
    cost: 11500,
    minAreaM2: 300,
    referenceAreaM2: 600,
    upkeepPerDay: 520,
    revenuePerDay: 1620,
    launderPerDay: 7800,
    cut: 0.2,
    // The best cooling effect in the game: goodwill buys quiet.
    heatPerDay: -1.1,
    capacity: 0,
  },
  nightclub: {
    id: 'nightclub',
    kind: 'front',
    name: 'Nightclub',
    blurb: 'The biggest legal earner there is, on the right street. Draws attention.',
    icon: 'disc',
    cost: 26000,
    minAreaM2: 340,
    referenceAreaM2: 700,
    upkeepPerDay: 1150,
    revenuePerDay: 4200,
    wealthSensitivity: 1.8,
    launderPerDay: 18000,
    cut: 0.16,
    // A club full of people is the one legitimate business police watch.
    heatPerDay: 0.35,
    capacity: 0,
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS);

// --- Couriers ---------------------------------------------------------------
export const COURIERS = {
  runner: {
    id: 'runner',
    name: 'Foot Runner',
    blurb: 'A kid on a corner. Carries almost nothing, but nobody looks twice.',
    cost: 350,
    wagePerDay: 55,
    capacity: 14,
    speedKph: 6,
    stealth: 0.94,
  },
  bike: {
    id: 'bike',
    name: 'Bike Courier',
    blurb: 'Quick through traffic, slips down alleys, barely worth pulling over.',
    cost: 900,
    wagePerDay: 90,
    capacity: 40,
    speedKph: 18,
    stealth: 0.85,
  },
  scooter: {
    id: 'scooter',
    name: 'Delivery Scooter',
    blurb: 'A food-delivery box on the back. Fast, plausible, and hard to tail.',
    cost: 1900,
    wagePerDay: 120,
    capacity: 65,
    speedKph: 34,
    stealth: 0.78,
  },
  sedan: {
    id: 'sedan',
    name: 'Beater Sedan',
    blurb: 'Anonymous and cheap. The honest workhorse of a growing operation.',
    cost: 3400,
    wagePerDay: 165,
    capacity: 140,
    speedKph: 38,
    stealth: 0.62,
  },
  cab: {
    id: 'cab',
    name: 'Livery Cab',
    blurb: 'Belongs everywhere at any hour. Costs a fortune in wages.',
    cost: 6800,
    wagePerDay: 300,
    capacity: 160,
    speedKph: 44,
    stealth: 0.8,
  },
  van: {
    id: 'van',
    name: 'Panel Van',
    blurb: 'Serious capacity, and exactly what police expect to search.',
    cost: 9200,
    wagePerDay: 260,
    capacity: 480,
    speedKph: 32,
    stealth: 0.45,
  },
  boxtruck: {
    id: 'boxtruck',
    name: 'Box Truck',
    blurb: 'Moves a warehouse in one run. Slow, thirsty, impossible to hide.',
    cost: 21000,
    wagePerDay: 430,
    capacity: 1400,
    speedKph: 28,
    stealth: 0.3,
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
  // Price = area x rate-for-that-kind x block rent, with a mild economy of
  // scale so a warehouse doesn't cost twenty rowhouses per square metre.
  pricePerM2: 21,
  scaleBreakM2: 400,   // above this, each extra m² is cheaper
  scaleExponent: 0.88, // <1 = economy of scale
  minPrice: 1200,
  maxPrice: 400000,
  resaleRate: 0.62,
  minAreaM2: 11,
  maxAreaM2: 40000,
  industrialAreaM2: 1400,

  // Buildings stream in by area as you explore — a whole territory is ~50k of
  // them, which is far too much to fetch, draw or save at once.
  // Overpass allows only two concurrent queries per IP, so one large request
  // beats six small ones. These tiles are ~1.3 km across: roughly 1200
  // buildings and a couple of seconds each.
  tileDeg: 0.012,
  tileFetchCap: 4000,
  minZoomForFetch: 16,
  maxTilesPerSweep: 2,
};

// --- Property market --------------------------------------------------------
// Every block has a market index that drifts over time. It responds to what
// you do there: legitimate business and a quiet street lift values, heat and
// rival control sink them. Buy low, clean a block up, sell high.
export const MARKET_PROPERTY = {
  driftPerDay: 0.10,      // how fast the index chases its target
  noisePerDay: 0.018,     // random walk on top
  min: 0.55,
  max: 1.95,
  legitLift: 0.075,       // per legitimate business you run on the block
  heatDrag: 0.45,         // at maximum heat
  rivalDrag: 0.22,        // at full rival control
  repLift: 0.06,          // being known there is mildly good for values
  agentFee: 0.055,        // what a sale costs you
  fitOutScrap: 0.4,       // recovered from equipment when you sell up

  // Letting a building out: quiet, legal, and far less than running something
  // in it yourself — but it costs you nothing and risks nothing.
  rentYieldPerDay: 0.0062,   // share of market value, per day
  rentWealthSwing: 0.5,      // richer blocks pay proportionally more
  tenancyBuyout: 0.35,       // share of a month's rent to end a tenancy early
  rentedMarketLift: 0.03,    // an occupied building helps the block a little
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
