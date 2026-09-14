// Bodies, and what happens to them.
//
// The brief was "real effects", so this is built off trauma medicine rather
// than off a hit-point bar. Four things drive the whole model, and each one is
// something the literature actually says:
//
//   1. **Where it lands matters more than how hard.** Ballistic injury severity
//      depends on the part of the body hit and the path taken through it. Solid
//      friable organs — liver, brain — tear far beyond the bullet track because
//      of temporary cavitation, while a limb can take the same round and keep
//      working. So damage is resolved per body part, not against one pool.
//
//   2. **The wound type is a real taxonomy.** Ballistic wounds are classified
//      penetrating (projectile stays in), perforating (in and out), and
//      avulsive (tissue gone). These are not flavour: a retained projectile is
//      a foreign body and drives infection, while a through-and-through bleeds
//      from two holes instead of one.
//
//   3. **Untreated is a clock, not a state.** Contamination sets in past about
//      twelve hours of field exposure; delays past twenty-four correlate with
//      sepsis, exsanguination, multi-organ failure and amputation. Infection
//      complicates 20-30% of gunshot wounds, and extremity wounds carry
//      fracture in 40-70% of cases, which is what opens the door to
//      osteomyelitis and compartment syndrome.
//
//   4. **Armour changes the KIND of injury, not just the amount.** A vest that
//      stops a round still transmits the energy: behind-armour blunt trauma is
//      skin contusion, rib fracture and pulmonary contusion from the back face
//      deforming into the chest. So armour converts a penetrating wound into a
//      blunt one — far more survivable, rarely nothing at all.
//
// Everything below is a consequence of those four. Nothing here is, or is
// intended to be, useful outside the game.

import { clamp, clamp01 } from './rng.js';
import {
  targetsIn, PARTS, PART_IDS, countOf, survivesWithout,
} from './anatomy.js';

// --- The body ---------------------------------------------------------------

/**
 * Body parts, with the share of frontal presented area each one is.
 *
 * `hitShare` sums to 1 and is roughly anatomical: the chest is the biggest
 * single target and the neck the smallest, which is why extremity wounds
 * dominate survivable gunshot injury and head and chest dominate the deaths.
 *
 * `bleed` is how hard that part bleeds for a given severity — the neck and
 * chest carry the great vessels, a forearm does not.
 */
export const BODY_PARTS = {
  head: {
    id: 'head', name: 'Head', vital: true, hitShare: 0.09, bleed: 0.8,
    capacities: ['consciousness'],
    note: 'Brain tissue tears well beyond the track. Very little of this is survivable.',
  },
  neck: {
    id: 'neck', name: 'Neck', vital: true, hitShare: 0.04, bleed: 1.7,
    // The neck does not PROVIDE consciousness or breathing — it carries them.
    // Listing it as a source made it a second supply, so a destroyed head left
    // you half conscious. It caps them instead: airway and carotid, and
    // nothing gets past a neck that has been opened.
    capacities: [],
    limits: ['consciousness', 'breathing'],
    note: 'Airway and the great vessels in a hand’s width. Bleeds faster than anywhere else.',
  },
  thorax: {
    id: 'thorax', name: 'Chest', vital: true, hitShare: 0.28, bleed: 1.4,
    capacities: ['breathing'],
    note: 'Heart and lungs. A chest wound that opens the pleura collapses the lung on that side.',
  },
  abdomen: {
    id: 'abdomen', name: 'Abdomen', vital: true, hitShare: 0.19, bleed: 1.2,
    capacities: [],
    note: 'Liver and spleen tear; bowel spills. The infection risk here is the highest in the body.',
  },
  armL: {
    id: 'armL', name: 'Left arm', side: 'left', limb: true, hitShare: 0.09, bleed: 0.6,
    capacities: ['manipulation'],
    note: 'Survivable, and the most commonly hit part of anybody who lives to be counted.',
  },
  armR: {
    id: 'armR', name: 'Right arm', side: 'right', limb: true, hitShare: 0.09, bleed: 0.6,
    capacities: ['manipulation'],
    note: 'Survivable, and the most commonly hit part of anybody who lives to be counted.',
  },
  legL: {
    id: 'legL', name: 'Left leg', side: 'left', limb: true, hitShare: 0.11, bleed: 0.9,
    capacities: ['moving'],
    note: 'The femoral artery runs the length of it. A thigh wound can empty somebody in minutes.',
  },
  legR: {
    id: 'legR', name: 'Right leg', side: 'right', limb: true, hitShare: 0.11, bleed: 0.9,
    capacities: ['moving'],
    note: 'The femoral artery runs the length of it. A thigh wound can empty somebody in minutes.',
  },
};

