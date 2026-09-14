// Everything a person is made of, and what each piece is worth.
//
// The eight regions in health.js are where a round LANDS — they are the target
// a bullet picks and the area a plate covers. This is what is inside them.
// Separating the two is what lets a chest hit mean "it went through the lower
// lobe of the right lung" rather than "the chest took 0.4 damage", and it is
// what makes a harvest a list of specific things rather than a number.
//
// Two real markets, and they are about a hundred times apart:
//
//   TRANSPLANT. A living organ for somebody waiting for one. Reported
//   trafficking figures: kidney $50-120k, liver $99-157k, heart $119-290k,
//   corneas to $30k. Enormous money, and a cold clock measured in hours.
//
//   TISSUE. What a body is worth to research and training, which in the United
//   States is barely regulated at all. Reuters bought two heads and a cervical
//   spine for $900; a whole cadaver runs $3-5k, a torso $4,000, an arm and
//   shoulder $600, a spine $300. Heart valves fetch $5-7k and skin about
//   $1,000 a square foot. Small money, and almost no clock.
//
// The interesting consequence is that nothing is ever worthless. Miss the
// five-hour window on a heart and it is worth nothing as a heart — but the
// valves in it are still tissue, and tissue keeps. Moving fast is worth two
// orders of magnitude, not the difference between something and nothing.

import { clamp01 } from './rng.js';

/** What kind of thing a part is. Drives how it is drawn and how it is priced. */
export const PART_KINDS = {
  organ:  { id: 'organ', name: 'Organ' },
  bone:   { id: 'bone', name: 'Bone' },
  tissue: { id: 'tissue', name: 'Soft tissue' },
  vessel: { id: 'vessel', name: 'Vessel' },
  sense:  { id: 'sense', name: 'Sense organ' },
  neural: { id: 'neural', name: 'Neural' },
};

/**
 * Every part, keyed by id.
 *
 * `region`      which of the eight it lives in
 * `count`       how many a person has
 * `vital`       destroying it is fatal
 * `depth`       0 surface, 1 deep — how likely a round to that region reaches it
 * `transplant`  [lo, hi] and the cold time in hours, or null
 * `tissue`      [lo, hi] for the research trade, or null
 */
