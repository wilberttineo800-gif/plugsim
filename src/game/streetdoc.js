// Somebody who will operate on you.
//
// Nothing goes into you without one. A street doctor is not a building and not
// a service you buy per job — they are a person you pay to be available, and
// the retainer runs whether you need them this week or not. That is the whole
// shape of the decision: an expense that does nothing most of the time and is
// the only thing standing between you and bleeding out in a back room the one
// time it matters.
//
// They are also the alternative to a hospital. A hospital will reliably save
// you and will reliably report a gunshot wound; a street doctor asks nothing
// and sometimes gets it wrong. That trade is the point of having both.

import { clamp, clamp01 } from './rng.js';
import { randomAppearance } from './appearance.js';

export const STREET_DOC = {
  /** What it takes to get somebody to answer the phone at all. */
  signingFee: 240000,
  /** And to keep answering it. */
  retainerPerDay: 5200,
  /** A hospital is reliable, and tells the police. */
  hospitalCostPerSeverity: 26000,
  hospitalHeat: 18,
};

const NAMES = [
  'Struck off in 09', 'Used to be a nurse', 'Never says which hospital',
  'Trained somewhere else', 'Does this on Tuesdays', 'Owes somebody a favour',
];

export function docOf(state) {
  return (state && state.streetDoc) || null;
}

export function hasDoc(state) {
  return !!docOf(state);
}

/**
 * Take somebody on.
 *
 * Skill is rolled once and kept. A cheap doctor who is bad at it is still a
 * doctor, and you will not find out which one you have until something goes
 * wrong on a table.
 */
export function hireDoc(state, { rand = Math.random } = {}) {
  if (hasDoc(state)) return { ok: false, error: 'You already have somebody.' };
  const skill = clamp01(0.45 + rand() * 0.5);
  const seed = ((state.minutes || 0) * 13 + 4099) >>> 0;
  state.streetDoc = {
    name: NAMES[Math.floor(rand() * NAMES.length)],
    appearance: randomAppearance(seed),
    skill,
    hiredOn: Math.floor((state.minutes || 0) / 60),
    jobs: 0,
    lost: 0,
  };
  return { ok: true, doc: state.streetDoc };
}

export function releaseDoc(state) {
  const doc = docOf(state);
  if (!doc) return { ok: false, error: 'You do not have anybody.' };
  state.streetDoc = null;
  return { ok: true, doc };
}

/**
 * How likely a job is to go wrong, 0-1.
 *
 * Harder work and a worse doctor, and it compounds: a bionic heart fitted by
 * somebody who was struck off in 2009 is a genuinely bad idea, and the number
 * should say so before the player commits rather than afterwards.
 */
export function riskOf(state, tier, fitment) {
  const doc = docOf(state);
  if (!doc) return 1;
  const base = tier ? tier.risk : 0.1;
  const hard = fitment && fitment.organOnly ? 1.55 : 1;
  // Skill has to actually buy something. At (1.75 - skill) even a perfect
  // doctor lost a quarter of the organ jobs, which makes the choice of who you
  // hire meaningless — the spread now runs from about half the base risk to
  // nearly double it.
  return clamp(base * hard * (1.35 - doc.skill * 0.9), 0.015, 0.9);
}

/** What the retainer costs per day, for the ledger. */
export function docUpkeep(state) {
  return hasDoc(state) ? STREET_DOC.retainerPerDay : 0;
}