export const BODY_PART_IDS = Object.keys(BODY_PARTS);

/** What a body has to be able to do, and what stops working without it. */
export const CAPACITIES = {
  consciousness: { id: 'consciousness', name: 'Consciousness', fatalAtZero: true },
  breathing: { id: 'breathing', name: 'Breathing', fatalAtZero: true },
  moving: { id: 'moving', name: 'Moving', fatalAtZero: false },
  manipulation: { id: 'manipulation', name: 'Manipulation', fatalAtZero: false },
  sight: { id: 'sight', name: 'Sight', fatalAtZero: false },
};

// --- Wounds -----------------------------------------------------------------

/**
 * The real classification, with the properties that follow from it.
 *
 * `retained` is the one that matters most for what happens next: a projectile
 * left inside is a foreign body, and a foreign body is what turns a wound into
 * an abscess.
 */
export const WOUND_TYPES = {
  graze: {
    id: 'graze', name: 'Graze',
    blurb: 'Tangential. It took skin and not much else.',
    severity: [0.08, 0.22], bleedMult: 0.5, infectMult: 0.6, retained: false,
  },
  penetrating: {
    id: 'penetrating', name: 'Penetrating',
    blurb: 'It went in and stayed in. The round is still in there, and so is whatever it carried with it.',
    severity: [0.28, 0.68], bleedMult: 0.8, infectMult: 1.6, retained: true,
  },
  perforating: {
    id: 'perforating', name: 'Perforating',
    blurb: 'Through and through. Cleaner than a retained round and it bleeds from both ends.',
    severity: [0.32, 0.74], bleedMult: 1.35, infectMult: 1, retained: false,
  },
  avulsive: {
    id: 'avulsive', name: 'Avulsive',
    blurb: 'Tissue is gone rather than damaged. Nothing closes over an absence.',
    severity: [0.55, 0.95], bleedMult: 1.5, infectMult: 1.8, retained: false,
  },
  fracture: {
    id: 'fracture', name: 'Fracture',
    blurb: 'The bone took it. Bone that has been open to the air is the hardest infection there is to clear.',
    severity: [0.4, 0.8], bleedMult: 0.9, infectMult: 1.4, retained: true,
    bone: true,
  },
  babt: {
    id: 'babt', name: 'Blunt trauma',
    blurb: 'The armour held. The energy did not disappear — it went through the back face and into the chest.',
    severity: [0.06, 0.34], bleedMult: 0.05, infectMult: 0.05, retained: false,
    closed: true,
  },
};

export const WOUND_TYPE_IDS = Object.keys(WOUND_TYPES);

/**
 * Infection, as stages rather than a number.
 *
 * The thresholds follow the clinical picture: contamination inside the first
 * half day, a spreading soft-tissue infection after that, then either a walled
 * collection or — with bone involved or tissue missing — the two that actually
 * take limbs. Sepsis is the systemic end of all of them.
 */
export const INFECTION_STAGES = [
  { id: 'clean', at: 0, name: 'Clean', tone: 'good',
    blurb: 'Washed out and closed in time.' },
  { id: 'contaminated', at: 0.18, name: 'Contaminated', tone: 'warn',
    blurb: 'Dirt and cloth went in with it. Nothing has grown yet.' },
  { id: 'cellulitis', at: 0.38, name: 'Cellulitis', tone: 'warn',
    blurb: 'Hot, red and spreading outward from the edges.' },
  { id: 'abscess', at: 0.58, name: 'Abscess', tone: 'bad',
    blurb: 'Walled off and full. Antibiotics do not reach inside a collection — it has to be opened.' },
  { id: 'osteomyelitis', at: 0.74, name: 'Osteomyelitis', tone: 'bad', needsBone: true,
    blurb: 'It is in the bone now. Months of it, and it comes back.' },
  { id: 'gangrene', at: 0.74, name: 'Gas gangrene', tone: 'bad', needsDeadTissue: true,
    blurb: 'Clostridial. It moves along the muscle by the hour and it does not stop on its own.' },
  { id: 'sepsis', at: 0.9, name: 'Sepsis', tone: 'bad',
    blurb: 'It is systemic. Pressure drops, organs fail, and this is what kills people who survived being shot.' },
];