export const PARTS = {
  // --- Head -----------------------------------------------------------------
  brain: {
    id: 'brain', name: 'Brain', region: 'head', kind: 'neural', count: 1,
    symptom: 'Nothing. This is not survivable and never has been.',
    vital: true, depth: 0.9, transplant: null, tissue: [400, 900],
    note: 'No transplant market and there never will be. Worth something to a lab and nothing to anybody else.',
  },
  skull: {
    id: 'skull', name: 'Skull', region: 'head', kind: 'bone', count: 1,
    symptom: 'A soft place on the head and a headache that does not go.',
    depth: 0.3, transplant: null, tissue: [300, 600],
    note: 'Reuters paid about $450 a head. Nothing about that was illegal.',
  },
  cornea: {
    id: 'cornea', name: 'Cornea', region: 'head', kind: 'sense', count: 2,
    symptom: 'Everything on that side is behind frosted glass.',
    component: 'eye', depth: 0.15, transplant: { price: [9000, 30000], hours: 336 }, tissue: [200, 500],
    note: 'Keeps for a fortnight in a jar. The only thing here you can take your time with.',
  },
  eye: {
    id: 'eye', name: 'Eye', region: 'head', kind: 'sense', count: 2,
    symptom: 'Blind on one side, and no idea how far away anything is.',
    depth: 0.2, capacity: 'sight', transplant: null, tissue: [150, 400],
  },
  ear: {
    id: 'ear', name: 'Ear', region: 'head', kind: 'sense', count: 2,
    symptom: 'Deaf on that side. Turning the head quickly puts you on the floor.',
    depth: 0.1, transplant: null, tissue: [100, 260],
  },
  jaw: {
    id: 'jaw', name: 'Jaw', region: 'head', kind: 'bone', count: 1,
    symptom: 'Cannot chew. Everything through a straw.',
    depth: 0.25, transplant: null, tissue: [180, 420],
  },

  // --- Neck -----------------------------------------------------------------
  cervicalSpine: {
    id: 'cervicalSpine', name: 'Cervical spine', region: 'neck', kind: 'bone', count: 1,
    symptom: 'Nothing survives this.',
    vital: true, depth: 0.6, transplant: null, tissue: [250, 400],
    note: 'A documented line item. Three hundred dollars, freight extra.',
  },
  trachea: {
    id: 'trachea', name: 'Trachea', region: 'neck', kind: 'organ', count: 1,
    symptom: 'Breathing through a hole in the throat, badly.',
    vital: true, depth: 0.4, capacity: 'breathing',
    transplant: { price: [18000, 55000], hours: 8 }, tissue: [200, 500],
  },
  thyroid: {
    id: 'thyroid', name: 'Thyroid', region: 'neck', kind: 'organ', count: 1,
    symptom: 'Cold all the time, exhausted, and the weight climbs whatever you do.',
    depth: 0.45, transplant: null, tissue: [300, 700],
  },
  carotid: {
    id: 'carotid', name: 'Carotid', region: 'neck', kind: 'vessel', count: 2,
    symptom: 'One is survivable. Losing both is not.',
    vital: true, depth: 0.5, transplant: null, tissue: [600, 1400],
    note: 'Vascular graft. Also the reason a neck wound empties somebody in minutes.',
  },

  // --- Chest ----------------------------------------------------------------
  heart: {
    id: 'heart', name: 'Heart', region: 'thorax', kind: 'organ', count: 1,
    symptom: 'There is no version of this anybody walks away from.',
    vital: true, depth: 0.85,
    transplant: { price: [119000, 290000], hours: 5 }, tissue: [1200, 2600],
    note: 'Five hours and then it is nothing — as a heart. The valves in it keep.',
  },
  heartValve: {
    id: 'heartValve', name: 'Heart valve', region: 'thorax', kind: 'tissue', count: 4,
    // Part of the heart rather than a thing a bullet finds on its own. It is
    // harvested separately because the market treats it separately — the heart
    // spoils in five hours and the valves in it do not.
    symptom: 'A murmur you can hear across a room, and stairs are a problem.',
    component: 'heart', depth: 0.85, transplant: null, tissue: [5000, 7000],
    note: 'Five to seven thousand each, and they do not spoil the way the heart does.',
  },
  lung: {
    id: 'lung', name: 'Lung', region: 'thorax', kind: 'organ', count: 2,
    symptom: 'Fine sitting down. Twenty yards at a run and the world goes grey.',
    vital: true, depth: 0.7, capacity: 'breathing',
    transplant: { price: [70000, 140000], hours: 6 }, tissue: [400, 900],
  },
  ribs: {
    id: 'ribs', name: 'Ribs', region: 'thorax', kind: 'bone', count: 1,
    symptom: 'Every breath is a decision. Coughing is out of the question.',
    depth: 0.2, transplant: null, tissue: [350, 800],
  },
  sternum: {
    id: 'sternum', name: 'Sternum', region: 'thorax', kind: 'bone', count: 1,
    symptom: 'The chest grinds when you move.',
    depth: 0.25, transplant: null, tissue: [180, 400],
  },
  thoracicSpine: {
    id: 'thoracicSpine', name: 'Thoracic spine', region: 'thorax', kind: 'bone', count: 1,
    symptom: 'Nothing below the injury works, if anything works at all.',
    vital: true, depth: 0.8, transplant: null, tissue: [300, 550],
  },
  oesophagus: {
    id: 'oesophagus', name: 'Oesophagus', region: 'thorax', kind: 'organ', count: 1,
    symptom: 'Solids do not go down. Nothing stays down long.',
    depth: 0.75, transplant: null, tissue: [200, 480],
  },
  diaphragm: {
    id: 'diaphragm', name: 'Diaphragm', region: 'thorax', kind: 'tissue', count: 1,
    symptom: 'Shallow, fast breathing that never quite catches up.',
    depth: 0.6, capacity: 'breathing', transplant: null, tissue: [250, 600],
  },

  // --- Abdomen --------------------------------------------------------------
  liver: {
    id: 'liver', name: 'Liver', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'Yellow, then confused, then gone. Days at the outside.',
    vital: true, depth: 0.6,
    transplant: { price: [99000, 157000], hours: 11 }, tissue: [500, 1100],
    note: 'Friable. It tears well beyond anything that actually touched it.',
  },
  kidney: {
    id: 'kidney', name: 'Kidney', region: 'abdomen', kind: 'organ', count: 2,
    symptom: 'One and you drink more water. Both and it is days.',
    vital: true, depth: 0.75,
    transplant: { price: [50000, 120000], hours: 30 }, tissue: [400, 900],
    note: 'Two of them and a day and a half on ice. This is what the trade actually runs on.',
  },
  pancreas: {
    id: 'pancreas', name: 'Pancreas', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'Diabetic from the moment it comes out. Insulin for the rest of it.',
    depth: 0.8, transplant: { price: [40000, 90000], hours: 15 }, tissue: [300, 700],
  },
  spleen: {
    id: 'spleen', name: 'Spleen', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'Every infection that gets in takes hold, and takes hold fast.',
    depth: 0.65, transplant: null, tissue: [250, 600],
  },
  stomach: {
    id: 'stomach', name: 'Stomach', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'Small meals, constantly, and none of them stay.',
    depth: 0.55, transplant: null, tissue: [200, 500],
  },
  smallBowel: {
    id: 'smallBowel', name: 'Small bowel', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'Nothing is absorbed. Wasting, whatever goes in.',
    depth: 0.5, transplant: { price: [22000, 60000], hours: 8 }, tissue: [250, 600],
    note: 'Perforated bowel is the reason an abdominal wound is the dirtiest wound there is.',
  },
  largeBowel: {
    id: 'largeBowel', name: 'Large bowel', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'A bag, for good.',
    depth: 0.45, transplant: null, tissue: [180, 420],
  },
  gallbladder: {
    id: 'gallbladder', name: 'Gallbladder', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'Anything fried is a bad night.',
    depth: 0.6, transplant: null, tissue: [90, 240],
  },
  bladder: {
    id: 'bladder', name: 'Bladder', region: 'abdomen', kind: 'organ', count: 1,
    symptom: 'A bag, for good.',
    depth: 0.5, transplant: null, tissue: [180, 460],
  },
  adrenal: {
    id: 'adrenal', name: 'Adrenal gland', region: 'abdomen', kind: 'organ', count: 2,
    symptom: 'Upright and fine until the first shock, and then flat on the floor.',
    depth: 0.8, transplant: null, tissue: [220, 520],
  },
  lumbarSpine: {
    id: 'lumbarSpine', name: 'Lumbar spine', region: 'abdomen', kind: 'bone', count: 1,
    symptom: 'Nothing below the waist.',
    vital: true, depth: 0.85, transplant: null, tissue: [280, 520],
  },
  pelvis: {
    id: 'pelvis', name: 'Pelvis', region: 'abdomen', kind: 'bone', count: 1,
    symptom: 'Cannot bear weight on either side. A chair from here on.',
    depth: 0.4, transplant: null, tissue: [350, 800],
  },
  marrow: {
    id: 'marrow', name: 'Marrow', region: 'abdomen', kind: 'tissue', count: 1,
    symptom: 'No immunity to speak of. Bruises from nothing, and they stay.',
    component: 'pelvis', depth: 0.7, transplant: { price: [14000, 42000], hours: 48 }, tissue: [300, 700],
    note: 'Drawn from the pelvis. Two days, and a buyer has to be waiting.',
  },

  // --- Arms (each side) -----------------------------------------------------
  humerus: {
    id: 'humerus', name: 'Humerus', region: 'arm', kind: 'bone', count: 1, paired: true,
    symptom: 'The arm will not take any load at all.',
    depth: 0.5, transplant: null, tissue: [200, 450],
  },
  forearmBones: {
    id: 'forearmBones', name: 'Radius and ulna', region: 'arm', kind: 'bone', count: 1, paired: true,
    symptom: 'Cannot turn the wrist or carry anything in that hand.',
    depth: 0.5, transplant: null, tissue: [160, 380],
  },
  hand: {
    id: 'hand', name: 'Hand', region: 'arm', kind: 'tissue', count: 1, paired: true,
    symptom: 'No grip on that side. Everything two-handed is now one-handed.',
    depth: 0.1, capacity: 'manipulation', transplant: null, tissue: [280, 650],
  },
  armTendons: {
    id: 'armTendons', name: 'Arm tendons', region: 'arm', kind: 'tissue', count: 1, paired: true,
    symptom: 'The fingers will not close. The arm is there and does nothing.',
    depth: 0.35, capacity: 'manipulation', transplant: null, tissue: [400, 1100],
    note: 'Graft stock. A real product with a real catalogue number.',
  },
  armSkin: {
    id: 'armSkin', name: 'Arm skin', region: 'arm', kind: 'tissue', count: 1, paired: true,
    symptom: 'Open to the air and to everything in it.',
    depth: 0.05, transplant: null, tissue: [900, 2400],
    note: 'About a thousand dollars a square foot, to dress the wounds of burn victims.',
  },

  // --- Legs (each side) -----------------------------------------------------
  femur: {
    id: 'femur', name: 'Femur', region: 'leg', kind: 'bone', count: 1, paired: true,
    symptom: 'That leg will not hold you. Crutches, permanently.',
    depth: 0.55, transplant: null, tissue: [300, 700],
    note: 'Femoral heads are the most-used bone graft there is.',
  },
  knee: {
    id: 'knee', name: 'Knee', region: 'leg', kind: 'tissue', count: 1, paired: true,
    symptom: 'It does not bend and it does not lock. Stairs one at a time.',
    depth: 0.3, capacity: 'moving', transplant: null, tissue: [500, 900],
    note: 'A documented line item, about six hundred and fifty dollars.',
  },
  shinBones: {
    id: 'shinBones', name: 'Tibia and fibula', region: 'leg', kind: 'bone', count: 1, paired: true,
    symptom: 'Cannot walk on it unaided.',
    depth: 0.5, transplant: null, tissue: [220, 500],
  },
  foot: {
    id: 'foot', name: 'Foot', region: 'leg', kind: 'tissue', count: 1, paired: true,
    symptom: 'No balance on that side.',
    depth: 0.1, capacity: 'moving', transplant: null, tissue: [200, 480],
  },
  achilles: {
    id: 'achilles', name: 'Achilles tendon', region: 'leg', kind: 'tissue', count: 1, paired: true,
    symptom: 'Cannot push off. A limp that never goes.',
    depth: 0.3, capacity: 'moving', transplant: null, tissue: [600, 1500],
  },
  saphenous: {
    id: 'saphenous', name: 'Saphenous vein', region: 'leg', kind: 'vessel', count: 1, paired: true,
    symptom: 'The leg swells by the evening, every evening.',
    depth: 0.2, transplant: { price: [2000, 6000], hours: 20 }, tissue: [500, 1300],
    note: 'The vein they take for a bypass. There is a real, legal market in these.',
  },
  femoralArtery: {
    id: 'femoralArtery', name: 'Femoral artery', region: 'leg', kind: 'vessel', count: 1, paired: true,
    symptom: 'Minutes, unless somebody ties it off. Then the leg goes.',
    vital: true, depth: 0.6, transplant: null, tissue: [500, 1200],
    note: 'Runs the length of the thigh. A wound that finds it empties somebody in minutes.',
  },
  legSkin: {
    id: 'legSkin', name: 'Leg skin', region: 'leg', kind: 'tissue', count: 1, paired: true,
    symptom: 'Open to the air and to everything in it.',
    depth: 0.05, transplant: null, tissue: [1100, 3000],
  },
};

