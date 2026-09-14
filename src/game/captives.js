// People you are holding.
//
// This is the part of the trade that is not about a body on a block. A body is
// what a fight leaves behind; a captive is somebody you went and got, and the
// difference between the two is the whole moral and mechanical weight of it.
//
// The reason it is worth modelling rather than abstracting into "bodies: 3" is
// that a person is not a set of parts until you make them one. Somebody can be
// held for weeks and sold a kidney and walk out of it — two kidneys is what
// there are and one is enough. Take the second, or the liver, or the heart,
// and they are not walking anywhere. That choice, made one organ at a time
// against a body that is keeping score, is the mechanic.

import { clamp, clamp01 } from './rng.js';
import { BUILDINGS } from './constants.js';
import {
  newBody, removePart, isAlive, capacities, missingCount, condition,
} from './health.js';
import { PARTS, countOf, survivesWithout, symptomsFor } from './anatomy.js';
import { randomAppearance } from './appearance.js';

export const CAPTIVES = {
  /** What a crew wants to go and get somebody. */
  snatchCost: 42000,
  /** Base odds it goes cleanly, before the block's own temperature. */
  snatchBase: 0.72,
  /** What it does to the block whether or not it works. */
  heatPerTry: 9,
  repPerTry: 0.12,
  /** Somebody being held is somebody being looked for. */
  heatPerDayHeld: 0.55,
  /** What it costs a day to hold somebody who is still alive. */
  upkeepPerDay: 900,
};

export function captivesOf(state) {
  return state.captives || [];
}

/** Somewhere to keep people, and how many. A funeral home is a better one. */
export function holdingCapacity(state) {
  return (state.buildings || [])
    .filter((b) => b.active && (BUILDINGS[b.type] || {}).holds)
    .reduce((n, b) => n + BUILDINGS[b.type].holds, 0);
}

/** Does anywhere you own have a cold room? It changes every clock there is. */
export function hasColdStorage(state) {
  return (state.buildings || []).some(
    (b) => b.active && (BUILDINGS[b.type] || {}).coldStorage
  );
}

let counter = 0;
const NAMES = [
  'A man in his forties', 'A woman off the late shift', 'Somebody nobody reported missing',
  'A courier for somebody else', 'A man who owed money', 'A student',
  'Somebody who was sleeping rough', 'A woman who saw too much',
];

/**
 * Go and get somebody.
 *
 * Deliberately abstract: a crew goes out, it costs money, and it either works
 * or it does not. What the game models is the consequence, not the method.
 */
export function snatch(state, districtId, { rand = Math.random } = {}) {
  const held = captivesOf(state).length;
  const room = holdingCapacity(state);
  if (room <= 0) return { ok: false, error: 'You have nowhere to keep anybody.' };
  if (held >= room) return { ok: false, error: `You are already holding ${held}. No room.` };

  const d = (state.districts || []).find((x) => x.id === districtId);
  if (!d) return { ok: false, error: 'No such block.' };

  // A hot block is a watched block, and a block that knows you is a block
  // where somebody will say your name.
  const odds = clamp01(CAPTIVES.snatchBase - (d.heat / 100) * 0.5 - clamp01(d.rep) * 0.15);
  const won = rand() < odds;

  d.heat = Math.min(100, d.heat + CAPTIVES.heatPerTry);
  d.rep = clamp01(d.rep - CAPTIVES.repPerTry);

  if (!won) return { ok: true, got: null, odds };

  counter += 1;
  const seed = ((state.minutes || 0) * 31 + counter * 7919) >>> 0;
  const captive = {
    id: `cap${(state.organCounter = (state.organCounter || 0) + 1)}`,
    name: NAMES[Math.floor(rand() * NAMES.length)],
    appearance: randomAppearance(seed),
    body: newBody(),
    districtId,
    takenAt: Math.floor((state.minutes || 0) / 60),
    dead: false,
  };
  state.captives = captivesOf(state).concat([captive]);
  return { ok: true, got: captive, odds };
}

/** Everything you could take off somebody and have them survive it. */
export function takeableFrom(captive) {
  if (!captive || !captive.body) return [];
  return Object.keys(PARTS)
    .map((id) => PARTS[id])
    .map((part) => {
      const already = missingCount(captive.body, part.id);
      const left = countOf(part) - already;
      return {
        part,
        left,
        survives: survivesWithout(part, already),
        symptom: part.symptom,
      };
    })
    .filter((r) => r.left > 0);
}

/**
 * Take one specific thing.
 *
 * The body decides what happens next, not this function — `removePart` knows
 * whether there was a spare, and `isAlive` knows what that means. Every route
 * into taking something out goes through the same two calls so a scalpel and a
 * shotgun cannot disagree about whether somebody is dead.
 */
export function takeFrom(state, captiveId, partId, { atHour = 0 } = {}) {
  const captive = captivesOf(state).find((c) => c.id === captiveId);
  if (!captive) return { ok: false, error: 'Nobody by that name.' };
  if (captive.dead) return { ok: false, error: 'They are already dead. Take the lot.' };

  const res = removePart(captive.body, partId);
  if (!res.ok) return res;

  const piece = {
    organ: partId,
    takenAt: atHour,
    // Taken carefully off somebody alive, rather than cut out of a corpse on a
    // block. It is the best condition anything here ever arrives in.
    quality: clamp01(0.62 + Math.random() * 0.3),
  };
  state.organs = (state.organs || []).concat([piece]);

  const died = !isAlive(captive.body);
  if (died) {
    captive.dead = true;
    captive.diedAt = atHour;
    captive.body.deadAt = atHour;
  }
  return { ok: true, part: res.part, piece, died, survives: res.survives };
}

/** What is wrong with somebody, in words. */
export function symptomsOf(captive) {
  if (!captive || !captive.body) return [];
  return symptomsFor(captive.body.missing);
}

/** Let somebody go. It does not undo anything, and they know your face. */
export function release(state, captiveId) {
  const list = captivesOf(state);
  const c = list.find((x) => x.id === captiveId);
  if (!c) return { ok: false, error: 'Nobody by that name.' };
  state.captives = list.filter((x) => x.id !== captiveId);
  const d = (state.districts || []).find((x) => x.id === c.districtId);
  // Somebody who has been held and taken from and then let go is somebody who
  // tells people. That is worse for you than a body nobody finds.
  if (d) {
    d.heat = Math.min(100, d.heat + (c.dead ? 0 : 16));
    d.rep = clamp01(d.rep - 0.2);
  }
  return { ok: true, captive: c };
}

/** A day of being held: upkeep, attention, and whatever is already wrong. */
export function stepCaptives(state, dt) {
  const list = captivesOf(state);
  if (!list.length) return [];
  const events = [];
  const atHour = Math.floor((state.minutes || 0) / 60);
  for (const c of list) {
    if (c.dead) continue;
    const caps = capacities(c.body);
    // Somebody short of enough of themselves does not simply carry on.
    if (caps.consciousness < 0.25 || c.body.blood < 0.45) {
      c.body.blood = clamp01(c.body.blood - 0.004 * dt);
    } else {
      c.body.blood = clamp01(c.body.blood + 0.003 * dt);
    }
    if (!isAlive(c.body)) {
      c.dead = true;
      c.diedAt = atHour;
      c.body.deadAt = atHour;
      events.push({ kind: 'died', captive: c });
    }
  }
  return events;
}
