// ---------------------------------------------------------------------------
// Tuning + content definitions. Everything balance-related lives here so the
// game can be re-tuned without touching simulation code.
// ---------------------------------------------------------------------------

// Time. 1x is real time — one game minute is one real minute, so a courier
// crossing three kilometres of city takes exactly as long as that drive takes
// in the world, and the map reads like watching live GPS. Everything above it
// is an explicit multiple of reality, so the number on the button means what
// it says.
//
//   1x      real time            · a 3 km drive takes ~9 min · a day in 24 h
//   10x     ten times reality    · ~56 s                     · a day in 2.4 h
//   60x     a minute a second    · ~9 s                      · a day in 24 min
//   300x                         · ~2 s                      · a day in 5 min
//   1000x   for long hauls       · under a second            · a day in 90 s
export const GAME_MINUTES_PER_REAL_SECOND = 1 / 60;
export const TICK_MS = 100;
export const SPEEDS = [0, 1, 10, 60, 300, 1000];

/** What each speed means in plain terms, for the button tooltips. */
export const SPEED_NOTES = {
  0: 'Paused',
  1: 'Real time — a drive takes as long as the drive',
  10: 'Ten times real — a day in 2.4 hours',
  60: 'A minute every second — a day in 24 minutes',
  300: 'A day in 5 minutes',
  1000: 'A day in 90 seconds',
};