export const PART_IDS = Object.keys(PARTS);

/**
 * Can a person live without this one?
 *
 * `vital` means ALL of them gone is fatal, not any of them. That distinction
 * is the whole reason somebody can be walking around one kidney and one lung
 * short: there were two to begin with, and one is enough. A single vital organ
 * — heart, liver, brain — has no spare, so taking it is killing them.
 */
export function survivesWithout(part, alreadyMissing = 0) {
  if (!part) return true;
  if (!part.vital) return true;
  return alreadyMissing + 1 < countOf(part);
}

/** Parts a person can lose and keep going, for a UI that offers the choice. */
/** What being short of one is actually like. */
export function symptomOf(partId) {
  const p = PARTS[partId];
  return (p && p.symptom) || null;
}

/** Everything a body is currently short of, with what that means. */
export function symptomsFor(missing) {
  const out = [];
  for (const id of Object.keys(missing || {})) {
    const n = missing[id];
    if (!n) continue;
    const part = PARTS[id];
    if (!part || !part.symptom) continue;
    out.push({ part, n, gone: n >= countOf(part), symptom: part.symptom });
  }
  return out.sort((a, b) => (b.gone ? 1 : 0) - (a.gone ? 1 : 0));
}

export function harvestableAlive(regionFilter = null) {
  return PART_IDS
    .map((id) => PARTS[id])
    .filter((p) => (!regionFilter || p.region === regionFilter) && survivesWithout(p, 0));
}

