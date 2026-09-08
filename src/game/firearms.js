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
    cost: 9000,
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
    cost: 24000,
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
    cost: 41000,
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
