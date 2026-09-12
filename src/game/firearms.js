// Firearms are not drugs, and the design note was specific about it: a
// different cycle, real manufacturing steps, and two ways out — licensed and
// legal, or unserialised and worth far more on the street.
//
// The references here are the real US regime. A Federal Firearms Licence is
// issued by type: 01 is a dealer, 07 is a manufacturer, and anything under the
// National Firearms Act additionally needs a Special Occupational Tax class.
// Legal product is serialised and logged in a bound book, which is exactly why
// it's worth less to the people who want it untraceable.

/**
 * What you can be licensed to do. Applications take time to come back, cost
 * real money up front, and lapse if you don't renew them.
 */
export const LICENCES = {
  ffl01: {
    id: 'ffl01',
    name: 'FFL Type 01 — Dealer',
    short: 'FFL 01',
    blurb:
      'Lets you sell finished firearms over a counter, with a bound book and a background check on every sale. Legal money, legal prices.',
    cost: 900000,
    renewalPerYear: 3200,
    processingDays: 14,
    // A licence is a look at your record. Too much attention and it's refused.
    maxHeatToApply: 45,
  },
  ffl07: {
    id: 'ffl07',
    name: 'FFL Type 07 — Manufacturer',
    short: 'FFL 07',
    blurb:
      'Lets you build firearms lawfully: serialised receivers, marked to standard, records kept. Slower and dearer than a back-room shop, and nobody kicks the door in.',
    cost: 2400000,
    renewalPerYear: 9500,
    processingDays: 30,
    maxHeatToApply: 38,
    requires: ['ffl01'],
  },
  sot2: {
    id: 'sot2',
    name: 'SOT Class 2 — NFA',
    short: 'SOT 2',
    blurb:
      'The tax stamp that puts suppressors, short barrels and select-fire on the books. Enormous margins, and the closest scrutiny there is.',
    cost: 4100000,
    renewalPerYear: 18000,
    processingDays: 45,
    maxHeatToApply: 28,
    requires: ['ffl07'],
  },
};

export const LICENCE_IDS = Object.keys(LICENCES);

/**
 * What a shop is tooled up to build. Real categories, with the trade-offs that
 * actually distinguish them: a shotgun is simple and cheap, a suppressor is a
 * tube and a stack of baffles that happens to be worth a fortune on paper.
 */
export const FIREARM_CLASSES = {
  shotgun: {
    id: 'shotgun',
    // A cylinder is not a magazine well, and so on.
    noParts: ['extmag'],
    name: 'Shotguns',
    blurb: 'Simplest thing in the trade. Smoothbore, few parts, forgiving tolerances.',
    valueMult: 0.55,
    yieldMult: 1.45,
    heatMult: 0.7,
    legalMargin: 0.62,
  },
  handgun: {
    id: 'handgun',
    name: 'Handguns',
    blurb: 'What the street actually asks for. Small, concealable, and always moving.',
    valueMult: 1,
    yieldMult: 1,
    heatMult: 1,
    legalMargin: 0.5,
  },
  rifle: {
    id: 'rifle',
    name: 'Rifles',
    blurb: 'Stripped receivers, barrels and furniture. More machining, more money.',
    valueMult: 1.7,
    yieldMult: 0.72,
    heatMult: 1.15,
    legalMargin: 0.55,
  },
  smg: {
    id: 'smg',
    name: 'Submachine Guns',
    blurb: 'Pistol calibre, magazine through the grip, folding stock. Simple to build and it never stops moving.',
    valueMult: 1.45,
    yieldMult: 0.86,
    heatMult: 1.35,
    legalMargin: 0.44,
  },
  revolver: {
    id: 'revolver',
    // A cylinder is not a magazine well, and so on.
    noParts: ['extmag', 'foregrip'],
    name: 'Revolvers',
    blurb: 'Fewer parts than anything with a magazine, and no brass left on the floor. People who care about that pay for it.',
    valueMult: 1.15,
    yieldMult: 1.1,
    heatMult: 0.85,
    legalMargin: 0.58,
  },
  precision: {
    id: 'precision',
    // A cylinder is not a magazine well, and so on.
    noParts: ['foregrip'],
    name: 'Precision Rifles',
    blurb: 'Heavy barrel, bedded action, glass worth more than the rifle. Slow work and very few buyers, all of them serious.',
    valueMult: 2.6,
    yieldMult: 0.5,
    heatMult: 1.5,
    legalMargin: 0.62,
  },
  machinegun: {
    id: 'machinegun',
    name: 'Machine Guns',
    blurb: 'Belt-fed and unambiguous. The most valuable thing you can build and the fastest way to end a run.',
    valueMult: 4.2,
    yieldMult: 0.3,
    heatMult: 2.4,
    legalMargin: 0.7,
    requiresLicence: 'sot2',
  },
  nfa: {
    id: 'nfa',
    name: 'NFA Items',
    blurb: 'Suppressors, short barrels, select-fire. Needs a tax stamp to touch legally.',
    valueMult: 3.4,
    yieldMult: 0.42,
    heatMult: 1.9,
    legalMargin: 0.68,
    requiresLicence: 'sot2',
  },
};

