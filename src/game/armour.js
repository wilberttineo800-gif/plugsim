// Body armour is the other half of the same trade, and it is deliberately not
// a reskin of firearms.
//
// Three things make it its own business:
//
//   1. **It is mostly legal.** Making and selling body armour needs no federal
//      licence in the United States; what it needs is TESTING. A plate is
//      either on the NIJ compliant products list or it is a lump of ceramic
//      somebody is willing to take your word about. So the paperwork here is a
//      certification rather than a permit, and the fraud is selling uncertified
//      product as certified.
//   2. **It runs cold.** Every class of armour draws a fraction of the
//      attention iron does. A quiet, lower-margin line that can absorb a lot of
//      floorspace is a genuine alternative to a hot one, which is the point.
//   3. **The spread is materials, not machining.** A stab vest is aramid on a
//      sewing machine. A Level IV plate is silicon carbide pressed and cured
//      against a backer, and it takes as long as it takes.
//
// Prices below are anchored to what this stuff actually costs: a concealable
// Level II vest around $350, a IIIA vest $300-800, rifle plates $500-1000 a
// pair, Level IV $700-1500 a set, a plate carrier alone $150-1000, a helmet
// from $150, a small IIIA shield about $400.

/**
 * What a shop is tooled to build. Rated the way armour is actually rated —
 * by what it stops — because that is what the price tracks.
 */
export const ARMOUR_CLASSES = {
  stab: {
    id: 'stab',
    // Edged and spike rated. Against a bullet it is a shirt.
    protection: { level: 0.05, covers: ['thorax', 'abdomen'] },
    name: 'Stab Vests',
    blurb: 'Edged and spike rated, not ballistic. Layered aramid on a sewing machine — the simplest thing in the trade and it always moves.',
    valueMult: 0.72,
    yieldMult: 1.6,
    heatMult: 0.25,
    legalMargin: 0.85,
  },
  carrier: {
    id: 'carrier',
    // A carrier holds plates. On its own it stops nothing at all.
    protection: { level: 0.02, covers: ['thorax'] },
    name: 'Plate Carriers',
    blurb: 'Cordura, webbing and buckles. Stops nothing on its own, which is exactly why everybody who buys plates buys one too.',
    valueMult: 0.85,
    yieldMult: 1.5,
    heatMult: 0.25,
    legalMargin: 0.86,
  },
  covert: {
    id: 'covert',
    // Level II: 9mm and .357. What most people who are shot at are shot with.
    protection: { level: 0.38, covers: ['thorax', 'abdomen'] },
    name: 'Concealable Vests',
    blurb: 'Level II, worn under a shirt. The vest most people who wear one every day are actually wearing.',
    valueMult: 1,
    yieldMult: 1.35,
    heatMult: 0.3,
    legalMargin: 0.8,
  },
  helmet: {
    id: 'helmet',
    // Handgun rounds and fragments. A rifle round through a helmet is still a rifle round.
    protection: { level: 0.40, covers: ['head'] },
    name: 'Ballistic Helmets',
    blurb: 'A moulded aramid shell, a suspension and a shroud. Slow work — the shell is pressed in one piece or it is scrap — and worth more than a vest, which is why it is worth the wait.',
    valueMult: 1.75,
    yieldMult: 0.65,
    heatMult: 0.4,
    legalMargin: 0.75,
  },
  soft: {
    id: 'soft',
    // Level IIIA: everything a handgun throws, up to .44 Magnum.
    protection: { level: 0.50, covers: ['thorax', 'abdomen'] },
    name: 'Soft Armour',
    blurb: 'Level IIIA panels. Stops everything a handgun throws and nothing a rifle does. The working vest, and the volume seller.',
    valueMult: 1.55,
    yieldMult: 1,
    heatMult: 0.35,
    legalMargin: 0.78,
  },
  rifle: {
    id: 'rifle',
    // Level III: rifle ball. Only over the plate — the plate is smaller than you are.
    protection: { level: 0.78, covers: ['thorax'] },
    name: 'Rifle Plates',
    blurb: 'Level III and III+. Where armour stops being clothing and starts being engineering.',
    valueMult: 2.1,
    yieldMult: 0.62,
    heatMult: 0.5,
    legalMargin: 0.72,
  },
  ceramic: {
    id: 'ceramic',
    // Level IV: armour-piercing rifle. The most that is made.
    protection: { level: 0.92, covers: ['thorax'] },
    name: 'Ceramic Plates',
    blurb: 'Level IV. Silicon carbide pressed against a backer, cured, and tested one at a time. Stops armour-piercing rifle and costs accordingly.',
    valueMult: 3.4,
    yieldMult: 0.45,
    heatMult: 0.55,
    legalMargin: 0.7,
  },
  shield: {
    id: 'shield',
    // Whatever is behind it, when it happens to be in the way.
    protection: { level: 0.60, covers: ['thorax', 'abdomen', 'armL'] },
    name: 'Ballistic Shields',
    blurb: 'Handheld and barricade. Almost nobody but a department buys one, and a department will not buy one without paper.',
    valueMult: 4,
    yieldMult: 0.4,
    heatMult: 0.6,
    legalMargin: 0.68,
    requiresLicence: 'leSupply',
  },
};

export const ARMOUR_CLASS_IDS = Object.keys(ARMOUR_CLASSES);

/**
 * How well a set protects a given body part, 0 to 1.
 *
 * A plate carrier and a plate are not the same thing, and neither covers your
 * arms — the single most-hit part of anybody who survives being shot. So this
 * asks per part rather than returning one number for "wearing armour".
 */
