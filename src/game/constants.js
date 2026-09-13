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
export const START_CASH_CLEAN = 600000;

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
    basePrice: 4096, // $ per packaged unit at neutral demand
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
    basePrice: 4480,
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
    basePrice: 8000,
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
    basePrice: 40823,
    heatPerPackSold: 0.55,
    demandBase: [0.15, 1.4],
    // Follows money more than population — it is a wealthy market's drug.
    regionBoost: { us: 1.5, gb: 1.6, au: 1.5, nl: 1.4, es: 1.4, ae: 1.3 },
    regionPenalty: 0.55,
  },
  meth: {
    id: 'meth',
    name: 'Methamphetamine',
    short: 'CRYS',
    color: '#9fe8f5',
    rawName: 'Precursor',
    packName: 'Shards',
    packsPerRaw: 6,
    basePrice: 18144,
    heatPerPackSold: 0.42,
    demandBase: [0.2, 1.9],
    // Rural and post-industrial markets, more than city centres.
    regionBoost: { us: 1.8, cz: 1.6, th: 1.5, au: 1.5, mx: 1.7 },
    regionPenalty: 0.6,
  },
  acid: {
    id: 'acid',
    name: 'LSD',
    short: 'ACID',
    color: '#ffd166',
    rawName: 'Crude Ergot',
    packName: 'Sheets',
    packsPerRaw: 14,
    basePrice: 9000,
    // Almost nothing by weight, so almost nothing to find.
    heatPerPackSold: 0.06,
    demandBase: [0.08, 0.9],
    regionBoost: { us: 1.3, gb: 1.4, nl: 1.4, de: 1.3 },
    regionPenalty: 0.7,
  },
  ket: {
    id: 'ket',
    name: 'Ketamine',
    short: 'KET',
    color: '#c9b6ff',
    rawName: 'Diverted Stock',
    packName: 'Grams',
    packsPerRaw: 8,
    basePrice: 24948,
    heatPerPackSold: 0.18,
    demandBase: [0.12, 1.5],
    regionBoost: { gb: 1.9, cn: 1.5, in: 1.4, nl: 1.3, au: 1.2 },
    regionPenalty: 0.65,
  },
  pills: {
    id: 'pills',
    name: 'Pills',
    short: 'PILL',
    color: '#63b9d4',
    rawName: 'Raw Batch',
    packName: 'Baggies',
    packsPerRaw: 9,
    basePrice: 22500,
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
    basePrice: 1500,
    // By far the hottest thing you can move.
    heatPerPackSold: 0.85,
    demandBase: [0.05, 0.5],
    // Demand tracks how armed a society already is.
    regionBoost: { us: 2.4, br: 1.7, za: 1.6, mx: 1.6, ph: 1.4 },
    regionPenalty: 0.35, // everywhere else: a thin, dangerous trade
  },
  // --- More to make ---------------------------------------------------------
  // Priced per pound on the same researched basis as the originals, and spread
  // deliberately from cheap-and-heavy to tiny-and-valuable, because that spread
  // is what makes choosing between them a decision.
  heroin: {
    id: 'heroin',
    name: 'Heroin',
    short: 'H',
    color: '#a8896b',
    rawName: 'Raw Opium',
    packName: 'Bags',
    packsPerRaw: 5,
    basePrice: 36000,           // ~$80/g street
    heatPerPackSold: 0.62,
    demandBase: [0.1, 1.2],
    regionBoost: { us: 1.5, gb: 1.3, ru: 1.6, af: 1.2 },
    regionPenalty: 0.6,
  },
  fentanyl: {
    id: 'fentanyl',
    name: 'Fentanyl',
    short: 'FENT',
    color: '#d64f6a',
    rawName: 'Precursor Batch',
    packName: 'Grams',
    packsPerRaw: 12,
    // Almost nothing by weight goes an enormous way, which is exactly why it
    // is worth this much and draws this much attention.
    basePrice: 120000,
    heatPerPackSold: 0.95,
    demandBase: [0.04, 0.5],
    regionBoost: { us: 2.2, ca: 1.6 },
    regionPenalty: 0.4,
  },
  crack: {
    id: 'crack',
    name: 'Crack',
    short: 'ROCK',
    color: '#e8dcc8',
    rawName: 'Cooked Batch',
    packName: 'Rocks',
    packsPerRaw: 9,
    basePrice: 30000,
    heatPerPackSold: 0.7,
    // Sells faster and in smaller amounts than powder — more volume, more heat.
    demandBase: [0.3, 2.4],
    regionBoost: { us: 1.9, gb: 1.4, br: 1.3, za: 1.3 },
    regionPenalty: 0.5,
  },
  benzos: {
    id: 'benzos',
    name: 'Benzodiazepines',
    short: 'BENZ',
    color: '#8fc7e8',
    rawName: 'Bulk Powder',
    packName: 'Strips',
    packsPerRaw: 11,
    basePrice: 5000,
    heatPerPackSold: 0.12,
    demandBase: [0.4, 2.8],
    regionBoost: { gb: 1.7, us: 1.4, ie: 1.5 },
  },
  oxy: {
    id: 'oxy',
    name: 'Oxycodone',
    short: 'OXY',
    color: '#c9a0dc',
    rawName: 'Diverted Stock',
    packName: 'Bottles',
    packsPerRaw: 6,
    basePrice: 30000,
    heatPerPackSold: 0.4,
    demandBase: [0.2, 1.6],
    regionBoost: { us: 2.1, ca: 1.5 },
    regionPenalty: 0.45,
  },
  roids: {
    id: 'roids',
    name: 'Anabolic Steroids',
    short: 'GEAR',
    color: '#7fd4a8',
    rawName: 'Raw Hormone',
    packName: 'Vials',
    packsPerRaw: 8,
    basePrice: 8000,
    // Barely policed next to everything else on this list.
    heatPerPackSold: 0.05,
    demandBase: [0.3, 2.0],
    regionBoost: { us: 1.4, au: 1.5, gb: 1.3, br: 1.4 },
  },
  dmt: {
    id: 'dmt',
    name: 'DMT',
    short: 'DMT',
    color: '#f2a65a',
    rawName: 'Bark Extract',
    packName: 'Crystal',
    packsPerRaw: 10,
    basePrice: 50000,
    heatPerPackSold: 0.08,
    // A small, dedicated market that pays well and never gets large.
    demandBase: [0.05, 0.6],
    regionBoost: { us: 1.3, nl: 1.5, gb: 1.3 },
    regionPenalty: 0.7,
  },
  spice: {
    id: 'spice',
    name: 'Synthetic Cannabinoid',
    short: 'SPCE',
    color: '#9aa86b',
    rawName: 'Sprayed Base',
    packName: 'Pouches',
    packsPerRaw: 14,
    basePrice: 6000,
    // Cheap, nasty, and it brings the wrong kind of attention.
    heatPerPackSold: 0.5,
    demandBase: [0.4, 3.0],
    regionBoost: { gb: 1.9, us: 1.3, pl: 1.4 },
  },
  shine: {
    id: 'shine',
    name: 'Moonshine',
    short: 'SHNE',
    color: '#e3c766',
    rawName: 'Mash',
    packName: 'Jars',
    packsPerRaw: 7,
    basePrice: 1200,
    // Barely illegal by comparison. High volume, thin margin, nobody cares.
    heatPerPackSold: 0.03,
    demandBase: [0.8, 4.5],
    regionBoost: { us: 1.5, ru: 1.7, za: 1.4, in: 1.3 },
  },

};

export const PRODUCT_IDS = Object.keys(PRODUCTS);