export const START_CASH_DIRTY = 0;
export const START_CASH_CLEAN = 30000;

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
  coke: {
    id: 'coke',
    name: 'Cocaine',
    short: 'SNOW',
    color: '#e6f0ff',
    rawName: 'Coca Paste',
    packName: 'Grams',
    packsPerRaw: 7,
    basePrice: 118,
    heatPerPackSold: 0.55,
    demandBase: [0.15, 1.4],
    // Follows money more than population — it is a wealthy market's drug.
    regionBoost: { us: 1.5, gb: 1.6, au: 1.5, nl: 1.4, es: 1.4, ae: 1.3 },
    regionPenalty: 0.55,
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
    maxAreaM2: 650,
    referenceAreaM2: 130,
    areaExponent: 0.85,
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
    maxAreaM2: 520,
    referenceAreaM2: 130,
    areaExponent: 0.85,
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
    maxAreaM2: 35,
    referenceAreaM2: 40,
    areaExponent: 0.85,
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
    maxAreaM2: 400,
    referenceAreaM2: 160,
    areaExponent: 0.7,
    upkeepPerDay: 240,
    slots: 3,
    cycleHours: 7,
    rawPerSlot: 2.0,
    supplyCostPerSlot: 190,
    baseQuality: 0.55,
    heatPerDay: 0.55,
    capacity: 100,
  },
  proof_house: {
    id: 'proof_house',
    kind: 'processing',
    name: 'Proof House',
    blurb: 'Where a receiver becomes a weapon: headspace checked, proof rounds fired, function tested, then packed. Nothing leaves a shop without going through one.',
    icon: 'gun',
    handles: ['iron'],
    unlock: { properties: 8, cash: 210000 },
    cost: 26000,
    minAreaM2: 180,
    maxAreaM2: 1600,
    referenceAreaM2: 480,
    areaExponent: 0.7,
    upkeepPerDay: 640,
    rawPerHour: 2.1,
    costPerRaw: 26,
    qualityBonus: 0.14,
    // A range under a roof is loud, and people notice loud.
    heatPerDay: 0.9,
    capacity: 220,
  },
  bottling: {
    id: 'bottling',
    kind: 'processing',
    name: 'Bottling Line',
    blurb: 'Counts, bottles, seals and labels. The same tablet in a printed bottle with a batch number is worth far more than one in a bag — and it is what a pill press should be feeding.',
    icon: 'flask',
    // The premium route for tablets: dearer to open and slower to reach than a
    // press on its own, and worth it in what comes out.
    handles: ['pills'],
    unlock: { properties: 10, cash: 340000 },
    cost: 38000,
    minAreaM2: 220,
    maxAreaM2: 2400,
    referenceAreaM2: 620,
    areaExponent: 0.85,
    upkeepPerDay: 890,
    rawPerHour: 7.5,
    costPerRaw: 7,
    qualityBonus: 0.2,
    heatPerDay: 0.4,
    capacity: 600,
  },
  coca_plot: {
    id: 'coca_plot',
    kind: 'production',
    name: 'Coca Plot',
    blurb: 'Terraced rows under shade cloth. Leaf is picked, macerated and worked into paste on site.',
    icon: 'leaf',
    unlock: { properties: 12, cash: 520000 },
    cost: 34000,
    product: 'coke',
    minAreaM2: 1200,
    maxAreaM2: 120000,
    referenceAreaM2: 4000,
    areaExponent: 0.95,
    upkeepPerDay: 1450,
    slots: 5,
    cycleHours: 36,
    rawPerSlot: 5.2,
    supplyCostPerSlot: 480,
    baseQuality: 0.55,
    heatPerDay: 1.4,
    capacity: 800,
  },
  wash_house: {
    id: 'wash_house',
    kind: 'processing',
    name: 'Wash House',
    blurb: 'Paste in, base out: acid, solvent and a great deal of patience. The step that decides what the finished article is worth.',
    icon: 'flask',
    handles: ['coke'],
    unlock: { properties: 13, cash: 640000 },
    cost: 62000,
    minAreaM2: 260,
    maxAreaM2: 2600,
    referenceAreaM2: 700,
    areaExponent: 0.7,
    upkeepPerDay: 2100,
    rawPerHour: 3.4,
    costPerRaw: 34,
    qualityBonus: 0.22,
    heatPerDay: 2.2,
    capacity: 340,
  },
  poppy_field: {
    id: 'poppy_field',
    kind: 'production',
    name: 'Poppy Field',
    blurb: 'Rows of papaver under polytunnels, scored by hand and bled for latex. Wants land, not a room.',
    icon: 'leaf',
    product: 'pills',
    unlock: { properties: 8, cash: 190000 },
    cost: 21000,
    minAreaM2: 900,
    maxAreaM2: 90000,
    referenceAreaM2: 3000,
    areaExponent: 0.95,
    upkeepPerDay: 680,
    slots: 5,
    cycleHours: 30,
    rawPerSlot: 6.5,
    supplyCostPerSlot: 210,
    baseQuality: 0.55,
    heatPerDay: 0.9,
    capacity: 900,
  },
  pill_press: {
    id: 'pill_press',
    kind: 'processing',
    name: 'Pill Press',
    blurb: 'Takes raw opium latex and turns it into tablets. Punch and die, a hopper, and a smell that carries.',
    icon: 'pill',
    handles: ['pills'],
    unlock: { properties: 6, cash: 120000 },
    cost: 14500,
    minAreaM2: 120,
    maxAreaM2: 850,
    referenceAreaM2: 260,
    areaExponent: 0.6,
    upkeepPerDay: 520,
    rawPerHour: 5.5,
    costPerRaw: 9,
    qualityBonus: 0.1,
    heatPerDay: 1.1,
    capacity: 150,
  },
  gunsmith: {
    id: 'gunsmith',
    kind: 'production',
    name: 'Licensed Gunsmith',
    blurb: 'Serialised receivers, marked to standard, every unit in the bound book. Costs more and yields less than a back room, but nobody kicks the door in.',
    icon: 'gun',
    product: 'iron',
    unlock: { properties: 7, cash: 180000 },
    cost: 52000,
    minAreaM2: 200,
    maxAreaM2: 1900,
    referenceAreaM2: 520,
    areaExponent: 0.65,
    upkeepPerDay: 1900,
    slots: 3,
    cycleHours: 16,
    rawPerSlot: 0.85,
    supplyCostPerSlot: 2100,
    baseQuality: 0.82,
    // Doing it properly is quiet. That is the whole point of the licence.
    heatPerDay: 0.35,
    capacity: 90,
    // Needs an FFL 07 to run at all; checked in the sim, not hidden from view.
    needsLicence: 'ffl07',
  },
  gun_store: {
    id: 'gun_store',
    kind: 'front',
    name: 'Gun Store',
    blurb: 'A counter, a bound book and a background check. Sells finished units at legal prices, straight into clean money.',
    icon: 'shop',
    unlock: { properties: 6, cash: 120000 },
    cost: 34000,
    minAreaM2: 90,
    maxAreaM2: 600,
    referenceAreaM2: 260,
    areaExponent: 0.8,
    upkeepPerDay: 620,
    // Ammunition, optics, range time and transfers — a gun shop is a real shop
    // before it is anything else.
    revenuePerDay: 1450,
    wealthSensitivity: 0.8,
    cut: 0.14,
    launderPerDay: 2600,
    heatPerDay: 0.1,
    capacity: 140,
    needsLicence: 'ffl01',
    // The legal counter. Sells iron lawfully rather than washing money.
    sellsLegally: 'iron',
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
    maxAreaM2: 2200,
    referenceAreaM2: 520,
    areaExponent: 0.65,
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
    maxAreaM2: 900,
    referenceAreaM2: 420,
    areaExponent: 0.6,
    upkeepPerDay: 210,
    // Organics only. Firearms go to a proof house and pills to a bottling
    // line — a lab that trims cannabis has no business testing a receiver.
    handles: ['weed', 'shrooms', 'hash'],
    rawPerHour: 3.2, // raw units consumed per game hour
    costPerRaw: 12,
    qualityBonus: 0.15,
    heatPerDay: 0.35,
    capacity: 400, // packaged units held on site
  },
  stash: {
    id: 'stash',
    kind: 'storage',
    name: 'Stash House',
    blurb: 'Buffer storage close to your customers — and it can serve the block itself, so you don\u2019t need a courier for the last hop.',
    sellsPerHour: 9,
    icon: 'box',
    cost: 1500,
    minAreaM2: 90,
    maxAreaM2: 850,
    referenceAreaM2: 320,
    areaExponent: 1.0,
    upkeepPerDay: 65,
    heatPerDay: 0.15,
    capacity: 600,
  },
  // --- Legitimate businesses ------------------------------------------------
  // These earn CLEAN money on their own, slowly and safely, and they wash
  // street cash on the side. They're never raided and they cool a block down.
  // Legal income is the patient way to afford property; the chain is the fast
  // way, and it costs you heat.
  hq: {
    id: 'hq',
    kind: 'hq',
    name: 'Headquarters',
    blurb: 'Somewhere that is yours. People know where to find you, and the block stays calmer because of who you know.',
    icon: 'star',
    cost: 0,
    minAreaM2: 20,
    maxAreaM2: 2400,
    referenceAreaM2: 120,
    areaExponent: 0.5,
    upkeepPerDay: 40,
    heatPerDay: 0,
    capacity: 0,
  },
  depot: {
    id: 'depot',
    kind: 'depot',
    name: 'Depot',
    blurb: 'Somewhere for the fleet to sit. Only goes on a car park, and how many vehicles you can run is however many spaces it has.',
    icon: 'box',
    // Only fits on parking; the size of the lot decides the size of the fleet.
    requiresKind: 'parking',
    cost: 900,
    minAreaM2: 40,
    maxAreaM2: 80000,
    referenceAreaM2: 400,
    areaExponent: 1,
    upkeepPerDay: 90,
    heatPerDay: 0.2,
    capacity: 0,
  },
  lockup: {
    id: 'lockup',
    kind: 'storage',
    name: 'Lockup Garage',
    blurb: 'A roller door and four walls. The cheapest place to park product near a buyer, and it can serve the block itself.',
    sellsPerHour: 3.5,
    icon: 'box',
    cost: 600,
    minAreaM2: 11,
    maxAreaM2: 60,
    referenceAreaM2: 45,
    areaExponent: 1.0,
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
    maxAreaM2: 300,
    referenceAreaM2: 120,
    areaExponent: 0.65,
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
    maxAreaM2: 520,
    referenceAreaM2: 200,
    areaExponent: 0.9,
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
    maxAreaM2: 1300,
    referenceAreaM2: 430,
    areaExponent: 0.95,
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
    maxAreaM2: 360,
    referenceAreaM2: 150,
    areaExponent: 0.75,
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
    maxAreaM2: 150,
    referenceAreaM2: 55,
    areaExponent: 0.55,
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
    maxAreaM2: 140,
    referenceAreaM2: 60,
    areaExponent: 0.5,
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
    maxAreaM2: 210,
    referenceAreaM2: 110,
    areaExponent: 0.8,
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
    maxAreaM2: 1600,
    referenceAreaM2: 520,
    areaExponent: 0.9,
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
    maxAreaM2: 1600,
    referenceAreaM2: 600,
    areaExponent: 0.95,
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
    maxAreaM2: 2600,
    referenceAreaM2: 700,
    areaExponent: 1.0,
    upkeepPerDay: 1150,
    revenuePerDay: 4200,
    wealthSensitivity: 1.8,
    launderPerDay: 18000,
    cut: 0.16,
    // A club full of people is the one legitimate business police watch.
    heatPerDay: 0.35,
    capacity: 0,
  },

  research_lab: {
    id: 'research_lab',
    kind: 'research',
    name: 'R&D Facility',
    blurb: 'Benches, glassware and people who read. Develops new product properly, and every so often the work throws off something nobody else has.',
    icon: 'flask',
    unlock: { properties: 11, cash: 420000 },
    cost: 96000,
    minAreaM2: 320,
    maxAreaM2: 3200,
    referenceAreaM2: 760,
    areaExponent: 0.8,
    upkeepPerDay: 3100,
    heatPerDay: 0.2,
    capacity: 0,
  },

  pawnshop: {
    id: 'pawnshop',
    kind: 'front',
    name: 'Pawn Shop',
    blurb: 'Cash over the counter all day, and nobody blinks at a bundle of notes. One of the best books there is for the money.',
    icon: 'shop',
    cost: 9800,
    minAreaM2: 55,
    maxAreaM2: 400,
    referenceAreaM2: 180,
    areaExponent: 0.85,
    upkeepPerDay: 260,
    revenuePerDay: 900,
    wealthSensitivity: 0.6,
    launderPerDay: 7200,
    cut: 0.2,
    heatPerDay: 0.16,
    capacity: 0,
  },
  takeaway: {
    id: 'takeaway',
    kind: 'front',
    name: 'Takeaway',
    blurb: 'Small margins, long hours and a till that never stops. Cash in, cash out, all of it plausible.',
    icon: 'shop',
    cost: 7400,
    minAreaM2: 45,
    maxAreaM2: 320,
    referenceAreaM2: 140,
    areaExponent: 0.8,
    upkeepPerDay: 300,
    revenuePerDay: 820,
    wealthSensitivity: 0.7,
    launderPerDay: 5400,
    cut: 0.19,
    heatPerDay: 0.1,
    capacity: 0,
  },
  tattoo: {
    id: 'tattoo',
    name: 'Tattoo Studio',
    kind: 'front',
    blurb: 'Appointments, deposits and no stock to account for. Quiet, cash-heavy and cheap to run.',
    icon: 'shop',
    cost: 6200,
    minAreaM2: 40,
    maxAreaM2: 240,
    referenceAreaM2: 110,
    areaExponent: 0.75,
    upkeepPerDay: 190,
    revenuePerDay: 700,
    wealthSensitivity: 1.1,
    launderPerDay: 4100,
    cut: 0.17,
    heatPerDay: 0.08,
    capacity: 0,
  },
  minicab: {
    id: 'minicab',
    kind: 'front',
    name: 'Minicab Office',
    blurb: 'Fares, accounts and drivers on the road at every hour. Useful cover for people going places.',
    icon: 'car',
    cost: 11500,
    minAreaM2: 50,
    maxAreaM2: 500,
    referenceAreaM2: 190,
    areaExponent: 0.8,
    upkeepPerDay: 420,
    revenuePerDay: 1250,
    wealthSensitivity: 0.9,
    launderPerDay: 8800,
    cut: 0.18,
    heatPerDay: 0.14,
    capacity: 0,
  },
  storage_units: {
    id: 'storage_units',
    kind: 'front',
    name: 'Self Storage',
    blurb: 'Rent by the month, paid up front, and nobody asks what is behind the shutters.',
    icon: 'box',
    unlock: { properties: 8, cash: 200000 },
    cost: 46000,
    minAreaM2: 600,
    maxAreaM2: 9000,
    referenceAreaM2: 1400,
    areaExponent: 0.95,
    upkeepPerDay: 1250,
    revenuePerDay: 3300,
    wealthSensitivity: 0.8,
    launderPerDay: 21000,
    cut: 0.12,
    heatPerDay: 0.1,
    capacity: 0,
  },

  // --- Corporate tier -------------------------------------------------------
  //
  // The design note put it plainly: setting up in Times Square should cost a
  // great deal more than Long Island, because of the floorplate and the height.
  // These need both — a big building with real storeys, on an expensive block —
  // and they pay accordingly. The property market already prices the address;
  // these are what you put in it once you can afford one.

  holding_co: {
    id: 'holding_co',
    kind: 'front',
    name: 'Property Holding Company',
    blurb: 'A name on a brass plate and a portfolio behind it. Rent from everything you let comes in bigger, and the books absorb a great deal.',
    icon: 'bank',
    unlock: { properties: 14, cash: 900000 },
    cost: 210000,
    minAreaM2: 420,
    maxAreaM2: 4200,
    referenceAreaM2: 900,
    areaExponent: 0.9,
    upkeepPerDay: 4200,
    revenuePerDay: 6800,
    wealthSensitivity: 1.6,
    launderPerDay: 42000,
    cut: 0.11,
    heatPerDay: 0.12,
    capacity: 0,
    // What makes it corporate rather than just expensive.
    rentBonus: 0.22,
  },
  members_club: {
    id: 'members_club',
    kind: 'front',
    name: "Private Members' Club",
    blurb: 'Subscriptions, a dining room and nobody at the door taking names. The largest legitimate earner in the game, on the right address.',
    icon: 'disc',
    unlock: { properties: 18, cash: 1600000 },
    cost: 340000,
    minAreaM2: 620,
    maxAreaM2: 6500,
    referenceAreaM2: 1400,
    areaExponent: 1.0,
    upkeepPerDay: 7600,
    revenuePerDay: 14500,
    wealthSensitivity: 2.4,
    launderPerDay: 58000,
    cut: 0.13,
    heatPerDay: 0.28,
    capacity: 0,
  },
  terminal: {
    id: 'terminal',
    kind: 'storage',
    name: 'Logistics Terminal',
    blurb: 'Racking, dock doors and a yard. Holds more than anything else and turns vehicles round in a fraction of the time.',
    icon: 'box',
    unlock: { properties: 16, cash: 1100000 },
    cost: 265000,
    minAreaM2: 1200,
    maxAreaM2: 60000,
    referenceAreaM2: 2600,
    areaExponent: 1.0,
    upkeepPerDay: 5400,
    heatPerDay: 0.5,
    capacity: 5200,
    // A terminal is a hub, not a shop front — it holds, it doesn't sell.
    sellsPerHour: 0,
  },
  pharma_plant: {
    id: 'pharma_plant',
    kind: 'processing',
    name: 'Pharmaceutical Plant',
    blurb: 'Reactors, a clean suite and a quality lab. Processes at a scale no back-room operation can touch, and the product is consistent.',
    icon: 'flask',
    unlock: { properties: 20, cash: 2200000 },
    cost: 480000,
    minAreaM2: 1500,
    maxAreaM2: 42000,
    referenceAreaM2: 3200,
    areaExponent: 0.85,
    upkeepPerDay: 11200,
    rawPerHour: 46,
    costPerRaw: 24,
    qualityBonus: 0.26,
    heatPerDay: 1.6,
    capacity: 3400,
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS);

