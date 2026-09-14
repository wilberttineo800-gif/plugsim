// What being hurt actually costs you.
//
// Up to now an injury was a number on a screen: real, tracked, progressing,
// and invisible to every other system in the game. This is the seam that makes
// it bite. Everything that should eventually be affected by a body reads
// through `getStat` rather than a raw value, and `getActiveModifiers` is the
// one place that aggregates where those modifiers come from.
//
// The mapping has to be to what the player actually DOES. There is no shooting
// minigame here — the game is blocks, deals, money and property — so a ruined
// leg cannot mean "slower movement speed". It means you cannot take a block off
// somebody, because taking a block off somebody involves being able to run.
//
//   moving         → moving on a crew, and getting away when it goes wrong
//   manipulation    → handling anything yourself; what a handoff is worth
//   consciousness   → judgement: what you negotiate, what the fixer takes
//   sight           → what you can read of a block before you commit to it

import { clamp, clamp01 } from './rng.js';
import { capacities, missingParts, HEALTH } from './health.js';

/** How far past whole any stat can be pushed by what is fitted. */
const CEILING = HEALTH.capacityCeiling;
import { characterOf } from './character.js';
import { IMPAIRMENTS } from './impairments.js';

/**
 * The stats a body can move. Each declares what a full deficit does, so the
 * data says what it means rather than the call site guessing.
 */
export const STATS = {
  muscle: {
    id: 'muscle', name: 'Moving on a block',
    blurb: 'Taking turf off somebody is a physical thing. On one leg it is a worse idea than it already was.',
    from: { moving: 0.55, consciousness: 0.25, manipulation: 0.2 },
    floor: 0.25,
  },
  evade: {
    id: 'evade', name: 'Getting away',
    blurb: 'When it goes wrong, whether you are still standing there when it does.',
    from: { moving: 0.7, consciousness: 0.3 },
    floor: 0.2,
  },
  deal: {
    id: 'deal', name: 'What you get for it',
    blurb: 'Somebody who is obviously hurt is somebody who is obviously in a hurry.',
    from: { consciousness: 0.55, sight: 0.2, manipulation: 0.25 },
    floor: 0.5,
  },
  wash: {
    id: 'wash', name: 'Moving money',
    blurb: 'Paperwork, appointments, being somewhere at a particular time.',
    from: { consciousness: 0.7, manipulation: 0.3 },
    floor: 0.4,
  },
  read: {
    id: 'read', name: 'Reading a block',
    blurb: 'What you can tell about a place before you have committed to it.',
    from: { sight: 0.6, consciousness: 0.4 },
    floor: 0.35,
  },
};

export const STAT_IDS = Object.keys(STATS);

/**
 * Everything currently acting on the body, in one flat object.
 *
 * Three sources: what the capacities are down to, what is missing outright,
 * and any permanent impairment left behind by something that went wrong. They
 * are gathered here so that no caller ever has to know there were three.
 */
export function getActiveModifiers(state) {
  const ch = characterOf(state);
  const body = ch.body;
  const caps = capacities(body);

  const mods = { ...caps };
  // Impairments are named, permanent, and apply on top of the capacities —
  // a nerve palsy is an arm that is attached, alive, and does not work.
  const marks = [];
  for (const id of Object.keys(body.impairments || {})) {
    const imp = IMPAIRMENTS[id];
    if (!imp) continue;
    const n = body.impairments[id];
    marks.push({ impairment: imp, n });
    for (const key of Object.keys(imp.effect || {})) {
      mods[key] = clamp01((mods[key] == null ? 1 : mods[key]) + imp.effect[key] * n);
    }
  }
  return { capacities: mods, impairments: marks, missing: missingParts(body) };
}

/**
 * A stat, 0 to 1, where 1 is a body that nothing has happened to.
 *
 * Every consumer multiplies by this rather than reading a capacity directly,
 * which is what makes it possible to change what "hurt" means in one place.
 */
export function getStat(state, id) {
  const def = STATS[id];
  if (!def) return 1;
  const { capacities: caps } = getActiveModifiers(state);
  let total = 0;
  for (const key of Object.keys(def.from)) {
    total += (caps[key] == null ? 1 : caps[key]) * def.from[key];
  }
  // A floor, because a body that can still make decisions can still do
  // business badly — zero would mean the game silently stops responding. And
  // a ceiling ABOVE one, because a bionic limb is better than the limb it
  // replaced and capping here at 1 threw that away after the body had already
  // been careful to keep it.
  return clamp(total, def.floor, CEILING);
}

/** Every stat at once, for a readout. */
export function allStats(state) {
  const out = {};
  for (const id of STAT_IDS) out[id] = getStat(state, id);
  return out;
}

/** Anything a player should be told about, in words. */
export function activePenalties(state) {
  const out = [];
  for (const id of STAT_IDS) {
    const v = getStat(state, id);
    if (v > 0.97 && v < 1.03) continue;
    out.push({ stat: STATS[id], value: v, down: Math.round((1 - v) * 100) });
  }
  return out.sort((a, b) => a.value - b.value);
}