export function protectionAt(classId, partId) {
  const cls = ARMOUR_CLASSES[classId];
  const p = cls && cls.protection;
  if (!p || !p.covers.includes(partId)) return 0;
  return p.level;
}

/**
 * The patterns within a class. Each is a real trade-off in materials: steel is
 * cheap and heavy and spalls, polyethylene is light and expensive and floats.
 */
export const ARMOUR_MODELS = {
  // --- Stab -----------------------------------------------------------------
  weaver: {
    id: 'weaver', category: 'stab', name: 'Weaver Stab Vest',
    blurb: 'Layered aramid, spike rated. Quick to cut and quick to sew.',
    valueMult: 1, yieldMult: 1,
  },
  mailliner: {
    id: 'mailliner', category: 'stab', name: 'Mail Liner',
    blurb: 'Titanium mail under a shirt. Heavy, slow to link, and nothing gets through it.',
    valueMult: 1.35, yieldMult: 0.8,
  },

  // --- Carriers -------------------------------------------------------------
  slick: {
    id: 'slick', category: 'carrier', name: 'Slick Carrier',
    blurb: 'No webbing, no pouches. Goes under a jacket and nobody looks twice.',
    valueMult: 0.85, yieldMult: 1.2,
  },
  rigger: {
    id: 'rigger', category: 'carrier', name: 'Rigger Rig',
    blurb: 'Laser-cut laminate, cummerbund, every pouch you can hang off it.',
    valueMult: 1.3, yieldMult: 0.85,
  },

  // --- Concealable ----------------------------------------------------------
  shadow: {
    id: 'shadow', category: 'covert', name: 'Shadow Undervest',
    blurb: 'Thin enough to wear against the skin all day. Front panel only.',
    valueMult: 0.9, yieldMult: 1.15,
  },
  dayshift: {
    id: 'dayshift', category: 'covert', name: 'Dayshift II',
    blurb: 'Front and back panels in a carrier cut like a waistcoat. What a shift actually wears.',
    valueMult: 1.15, yieldMult: 0.9,
  },

  // --- Helmets --------------------------------------------------------------
  highcut: {
    id: 'highcut', category: 'helmet', name: 'High-Cut Shell',
    blurb: 'Cut away at the ears for comms and a rifle stock. Rails down both sides.',
    valueMult: 1.1, yieldMult: 0.95,
  },
  fullcut: {
    id: 'fullcut', category: 'helmet', name: 'Full-Cut Lid',
    blurb: 'Full coverage down past the ear. Heavier, cheaper, and more of it.',
    valueMult: 0.85, yieldMult: 1.15,
  },

  // --- Soft -----------------------------------------------------------------
  patrol: {
    id: 'patrol', category: 'soft', name: 'Patrol IIIA',
    blurb: 'The standard vest. Aramid panels, outer carrier, name tape.',
    valueMult: 1, yieldMult: 1,
  },
  sheerweb: {
    id: 'sheerweb', category: 'soft', name: 'Sheerweb IIIA',
    blurb: 'Polyethylene instead of aramid. Half the weight, twice the price, and it will not take a hot wash.',
    valueMult: 1.5, yieldMult: 0.7,
  },

  // --- Rifle plates ---------------------------------------------------------
  hardline: {
    id: 'hardline', category: 'rifle', name: 'Hardline Steel III',
    blurb: 'AR500 steel with a spall coat. Cheap, indestructible, and eight pounds each.',
    valueMult: 0.7, yieldMult: 1.4,
  },
  polyplate: {
    id: 'polyplate', category: 'rifle', name: 'Poly III+',
    blurb: 'Pressed polyethylene. Floats, weighs nothing, and stops the round steel does not.',
    valueMult: 1.4, yieldMult: 0.75,
  },

  // --- Ceramic --------------------------------------------------------------
  carbide: {
    id: 'carbide', category: 'ceramic', name: 'Carbide IV',
    blurb: 'Silicon carbide strike face on a polyethylene backer. The standard Level IV plate.',
    valueMult: 1, yieldMult: 1,
  },
  boronlite: {
    id: 'boronlite', category: 'ceramic', name: 'Boron IV Lite',
    blurb: 'Boron carbide. Two pounds lighter than silicon and roughly twice the money, which people pay.',
    valueMult: 1.7, yieldMult: 0.6,
  },

  // --- Shields --------------------------------------------------------------
  minishield: {
    id: 'minishield', category: 'shield', name: 'Mini Shield',
    blurb: 'Twelve by eighteen, one hand, Level IIIA. Lives in a boot until it does not.',
    valueMult: 0.6, yieldMult: 1.4,
  },
  barricade: {
    id: 'barricade', category: 'shield', name: 'Barricade Shield',
    blurb: 'Full body, Level III, viewport and a light. Two people to move it and a department to afford it.',
    valueMult: 1.8, yieldMult: 0.55,
  },
};

export const ARMOUR_MODEL_IDS = Object.keys(ARMOUR_MODELS);

/** The default a line runs on before anyone tools it. */
export const DEFAULT_ARMOUR_LINE = 'covert';

export function armourModelsFor(classId) {
  return ARMOUR_MODEL_IDS
    .filter((id) => ARMOUR_MODELS[id].category === classId)
    .map((id) => ARMOUR_MODELS[id]);
}

export function armourClassOf(building) {
  return ARMOUR_CLASSES[building && building.line] || ARMOUR_CLASSES[DEFAULT_ARMOUR_LINE];
}

export function armourModelOf(building) {
  const m = building && building.model ? ARMOUR_MODELS[building.model] : null;
  // Only honour a pattern that belongs to what the line is tooled for.
  return m && m.category === armourClassOf(building).id ? m : null;
}