export const FIREARM_CLASS_IDS = Object.keys(FIREARM_CLASSES);

/**
 * The actual patterns a shop can be set up to build, within a category. Each is
 * a real trade-off rather than a skin: a 1911 pattern is slower to make and
 * worth more, a polymer striker gun is the opposite.
 */
export const MODELS = {
  warden:    { id: 'warden', category: 'handgun', name: 'Warden .45',
    blurb: 'Single stack, exposed hammer, all steel. Slow to make and people pay for it.',
    valueMult: 1.3, yieldMult: 0.82 },
  kestrel:   { id: 'kestrel', category: 'handgun', name: 'Kestrel 9',
    blurb: 'Polymer frame, few parts, quick to turn out. What the street actually asks for.',
    valueMult: 0.92, yieldMult: 1.25 },
  drover:    { id: 'drover', category: 'revolver', name: 'Drover .357',
    blurb: 'Six shots and nothing left on the floor afterwards.',
    valueMult: 1.1, yieldMult: 1 },
  wasp:      { id: 'wasp', category: 'smg', name: 'Wasp 9',
    blurb: 'Roller-delayed, ribbed handguard, the shape everybody recognises.',
    valueMult: 3.0, yieldMult: 0.95 },
  kite:      { id: 'kite', category: 'rifle', name: 'Kite 15',
    blurb: 'Flat-top rail, modular, takes every attachment there is.',
    valueMult: 1.05, yieldMult: 1 },
  longmarch: { id: 'longmarch', category: 'rifle', name: 'Longmarch 47',
    blurb: 'Stamped, loose tolerances, works caked in anything. Cheap to build and it never stops selling.',
    valueMult: 0.88, yieldMult: 1.3 },
  ridgeback: { id: 'ridgeback', category: 'shotgun', name: 'Ridgeback 12',
    blurb: 'Pump action, tube magazine, nothing to go wrong.',
    valueMult: 1, yieldMult: 1 },
  coachman:  { id: 'coachman', category: 'shotgun', name: 'Coachman',
    blurb: 'Two barrels and a hinge. Almost nothing to machine.',
    valueMult: 0.8, yieldMult: 1.45 },
  vigil:     { id: 'vigil', category: 'precision', name: 'Vigil .308',
    blurb: 'Bedded action, heavy barrel, every one hand-checked. Comes with glass.',
    valueMult: 1.25, yieldMult: 0.85, builtIn: ['optic'] },

  sable:     { id: 'sable', category: 'handgun', name: 'Sable Compact',
    blurb: 'Cut down to nothing. Less metal, less money, and it goes anywhere.',
    valueMult: 0.85, yieldMult: 1.35 },
  vulcan:    { id: 'vulcan', category: 'handgun', name: 'Vulcan 10',
    blurb: 'Long slide and a ported barrel. A competition gun that ended up on the street.',
    valueMult: 1.5, yieldMult: 0.7 },
  bulldog:   { id: 'bulldog', category: 'revolver', name: 'Bulldog .44',
    blurb: 'Two inches of barrel and a bobbed hammer. Nothing to snag.',
    valueMult: 0.95, yieldMult: 1.2 },
  frontier:  { id: 'frontier', category: 'revolver', name: 'Frontier .45',
    blurb: 'Single action, unchanged in a century and a half. Collectors pay stupidly.',
    valueMult: 1.55, yieldMult: 0.72 },
  grease:    { id: 'grease', category: 'smg', name: 'Grease .45',
    blurb: 'Stamped tube and a wire stock. Made in a shed by the thousand.',
    valueMult: 2.6, yieldMult: 1.5 },
  spectre:   { id: 'spectre', category: 'smg', name: 'Spectre .45',
    blurb: 'Angled bore, folds to nothing, expensive to machine properly.',
    valueMult: 3.4, yieldMult: 0.75 },
  adder:     { id: 'adder', category: 'rifle', name: 'Adder Bullpup',
    blurb: 'Action behind the trigger — full barrel, half the length. Fiddly to build.',
    valueMult: 1.35, yieldMult: 0.8 },
  praetor:   { id: 'praetor', category: 'rifle', name: 'Praetor .308',
    blurb: 'Full-power cartridge and heavier everything. Fewer buyers, deeper pockets.',
    valueMult: 1.42, yieldMult: 0.76 },
  streetsweeper: { id: 'streetsweeper', category: 'shotgun', name: 'Streetsweeper',
    blurb: 'Twelve rounds in a spring-wound drum. Exactly as subtle as it sounds.',
    valueMult: 2.5, yieldMult: 0.62 },
  longshot:  { id: 'longshot', category: 'precision', name: 'Longshot .50',
    blurb: 'Anti-materiel. Almost nobody wants one and they pay anything for it.',
    valueMult: 8.0, yieldMult: 0.45, builtIn: ['optic'] },
  whisper:   { id: 'whisper', category: 'precision', name: 'Whisper .300',
    blurb: 'Integrally suppressed and subsonic. Quieter than the bolt working.',
    valueMult: 3.5, yieldMult: 0.6, builtIn: ['optic', 'suppressor'] },
  hammerfall: { id: 'hammerfall', category: 'machinegun', name: 'Hammerfall',
    blurb: 'Belt-fed with a quick-change barrel. Fires until the belt runs out.',
    valueMult: 12.0, yieldMult: 0.9 },
  reaper:    { id: 'reaper', category: 'machinegun', name: 'Reaper LMG',
    blurb: 'Light enough to carry, drum underneath. Easier to build than a belt gun.',
    valueMult: 9.0, yieldMult: 1.3 },
};

