// The trade in parts.
//
// The anatomy — what a person is made of and what each piece is worth — lives
// in anatomy.js. This is only the trade over the top of it: what comes out of
// a body, what it is worth by the time you get to a buyer, and what a broker
// takes for knowing one.
//
// The shape of the decision is the gap between the two markets. A viable organ
// is worth a hundred times what the same organ is worth to a research buyer,
// and the clock on it is measured in hours. So a run is never "how much can I
// carry" — it is "what do I take first, and can I move it before it turns into
// tissue".

import { clamp, clamp01 } from './rng.js';
import {
  PARTS, PART_IDS, partsIn, countOf, partValue, viabilityOf, isTransplantable,
} from './anatomy.js';

export const ORGAN_TRADE = {
  /** Base chance a given piece comes out usable at all. */
  yieldFloor: 0.3,
  /** What the block thinks of you afterwards. People find out. */
  repHit: 0.34,
  /** Attention, per body, on the block it happened on. */
  heatPerBody: 14,
  /** What a broker takes off the top. */
  brokerCut: 0.28,
};

/** Everything currently on ice. */
export function stockOf(state) {
  return (state && state.organs) || [];
}

/** How long a piece has been out, in hours. */
export function hoursOut(piece, atHour) {
  return Math.max(0, atHour - (piece.takenAt || 0));
}

/** What one piece is worth now, and which market it is on. */
export function pieceWorth(piece, atHour) {
  const part = PARTS[piece.organ];
  if (!part) return { value: 0, market: 'none', viability: 0 };
  return partValue(part, hoursOut(piece, atHour), piece.quality != null ? piece.quality : 0.6);
}

/** Backwards-compatible single number, for anything that just wants the money. */
export function organValue(piece, atHour, quality) {
  const part = PARTS[piece.organ];
  if (!part) return 0;
  return partValue(part, hoursOut(piece, atHour), quality != null ? quality : piece.quality).value;
}

/** How good a transplant piece still is, 0 to 1. Tissue does not expire. */
export function viability(organId, hours) {
  const part = PARTS[organId];
  if (!part || !part.transplant) return 1;
  return viabilityOf(part.transplant.hours, hours);
}

/**
 * What comes out of one body.
 *
 * Every part is rolled for separately, because a body that has been shot is a
 * body with holes in some of the things you wanted. Deep structures are harder
 * to get out intact than surface ones, and the short-clock organs are the ones
 * most likely to have been ruined on the way here — which is the same reason
 * they are worth the most.
 */
export function harvest(_body, { atHour = 0, skill = 0.6, rand = Math.random } = {}) {
  const out = [];
  for (const id of PART_IDS) {
    const part = PARTS[id];
    const n = countOf(part);
    for (let i = 0; i < n; i++) {
      const deep = (part.depth || 0.4) * 0.3;
      const fragile = isTransplantable(part) && part.transplant.hours < 12 ? 0.2 : 0;
      const chance = clamp(ORGAN_TRADE.yieldFloor + skill * 0.6 - deep - fragile, 0.05, 0.95);
      if (rand() > chance) continue;
      out.push({
        organ: id,
        takenAt: atHour,
        quality: clamp01(0.3 + skill * 0.5 + rand() * 0.25),
      });
    }
  }
  return out;
}

/** What the whole lot would fetch right now, net of the broker. */
export function stockValue(state, atHour) {
  return stockOf(state).reduce(
    (n, p) => n + Math.round(pieceWorth(p, atHour).value * (1 - ORGAN_TRADE.brokerCut)),
    0
  );
}

/**
 * Drop anything that is genuinely worthless, and say what went.
 *
 * Far less than it used to be. A heart past its cold time is no longer a heart
 * worth a quarter of a million — but the valves in it are tissue and tissue
 * keeps, so what leaves the ice is only what has no buyer on either market.
 */
export function cullSpoiled(state, atHour) {
  const keep = [];
  const gone = [];
  for (const p of stockOf(state)) {
    if (pieceWorth(p, atHour).value <= 0) gone.push(p);
    else keep.push(p);
  }
  state.organs = keep;
  return gone;
}

/**
 * What has just dropped off the transplant market since the last check.
 *
 * Worth telling the player about: the money did not vanish, it fell through
 * the floor, and that is the moment the decision they made earlier paid or
 * did not.
 */
export function newlyTissue(state, fromHour, toHour) {
  return stockOf(state).filter((p) => {
    const part = PARTS[p.organ];
    if (!part || !part.transplant) return false;
    return viability(p.organ, hoursOut(p, fromHour)) > 0
      && viability(p.organ, hoursOut(p, toHour)) <= 0;
  });
}

/** Grouped for a readout: one row per kind of thing, with its market and worth. */
export function stockRows(state, atHour) {
  const rows = {};
  for (const p of stockOf(state)) {
    const part = PARTS[p.organ];
    if (!part) continue;
    const w = pieceWorth(p, atHour);
    const row = rows[p.organ] || (rows[p.organ] = {
      part, n: 0, value: 0, market: w.market, worst: 1,
    });
    row.n++;
    row.value += w.value;
    row.worst = Math.min(row.worst, w.viability != null ? w.viability : 1);
    if (w.market === 'transplant') row.market = 'transplant';
  }
  return Object.values(rows).sort((a, b) => b.value - a.value);
}

// Kept so anything still importing the old table keeps working; the anatomy is
// the source of truth now.
export const ORGANS = PARTS;
export const ORGAN_IDS = PART_IDS;