/** Where a given infection level has got to, given what the wound is. */
export function infectionStage(wound) {
  const lvl = wound.infection || 0;
  let found = INFECTION_STAGES[0];
  for (const stage of INFECTION_STAGES) {
    if (lvl < stage.at) continue;
    if (stage.needsBone && !WOUND_TYPES[wound.type].bone) continue;
    if (stage.needsDeadTissue && wound.type !== 'avulsive') continue;
    found = stage;
  }
  return found;
}

// --- Rates ------------------------------------------------------------------

export const HEALTH = {
  /** Blood volume, 1 is full. Shock sets in low and it is fatal lower still. */
  shockBelow: 0.62,
  deadBelow: 0.32,
  /** Bleeding, as a share of blood volume per hour, at severity 1 on a part at bleed 1. */
  bleedPerHour: 0.055,
  /** Clotting: an untended wound still slows down on its own, and never stops entirely. */
  clotPerHour: 0.09,
  /** Blood replaced per day once the bleeding is under control. */
  regenPerDay: 0.11,
  /**
   * What sepsis costs per hour. Deliberately faster than the body can replace,
   * because untreated sepsis is not a condition somebody lives with — it is
   * what kills the people who survived being shot.
   */
  sepsisPerHour: 0.014,
  /** Field exposure past this many hours starts contamination. */
  contaminateAfterHours: 12,
  /** How fast infection climbs once it starts, per hour, before modifiers. */
  infectPerHour: 0.014,
  /** How fast a wound closes per day once it is clean and treated. */
  healPerDay: 0.055,
  /** Below this much function, a limb is not coming back. */
  loseLimbBelow: 0.12,
  /** The most permanent damage one badly-infected wound can leave behind. */
  scarMax: 0.22,
  /** What treatment costs, per point of severity, at a clinic that asks nothing. */
  treatCostPerSeverity: 9000,
};

// --- A body -----------------------------------------------------------------

export function newBody() {
  const parts = {};
  for (const id of BODY_PART_IDS) parts[id] = { id, lost: false, scar: 0 };
  // `missing` is anatomical parts that have been TAKEN OUT, which is a
  // different thing from a region being shot up. Somebody can be perfectly
  // well and one kidney short.
  return { parts, wounds: [], blood: 1, woundCounter: 0, deadAt: null, missing: {} };
}

/** How many of a given anatomical part have been removed. */
export function missingCount(body, partId) {
  return ((body && body.missing) || {})[partId] || 0;
}

/** Everything that has been taken out, for a readout. */
export function missingParts(body) {
  const m = (body && body.missing) || {};
  return Object.keys(m).filter((id) => m[id] > 0).map((id) => ({ part: PARTS[id], n: m[id] }));
}

/**
 * Take one out.
 *
 * Returns whether they are still alive afterwards. A paired organ with one
 * left is survivable and costs function; the last of a vital one is not
 * survivable at all, and saying so here rather than at the call site means
 * every route into this — a surgeon, a shotgun — gets the same answer.
 */
export function removePart(body, partId) {
  const part = PARTS[partId];
  if (!part) return { ok: false, error: 'No such part.' };
  const already = missingCount(body, partId);
  if (already >= countOf(part)) return { ok: false, error: `No ${part.name.toLowerCase()} left.` };
  const survives = survivesWithout(part, already);
  body.missing = body.missing || {};
  body.missing[partId] = already + 1;
  // Taking something out is an injury even when it is done properly.
  body.blood = clamp01(body.blood - (part.kind === 'organ' ? 0.06 : 0.02));
  if (!survives) body.deadAt = body.deadAt == null ? 0 : body.deadAt;
  return { ok: true, part, survives, remaining: countOf(part) - (already + 1) };
}

/**
 * How much of a capacity the remaining anatomy can still supply, 0 to 1.
 *
 * One lung is half the breathing, and it is why somebody can be sold a lung
 * and walk out of the room.
 */
