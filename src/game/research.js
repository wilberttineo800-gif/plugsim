// Research, and the things it turns out.
//
// Two ideas from the design note, and they belong together. A research facility
// develops new product — strains you bred yourself, weapons nobody else builds.
// And every so often the work throws off something one-off: an item that only
// exists because you made it, worth more the rarer it is and the higher your
// standing when it came out.
//
// The note also asked that rarity be gauged against how many exist in the
// world. Single-player, the world is your run, so rarity is measured against
// what you have already produced — the tenth of something is worth less than
// the first, which is the same shape as the real thing.

import { clamp01 } from './rng.js';

/** How long a project takes and what it needs behind it. */
export const RESEARCH = {
  // Progress is per game-hour at a plant running at reference size.
  basePerHour: 0.42,
  // A day of work is worth this much toward a discovery roll.
  discoveryPerDay: 0.16,
  maxProjects: 3,
};

/**
 * What a research facility can be put to work on. Each line ends in something
 * permanent: a better strain, a cheaper process, a weapon nobody else has.
 */
export const PROJECTS = {
  // --- Botany -------------------------------------------------------------
  phenohunt: {
    id: 'phenohunt',
    name: 'Pheno Hunt',
    field: 'botany',
    blurb:
      'Pop a few hundred seeds, keep the one plant worth keeping. The slow, real way a strain gets made.',
    cost: 2600000,
    hours: 260,
    effects: { qualityAdd: { weed: 0.12 } },
    result: 'Every grow you run turns out a better product.',
  },
  tissue: {
    id: 'tissue',
    name: 'Tissue Culture',
    field: 'botany',
    blurb:
      'Clean stock held in vitro instead of a room full of mothers. No drift, no pests, and it takes up a shelf.',
    cost: 4800000,
    hours: 400,
    requires: ['phenohunt'],
    effects: { yieldMult: { weed: 1.15 }, cycleMult: 0.92 },
    result: 'Grows yield more and come round faster.',
  },
  substrate: {
    id: 'substrate',
    name: 'Sterile Substrate',
    field: 'botany',
    blurb:
      'Properly pasteurised bulk and still-air work. Contamination is what kills a mushroom operation, not yield.',
    cost: 3100000,
    hours: 300,
    effects: { yieldMult: { shrooms: 1.22 }, qualityAdd: { shrooms: 0.1 } },
    result: 'Fruiting rooms lose far less to contamination.',
  },

  // --- Chemistry ----------------------------------------------------------
  reflux: {
    id: 'reflux',
    name: 'Reflux and Recovery',
    field: 'chemistry',
    blurb:
      'Recover your solvent instead of pouring it away. The single biggest cost in any extraction is the thing you throw out.',
    cost: 5400000,
    hours: 380,
    effects: { processCostMult: 0.72 },
    result: 'Processing costs drop by nearly a third.',
  },
  chromatography: {
    id: 'chromatography',
    name: 'Column Chromatography',
    field: 'chemistry',
    blurb:
      'Separate the fractions properly and you can sell the good one for what it is actually worth.',
    cost: 9200000,
    hours: 520,
    requires: ['reflux'],
    effects: { qualityAdd: { hash: 0.18, pills: 0.14 } },
    result: 'Everything that comes out of a lab is visibly better.',
  },

  // --- Engineering --------------------------------------------------------
  tooling: {
    id: 'tooling',
    name: 'Fixtures and Tooling',
    field: 'engineering',
    blurb:
      'Jigs and fixtures so parts come out the same every time. This is what separates a workshop from a manufacturer.',
    cost: 7400000,
    hours: 420,
    effects: { yieldMult: { iron: 1.2 } },
    result: 'Firearms shops turn out considerably more.',
  },
  metallurgy: {
    id: 'metallurgy',
    name: 'Heat Treatment',
    field: 'engineering',
    blurb:
      'Proper hardening and finishing. The difference between something that works and something that lasts.',
    cost: 11800000,
    hours: 600,
    requires: ['tooling'],
    effects: { qualityAdd: { iron: 0.2 } },
    result: 'Your iron is worth noticeably more per unit.',
  },
};