// --- Buildings --------------------------------------------------------------
export const BUILDINGS = {
  grow_house: {
    id: 'grow_house',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Grow Room'], [1.6, 'Grow House'], [3.2, 'Grow Op'], [Infinity, 'Warehouse Grow']],
    kind: 'production',
    name: 'Grow House',
    blurb: 'Runs continuous cannabis cycles. Output is raw and unsellable until cured.',
    icon: 'leaf',
    product: 'weed',
    cost: 26250,
    minAreaM2: 55,
    maxAreaM2: 650,
    referenceAreaM2: 130,
    areaExponent: 1.0,
    upkeepPerDay: 867,
    slots: 4,
    cycleHours: 6,
    rawPerSlot: 2.5,
    supplyCostPerSlot: 11000, // charged at the start of every cycle
    baseQuality: 0.5,
    heatPerDay: 0.6,
    capacity: 120, // raw units it can hold before production stalls
  },
  fungi_room: {
    id: 'fungi_room',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Fruiting Cupboard'], [1.6, 'Fruiting Room'], [Infinity, 'Mushroom Farm']],
    kind: 'production',
    name: 'Fruiting Room',
    blurb: 'Slower cycles, smaller flushes, but the product is worth three times as much.',
    icon: 'spore',
    product: 'shrooms',
    unlock: { properties: 2 },
    cost: 41250,
    minAreaM2: 55,
    maxAreaM2: 520,
    referenceAreaM2: 130,
    areaExponent: 1.0,
    upkeepPerDay: 1167,
    slots: 3,
    cycleHours: 9,
    rawPerSlot: 1.6,
    supplyCostPerSlot: 16500,
    baseQuality: 0.5,
    heatPerDay: 0.5,
    capacity: 80,
  },
  closet_grow: {
    id: 'closet_grow',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[1.2, 'Closet Grow'], [2.2, 'Spare Room Grow'], [Infinity, 'Back Room Grow']],
    kind: 'production',
    name: 'Closet Grow',
    blurb: 'A few lights in a back room. Tiny output, almost no footprint, and nobody notices.',
    icon: 'leaf',
    product: 'weed',
    cost: 8750,
    minAreaM2: 13,
    maxAreaM2: 140,
    referenceAreaM2: 40,
    areaExponent: 1.0,
    upkeepPerDay: 300,
    slots: 2,
    cycleHours: 7,
    rawPerSlot: 1.1,
    supplyCostPerSlot: 6000,
    baseQuality: 0.42,
    heatPerDay: 0.15,
    capacity: 30,
  },
  press_room: {
    id: 'press_room',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.6, 'Hand Press'], [1.1, 'Hash Press'], [Infinity, 'Press Works']],
    kind: 'production',
    name: 'Hash Press',
    blurb: 'Presses trim and resin into slabs. Steady, dense, and worth twice raw flower.',
    icon: 'press',
    product: 'hash',
    unlock: { properties: 3, cash: 3000000 },
    cost: 67500,
    minAreaM2: 70,
    maxAreaM2: 400,
    referenceAreaM2: 160,
    areaExponent: 0.7,
    upkeepPerDay: 1600,
    slots: 3,
    cycleHours: 7,
    rawPerSlot: 2.0,
    supplyCostPerSlot: 19000,
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
    unlock: { properties: 8, cash: 21000000 },
    cost: 325000,
    minAreaM2: 180,
    maxAreaM2: 1600,
    referenceAreaM2: 480,
    areaExponent: 0.7,
    upkeepPerDay: 4267,
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
    handles: ['pills', 'shine', 'roids'],
    unlock: { properties: 10, cash: 34000000 },
    cost: 475000,
    minAreaM2: 220,
    maxAreaM2: 2400,
    referenceAreaM2: 620,
    areaExponent: 0.85,
    upkeepPerDay: 5933,
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
    unlock: { properties: 12, cash: 52000000 },
    cost: 425000,
    product: 'coke',
    minAreaM2: 1200,
    maxAreaM2: 120000,
    referenceAreaM2: 4000,
    areaExponent: 0.95,
    upkeepPerDay: 9667,
    slots: 5,
    cycleHours: 36,
    rawPerSlot: 5.2,
    supplyCostPerSlot: 48000,
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
    handles: ['coke', 'crack'],
    unlock: { properties: 13, cash: 64000000 },
    cost: 775000,
    minAreaM2: 260,
    maxAreaM2: 2600,
    referenceAreaM2: 700,
    areaExponent: 0.7,
    upkeepPerDay: 14000,
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
    unlock: { properties: 8, cash: 19000000 },
    cost: 262500,
    minAreaM2: 900,
    maxAreaM2: 90000,
    referenceAreaM2: 3000,
    areaExponent: 0.95,
    upkeepPerDay: 4533,
    slots: 5,
    cycleHours: 30,
    rawPerSlot: 6.5,
    supplyCostPerSlot: 21000,
    baseQuality: 0.55,
    heatPerDay: 0.9,
    capacity: 900,
  },
  pill_press: {
    id: 'pill_press',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.6, 'Tabletop Press'], [1.1, 'Pill Press'], [Infinity, 'Tablet Plant']],
    kind: 'processing',
    name: 'Pill Press',
    blurb: 'Takes raw opium latex and turns it into tablets. Punch and die, a hopper, and a smell that carries.',
    icon: 'pill',
    handles: ['pills'],
    unlock: { properties: 6, cash: 12000000 },
    cost: 181250,
    minAreaM2: 120,
    maxAreaM2: 850,
    referenceAreaM2: 260,
    areaExponent: 0.6,
    upkeepPerDay: 3467,
    rawPerHour: 5.5,
    costPerRaw: 9,
    qualityBonus: 0.1,
    heatPerDay: 1.1,
    capacity: 150,
  },
  gunsmith: {
    id: 'gunsmith',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.6, 'Workbench'], [1.1, 'Gunsmith'], [Infinity, 'Arms Workshop']],
    kind: 'production',
    name: 'Licensed Gunsmith',
    blurb: 'Serialised receivers, marked to standard, every unit in the bound book. Costs more and yields less than a back room, but nobody kicks the door in.',
    icon: 'gun',
    product: 'iron',
    unlock: { properties: 7, cash: 18000000 },
    cost: 15234,
    minAreaM2: 200,
    maxAreaM2: 1900,
    referenceAreaM2: 520,
    areaExponent: 0.65,
    upkeepPerDay: 297,
    slots: 3,
    cycleHours: 16,
    rawPerSlot: 0.85,
    supplyCostPerSlot: 4922,
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
    unlock: { properties: 6, cash: 12000000 },
    cost: 9961,
    minAreaM2: 90,
    maxAreaM2: 600,
    referenceAreaM2: 260,
    areaExponent: 0.8,
    upkeepPerDay: 97,
    // Ammunition, optics, range time and transfers — a gun shop is a real shop
    // before it is anything else.
    revenuePerDay: 1450,
    wealthSensitivity: 0.8,
    cut: 0.14,
    launderPerDay: 260000,
    heatPerDay: 0.1,
    capacity: 140,
    needsLicence: 'ffl01',
    // The legal counter. Sells iron lawfully rather than washing money.
    sellsLegally: 'iron',
  },
  machine_shop: {
    id: 'machine_shop',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.6, 'Garage Shop'], [1.1, 'Machine Shop'], [Infinity, 'Machine Works']],
    kind: 'production',
    name: 'Machine Shop',
    blurb: 'Turns out untraceable iron. The most valuable thing you can make, and the fastest way to bring the wrong attention.',
    icon: 'gun',
    product: 'iron',
    unlock: { properties: 9, cash: 26000000 },
    cost: 11133,
    minAreaM2: 260,
    maxAreaM2: 2200,
    referenceAreaM2: 520,
    areaExponent: 0.65,
    upkeepPerDay: 195,
    slots: 3,
    cycleHours: 12,
    rawPerSlot: 1.1,
    supplyCostPerSlot: 3281,
    baseQuality: 0.6,
    heatPerDay: 2.6,
    capacity: 60,
  },
  lab: {
    id: 'lab',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.6, 'Trim Room'], [1.1, 'Cutting Lab'], [Infinity, 'Processing Lab']],
    kind: 'processing',
    name: 'Processing Lab',
    blurb: 'Turns raw harvest into packaged product. Your chain is only as fast as this.',
    icon: 'flask',
    cost: 53750,
    minAreaM2: 40,
    maxAreaM2: 900,
    referenceAreaM2: 420,
    areaExponent: 0.6,
    upkeepPerDay: 1400,
    // Organics only. Firearms go to a proof house and pills to a bottling
    // line — a lab that trims cannabis has no business testing a receiver.
    handles: ['weed', 'shrooms', 'hash', 'dmt', 'spice'],
    rawPerHour: 3.2, // raw units consumed per game hour
    costPerRaw: 12,
    qualityBonus: 0.15,
    heatPerDay: 0.35,
    capacity: 400, // packaged units held on site
  },
  stash: {
    id: 'stash',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Stash Spot'], [1.6, 'Stash House'], [Infinity, 'Stash Warehouse']],
    kind: 'storage',
    name: 'Stash House',
    blurb: 'Buffer storage close to your customers — and it can serve the block itself, so you don\u2019t need a courier for the last hop.',
    sellsPerHour: 9,
    icon: 'box',
    cost: 18750,
    minAreaM2: 90,
    maxAreaM2: 850,
    referenceAreaM2: 320,
    areaExponent: 1.0,
    upkeepPerDay: 433,
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
    upkeepPerDay: 267,
    heatPerDay: 0,
    capacity: 0,
  },
  depot: {
    id: 'depot',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Parking Spot'], [1.6, 'Depot'], [Infinity, 'Freight Yard']],
    kind: 'depot',
    name: 'Depot',
    blurb: 'Somewhere for the fleet to sit. Only goes on a car park, and how many vehicles you can run is however many spaces it has.',
    icon: 'box',
    // Only fits on parking; the size of the lot decides the size of the fleet.
    requiresKind: 'parking',
    cost: 11250,
    minAreaM2: 40,
    maxAreaM2: 80000,
    referenceAreaM2: 400,
    areaExponent: 1,
    upkeepPerDay: 600,
    heatPerDay: 0.2,
    capacity: 0,
  },
  lockup: {
    id: 'lockup',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[1.2, 'Lockup'], [Infinity, 'Storage Unit']],
    kind: 'storage',
    name: 'Lockup Garage',
    blurb: 'A roller door and four walls. The cheapest place to park product near a buyer, and it can serve the block itself.',
    sellsPerHour: 3.5,
    icon: 'box',
    cost: 7500,
    minAreaM2: 11,
    maxAreaM2: 140,
    referenceAreaM2: 45,
    areaExponent: 1.0,
    upkeepPerDay: 187,
    heatPerDay: 0.08,
    capacity: 150,
  },
  bodega: {
    id: 'bodega',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Corner Stall'], [1.3, 'Corner Store'], [Infinity, 'Minimart']],
    kind: 'front',
    name: 'Corner Store',
    blurb: 'Small, legal, boring. Turns a modest clean profit and quietly washes street cash.',
    icon: 'store',
    cost: 40000,
    minAreaM2: 45,
    maxAreaM2: 300,
    referenceAreaM2: 120,
    areaExponent: 0.65,
    upkeepPerDay: 1400,
    revenuePerDay: 640,
    launderPerDay: 260000,
    cut: 0.24,
    heatPerDay: -0.25,
    capacity: 0,
  },
  laundromat: {
    id: 'laundromat',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Wash Point'], [1.6, 'Laundromat'], [Infinity, 'Laundry Plant']],
    kind: 'front',
    name: 'Laundromat',
    blurb: 'Thin margins, but nobody blinks at a cash business. Washes far more than it earns.',
    icon: 'washer',
    cost: 65000,
    minAreaM2: 90,
    maxAreaM2: 520,
    referenceAreaM2: 200,
    areaExponent: 0.9,
    upkeepPerDay: 1933,
    revenuePerDay: 810,
    launderPerDay: 620000,
    cut: 0.19,
    heatPerDay: -0.45,
    capacity: 0,
  },
  autoshop: {
    id: 'autoshop',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Lock-up Garage'], [1.6, 'Auto Shop'], [Infinity, 'Body Works']],
    kind: 'front',
    name: 'Auto Shop',
    blurb: 'Needs real space. The best earner you can run legally, and the best laundry.',
    icon: 'wrench',
    cost: 97500,
    minAreaM2: 200,
    maxAreaM2: 1300,
    referenceAreaM2: 430,
    areaExponent: 0.95,
    upkeepPerDay: 2600,
    revenuePerDay: 1320,
    launderPerDay: 920000,
    cut: 0.17,
    heatPerDay: -0.55,
    capacity: 0,
  },
  cafe: {
    id: 'cafe',
    // What it gets called depends on how big the place actually is —
    // a warehouse grow should not read as a closet.
    sizeNames: [[0.7, 'Coffee Cart'], [1.6, 'Coffee Bar'], [Infinity, 'Roastery']],
    kind: 'front',
    name: 'Coffee Bar',
    blurb: 'Lives or dies on the block around it. Excellent on money streets, pointless on poor ones.',
    icon: 'cup',
    cost: 80000,
    minAreaM2: 60,
    maxAreaM2: 360,
    referenceAreaM2: 150,
    areaExponent: 0.75,
    upkeepPerDay: 2333,
    revenuePerDay: 980,
    // Twice as sensitive to how much money lives on the block as the others.
    wealthSensitivity: 2,
    launderPerDay: 340000,
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
    cost: 23750,
    minAreaM2: 20,
    maxAreaM2: 150,
    referenceAreaM2: 55,
    areaExponent: 0.55,
    upkeepPerDay: 867,
    revenuePerDay: 400,
    launderPerDay: 220000,
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
    cost: 52500,
    minAreaM2: 26,
    maxAreaM2: 140,
    referenceAreaM2: 60,
    areaExponent: 0.5,
    upkeepPerDay: 1400,
    revenuePerDay: 330,
    launderPerDay: 860000,
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
    cost: 48750,
    minAreaM2: 40,
    maxAreaM2: 210,
    referenceAreaM2: 110,
    areaExponent: 0.8,
    upkeepPerDay: 1533,
    revenuePerDay: 700,
    launderPerDay: 420000,
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
    cost: 117500,
    minAreaM2: 260,
    maxAreaM2: 1600,
    referenceAreaM2: 520,
    areaExponent: 0.9,
    upkeepPerDay: 2800,
    revenuePerDay: 1180,
    launderPerDay: 1250000,
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
    cost: 143750,
    minAreaM2: 300,
    maxAreaM2: 1600,
    referenceAreaM2: 600,
    areaExponent: 0.95,
    upkeepPerDay: 3467,
    revenuePerDay: 1620,
    launderPerDay: 780000,
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
    cost: 325000,
    minAreaM2: 340,
    maxAreaM2: 2600,
    referenceAreaM2: 700,
    areaExponent: 1.0,
    upkeepPerDay: 7667,
    revenuePerDay: 4200,
    wealthSensitivity: 1.8,
    launderPerDay: 1800000,
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
    unlock: { properties: 11, cash: 42000000 },
    cost: 1200000,
    minAreaM2: 320,
    maxAreaM2: 3200,
    referenceAreaM2: 760,
    areaExponent: 0.8,
    upkeepPerDay: 20667,
    heatPerDay: 0.2,
    capacity: 0,
  },

  pawnshop: {
    id: 'pawnshop',
    kind: 'front',
    name: 'Pawn Shop',
    blurb: 'Cash over the counter all day, and nobody blinks at a bundle of notes. One of the best books there is for the money.',
    icon: 'shop',
    cost: 122500,
    minAreaM2: 55,
    maxAreaM2: 400,
    referenceAreaM2: 180,
    areaExponent: 0.85,
    upkeepPerDay: 1733,
    revenuePerDay: 900,
    wealthSensitivity: 0.6,
    launderPerDay: 720000,
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
    cost: 92500,
    minAreaM2: 45,
    maxAreaM2: 320,
    referenceAreaM2: 140,
    areaExponent: 0.8,
    upkeepPerDay: 2000,
    revenuePerDay: 820,
    wealthSensitivity: 0.7,
    launderPerDay: 540000,
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
    cost: 77500,
    minAreaM2: 40,
    maxAreaM2: 240,
    referenceAreaM2: 110,
    areaExponent: 0.75,
    upkeepPerDay: 1267,
    revenuePerDay: 700,
    wealthSensitivity: 1.1,
    launderPerDay: 410000,
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
    cost: 143750,
    minAreaM2: 50,
    maxAreaM2: 500,
    referenceAreaM2: 190,
    areaExponent: 0.8,
    upkeepPerDay: 2800,
    revenuePerDay: 1250,
    wealthSensitivity: 0.9,
    launderPerDay: 880000,
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
    unlock: { properties: 8, cash: 20000000 },
    cost: 575000,
    minAreaM2: 600,
    maxAreaM2: 9000,
    referenceAreaM2: 1400,
    areaExponent: 0.95,
    upkeepPerDay: 8333,
    revenuePerDay: 3300,
    wealthSensitivity: 0.8,
    launderPerDay: 2100000,
    cut: 0.12,
    heatPerDay: 0.1,
    capacity: 0,
  },

  precursor_lockup: {
    id: 'precursor_lockup',
    kind: 'production',
    name: 'Precursor Lockup',
    blurb: 'Boxes of cold medicine, lithium strips and drain cleaner, bought a little at a time from a lot of places.',
    icon: 'box',
    product: 'meth',
    unlock: { properties: 7, cash: 16000000 },
    cost: 193750,
    minAreaM2: 60,
    maxAreaM2: 700,
    referenceAreaM2: 200,
    areaExponent: 0.7,
    upkeepPerDay: 2800,
    slots: 4,
    cycleHours: 9,
    rawPerSlot: 2.2,
    supplyCostPerSlot: 32000,
    baseQuality: 0.5,
    heatPerDay: 1.2,
    capacity: 320,
  },
  meth_cook: {
    id: 'meth_cook',
    kind: 'processing',
    name: 'Cook House',
    blurb: 'Glassware, a heat source and no ventilation worth the name. The most dangerous room you will ever own.',
    icon: 'flask',
    handles: ['meth'],
    unlock: { properties: 8, cash: 24000000 },
    cost: 300000,
    minAreaM2: 90,
    maxAreaM2: 900,
    referenceAreaM2: 260,
    areaExponent: 0.65,
    upkeepPerDay: 5200,
    rawPerHour: 4.2,
    costPerRaw: 22,
    qualityBonus: 0.16,
    // Everybody within two streets knows what this is.
    heatPerDay: 3.1,
    capacity: 420,
  },
  ergot_culture: {
    id: 'ergot_culture',
    kind: 'production',
    name: 'Ergot Culture',
    blurb: 'Rye grain deliberately infected and grown on in sealed flasks. Months of patience for a few grams of anything.',
    icon: 'leaf',
    product: 'acid',
    unlock: { properties: 10, cash: 38000000 },
    cost: 350000,
    minAreaM2: 70,
    maxAreaM2: 600,
    referenceAreaM2: 220,
    areaExponent: 0.6,
    upkeepPerDay: 3733,
    slots: 3,
    cycleHours: 40,
    rawPerSlot: 2.6,
    supplyCostPerSlot: 38000,
    baseQuality: 0.62,
    heatPerDay: 0.3,
    capacity: 260,
  },
  blotter_lab: {
    id: 'blotter_lab',
    kind: 'processing',
    name: 'Blotter Lab',
    blurb: 'Synthesis, then dilution down to micrograms and onto perforated card. Nothing here weighs anything.',
    icon: 'flask',
    handles: ['acid'],
    unlock: { properties: 11, cash: 46000000 },
    cost: 512500,
    minAreaM2: 80,
    maxAreaM2: 700,
    referenceAreaM2: 240,
    areaExponent: 0.6,
    upkeepPerDay: 6267,
    rawPerHour: 2.4,
    costPerRaw: 30,
    qualityBonus: 0.22,
    // Tiny quantities, tiny footprint, almost nothing to smell.
    heatPerDay: 0.35,
    capacity: 380,
  },
  vet_supply: {
    id: 'vet_supply',
    kind: 'production',
    name: 'Veterinary Supply',
    blurb: 'A licensed wholesaler with sloppy paperwork. Stock walks out of the back on a schedule.',
    icon: 'shop',
    product: 'ket',
    unlock: { properties: 9, cash: 30000000 },
    cost: 275000,
    minAreaM2: 110,
    maxAreaM2: 1200,
    referenceAreaM2: 320,
    areaExponent: 0.75,
    upkeepPerDay: 4267,
    slots: 4,
    cycleHours: 14,
    rawPerSlot: 2.8,
    supplyCostPerSlot: 41000,
    baseQuality: 0.68,
    heatPerDay: 0.7,
    capacity: 380,
  },
  drying_room: {
    id: 'drying_room',
    kind: 'processing',
    name: 'Drying Room',
    blurb: 'Trays, a dehumidifier and time. Liquid in, crystal out, then broken down and weighed.',
    icon: 'flask',
    handles: ['ket'],
    unlock: { properties: 9, cash: 32000000 },
    cost: 231250,
    minAreaM2: 70,
    maxAreaM2: 700,
    referenceAreaM2: 210,
    areaExponent: 0.65,
    upkeepPerDay: 3200,
    rawPerHour: 5.5,
    costPerRaw: 14,
    qualityBonus: 0.12,
    heatPerDay: 0.5,
    capacity: 440,
  },

  // --- More honest work -----------------------------------------------------

  drycleaner: {
    id: 'drycleaner',
    kind: 'front',
    name: 'Dry Cleaner',
    blurb: 'Tickets, tokens and a lot of small cash. The oldest wash there is, and still one of the best.',
    icon: 'shop',
    cost: 107500,
    minAreaM2: 60,
    maxAreaM2: 420,
    referenceAreaM2: 170,
    areaExponent: 0.8,
    upkeepPerDay: 1867,
    revenuePerDay: 860,
    wealthSensitivity: 0.8,
    launderPerDay: 940000,
    cut: 0.21,
    heatPerDay: 0.12,
    capacity: 0,
  },
  nailsalon: {
    id: 'nailsalon',
    kind: 'front',
    name: 'Nail Salon',
    blurb: 'Appointments, tips and no inventory worth counting. Busy, cash-heavy and nobody looks twice.',
    icon: 'shop',
    cost: 67500,
    minAreaM2: 35,
    maxAreaM2: 200,
    referenceAreaM2: 95,
    areaExponent: 0.75,
    upkeepPerDay: 1400,
    revenuePerDay: 740,
    wealthSensitivity: 1.2,
    launderPerDay: 560000,
    cut: 0.18,
    heatPerDay: 0.07,
    capacity: 0,
  },
  vending: {
    id: 'vending',
    kind: 'front',
    name: 'Vending Route',
    blurb: 'Machines across the district, emptied by hand every week. All coin, no counter, no staff to talk.',
    icon: 'box',
    cost: 160000,
    minAreaM2: 40,
    maxAreaM2: 350,
    referenceAreaM2: 120,
    areaExponent: 0.6,
    upkeepPerDay: 2267,
    revenuePerDay: 1020,
    wealthSensitivity: 0.5,
    launderPerDay: 1150000,
    cut: 0.15,
    heatPerDay: 0.09,
    capacity: 0,
  },
  scrapyard: {
    id: 'scrapyard',
    kind: 'front',
    name: 'Scrap Yard',
    blurb: 'Weighed in, paid out, no questions on either side of the scale. Heavy cash and a gate nobody watches.',
    icon: 'box',
    unlock: { properties: 6, cash: 12000000 },
    cost: 350000,
    minAreaM2: 700,
    maxAreaM2: 20000,
    referenceAreaM2: 1800,
    areaExponent: 0.9,
    upkeepPerDay: 6533,
    revenuePerDay: 2400,
    wealthSensitivity: 0.45,
    launderPerDay: 1750000,
    cut: 0.16,
    heatPerDay: 0.2,
    capacity: 0,
  },
  courier_co: {
    id: 'courier_co',
    kind: 'front',
    name: 'Courier Company',
    blurb: 'Invoices, waybills and vans coming and going all day. The best cover there is for vans coming and going all day.',
    icon: 'car',
    unlock: { properties: 7, cash: 16000000 },
    cost: 300000,
    minAreaM2: 180,
    maxAreaM2: 2600,
    referenceAreaM2: 520,
    areaExponent: 0.85,
    upkeepPerDay: 5733,
    revenuePerDay: 2150,
    wealthSensitivity: 0.7,
    launderPerDay: 1480000,
    cut: 0.14,
    // Vans on the road all day are the point: your own move less noticed.
    stopResist: 0.18,
    heatPerDay: 0.1,
    capacity: 0,
  },

  // --- And the other end ----------------------------------------------------

  safehouse: {
    id: 'safehouse',
    kind: 'storage',
    name: 'Safe House',
    blurb: 'Nothing sold from here and nobody comes to the door. It just holds, and it holds quietly.',
    icon: 'box',
    unlock: { properties: 5, cash: 6000000 },
    cost: 122500,
    minAreaM2: 70,
    maxAreaM2: 600,
    referenceAreaM2: 240,
    areaExponent: 1.0,
    upkeepPerDay: 1267,
    // The quietest storage there is, because it never serves anybody.
    heatPerDay: 0.02,
    capacity: 900,
    sellsPerHour: 0,
  },
  cut_house: {
    id: 'cut_house',
    kind: 'processing',
    name: 'Cut House',
    blurb: 'Bulking agents, a set of scales and no conscience. Turns out far more than went in, and every unit is worse for it.',
    icon: 'flask',
    handles: ['coke', 'pills', 'weed'],
    unlock: { properties: 6, cash: 9500000 },
    cost: 156250,
    minAreaM2: 90,
    maxAreaM2: 700,
    referenceAreaM2: 230,
    areaExponent: 0.7,
    upkeepPerDay: 2267,
    rawPerHour: 9.5,
    costPerRaw: 5,
    // The trade-off: volume at the cost of what it is worth.
    qualityBonus: -0.24,
    yieldBonus: 1.55,
    heatPerDay: 0.7,
    capacity: 520,
  },
  chopshop: {
    id: 'chopshop',
    kind: 'front',
    name: 'Chop Shop',
    blurb: 'Cars in one door, parts out the other. Keeps your own fleet on the road for a fraction of what a garage charges.',
    icon: 'car',
    unlock: { properties: 7, cash: 14000000 },
    cost: 243750,
    minAreaM2: 260,
    maxAreaM2: 2200,
    referenceAreaM2: 620,
    areaExponent: 0.85,
    upkeepPerDay: 4800,
    revenuePerDay: 1750,
    wealthSensitivity: 0.4,
    launderPerDay: 640000,
    cut: 0.24,
    // Same trade as an auto shop, done the other way and cheaper.
    fittingDiscount: 0.26,
    heatPerDay: 0.85,
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
    unlock: { properties: 14, cash: 90000000 },
    cost: 2625000,
    minAreaM2: 420,
    maxAreaM2: 4200,
    referenceAreaM2: 900,
    areaExponent: 0.9,
    upkeepPerDay: 28000,
    revenuePerDay: 6800,
    wealthSensitivity: 1.6,
    launderPerDay: 4200000,
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
    unlock: { properties: 18, cash: 160000000 },
    cost: 4250000,
    minAreaM2: 620,
    maxAreaM2: 6500,
    referenceAreaM2: 1400,
    areaExponent: 1.0,
    upkeepPerDay: 50667,
    revenuePerDay: 14500,
    wealthSensitivity: 2.4,
    launderPerDay: 5800000,
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
    unlock: { properties: 16, cash: 110000000 },
    cost: 3312500,
    minAreaM2: 1200,
    maxAreaM2: 60000,
    referenceAreaM2: 2600,
    areaExponent: 1.0,
    upkeepPerDay: 36000,
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
    unlock: { properties: 20, cash: 220000000 },
    cost: 6000000,
    minAreaM2: 1500,
    maxAreaM2: 42000,
    referenceAreaM2: 3200,
    areaExponent: 0.85,
    upkeepPerDay: 74667,
    rawPerHour: 46,
    costPerRaw: 24,
    // It finished nothing at all before this, which made the most expensive
    // building in the game a dead end. Pharmaceuticals are what it is for.
    handles: ['benzos', 'oxy', 'fentanyl'],
    qualityBonus: 0.26,
    heatPerDay: 1.6,
    capacity: 3400,
  },
  // --- More legitimate business ---------------------------------------------
  // Spread deliberately across size and laundering capacity rather than being
  // eleven more corner shops: a food truck and an import agent are different
  // businesses to run, not the same one renamed.
  offlicence: {
    id: 'offlicence',
    kind: 'front',
    name: 'Off-Licence',
    sizeNames: [[0.7, 'Bottle Shop'], [1.4, 'Off-Licence'], [Infinity, 'Wine Merchant']],
    blurb: 'Open late, takes cash all night, and nobody asks why the till is heavy.',
    icon: 'store',
    cost: 61250,
    minAreaM2: 35,
    maxAreaM2: 260,
    referenceAreaM2: 110,
    areaExponent: 0.8,
    upkeepPerDay: 1800,
    revenuePerDay: 900,
    launderPerDay: 520000,
    cut: 0.2,
    heatPerDay: -0.25,
    capacity: 0,
  },
  bookies: {
    id: 'bookies',
    kind: 'front',
    name: 'Bookmakers',
    blurb: 'Money in and money out all day by design. The one business where a bad week explains itself.',
    icon: 'note',
    unlock: { properties: 5, cash: 3200000 },
    cost: 98750,
    minAreaM2: 55,
    maxAreaM2: 320,
    referenceAreaM2: 140,
    areaExponent: 0.75,
    upkeepPerDay: 2867,
    revenuePerDay: 1400,
    launderPerDay: 1450000,
    cut: 0.16,
    heatPerDay: -0.1,
    capacity: 0,
  },
  foodtruck: {
    id: 'foodtruck',
    kind: 'front',
    name: 'Food Truck',
    blurb: 'Barely a building. Cheap to stand up and it can be somewhere else tomorrow.',
    icon: 'cup',
    cost: 21250,
    minAreaM2: 11,
    maxAreaM2: 90,
    referenceAreaM2: 40,
    areaExponent: 0.6,
    upkeepPerDay: 733,
    revenuePerDay: 420,
    launderPerDay: 210000,
    cut: 0.24,
    heatPerDay: -0.15,
    capacity: 0,
  },
  barpub: {
    id: 'barpub',
    kind: 'front',
    name: 'Bar',
    sizeNames: [[0.7, 'Back Bar'], [1.5, 'Bar'], [Infinity, 'Music Venue']],
    blurb: 'Late licence, loud room, takings nobody can count from outside.',
    icon: 'cup',
    unlock: { properties: 6, cash: 5500000 },
    cost: 176250,
    minAreaM2: 90,
    maxAreaM2: 760,
    referenceAreaM2: 260,
    areaExponent: 0.85,
    upkeepPerDay: 5133,
    revenuePerDay: 2600,
    launderPerDay: 1650000,
    cut: 0.15,
    heatPerDay: -0.45,
    capacity: 0,
  },
  studio: {
    id: 'studio',
    kind: 'front',
    name: 'Recording Studio',
    blurb: 'Books by the hour, paid in cash, and half the bookings never turn up.',
    icon: 'disc',
    unlock: { properties: 7, cash: 7200000 },
    cost: 143750,
    minAreaM2: 70,
    maxAreaM2: 480,
    referenceAreaM2: 180,
    areaExponent: 0.7,
    upkeepPerDay: 3600,
    revenuePerDay: 1800,
    launderPerDay: 1180000,
    cut: 0.18,
    heatPerDay: -0.35,
    capacity: 0,
  },
  carrental: {
    id: 'carrental',
    kind: 'front',
    name: 'Car Rental',
    blurb: 'A yard of motors on paper. Handy for more than the rental money.',
    icon: 'car',
    unlock: { properties: 7, cash: 8800000 },
    cost: 156250,
    minAreaM2: 120,
    maxAreaM2: 900,
    referenceAreaM2: 340,
    areaExponent: 0.8,
    upkeepPerDay: 4400,
    revenuePerDay: 2200,
    launderPerDay: 1320000,
    cut: 0.17,
    heatPerDay: -0.2,
    capacity: 0,
  },
  printshop: {
    id: 'printshop',
    kind: 'front',
    name: 'Print Shop',
    blurb: 'Signage, flyers, invoices. Especially invoices.',
    icon: 'note',
    cost: 52500,
    minAreaM2: 40,
    maxAreaM2: 260,
    referenceAreaM2: 110,
    areaExponent: 0.75,
    upkeepPerDay: 1667,
    revenuePerDay: 800,
    launderPerDay: 480000,
    cut: 0.2,
    heatPerDay: -0.3,
    capacity: 0,
  },
  cleaning: {
    id: 'cleaning',
    kind: 'front',
    name: 'Cleaning Company',
    blurb: 'Vans, keys to half the offices in town, and a payroll that can absorb anybody.',
    icon: 'droplet',
    unlock: { properties: 5, cash: 2800000 },
    cost: 71250,
    minAreaM2: 45,
    maxAreaM2: 340,
    referenceAreaM2: 130,
    areaExponent: 0.75,
    upkeepPerDay: 2133,
    revenuePerDay: 1100,
    launderPerDay: 760000,
    cut: 0.19,
    heatPerDay: -0.4,
    capacity: 0,
  },
  security: {
    id: 'security',
    kind: 'front',
    name: 'Security Firm',
    blurb: 'Licensed, insured, and full of people who were going to be doing this anyway.',
    icon: 'star',
    unlock: { properties: 8, cash: 12000000 },
    cost: 167500,
    minAreaM2: 70,
    maxAreaM2: 520,
    referenceAreaM2: 200,
    areaExponent: 0.7,
    upkeepPerDay: 4667,
    revenuePerDay: 2400,
    launderPerDay: 1280000,
    cut: 0.16,
    heatPerDay: -0.6,
    capacity: 0,
  },
  construction: {
    id: 'construction',
    kind: 'front',
    name: 'Construction Firm',
    sizeNames: [[0.8, 'Builders Yard'], [1.6, 'Construction Firm'], [Infinity, 'Contracting Group']],
    blurb: 'Every job is materials, labour and cash, and no two are priced the same. Made for this.',
    icon: 'wrench',
    unlock: { properties: 10, cash: 26000000 },
    cost: 412500,
    minAreaM2: 260,
    maxAreaM2: 2600,
    referenceAreaM2: 700,
    areaExponent: 0.85,
    upkeepPerDay: 11333,
    revenuePerDay: 6200,
    launderPerDay: 3400000,
    cut: 0.13,
    heatPerDay: -0.3,
    capacity: 0,
  },
  importexport: {
    id: 'importexport',
    kind: 'front',
    name: 'Import / Export',
    blurb: 'Containers, manifests and a customs broker who owes you. The best paper in the game.',
    icon: 'box',
    unlock: { properties: 12, cash: 48000000 },
    cost: 687500,
    minAreaM2: 420,
    maxAreaM2: 6000,
    referenceAreaM2: 1400,
    areaExponent: 0.9,
    upkeepPerDay: 18667,
    revenuePerDay: 9400,
    launderPerDay: 5600000,
    cut: 0.11,
    heatPerDay: -0.2,
    capacity: 0,
  },

  // --- Making the rest ------------------------------------------------------
  // One maker per new product, sized and gated so the cheap, high-volume ones
  // are reachable early and the tiny, valuable, dangerous ones are not.
  still_house: {
    id: 'still_house',
    kind: 'production',
    name: 'Still House',
    sizeNames: [[0.8, 'Backyard Still'], [1.6, 'Still House'], [Infinity, 'Distillery']],
    blurb: 'Mash, heat and patience. Barely illegal next to the rest of this, and it sells all day.',
    icon: 'droplet',
    product: 'shine',
    cost: 43750,
    minAreaM2: 45,
    maxAreaM2: 900,
    referenceAreaM2: 200,
    areaExponent: 0.9,
    upkeepPerDay: 1067,
    slots: 4,
    cycleHours: 10,
    rawPerSlot: 3.2,
    supplyCostPerSlot: 1800,
    baseQuality: 0.5,
    heatPerDay: 0.08,
    capacity: 260,
  },
  spray_room: {
    id: 'spray_room',
    kind: 'production',
    name: 'Spray Room',
    blurb: 'Plant matter, a solvent and something out of a drum. Cheap to make and it brings the wrong attention.',
    icon: 'leaf',
    product: 'spice',
    unlock: { properties: 4, cash: 1800000 },
    cost: 61250,
    minAreaM2: 40,
    maxAreaM2: 600,
    referenceAreaM2: 160,
    areaExponent: 0.85,
    upkeepPerDay: 1600,
    slots: 3,
    cycleHours: 8,
    rawPerSlot: 2.6,
    supplyCostPerSlot: 3400,
    baseQuality: 0.38,
    heatPerDay: 0.55,
    capacity: 220,
  },
  hormone_lab: {
    id: 'hormone_lab',
    kind: 'production',
    name: 'Hormone Lab',
    blurb: 'Raw powder, carrier oil and a sterile bench. The gyms take everything you can make.',
    icon: 'flask',
    product: 'roids',
    unlock: { properties: 5, cash: 3600000 },
    cost: 93750,
    minAreaM2: 55,
    maxAreaM2: 620,
    referenceAreaM2: 190,
    areaExponent: 0.75,
    upkeepPerDay: 2333,
    slots: 3,
    cycleHours: 12,
    rawPerSlot: 2.2,
    supplyCostPerSlot: 7600,
    baseQuality: 0.6,
    heatPerDay: 0.18,
    capacity: 200,
  },
  bark_room: {
    id: 'bark_room',
    kind: 'production',
    name: 'Extraction Room',
    blurb: 'Bark, solvent, a long wait and a very small yield. A tiny market that pays properly.',
    icon: 'spore',
    product: 'dmt',
    unlock: { properties: 6, cash: 6500000 },
    cost: 106250,
    minAreaM2: 45,
    maxAreaM2: 420,
    referenceAreaM2: 150,
    areaExponent: 0.7,
    upkeepPerDay: 2000,
    slots: 2,
    cycleHours: 18,
    rawPerSlot: 1.4,
    supplyCostPerSlot: 12000,
    baseQuality: 0.72,
    heatPerDay: 0.1,
    capacity: 120,
  },
  rock_house: {
    id: 'rock_house',
    kind: 'production',
    name: 'Rock House',
    blurb: 'A pot, a little soda and somebody who has done it before. Turns powder into something that sells faster.',
    icon: 'press',
    product: 'crack',
    unlock: { properties: 6, cash: 7000000 },
    cost: 68750,
    minAreaM2: 35,
    maxAreaM2: 420,
    referenceAreaM2: 130,
    areaExponent: 0.8,
    upkeepPerDay: 1867,
    slots: 3,
    cycleHours: 6,
    rawPerSlot: 2.4,
    supplyCostPerSlot: 18000,
    baseQuality: 0.52,
    heatPerDay: 0.9,
    capacity: 240,
  },
  script_mill: {
    id: 'script_mill',
    kind: 'production',
    name: 'Script Mill',
    blurb: 'A clinic that writes what you ask for and a wholesaler that never counts twice.',
    icon: 'pill',
    product: 'oxy',
    unlock: { properties: 8, cash: 14000000 },
    cost: 218750,
    minAreaM2: 90,
    maxAreaM2: 900,
    referenceAreaM2: 280,
    areaExponent: 0.7,
    upkeepPerDay: 4000,
    slots: 4,
    cycleHours: 16,
    rawPerSlot: 2.0,
    supplyCostPerSlot: 26000,
    baseQuality: 0.74,
    heatPerDay: 0.5,
    capacity: 300,
  },
  benzo_line: {
    id: 'benzo_line',
    kind: 'production',
    name: 'Tablet Line',
    blurb: 'Bulk powder off a container and a press that runs all night. Pennies a strip, and it never stops selling.',
    icon: 'pill',
    product: 'benzos',
    unlock: { properties: 7, cash: 9500000 },
    cost: 143750,
    minAreaM2: 70,
    maxAreaM2: 1100,
    referenceAreaM2: 300,
    areaExponent: 0.85,
    upkeepPerDay: 2933,
    slots: 5,
    cycleHours: 9,
    rawPerSlot: 3.0,
    supplyCostPerSlot: 5200,
    baseQuality: 0.55,
    heatPerDay: 0.22,
    capacity: 420,
  },
  opium_farm: {
    id: 'opium_farm',
    kind: 'production',
    name: 'Opium Farm',
    sizeNames: [[0.8, 'Poppy Patch'], [1.6, 'Opium Farm'], [Infinity, 'Poppy Estate']],
    blurb: 'Scored by hand, collected by hand, and it only grows where it grows.',
    icon: 'leaf',
    product: 'heroin',
    unlock: { properties: 10, cash: 24000000 },
    cost: 337500,
    minAreaM2: 900,
    maxAreaM2: 90000,
    referenceAreaM2: 3000,
    areaExponent: 0.95,
    upkeepPerDay: 6667,
    slots: 6,
    cycleHours: 24,
    rawPerSlot: 3.4,
    supplyCostPerSlot: 22000,
    baseQuality: 0.6,
    heatPerDay: 0.75,
    capacity: 700,
  },
  fent_suite: {
    id: 'fent_suite',
    kind: 'production',
    name: 'Precursor Suite',
    blurb: 'A sealed room and a very short list of people who can work it. Almost nothing by weight goes an awfully long way.',
    icon: 'flask',
    product: 'fentanyl',
    unlock: { properties: 13, cash: 62000000 },
    cost: 812500,
    minAreaM2: 110,
    maxAreaM2: 1200,
    referenceAreaM2: 340,
    areaExponent: 0.65,
    upkeepPerDay: 12000,
    slots: 3,
    cycleHours: 20,
    rawPerSlot: 1.6,
    supplyCostPerSlot: 68000,
    baseQuality: 0.8,
    heatPerDay: 1.4,
    capacity: 160,
  },
  refinery: {
    id: 'refinery',
    kind: 'processing',
    name: 'Refining Room',
    blurb: 'Where raw gum becomes something you can actually sell. Slow, fussy, and the only proper route.',
    icon: 'flask',
    product: null,
    unlock: { properties: 11, cash: 30000000 },
    cost: 300000,
    minAreaM2: 90,
    maxAreaM2: 1400,
    referenceAreaM2: 400,
    areaExponent: 0.7,
    upkeepPerDay: 5333,
    handles: ['heroin'],
    rawPerHour: 2.4,
    costPerRaw: 1900,
    qualityBonus: 0.19,
    heatPerDay: 0.8,
    capacity: 340,
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
  baseHireFee: 3000,
  hireGrowth: 1.30,   // each additional driver costs this much more to bring in
  baseWagePerDay: 260,
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
    cost: 1400, upkeepPerDay: 27, capacity: 14,
    paceFactor: 7.5, loadMinutes: 6, unloadMinutes: 5, stealth: 0.94,
  },
  jogger: {
    id: 'jogger', name: 'Runner in Lycra', class: 'foot',
    blurb: 'Running gear and a hydration pack. Quicker, and reads as exercise.',
    cost: 3600, upkeepPerDay: 40, capacity: 22,
    paceFactor: 5.2, loadMinutes: 7, unloadMinutes: 6, stealth: 0.96,
  },
  // --- Two wheels ----------------------------------------------------------
  bike: {
    id: 'bike', name: 'Bike Courier', class: 'twowheel',
    blurb: 'Through traffic and down alleys. Barely worth pulling over.',
    cost: 3600, upkeepPerDay: 53, capacity: 40,
    paceFactor: 1.9, loadMinutes: 12, unloadMinutes: 9, stealth: 0.85,
  },
  ebike: {
    id: 'ebike', name: 'E-Bike', class: 'twowheel',
    blurb: 'A bike that keeps up with traffic and still uses the cycle lane.',
    cost: 8800, upkeepPerDay: 93, capacity: 55,
    paceFactor: 1.3, loadMinutes: 13, unloadMinutes: 10, stealth: 0.86,
  },
  scooter: {
    id: 'scooter', name: 'Delivery Scooter', class: 'twowheel',
    blurb: 'A food-delivery box on the back. Quick, plausible, hard to tail.',
    cost: 7600, upkeepPerDay: 120, capacity: 65,
    paceFactor: 1.0, loadMinutes: 15, unloadMinutes: 11, stealth: 0.78,
  },
  motorcycle: {
    id: 'motorcycle', name: 'Motorcycle', class: 'twowheel',
    blurb: 'Nothing in a city is faster. Nothing carries less for the money.',
    cost: 31200, upkeepPerDay: 267, capacity: 45,
    paceFactor: 0.68, loadMinutes: 11, unloadMinutes: 8, stealth: 0.5,
  },
  // --- Cars ----------------------------------------------------------------
  hatchback: {
    id: 'hatchback', name: 'Compact Hatchback', class: 'car',
    blurb: 'The cheapest four wheels that will do the job. Utterly forgettable.',
    cost: 8400, upkeepPerDay: 147, capacity: 95,
    paceFactor: 1.05, loadMinutes: 18, unloadMinutes: 13, stealth: 0.7,
  },
  sedan: {
    id: 'sedan', name: 'Beater Sedan', class: 'car',
    blurb: 'Anonymous and cheap. The honest workhorse of a growing operation.',
    cost: 13600, upkeepPerDay: 200, capacity: 140,
    paceFactor: 1.0, loadMinutes: 22, unloadMinutes: 16, stealth: 0.62,
  },
  cab: {
    id: 'cab', name: 'Livery Cab', class: 'car',
    blurb: 'Belongs anywhere at any hour. Costs a fortune in wages.',
    cost: 27200, upkeepPerDay: 367, capacity: 160,
    paceFactor: 0.92, loadMinutes: 18, unloadMinutes: 13, stealth: 0.8,
  },
  suv: {
    id: 'suv', name: 'SUV', class: 'car',
    blurb: 'School-run bodywork with a boot you can live out of.',
    cost: 46000, upkeepPerDay: 320, capacity: 300,
    paceFactor: 1.06, loadMinutes: 24, unloadMinutes: 18, stealth: 0.74,
  },
  luxury: {
    id: 'luxury', name: 'Executive Saloon', class: 'car',
    blurb: 'Tinted, immaculate and expensive. Nobody stops it, and everyone remembers it.',
    cost: 128000, upkeepPerDay: 800, capacity: 180,
    paceFactor: 0.85, loadMinutes: 16, unloadMinutes: 12, stealth: 0.9,
  },
  sportscar: {
    id: 'sportscar', name: 'Sports Car', class: 'car',
    blurb: 'The fastest thing you own and the least room in it. Remembered by everyone who sees it.',
    cost: 96000, upkeepPerDay: 633, capacity: 55,
    paceFactor: 0.72, loadMinutes: 10, unloadMinutes: 8, stealth: 0.35,
  },
  // --- Vans ----------------------------------------------------------------
  minivan: {
    id: 'minivan', name: 'Minivan', class: 'van',
    blurb: 'School run camouflage with the seats out. Real capacity, ordinary pace.',
    cost: 22400, upkeepPerDay: 253, capacity: 260,
    paceFactor: 1.1, loadMinutes: 28, unloadMinutes: 20, stealth: 0.72,
  },
  van: {
    id: 'van', name: 'Panel Van', class: 'van',
    blurb: 'Serious capacity, and exactly what police expect to search.',
    cost: 36800, upkeepPerDay: 347, capacity: 480,
    paceFactor: 1.25, loadMinutes: 38, unloadMinutes: 28, stealth: 0.45,
  },
  chiller: {
    id: 'chiller', name: 'Refrigerated Van', class: 'van',
    blurb: 'Cold, sealed and nobody wants to stand in it. Keeps product at its best.',
    cost: 64000, upkeepPerDay: 520, capacity: 420,
    paceFactor: 1.28, loadMinutes: 42, unloadMinutes: 30, stealth: 0.68,
    // A chilled load arrives in the condition it left in.
    preservesQuality: true,
  },
  luton: {
    id: 'luton', name: 'Luton Van', class: 'van',
    blurb: 'A box on a van chassis. Removals by day, and by night.',
    cost: 76000, upkeepPerDay: 560, capacity: 820,
    paceFactor: 1.35, loadMinutes: 48, unloadMinutes: 35, stealth: 0.5,
  },
  // --- Trucks --------------------------------------------------------------
  pickup: {
    id: 'pickup', name: 'Pickup Truck', class: 'truck',
    blurb: 'A trade truck with a covered bed. Belongs on any site in the country.',
    cost: 33600, upkeepPerDay: 293, capacity: 340,
    paceFactor: 1.1, loadMinutes: 26, unloadMinutes: 19, stealth: 0.66,
  },
  boxtruck: {
    id: 'boxtruck', name: 'Box Truck', class: 'truck',
    blurb: 'Moves a warehouse in one run. Slow, and impossible to hide.',
    cost: 84000, upkeepPerDay: 733, capacity: 1700,
    paceFactor: 1.5, loadMinutes: 65, unloadMinutes: 48, stealth: 0.34,
  },
  flatbed: {
    id: 'flatbed', name: 'Flatbed', class: 'truck',
    blurb: 'Strapped pallets under a tarp. Loads and unloads faster than anything its size, and hides nothing at all.',
    cost: 108000, upkeepPerDay: 787, capacity: 1250,
    paceFactor: 1.45, loadMinutes: 45, unloadMinutes: 34,
    // The load is literally in open view — the least discreet thing you can run.
    stealth: 0.12,
  },
  semi: {
    id: 'semi', name: 'Semi Truck', class: 'truck',
    blurb: 'Everything you own in one trailer. Crawls through a city and can be seen from orbit.',
    cost: 272000, upkeepPerDay: 1267, capacity: 4200,
    paceFactor: 1.95, loadMinutes: 110, unloadMinutes: 80, stealth: 0.18,
  },
  // --- Air -----------------------------------------------------------------
  drone: {
    id: 'drone', name: 'Delivery Drone', class: 'air',
    blurb: 'Straight over everything. Carries almost nothing and cannot be followed.',
    cost: 56000, upkeepPerDay: 107, capacity: 12,
    paceFactor: 1.0, loadMinutes: 4, unloadMinutes: 3, stealth: 0.93,
    direct: true, airKph: 55,
  },
  heavylift: {
    id: 'heavylift', name: 'Heavy-Lift Drone', class: 'air',
    blurb: 'Industrial rotors and a slung crate. Still small, but it ignores every road.',
    cost: 184000, upkeepPerDay: 307, capacity: 70,
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
  pricePerM2: 2100,
  scaleBreakM2: 400,   // above this, each extra m² is cheaper
  scaleExponent: 0.88, // <1 = economy of scale
  minPrice: 120000,
  maxPrice: 40000000,
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
  dailyLimit: 250000,
  cut: 0.4,
};