export function organFactor(body, capacityId) {
  let have = 0, total = 0;
  for (const id of PART_IDS) {
    const p = PARTS[id];
    if (p.capacity !== capacityId) continue;
    const n = countOf(p);
    total += n;
    have += n - missingCount(body, id);
  }
  return total ? clamp01(have / total) : 1;
}

export function woundsOn(body, partId) {
  return (body.wounds || []).filter((w) => w.part === partId && !w.healed);
}

export function openWounds(body) {
  return (body.wounds || []).filter((w) => !w.healed);
}

/**
 * How badly a part is damaged, 0 (fine) to 1 (destroyed).
 *
 * Severities add rather than max: three holes in a thigh is worse than the
 * worst one of them, which is the whole reason volume of fire matters.
 */
export function partDamage(body, partId) {
  if (!body.parts[partId] || body.parts[partId].lost) return 1;
  const scar = body.parts[partId].scar || 0;
  return clamp01(scar + woundsOn(body, partId).reduce((n, w) => n + w.severity, 0));
}

/**
 * What the body can still do, 0 to 1 per capacity.
 *
 * Paired limbs each carry half of their capacity, so losing one arm halves
 * manipulation rather than ending it — which is both true and the reason a
 * limb wound is a setback instead of a game over.
 */
export function capacities(body) {
  const out = {};
  const fromRegions = new Set();
  for (const pid of BODY_PART_IDS) {
    for (const cap of BODY_PARTS[pid].capacities || []) fromRegions.add(cap);
  }
  // A capacity no region supplies — sight, say — comes entirely from the
  // anatomy, so it starts whole and is only reduced by what has been removed.
  for (const id of Object.keys(CAPACITIES)) out[id] = fromRegions.has(id) ? 0 : 1;

  // Paired parts each SUPPLY half of their capacity, so losing one arm halves
  // manipulation rather than ending it — which is both true and the reason a
  // limb wound is a setback instead of a game over.
  const counts = {};
  for (const pid of BODY_PART_IDS) {
    for (const cap of BODY_PARTS[pid].capacities || []) {
      counts[cap] = (counts[cap] || 0) + 1;
    }
  }
  const efficiencyOf = (pid) => (body.parts[pid].lost ? 0 : 1 - partDamage(body, pid));
  for (const pid of BODY_PART_IDS) {
    for (const cap of BODY_PARTS[pid].capacities || []) {
      out[cap] += efficiencyOf(pid) / counts[cap];
    }
  }

  // A part that LIMITS a capacity is not a second supply of it. The neck does
  // not think or breathe; it carries the airway and the carotids, and nothing
  // gets past one that has been opened.
  for (const pid of BODY_PART_IDS) {
    for (const cap of BODY_PARTS[pid].limits || []) {
      out[cap] = Math.min(out[cap], efficiencyOf(pid));
    }
  }

  // What has been taken out counts as much as what has been shot. One lung is
  // half the breathing whether it was a bullet or a scalpel that took it.
  for (const id of Object.keys(out)) {
    out[id] = Math.min(out[id], organFactor(body, id));
  }

  // Blood loss takes consciousness before it takes anything else.
  const shock = clamp01((body.blood - HEALTH.deadBelow) / (HEALTH.shockBelow - HEALTH.deadBelow));
  out.consciousness = Math.min(out.consciousness, shock);
  for (const id of Object.keys(out)) out[id] = clamp01(out[id]);
  return out;
}

/** Is this body still going? */
export function isAlive(body) {
  if (!body || body.deadAt != null) return false;
  if (body.blood <= HEALTH.deadBelow) return false;
  // The last of a vital organ, whoever took it.
  for (const id of PART_IDS) {
    const p = PARTS[id];
    if (p.vital && missingCount(body, id) >= countOf(p)) return false;
  }
  const caps = capacities(body);
  return !Object.values(CAPACITIES).some((c) => c.fatalAtZero && caps[c.id] <= 0.001);
}

/** Why it stopped, for the log. */
export function causeOfDeath(body) {
  // Check this before the blood, because sepsis kills THROUGH circulatory
  // collapse — reporting it as "bled out" would name the mechanism and miss
  // the cause, which is the thing the player could have done something about.
  if (openWounds(body).some((w) => infectionStage(w).id === 'sepsis')) return 'went septic';
  if (body.blood <= HEALTH.deadBelow) return 'bled out';
  const caps = capacities(body);
  if (caps.breathing <= 0.001) return 'stopped breathing';
  if (caps.consciousness <= 0.001) return 'never came round';
  return 'died of it';
}