export const PROJECT_IDS = Object.keys(PROJECTS);

export const FIELDS = {
  botany: { id: 'botany', name: 'Botany' },
  chemistry: { id: 'chemistry', name: 'Chemistry' },
  engineering: { id: 'engineering', name: 'Engineering' },
};

export function projectById(id) {
  return PROJECTS[id] || null;
}

export function isResearched(state, id) {
  return (state.research || []).includes(id);
}

/** Whether a project can be started: prerequisites met, not already done. */
export function canResearch(state, id) {
  const p = PROJECTS[id];
  if (!p) return { ok: false, reason: 'No such project.' };
  if (isResearched(state, id)) return { ok: false, reason: 'Already done.' };
  if ((state.researchActive || []).some((r) => r.id === id)) {
    return { ok: false, reason: 'Already under way.' };
  }
  for (const need of p.requires || []) {
    if (!isResearched(state, need)) {
      return { ok: false, reason: `${PROJECTS[need].name} has to come first.` };
    }
  }
  if ((state.researchActive || []).length >= RESEARCH.maxProjects) {
    return { ok: false, reason: `Only ${RESEARCH.maxProjects} projects at a time.` };
  }
  return { ok: true };
}

/** Everything finished research does, combined. */
export function researchEffects(state) {
  const fx = {
    qualityAdd: {}, yieldMult: {}, cycleMult: 1, processCostMult: 1,
  };
  for (const id of state.research || []) {
    const p = PROJECTS[id];
    if (!p) continue;
    const e = p.effects || {};
    for (const [k, v] of Object.entries(e.qualityAdd || {})) {
      fx.qualityAdd[k] = (fx.qualityAdd[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(e.yieldMult || {})) {
      fx.yieldMult[k] = (fx.yieldMult[k] || 1) * v;
    }
    fx.cycleMult *= e.cycleMult ?? 1;
    fx.processCostMult *= e.processCostMult ?? 1;
  }
  return fx;
}

export function researchQuality(state, productId) {
  return researchEffects(state).qualityAdd[productId] || 0;
}

export function researchYield(state, productId) {
  return researchEffects(state).yieldMult[productId] || 1;
}

// --- Things that only exist because you made them ---------------------------

/**
 * Rarity tiers. The note asked that price follow rarity and the tier it was
 * crafted at, and that rarity be a function of how many exist. Here that means
 * how many you have made: the first of something is the story, the tenth is
 * stock.
 */
export const TIERS = [
  { id: 'common', name: 'Common', color: '#9aa7b5', weight: 52, value: 1 },
  { id: 'fine', name: 'Fine', color: '#6fd08c', weight: 28, value: 2.4 },
  { id: 'rare', name: 'Rare', color: '#4ea8ff', weight: 14, value: 6 },
  { id: 'exceptional', name: 'Exceptional', color: '#c06bff', weight: 5, value: 15 },
  { id: 'oneoff', name: 'One of One', color: '#ffb020', weight: 1, value: 44 },
];

/**
 * What a discovery can be. Each attaches to something you run, and each is a
 * real modifier rather than a trophy.
 */
export const ITEM_KINDS = {
  strain: {
    id: 'strain',
    name: 'Cultivar',
    field: 'botany',
    slot: 'building',
    blurb: 'A strain that only exists because you bred it.',
    effect: { yieldMult: 1.12, qualityAdd: 0.08 },
  },
  process: {
    id: 'process',
    name: 'Process',
    field: 'chemistry',
    slot: 'building',
    blurb: 'A way of doing it that nobody else worked out.',
    effect: { yieldMult: 1.1, costMult: 0.88 },
  },
  pattern: {
    id: 'pattern',
    name: 'Pattern',
    field: 'engineering',
    slot: 'building',
    blurb: 'A design of your own. Serialised to you and nobody else.',
    effect: { qualityAdd: 0.14 },
  },
  rig: {
    id: 'rig',
    name: 'Rig',
    field: 'engineering',
    slot: 'vehicle',
    blurb: 'Something fitted to a vehicle that you cannot buy.',
    effect: { capacityMult: 1.18, paceMult: 0.94 },
  },
  attachment: {
    id: 'attachment',
    name: 'Attachment',
    field: 'engineering',
    slot: 'firearm',
    blurb: 'Furniture for what you build. Bolts onto the line, not onto one gun.',
    // The real effect comes from the variant; this is the floor.
    effect: {},
    variants: true,
  },
};

/**
 * What an attachment actually is, and what fitting it to a line does to what
 * comes off it. A shop tooled for rifles that fits optics turns out a better
 * rifle, and every unit it makes carries it.
 */
export const ATTACHMENTS = {
  optic: {
    id: 'optic',
    name: 'Optic',
    blurb: 'Glass on a rail. The single thing that most changes what a weapon is worth.',
    effect: { qualityAdd: 0.10 },
  },
  suppressor: {
    id: 'suppressor',
    name: 'Suppressor',
    blurb: 'A can and a stack of baffles. Worth a great deal, and it is the part that needs the stamp.',
    effect: { valueMult: 1.25, heatMult: 1.2 },
    needsLicence: 'sot2',
  },
  compensator: {
    id: 'compensator',
    name: 'Compensator',
    blurb: 'Ports cut to keep the muzzle down. Slower to machine, better to shoot.',
    effect: { qualityAdd: 0.06, yieldMult: 0.97 },
  },
  extmag: {
    id: 'extmag',
    name: 'Extended Magazine',
    blurb: 'More rounds under the well. Simple, and people pay for it.',
    effect: { valueMult: 1.12 },
  },
  foregrip: {
    id: 'foregrip',
    name: 'Foregrip',
    blurb: 'Somewhere to put your other hand. Cheap to add, noticeably better to hold.',
    effect: { qualityAdd: 0.05 },
  },
  laser: {
    id: 'laser',
    name: 'Laser Module',
    blurb: 'A dot where the round goes. Sells itself.',
    effect: { valueMult: 1.08 },
  },
};

export const ATTACHMENT_VARIANTS = Object.keys(ATTACHMENTS);

/** How many attachments one line can carry. */
export const ATTACHMENT_SLOTS = 3;

export function attachmentById(id) {
  return ATTACHMENTS[id] || null;
}

/** Everything bolted to this firearms line, combined. */
export function attachmentEffects(state, building) {
  const fx = { qualityAdd: 0, valueMult: 1, heatMult: 1, yieldMult: 1 };
  for (const it of state.items || []) {
    if (it.kind !== 'attachment' || it.equippedTo !== building.id) continue;
    const a = ATTACHMENTS[it.variant];
    if (!a) continue;
    // Rarity counts here too: a finer example of the same part does more.
    const power = 1 + (tierById(it.tier).value - 1) * 0.1;
    const e = a.effect || {};
    fx.qualityAdd += (e.qualityAdd || 0) * power;
    fx.valueMult *= 1 + ((e.valueMult || 1) - 1) * power;
    fx.heatMult *= e.heatMult || 1;
    fx.yieldMult *= e.yieldMult || 1;
  }
  return fx;
}

/** What's fitted to a line, as variant ids, for drawing it. */
export function fittedTo(state, buildingId) {
  return (state.items || [])
    .filter((it) => it.kind === 'attachment' && it.equippedTo === buildingId)
    .map((it) => it.variant);
}

export const ITEM_KIND_IDS = Object.keys(ITEM_KINDS);

export function tierById(id) {
  return TIERS.find((t) => t.id === id) || TIERS[0];
}

/**
 * What one of these is worth. Rarity is the main lever, standing is the second
 * — a name that carries weight sells a thing for more — and each additional
 * copy you have made is worth less than the last.
 */
export function itemValue(state, item) {
  const tier = tierById(item.tier);
  const kind = ITEM_KINDS[item.kind];
  const base = 14000 * tier.value;

  // How well known you are, averaged across blocks you actually work.
  const worked = (state.districts || []).filter((d) => (d.rep || 0) > 0.05);
  const standing = worked.length
    ? worked.reduce((n, d) => n + d.rep, 0) / worked.length
    : 0;

  // Every one you've made of this kind and tier dilutes the next.
  const madeSame = (state.items || [])
    .filter((it) => it.kind === item.kind && it.tier === item.tier).length;
  const scarcity = 1 / (1 + Math.max(0, madeSame - 1) * 0.22);

  return Math.round(base * (0.7 + standing * 0.8) * scarcity * (kind ? 1 : 1));
}

/**
 * Roll for a discovery. Called once a day per research facility; the note asked
 * for "every few days a random item can be crafted", so the odds are set to
 * land roughly there for one facility, and better for a bigger operation.
 */
export function rollDiscovery(state, facility, scale, rand) {
  const chance = clamp01(RESEARCH.discoveryPerDay * Math.max(0.4, scale));
  if (rand() >= chance) return null;

  // Rarity climbs with how much property and money stand behind the work,
  // which is what the note meant by rank.
  const props = (state.lots || []).filter((l) => l.owned).length;
  const bank = state.cash.clean + state.cash.dirty;
  const rank = clamp01(props / 30 * 0.5 + Math.min(1, bank / 4000000) * 0.5);

  const weights = TIERS.map((t, i) => t.weight * (1 + rank * i * 0.9));
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = rand() * total;
  let tier = TIERS[0];
  for (let i = 0; i < TIERS.length; i++) {
    pick -= weights[i];
    if (pick <= 0) { tier = TIERS[i]; break; }
  }

  const field = facility.field || 'botany';
  const candidates = ITEM_KIND_IDS.filter((k) => ITEM_KINDS[k].field === field);
  const kind = candidates.length
    ? candidates[Math.floor(rand() * candidates.length) % candidates.length]
    : 'strain';

  // An attachment is a particular part, not a generic one.
  const variant = ITEM_KINDS[kind].variants
    ? ATTACHMENT_VARIANTS[Math.floor(rand() * ATTACHMENT_VARIANTS.length) % ATTACHMENT_VARIANTS.length]
    : null;

  return { kind, tier: tier.id, variant };
}

// Names are generated so a discovery reads like a thing, not a row in a table.
const PREFIX = [
  'Blackfriar', 'Kestrel', 'Nine Mile', 'Harrow', 'Saltmarsh', 'Ironvale',
  'Ash Row', 'Pale Horse', 'Longshore', 'Coldharbour', 'Renfrew', 'Dunmore',
];
const SUFFIX = {
  strain: ['Haze', 'Kush', 'Diesel', 'Gold', 'Widow', 'Runtz', 'Cap', 'Veil'],
  process: ['Wash', 'Reduction', 'Method', 'Cut', 'Pull', 'Fraction'],
  pattern: ['Pattern', 'Frame', 'Mark II', 'Carbine', 'Compact', 'Receiver'],
  rig: ['Rig', 'Kit', 'Loadout', 'Harness', 'Rack'],
};

export function nameFor(kind, rand, variant) {
  const a = PREFIX[Math.floor(rand() * PREFIX.length) % PREFIX.length];
  if (kind === 'attachment' && ATTACHMENTS[variant]) {
    return `${a} ${ATTACHMENTS[variant].name}`;
  }
  const list = SUFFIX[kind] || SUFFIX.strain;
  const b = list[Math.floor(rand() * list.length) % list.length];
  return `${a} ${b}`;
}