// How hard a legitimate business leans on the wealth of its block.
/**
 * What a stalled building still costs per day, as a share of its normal upkeep.
 *
 * A halted line keeps its rent but stops burning power, consumables and the
 * wages of people who would be running it. Charging the full bill on a building
 * that is producing nothing is what turned a full warehouse into an
 * unrecoverable spiral — the chain seizes quietly and the bill never changes.
 */
/**
 * How full a production building's own store gets before it stops buying in
 * supplies for the next cycle.
 *
 * Outproducing your fleet is meant to be the pressure that makes you scale —
 * this is a logistics game. But paying full supply costs to make stock you
 * physically cannot ship turned that pressure into a death spiral: the line
 * filled, seized, and kept billing. Idling at 80% means falling behind costs
 * you the sales you didn't make, which is the right penalty, and nothing more.
 */
/**
 * How a pound breaks down when you serve it yourself.
 *
 * A unit of product is a POUND. Blocks and other operations buy it that way —
 * by weight, in one handoff. Nobody on a corner buys a pound, so serving it out
 * of your own premises means breaking it into eighths, quarters, halves, zips,
 * quarter-pounds and half-pounds, and the margin on that breakdown is the whole
 * reason to hold a storefront instead of just dropping weight on a block.
 */
export const UNIT_LADDER = [
  { id: 'eighth',  name: 'eighth',        perPound: 128 },
  { id: 'quarter', name: 'quarter',       perPound: 64 },
  { id: 'half',    name: 'half',          perPound: 32 },
  { id: 'zip',     name: 'zip (ounce)',   perPound: 16 },
  { id: 'qp',      name: 'quarter-pound', perPound: 4 },
  { id: 'hp',      name: 'half-pound',    perPound: 2 },
  { id: 'lb',      name: 'pound',         perPound: 1 },
];

