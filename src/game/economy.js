// Street pricing. Four forces set what a district pays: how much money lives
// there, how badly you've flooded the block, how good the product is, and how
// well the neighbourhood knows you.

import { MARKET, PRODUCTS, RIVALS } from './constants.js';
import { clamp01, lerp } from './rng.js';

export function wealthMultiplier(district) {
  return lerp(0.72, 1.48, district.wealth);
}

/** 0 = starving for product, 1 = comfortably supplied, >1 = flooded. */
export function saturation(district, productId) {
  const demand = district.demandPerHour[productId];
  if (demand <= 0) return 3;
  return district.supply[productId] / (demand * MARKET.saturationHours);
}

export function saturationMultiplier(district, productId) {
  const s = saturation(district, productId);
  if (s <= 1) return lerp(1.12, 1.0, clamp01(s)); // scarcity premium
  // Beyond a full buffer the price falls off fast and then flattens out.
  const over = Math.min(1, (s - 1) / 2.2);
  return lerp(1.0, MARKET.minPriceMultiplier, over);
}

export function qualityMultiplier(quality) {
  return 1 + (clamp01(quality) - 0.5) * MARKET.qualityPriceSwing;
}

export function repMultiplier(district) {
  return 1 + clamp01(district.rep) * MARKET.repPriceBonus;
}

/** What one packaged unit currently fetches on this block. */
export function streetPrice(district, productId) {
  const p = PRODUCTS[productId];
  return (
    p.basePrice *
    wealthMultiplier(district) *
    saturationMultiplier(district, productId) *
    qualityMultiplier(district.supplyQuality[productId]) *
    repMultiplier(district)
  );
}

/** The price a district would pay if you were fully stocked and unknown. */
export function baselinePrice(district, productId) {
  return PRODUCTS[productId].basePrice * wealthMultiplier(district);
}

/**
 * Units per game-hour this district will actually absorb. Customers buy less
 * when the block is crawling with police, and buy faster when they trust you.
 */
export function sellRatePerHour(district, productId) {
  const demand = district.demandPerHour[productId];
  const heatFear = clamp01(district.heat / 100) * 0.55;
  const trust = 1 + clamp01(district.rep) * 0.35;
  // Whoever already works this block is serving these customers first.
  const theirs = clamp01(district.rivalControl || 0) * RIVALS.demandCapture;
  return demand * (1 - heatFear) * (1 - theirs) * trust;
}

/** The slice of a block's trade a rival crew is currently taking. */
export function rivalShare(district) {
  return clamp01(district.rivalControl || 0) * RIVALS.demandCapture;
}

/** Blend incoming stock into a district's average quality. */
export function blendQuality(existingUnits, existingQuality, addedUnits, addedQuality) {
  const total = existingUnits + addedUnits;
  if (total <= 0) return addedQuality;
  return (existingUnits * existingQuality + addedUnits * addedQuality) / total;
}