// --- Taking a hit -----------------------------------------------------------

/** Pick a body part by presented area. */
export function rollPart(rand = Math.random) {
  let r = rand();
  for (const id of BODY_PART_IDS) {
    r -= BODY_PARTS[id].hitShare;
    if (r <= 0) return id;
  }
  return 'thorax';
}

/**
 * What kind of wound a round makes, given what it went through.
 *
 * Armour that outranks the round stops it, and what is left is behind-armour
 * blunt trauma — contusion, and at the top end a cracked rib or a bruised
 * lung. Armour that does not outrank it slows the round and no more. That
 * substitution is the single most important thing armour does in this model,
 * and it is why a vest is worth keeping rather than selling.
 */
export function resolveWoundType(threat, protection, rand = Math.random) {
  if (protection >= threat) return 'babt';
  const through = threat - protection;
  const r = rand();
  // A round that has been slowed but not stopped is the one that stays in you.
  if (protection > 0.05 && r < 0.55) return 'penetrating';
  if (r < 0.16) return 'graze';
  if (r < 0.34) return 'fracture';
  if (r < 0.62) return 'penetrating';
  if (r < 0.9) return 'perforating';
  return through > 0.45 ? 'avulsive' : 'perforating';
}

/**
 * Which structures inside a region a wound actually reached.
 *
 * This is why two chest wounds are not the same wound. A round that clips a
 * rib and a round that finds the heart land in the same place and on the same
 * drawing, and only one of them is survivable. Depth is what separates them:
 * a shallow wound cannot reach the things that sit deep, and a severe one
 * reaches nearly everything on the way through.
 */