// --- Couriers ---------------------------------------------------------------
// Speeds are door-to-door city averages, not cruising speeds — traffic, lights
// and finding somewhere to stop are most of a short trip. The load/unload
// minutes matter more than speed on a route of a few hundred metres, which is
// exactly how real delivery work behaves.
// Travel time comes from OSRM's own estimate for driving these actual roads.
// `paceFactor` is how this vehicle compares to that baseline car: under 1 is
// quicker, over 1 is slower. A semi is not just a big van — it is genuinely
// slower through a city, and a runner is walking.
//
// `class` groups vehicles for upgrades, so a truck tier never appears on a bike.
// Drivers are hired separately from the vehicles they drive. Each one you take
// on is harder to find than the last — the people willing to do this work, and
// keep quiet about it, are not an unlimited supply.
export const DRIVERS = {
  baseHireFee: 1200,
  hireGrowth: 1.30,   // each additional driver costs this much more to bring in
  baseWagePerDay: 130,
  wageGrowth: 1.06,   // and asks a little more to stay
  maxRoster: 24,
};

// Vehicle classes, and what each is for.
export const COURIER_CLASSES = {
  foot:     { id: 'foot',     name: 'On foot',      note: 'Slow and tiny, but invisible.' },
  twowheel: { id: 'twowheel', name: 'Two wheels',   note: 'Cuts through traffic, carries little.' },
  car:      { id: 'car',      name: 'Cars',         note: 'The everyday backbone of a fleet.' },
  van:      { id: 'van',      name: 'Vans',         note: 'Real capacity, and real attention.' },
  truck:    { id: 'truck',    name: 'Trucks',       note: 'Moves everything, slowly, in plain sight.' },
  air:      { id: 'air',      name: 'Air',          note: 'Ignores roads entirely. Barely carries anything.' },
};