export const MODEL_IDS = Object.keys(MODELS);

/** The patterns available to a line tooled for a given category. */
export function modelsFor(categoryId) {
  return MODEL_IDS.filter((id) => MODELS[id].category === categoryId).map((id) => MODELS[id]);
}

export function modelOf(building) {
  const m = building && building.model ? MODELS[building.model] : null;
  // Only honour a model that belongs to what the line is tooled for.
  return m && m.category === classOf(building).id ? m : null;
}

/** What the chosen pattern does on top of its category. */
/** Parts that make no sense on this kind of gun at all. */
export function incompatibleParts(building) {
  const cls = classOf(building);
  return (cls && cls.noParts) || [];
}

/** Parts a pattern already has, which can't be fitted twice. */
export function builtInParts(building) {
  const m = modelOf(building);
  return (m && m.builtIn) || [];
}

export function modelEffects(building) {
  const m = modelOf(building);
  return { valueMult: m ? m.valueMult : 1, yieldMult: m ? m.yieldMult : 1 };
}
export const DEFAULT_LINE = 'handgun';

export function classOf(building) {
  return FIREARM_CLASSES[building && building.line] || FIREARM_CLASSES[DEFAULT_LINE];
}

// --- Licence state ----------------------------------------------------------

export function licenceRecord(state, id) {
  state.licences = state.licences || {};
  return state.licences[id] || null;
}

export function hasLicence(state, id) {
  const rec = licenceRecord(state, id);
  return !!rec && rec.status === 'active';
}

/** Every prerequisite met, and not already held or in the post. */
export function canApply(state, id) {
  const def = LICENCES[id];
  if (!def) return { ok: false, reason: 'No such licence.' };
  const rec = licenceRecord(state, id);
  if (rec && rec.status === 'active') return { ok: false, reason: 'You already hold it.' };
  if (rec && rec.status === 'pending') {
    return { ok: false, reason: `Already applied — ${Math.ceil(rec.daysLeft)} days to go.` };
  }
  for (const need of def.requires || []) {
    if (!hasLicence(state, need)) {
      return { ok: false, reason: `${LICENCES[need].name} has to come first.` };
    }
  }
  // They look at the applicant, not just the form.
  const worst = Math.max(0, ...(state.districts || []).map((d) => d.heat || 0));
  if (worst > def.maxHeatToApply) {
    return {
      ok: false,
      reason: `Too much attention on you right now. Let things cool below ${def.maxHeatToApply} before applying.`,
    };
  }
  return { ok: true };
}

/**
 * Whether a firearms operation can run lawfully. Unlicensed manufacture still
 * works — it's just the other path, with everything that comes with it.
 */
export function legalManufacture(state, building) {
  const cls = classOf(building);
  if (!hasLicence(state, 'ffl07')) return false;
  if (cls.requiresLicence && !hasLicence(state, cls.requiresLicence)) return false;
  return true;
}

/**
 * What a licensed sale is worth against the street. Always less: the paperwork
 * is exactly what the buyer is paying to avoid.
 */
export function legalPriceFactor(building) {
  // A counter isn't tooled for anything, so it sells at the handgun margin
  // unless it's been told otherwise.
  return classOf(building).legalMargin;
}