/** Region ids as the anatomy uses them — arms and legs are one entry each side. */
export const REGION_OF = {
  head: 'head', neck: 'neck', thorax: 'thorax', abdomen: 'abdomen',
  armL: 'arm', armR: 'arm', legL: 'leg', legR: 'leg',
};

/** Everything inside one of the eight regions a round can land in. */
export function partsIn(regionId) {
  const anatomical = REGION_OF[regionId] || regionId;
  return PART_IDS.filter((id) => PARTS[id].region === anatomical).map((id) => PARTS[id]);
}

/**
 * The structures a wound track can actually find.
 *
 * Excludes components — a valve is part of the heart, not a separate thing a
 * bullet hits, and counting it as one made valves the most-struck structure in
 * the chest.
 */
export function targetsIn(regionId) {
  return partsIn(regionId).filter((p) => !p.component);
}

/** How many of a given part a whole person has. */
export function countOf(part) {
  return part.paired ? part.count * 2 : part.count;
}

/** Is there a transplant market for it at all? */
export function isTransplantable(part) {
  return !!(part && part.transplant);
}

/**
 * What one of these is worth, given how long it has been out.
 *
 * The whole point of the two markets sits in this one function. A part with a
 * transplant value is worth that while it is still viable; past its cold time
 * it falls back to what a research buyer will pay, which is roughly a hundred
 * times less and does not expire. Nothing is ever worth nothing.
 */