// Travel time comes from OSRM's own estimate for driving these actual roads.
// `paceFactor` compares this vehicle to that baseline car: under 1 is quicker.
// A semi is not just a big van — it is genuinely slower through a city, and a
// runner is walking. Anything marked `direct` ignores the road network and
// flies straight, which wins wherever streets detour.
export const COURIERS = {
  // --- On foot -------------------------------------------------------------
  runner: {
    id: 'runner', name: 'Foot Runner', class: 'foot',
    blurb: 'Walking pace. Carries almost nothing, and nobody looks twice.',
    cost: 350, upkeepPerDay: 4, capacity: 14,
    paceFactor: 7.5, loadMinutes: 6, unloadMinutes: 5, stealth: 0.94,
  },
  jogger: {
    id: 'jogger', name: 'Runner in Lycra', class: 'foot',
    blurb: 'Running gear and a hydration pack. Quicker, and reads as exercise.',
    cost: 900, upkeepPerDay: 6, capacity: 22,
    paceFactor: 5.2, loadMinutes: 7, unloadMinutes: 6, stealth: 0.96,
  },
  // --- Two wheels ----------------------------------------------------------
  bike: {
    id: 'bike', name: 'Bike Courier', class: 'twowheel',
    blurb: 'Through traffic and down alleys. Barely worth pulling over.',
    cost: 900, upkeepPerDay: 8, capacity: 40,
    paceFactor: 1.9, loadMinutes: 12, unloadMinutes: 9, stealth: 0.85,
  },
  ebike: {
    id: 'ebike', name: 'E-Bike', class: 'twowheel',
    blurb: 'A bike that keeps up with traffic and still uses the cycle lane.',
    cost: 2200, upkeepPerDay: 14, capacity: 55,
    paceFactor: 1.3, loadMinutes: 13, unloadMinutes: 10, stealth: 0.86,
  },
  scooter: {
    id: 'scooter', name: 'Delivery Scooter', class: 'twowheel',
    blurb: 'A food-delivery box on the back. Quick, plausible, hard to tail.',
    cost: 1900, upkeepPerDay: 18, capacity: 65,
    paceFactor: 1.0, loadMinutes: 15, unloadMinutes: 11, stealth: 0.78,
  },
  motorcycle: {
    id: 'motorcycle', name: 'Motorcycle', class: 'twowheel',
    blurb: 'Nothing in a city is faster. Nothing carries less for the money.',
    cost: 7800, upkeepPerDay: 40, capacity: 45,
    paceFactor: 0.68, loadMinutes: 11, unloadMinutes: 8, stealth: 0.5,
  },
  // --- Cars ----------------------------------------------------------------
  hatchback: {
    id: 'hatchback', name: 'Compact Hatchback', class: 'car',
    blurb: 'The cheapest four wheels that will do the job. Utterly forgettable.',
    cost: 2100, upkeepPerDay: 22, capacity: 95,
    paceFactor: 1.05, loadMinutes: 18, unloadMinutes: 13, stealth: 0.7,
  },
  sedan: {
    id: 'sedan', name: 'Beater Sedan', class: 'car',
    blurb: 'Anonymous and cheap. The honest workhorse of a growing operation.',
    cost: 3400, upkeepPerDay: 30, capacity: 140,
    paceFactor: 1.0, loadMinutes: 22, unloadMinutes: 16, stealth: 0.62,
  },
  cab: {
    id: 'cab', name: 'Livery Cab', class: 'car',
    blurb: 'Belongs anywhere at any hour. Costs a fortune in wages.',
    cost: 6800, upkeepPerDay: 55, capacity: 160,
    paceFactor: 0.92, loadMinutes: 18, unloadMinutes: 13, stealth: 0.8,
  },
  suv: {
    id: 'suv', name: 'SUV', class: 'car',
    blurb: 'School-run bodywork with a boot you can live out of.',
    cost: 11500, upkeepPerDay: 48, capacity: 300,
    paceFactor: 1.06, loadMinutes: 24, unloadMinutes: 18, stealth: 0.74,
  },
  luxury: {
    id: 'luxury', name: 'Executive Saloon', class: 'car',
    blurb: 'Tinted, immaculate and expensive. Nobody stops it, and everyone remembers it.',
    cost: 32000, upkeepPerDay: 120, capacity: 180,
    paceFactor: 0.85, loadMinutes: 16, unloadMinutes: 12, stealth: 0.9,
  },
  sportscar: {
    id: 'sportscar', name: 'Sports Car', class: 'car',
    blurb: 'The fastest thing you own and the least room in it. Remembered by everyone who sees it.',
    cost: 24000, upkeepPerDay: 95, capacity: 55,
    paceFactor: 0.72, loadMinutes: 10, unloadMinutes: 8, stealth: 0.35,
  },
  // --- Vans ----------------------------------------------------------------
  minivan: {
    id: 'minivan', name: 'Minivan', class: 'van',
    blurb: 'School run camouflage with the seats out. Real capacity, ordinary pace.',
    cost: 5600, upkeepPerDay: 38, capacity: 260,
    paceFactor: 1.1, loadMinutes: 28, unloadMinutes: 20, stealth: 0.72,
  },
  van: {
    id: 'van', name: 'Panel Van', class: 'van',
    blurb: 'Serious capacity, and exactly what police expect to search.',
    cost: 9200, upkeepPerDay: 52, capacity: 480,
    paceFactor: 1.25, loadMinutes: 38, unloadMinutes: 28, stealth: 0.45,
  },
  chiller: {
    id: 'chiller', name: 'Refrigerated Van', class: 'van',
    blurb: 'Cold, sealed and nobody wants to stand in it. Keeps product at its best.',
    cost: 16000, upkeepPerDay: 78, capacity: 420,
    paceFactor: 1.28, loadMinutes: 42, unloadMinutes: 30, stealth: 0.68,
    // A chilled load arrives in the condition it left in.
    preservesQuality: true,
  },
  luton: {
    id: 'luton', name: 'Luton Van', class: 'van',
    blurb: 'A box on a van chassis. Removals by day, and by night.',
    cost: 19000, upkeepPerDay: 84, capacity: 820,
    paceFactor: 1.35, loadMinutes: 48, unloadMinutes: 35, stealth: 0.5,
  },
  // --- Trucks --------------------------------------------------------------
  pickup: {
    id: 'pickup', name: 'Pickup Truck', class: 'truck',
    blurb: 'A trade truck with a covered bed. Belongs on any site in the country.',
    cost: 8400, upkeepPerDay: 44, capacity: 340,
    paceFactor: 1.1, loadMinutes: 26, unloadMinutes: 19, stealth: 0.66,
  },
  boxtruck: {
    id: 'boxtruck', name: 'Box Truck', class: 'truck',
    blurb: 'Moves a warehouse in one run. Slow, and impossible to hide.',
    cost: 21000, upkeepPerDay: 110, capacity: 1700,
    paceFactor: 1.5, loadMinutes: 65, unloadMinutes: 48, stealth: 0.34,
  },
  flatbed: {
    id: 'flatbed', name: 'Flatbed', class: 'truck',
    blurb: 'Strapped pallets under a tarp. Loads and unloads faster than anything its size, and hides nothing at all.',
    cost: 27000, upkeepPerDay: 118, capacity: 1250,
    paceFactor: 1.45, loadMinutes: 45, unloadMinutes: 34,
    // The load is literally in open view — the least discreet thing you can run.
    stealth: 0.12,
  },
  semi: {
    id: 'semi', name: 'Semi Truck', class: 'truck',
    blurb: 'Everything you own in one trailer. Crawls through a city and can be seen from orbit.',
    cost: 68000, upkeepPerDay: 190, capacity: 4200,
    paceFactor: 1.95, loadMinutes: 110, unloadMinutes: 80, stealth: 0.18,
  },
  // --- Air -----------------------------------------------------------------
  drone: {
    id: 'drone', name: 'Delivery Drone', class: 'air',
    blurb: 'Straight over everything. Carries almost nothing and cannot be followed.',
    cost: 14000, upkeepPerDay: 16, capacity: 12,
    paceFactor: 1.0, loadMinutes: 4, unloadMinutes: 3, stealth: 0.93,
    direct: true, airKph: 55,
  },
  heavylift: {
    id: 'heavylift', name: 'Heavy-Lift Drone', class: 'air',
    blurb: 'Industrial rotors and a slung crate. Still small, but it ignores every road.',
    cost: 46000, upkeepPerDay: 46, capacity: 70,
    paceFactor: 1.0, loadMinutes: 9, unloadMinutes: 7, stealth: 0.82,
    direct: true, airKph: 38,
  },
};









