// The black market in parts.
//
// Grounded the same way everything else here is. Reported trafficking figures
// put a kidney at $50-120k, a liver around $99-157k, a heart anywhere from
// $119k to $290k, and corneas up to $30k. The other number that matters is the
// one nobody quotes first: the person it came out of gets a thousand or two,
// and the middlemen take everything else. That gap IS the trade, and it is
// what this models — you are the middleman.
//
// The mechanic hangs off cold ischaemia time, which is real and brutal: a heart
// is good for four to six hours out of a body, a liver eight to twelve, a
// kidney a day or so, corneas a fortnight. So the most valuable thing you can
// take is the one you are least likely to get anywhere, and every run is a
// decision about what to take and how fast you can move it rather than a
// question of how much you can carry.

import { clamp, clamp01 } from './rng.js';

export const ORGANS = {
  cornea: {
    id: 'cornea', name: 'Cornea', perBody: 2,
    // Up to $30k reported. Keeps for a fortnight, which makes it the one you
    // can actually get to a buyer.
    price: [9000, 30000],
    viabilityHours: 336,
    blurb: 'Keeps for a fortnight in a jar. The only thing here you can take your time with.',
  },
  marrow: {
    id: 'marrow', name: 'Marrow', perBody: 1,
    price: [14000, 42000],
    viabilityHours: 48,
    blurb: 'Drawn from the pelvis. Two days, and a buyer has to be waiting.',
  },
  kidney: {
    id: 'kidney', name: 'Kidney', perBody: 2,
    // The most trafficked organ there is, and the reason: two of them, and a
    // day and a half of cold time to find somebody.
    price: [50000, 120000],
    viabilityHours: 30,
    blurb: 'Two of them, and a day and a half on ice. This is what the trade actually runs on.',
  },
  pancreas: {
    id: 'pancreas', name: 'Pancreas', perBody: 1,
    price: [40000, 90000],
    viabilityHours: 15,
    blurb: 'Fifteen hours. Difficult to place and difficult to keep.',
  },
  liver: {
    id: 'liver', name: 'Liver', perBody: 1,
    price: [99000, 157000],
    viabilityHours: 11,
    blurb: 'Eleven hours. Worth a great deal to somebody who is already waiting for it.',
  },
  lung: {
    id: 'lung', name: 'Lung', perBody: 2,
    price: [70000, 140000],
    viabilityHours: 6,
    blurb: 'Six hours. Almost nobody moves one in time.',
  },
  heart: {
    id: 'heart', name: 'Heart', perBody: 1,
    price: [119000, 290000],
    viabilityHours: 5,
    blurb: 'Five hours, and then it is nothing. The most valuable thing here and the hardest to sell.',
  },
};

export const ORGAN_IDS = Object.keys(ORGANS);

export const ORGAN_TRADE = {
  /** What a body actually yields, before anything is spoiled or botched. */
  yieldFloor: 0.35,
  /** What the block thinks of you afterwards. People find out. */
  repHit: 0.34,
  /** Attention, per body, on the block it happened on. */
  heatPerBody: 14,
  /** What a broker takes off the top. */
  brokerCut: 0.28,
  /** What the person it came out of, or whoever is owed, gets. The gap is you. */
  donorShare: 0.012,
  /** Nothing is worth anything past its cold time; this is how fast it falls. */
  decayCurve: 1.6,
};

/**
 * What a piece is still worth, 0 to 1, given how long it has been out.
 *
 * Flat for the first third of its cold time, then falling away fast. A heart
 * an hour late is not worth a little less; it is worth nothing.
 */
export function viability(organ, hoursOut) {
  const def = ORGANS[organ];
  if (!def) return 0;
  const f = hoursOut / def.viabilityHours;
  if (f <= 0.33) return 1;
  if (f >= 1) return 0;
  return clamp01(Math.pow(1 - (f - 0.33) / 0.67, ORGAN_TRADE.decayCurve));
}

/** What one piece fetches now, before the broker takes his cut. */
export function organValue(piece, atHour, quality = 1) {
  const def = ORGANS[piece.organ];
  if (!def) return 0;
  const v = viability(piece.organ, Math.max(0, atHour - piece.takenAt));
  const [lo, hi] = def.price;
  return Math.round((lo + (hi - lo) * clamp01(quality)) * v);
}

/**
 * What comes out of one body.
 *
 * Not everything, and not reliably. A body that has been shot is a body with
 * holes in the things you wanted, which is why the yield is rolled per organ
 * rather than handed over as a set.
 */
export function harvest(body, { atHour = 0, skill = 0.6, rand = Math.random } = {}) {
  const out = [];
  for (const id of ORGAN_IDS) {
    const def = ORGANS[id];
    for (let i = 0; i < def.perBody; i++) {
      // Bigger, deeper organs are likelier to have been damaged getting here.
      const fragile = def.viabilityHours < 12 ? 0.22 : 0;
      if (rand() > clamp(ORGAN_TRADE.yieldFloor + skill * 0.55 - fragile, 0.05, 0.95)) continue;
      out.push({
        organ: id,
        takenAt: atHour,
        quality: clamp01(0.35 + skill * 0.5 + rand() * 0.2),
      });
    }
  }
  return out;
}

/** Everything currently on ice. */
export function stockOf(state) {
  return (state && state.organs) || [];
}

/** What the whole lot would fetch right now, net of the broker. */
export function stockValue(state, atHour) {
  return stockOf(state).reduce(
    (n, p) => n + Math.round(organValue(p, atHour, p.quality) * (1 - ORGAN_TRADE.brokerCut)),
    0
  );
}

/** Drop anything that is past saving, and say what went. */
export function cullSpoiled(state, atHour) {
  const stock = stockOf(state);
  const keep = [];
  const gone = [];
  for (const p of stock) {
    if (viability(p.organ, atHour - p.takenAt) <= 0.001) gone.push(p);
    else keep.push(p);
  }
  state.organs = keep;
  return gone;
}
