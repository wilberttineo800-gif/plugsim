// Putting things back, and putting better things in.
//
// You cannot sell yourself. What you can do is have work done ON yourself, and
// that is a different trade with a different shape: it costs money instead of
// making it, it needs somebody who knows how, and it is the only reason to
// keep a street doctor on a retainer.
//
// Four tiers, and the escalation is the point. Crude is worse than what you
// had and cheap enough to fit tonight. A prosthetic is nearly as good and
// unremarkable. Salvaged organic is as good as the original because it WAS
// somebody's original — which means it comes out of the same stock you have
// been filling, and that is the loop closing. Bionic is better than you were,
// which is the only reason anybody would choose this on purpose.
//
// Nothing here can be fitted without a street doctor, and a street doctor is
// not a building. They are a person you are paying to be available.

import { clamp, clamp01 } from './rng.js';
import { PARTS, countOf } from './anatomy.js';
import { BODY_PARTS } from './health.js';

export const TIERS = {
  crude: {
    id: 'crude', name: 'Crude', efficiency: 0.62, costMult: 0.35, risk: 0.06,
    blurb: 'A hook, a peg, a cane. Fitted in an afternoon by somebody who has done it before, and everybody can see it.',
    organs: false,
  },
  prosthetic: {
    id: 'prosthetic', name: 'Prosthetic', efficiency: 0.86, costMult: 1, risk: 0.1,
    blurb: 'Modern, moulded, unremarkable to look at. Not the arm you had, and close enough that most days you forget.',
    organs: false,
  },
  salvaged: {
    id: 'salvaged', name: 'Salvaged', efficiency: 0.97, costMult: 0.55, risk: 0.22,
    blurb: 'Somebody else’s, and it works as well as it worked for them. Comes out of your own stock, which is the part that stays with you.',
    organs: true, needsStock: true,
  },
  bionic: {
    id: 'bionic', name: 'Bionic', efficiency: 1.2, costMult: 4.2, risk: 0.16,
    // A range rather than a number, rolled once when it is fitted and kept.
    // Two bionic legs are not the same bionic leg, and a slight improvement
    // that is slightly different each time reads as a real thing rather than
    // as a constant somebody typed.
    range: [1.15, 1.25],
    blurb: 'Better than the one you were born with, by a bit. How much of a bit is down to what came off the bench that week.',
    organs: true,
  },
};

export const TIER_IDS = Object.keys(TIERS);

/**
 * What can be replaced, and what it costs before the tier multiplier.
 *
 * Regions — a whole arm, a whole leg — are one kind of job; individual organs
 * are another. Both go through the same door because both need the same person
 * to be standing there.
 */
export const FITMENTS = {
  armL: { id: 'armL', kind: 'region', name: 'Left arm', base: 180000, capacity: 'manipulation' },
  armR: { id: 'armR', kind: 'region', name: 'Right arm', base: 180000, capacity: 'manipulation' },
  legL: { id: 'legL', kind: 'region', name: 'Left leg', base: 200000, capacity: 'moving' },
  legR: { id: 'legR', kind: 'region', name: 'Right leg', base: 200000, capacity: 'moving' },
  eye: { id: 'eye', kind: 'part', name: 'Eye', base: 90000, capacity: 'sight' },
  hand: { id: 'hand', kind: 'part', name: 'Hand', base: 120000, capacity: 'manipulation' },
  foot: { id: 'foot', kind: 'part', name: 'Foot', base: 110000, capacity: 'moving' },
  kidney: { id: 'kidney', kind: 'part', name: 'Kidney', base: 260000, organOnly: true },
  lung: { id: 'lung', kind: 'part', name: 'Lung', base: 340000, organOnly: true, capacity: 'breathing' },
  liver: { id: 'liver', kind: 'part', name: 'Liver', base: 420000, organOnly: true },
  heart: { id: 'heart', kind: 'part', name: 'Heart', base: 680000, organOnly: true },
  cornea: { id: 'cornea', kind: 'part', name: 'Cornea', base: 60000, organOnly: true },
};

export const FITMENT_IDS = Object.keys(FITMENTS);

/** Which tiers make sense for a given fitment. */
export function tiersFor(fitmentId) {
  const f = FITMENTS[fitmentId];
  if (!f) return [];
  return TIER_IDS.filter((id) => {
    const tier = TIERS[id];
    // You cannot carve a kidney out of wood, and nobody wants a bionic hook.
    if (f.organOnly && !tier.organs) return false;
    return true;
  });
}

/** What the job costs, before anybody haggles. */
export function fitmentCost(fitmentId, tierId) {
  const f = FITMENTS[fitmentId];
  const tier = TIERS[tierId];
  if (!f || !tier) return 0;
  return Math.round(f.base * tier.costMult);
}

/** What is already in you. */
export function installedOn(body) {
  return (body && body.installed) || {};
}

/**
 * A fitting is stored as {tier, efficiency} so a rolled range can be kept.
 * Older saves stored the tier id as a bare string; both are read here.
 */
function fittingAt(body, id) {
  const raw = installedOn(body)[id];
  if (!raw) return null;
  if (typeof raw === 'string') return { tier: raw, efficiency: (TIERS[raw] || {}).efficiency || 0 };
  return raw;
}

export function installedTier(body, id) {
  const fit = fittingAt(body, id);
  return fit ? TIERS[fit.tier] || null : null;
}

/** How well an installed replacement works, or 0 if there isn't one. */
export function installedEfficiency(body, id) {
  const fit = fittingAt(body, id);
  return fit ? fit.efficiency || 0 : 0;
}

/** What this particular one came out at, for a readout. */
export function installedFitting(body, id) {
  return fittingAt(body, id);
}

/** Roll what a given tier actually achieves this time. */
export function rollEfficiency(tierId, rand = Math.random) {
  const tier = TIERS[tierId];
  if (!tier) return 0;
  if (!tier.range) return tier.efficiency;
  const [lo, hi] = tier.range;
  return Math.round((lo + (hi - lo) * rand()) * 1000) / 1000;
}

/**
 * Is there anything to fit here, and what would it be doing?
 *
 * Three cases: putting back something that has been taken or lost, upgrading
 * something that is still there, or nothing to do. Upgrading a healthy part
 * means removing a working one first, which the game should say out loud.
 */
export function fitmentState(body, fitmentId, missingCount) {
  const f = FITMENTS[fitmentId];
  if (!f) return null;
  const already = installedTier(body, fitmentId);
  if (f.kind === 'region') {
    const lost = !!(body.parts[fitmentId] && body.parts[fitmentId].lost);
    return {
      fitment: f,
      installed: already,
      gap: lost,
      what: already ? 'replace' : lost ? 'restore' : 'upgrade',
    };
  }
  const part = PARTS[fitmentId];
  const gone = missingCount(body, fitmentId);
  return {
    fitment: f,
    installed: already,
    gap: gone > 0,
    remaining: part ? countOf(part) - gone : 0,
    what: already ? 'replace' : gone > 0 ? 'restore' : 'upgrade',
  };
}