export function struckBy(regionId, severity, rand = Math.random) {
  const inside = targetsIn(regionId);
  if (!inside.length) return [];

  // A bullet makes ONE track. Rolling every structure in the region
  // independently means a serious chest wound involves two thirds of the
  // chest at once, which is not a wound, it is an autopsy. So: work out how
  // far in the track got, take the things that sit at or above that depth,
  // and pick the handful actually along it.
  const reached = clamp01(severity * 1.5);
  const candidates = inside.filter((p) => (p.depth || 0.4) <= reached + 0.12);
  if (!candidates.length) return [];

  const howMany = Math.max(1, Math.min(candidates.length, Math.round(0.6 + severity * 2.6)));
  const pool = candidates.map((p) => ({
    part: p,
    // Weighted by how many of them there are — two lungs are likelier than one
    // heart — and by how far the track had left to go when it passed them.
    // Everything shallower than the terminus is ON the line, so surface bone
    // is hit more often than the organ the round finally stopped in.
    weight: countOf(p) * Math.max(0.15, 0.5 + (reached - (p.depth || 0.4)) * 1.2),
  })).filter((c) => c.weight > 0);

  const hit = [];
  for (let i = 0; i < howMany && pool.length; i++) {
    const total = pool.reduce((n, c) => n + c.weight, 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    const chosen = pool.splice(Math.min(idx, pool.length - 1), 1)[0];
    if (chosen) hit.push(chosen.part.id);
  }
  return hit;
}

/**
 * Put a round into a body.
 *
 * `threat` is the round, `protection` what was in the way at that part; both
 * on the 0-1 scale the firearms and armour tables use.
 */
export function takeHit(body, { part, threat = 0.4, protection = 0, atHour = 0, rand = Math.random } = {}) {
  const partId = part || rollPart(rand);
  if (!body.parts[partId] || body.parts[partId].lost) return null;

  const type = resolveWoundType(threat, protection, rand);
  const def = WOUND_TYPES[type];
  const [lo, hi] = def.severity;
  // How far past the armour the round got scales what it does inside.
  const bite = clamp01((threat - protection) / 0.7);
  const severity = clamp01((lo + (hi - lo) * (0.35 + rand() * 0.65)) * (0.55 + bite * 0.65));

  // What it found on the way through. A closed injury behind armour does not
  // reach anything: that is the entire point of the armour.
  const struck = def.closed ? [] : struckBy(partId, severity, rand);
  // Finding something that matters makes the same wound a different wound.
  const foundVital = struck.some((id) => PARTS[id] && PARTS[id].vital);
  const foundVessel = struck.some((id) => PARTS[id] && PARTS[id].kind === 'vessel');
  const worse = 1 + (foundVital ? 0.55 : 0) + (foundVessel ? 0.4 : 0);

  body.woundCounter = (body.woundCounter || 0) + 1;
  const wound = {
    id: `w${body.woundCounter}`,
    part: partId,
    type,
    struck,
    severity: clamp01(severity * (foundVital ? 1.45 : 1)),
    // Bleeding is severity, how hard that part bleeds, and what kind of hole
    // it is. A closed injury does not bleed out of the body at all.
    // A vessel is why a survivable-looking wound empties somebody in minutes.
    bleeding: severity * BODY_PARTS[partId].bleed * def.bleedMult * worse,
    infection: 0,
    treated: false,
    healed: false,
    atHour,
    // Retained metal is a foreign body, and a foreign body is what turns a
    // wound into an abscess. It is also what an X-ray is for.
    retained: !!def.retained && type !== 'babt',
  };
  body.wounds = (body.wounds || []).concat([wound]);

  // Losing a limb is not only something that happens days later to an infected
  // wound. Enough damage takes it there and then — an avulsive wound is tissue
  // GONE rather than damaged, and a round that destroys the bone leaves
  // nothing to hold the rest on.
  const region = BODY_PARTS[partId];
  if (region.limb && !body.parts[partId].lost) {
    const boneGone = struck.some((id) => PARTS[id] && PARTS[id].kind === 'bone')
      && wound.severity > 0.72;
    const tissueGone = type === 'avulsive' && wound.severity > 0.66;
    if (boneGone || tissueGone) {
      body.parts[partId].lost = true;
      body.parts[partId].lostTo = tissueGone ? 'the round taking it off' : 'what it did to the bone';
      wound.tookTheLimb = true;
      // It stops bleeding from the limb because there is no longer a limb, but
      // what is left bleeds hard until somebody ties it off.
      wound.bleeding = wound.bleeding * 0.8;
    }
  }
  return wound;
}

// --- Time passing -----------------------------------------------------------

/**
 * An hour in the life of a body.
 *
 * Three clocks run at once and they are the whole model: blood going out,
 * infection coming in, and — only once both are under control — tissue closing.
 */
export function stepBody(body, hours, { atHour = 0, tended = false } = {}) {
  if (!body || body.deadAt != null) return { died: false, events: [] };
  const events = [];
  const dt = hours;

  let bleedRate = 0;
  let septic = false;
  for (const w of openWounds(body)) {
    const def = WOUND_TYPES[w.type];

    // Bleeding slows on its own as it clots, and stops when it is packed.
    if (w.bleeding > 0) {
      bleedRate += w.bleeding;
      const clot = HEALTH.clotPerHour * (w.treated ? 4 : 1) * dt;
      w.bleeding = Math.max(0, w.bleeding - w.bleeding * clot);
      if (w.treated && w.bleeding < 0.02) w.bleeding = 0;
    }

    // Contamination starts after about half a day in the field. Treatment
    // inside that window is what the whole "get seen to" decision is about.
    const age = atHour - w.atHour;
    if (!w.treated && !def.closed && age > HEALTH.contaminateAfterHours) {
      const before = infectionStage(w).id;
      w.infection = clamp01(
        w.infection + HEALTH.infectPerHour * def.infectMult * (0.5 + w.severity) * dt
      );
      w.peakInfection = Math.max(w.peakInfection || 0, w.infection);
      const after = infectionStage(w);
      if (after.id !== before) {
        events.push({ kind: 'infection', wound: w, stage: after });
      }
    } else if (w.treated && w.infection > 0) {
      // Antibiotics work on a spreading infection and do nothing for a walled
      // collection or for bone — those need opening, and that takes longer.
      const stage = infectionStage(w);
      const rate = (stage.id === 'abscess' || stage.id === 'osteomyelitis') ? 0.006 : 0.03;
      w.infection = Math.max(0, w.infection - rate * dt);
    }

    // Nothing closes while it is infected.
    if (w.treated && w.infection < 0.2 && w.bleeding <= 0) {
      w.severity = Math.max(0, w.severity - (HEALTH.healPerDay / 24) * dt);
      if (w.severity <= 0.02) {
        w.healed = true;
        // Getting seen to late is not the same as getting seen to. Anything
        // that got past a spreading infection before it was caught leaves
        // something behind — the part works, but never quite as it did.
        const peak = w.peakInfection || 0;
        if (peak > 0.38) {
          const residual = clamp(((peak - 0.3) / 0.7) * HEALTH.scarMax, 0, HEALTH.scarMax);
          body.parts[w.part].scar = clamp01((body.parts[w.part].scar || 0) + residual);
          events.push({ kind: 'scarred', wound: w, part: BODY_PARTS[w.part], residual });
        }
        events.push({ kind: 'healed', wound: w });
      }
    }

    // Sepsis is systemic: it stops being about the wound and starts being
    // about the patient. Pressure drops, organs fail, and the body stops
    // replacing what it is losing — so it has to outrun recovery, or somebody
    // who went septic would simply sit there septic forever.
    if (infectionStage(w).id === 'sepsis') septic = true;
  }

  body.blood = clamp01(body.blood - bleedRate * HEALTH.bleedPerHour * dt);
  if (septic) {
    body.blood = clamp01(body.blood - HEALTH.sepsisPerHour * dt);
  } else if (bleedRate <= 0.0001) {
    body.blood = clamp01(body.blood + (HEALTH.regenPerDay / 24) * dt * (tended ? 1.6 : 1));
  }

  // A limb that has been destroyed, or that gangrene has got into, is not
  // coming back. Taking it is the only thing that stops it spreading.
  for (const pid of BODY_PART_IDS) {
    const part = BODY_PARTS[pid];
    if (!part.limb || body.parts[pid].lost) continue;
    const gangrene = woundsOn(body, pid).some((w) => infectionStage(w).id === 'gangrene');
    if (partDamage(body, pid) >= 1 - HEALTH.loseLimbBelow || gangrene) {
      body.parts[pid].lost = true;
      body.parts[pid].lostTo = gangrene ? 'gangrene' : 'the damage';
      for (const w of woundsOn(body, pid)) { w.healed = true; w.bleeding = 0; }
      events.push({ kind: 'lost', part, to: body.parts[pid].lostTo });
    }
  }

  if (!isAlive(body)) {
    body.deadAt = atHour;
    events.push({ kind: 'died', how: causeOfDeath(body) });
    return { died: true, events };
  }
  return { died: false, events };
}

// --- Treatment --------------------------------------------------------------

/** What it would cost to have everything open seen to properly. */
export function treatmentCost(body) {
  return Math.round(openWounds(body)
    .filter((w) => !w.treated)
    .reduce((n, w) => n + w.severity * HEALTH.treatCostPerSeverity, 0));
}

/**
 * Get seen to.
 *
 * Treating a wound stops the bleeding, gets the foreign body out, and starts
 * antibiotics. What it cannot do is undo an infection that has already walled
 * itself off or got into bone — those come down slowly whatever you pay.
 */
export function treat(body, { atHour = 0 } = {}) {
  const list = openWounds(body).filter((w) => !w.treated);
  for (const w of list) {
    w.treated = true;
    w.treatedAt = atHour;
    w.retained = false;
    w.bleeding = 0;
  }
  return list.length;
}

/** A short, readable state of the body for the UI and the log. */
export function condition(body) {
  if (!body) return { label: 'Unhurt', tone: 'good' };
  if (body.deadAt != null) return { label: 'Dead', tone: 'bad' };
  const open = openWounds(body);
  if (!open.length && body.blood > 0.95) return { label: 'Unhurt', tone: 'good' };
  const worst = open.reduce((s, w) => Math.max(s, w.infection), 0);
  const stage = open.map(infectionStage).sort((a, b) => b.at - a.at)[0];
  if (stage && stage.id === 'sepsis') return { label: 'Septic', tone: 'bad' };
  if (body.blood < HEALTH.shockBelow) return { label: 'In shock', tone: 'bad' };
  if (worst > 0.38) return { label: 'Infected', tone: 'bad' };
  if (open.some((w) => w.bleeding > 0.1)) return { label: 'Bleeding', tone: 'bad' };
  if (open.length) return { label: 'Wounded', tone: 'warn' };
  return { label: 'Recovering', tone: 'warn' };
}