export const COURIER_IDS = Object.keys(COURIERS);

// --- Heat & enforcement -----------------------------------------------------
// How much calmer your own block runs. You know the neighbours, you smooth
// things over, and heat sheds faster where you actually live.
export const HQ_HEAT_RELIEF = 0.35;

// Crime rate. The design note asked for it to affect market value and to be
// dynamic — partly the neighbourhood, partly what the player is doing to it.
export const CRIME = {
  driftPerDay: 0.16,     // how fast it chases its target
  fromHeat: 0.55,        // your own attention feeds it
  fromRivals: 0.40,      // so does somebody else's crew
  policingRelief: 0.45,  // a well-policed block runs cleaner
  valueDrag: 0.30,       // how much a bad block knocks off property values
  rentDrag: 0.22,        // and off what a tenant will pay
  streetPremium: 0.12,   // rough blocks pay a little more on the street
};

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
  crimeRentDrag: 0.22,       // a rough block lets for less
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
  // A block will hold about half a day of demand as stock before the price
  // starts to go. Eight hours was less than one vehicle-load, so the only
  // delivery a new player could make always cratered its own price.
  saturationHours: 12,
  // The most a block will physically take in: about two days of its own
  // demand. Past the saturation buffer above, the price is already falling.
  glutCap: 48,
  minPriceMultiplier: 0.35,
  // How fast reputation in a district builds and decays.
  repGainPerSale: 0.0016,
  repDecayPerDay: 0.03,
  repPriceBonus: 0.22, // full reputation is worth +22% price
  qualityPriceSwing: 0.55, // quality 0 -> -27%, quality 1 -> +27%
};

export const DISTRICT_RADIUS_KM = 0.62; // hex circumradius
export const DISTRICT_RINGS = 3; // 3 rings = 37 districts