export function partValue(part, hoursOut = 0, quality = 1) {
  if (!part) return { value: 0, market: 'none' };
  const q = clamp01(quality);
  const tx = part.transplant;
  if (tx) {
    const v = viabilityOf(tx.hours, hoursOut);
    if (v > 0) {
      const [lo, hi] = tx.price;
      return { value: Math.round((lo + (hi - lo) * q) * v), market: 'transplant', viability: v };
    }
  }
  if (part.tissue) {
    const [lo, hi] = part.tissue;
    return { value: Math.round(lo + (hi - lo) * q), market: 'tissue', viability: 1 };
  }
  return { value: 0, market: 'none', viability: 0 };
}

/**
 * How good a transplant organ still is, 0 to 1.
 *
 * Flat for the first third of its cold time, then away fast. A heart an hour
 * late is not worth a little less; it is worth nothing as a heart.
 */
export function viabilityOf(coldHours, hoursOut) {
  if (!coldHours) return 0;
  const f = hoursOut / coldHours;
  if (f <= 0.33) return 1;
  if (f >= 1) return 0;
  return clamp01(Math.pow(1 - (f - 0.33) / 0.67, 1.6));
}

/** What a whole intact person is worth on each market, for a sanity figure. */
export function wholeBodyValue() {
  let transplant = 0, tissue = 0;
  for (const id of PART_IDS) {
    const p = PARTS[id];
    const n = countOf(p);
    if (p.transplant) transplant += ((p.transplant.price[0] + p.transplant.price[1]) / 2) * n;
    if (p.tissue) tissue += ((p.tissue[0] + p.tissue[1]) / 2) * n;
  }
  return { transplant: Math.round(transplant), tissue: Math.round(tissue) };
}