/**
 * What serving it yourself is worth, against dropping the same weight on a
 * block. You do the breaking down, so you keep the margin the block's own
 * dealers would otherwise take.
 *
 * Deliberately a premium on top of the block price rather than a cut to it:
 * basePrice is what the whole economy is balanced around, and re-pricing the
 * main sales path to "wholesale" would halve every number in the game to make
 * an additive point.
 */
export const RETAIL_MARKUP = 1.35;

/**
 * And what a bulk handoff to another operation fetches. They take it by weight
 * in one go and carry the risk of moving it on, so they do not pay corner money.
 */
export const WHOLESALE_FACTOR = 0.75;

/**
 * Moving weight between cities.
 *
 * A courier works a route you can watch on the map. A smuggler takes a
 * consignment and disappears for days — you are betting on arrival, not
 * managing a delivery, which is why these numbers are about risk and time
 * rather than capacity and pace.
 */
export const SMUGGLING = {
  // Opening up somewhere new.
  foundBase: 2500000,      // the second city; the fifth is an organisation
  foundGrowth: 1.7,        // each further city is a bigger undertaking
  distanceCostKm: 1200,    // beyond this, distance starts to dominate the cost

  // Time in the wind. Deliberately slower than the drive: they wait for the
  // right crossing, the right vehicle, the right night.
  baseHours: 18,
  kmPerHour: 55,

  // What it costs to have it carried.
  feeBase: 25000,
  feePerUnitPerKm: 0.9,
  borderFeeMult: 2.2,

  // What can go wrong. Splitting a big load across several runs is genuinely
  // safer than sending it all at once — that is the decision on offer.
  riskPerKm: 9000,         // 1% of risk per this many km
  maxDistanceRisk: 0.22,
  riskPerUnit: 1200,       // 1% of risk per this many units in one load
  maxLoadRisk: 0.25,
  borderRisk: 0.12,
  heatRisk: 0.15,
  maxRisk: 0.65,
};

export const BACKLOG_PAUSE_AT = 0.8;

export const IDLE_UPKEEP_SHARE = 0.35;

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
