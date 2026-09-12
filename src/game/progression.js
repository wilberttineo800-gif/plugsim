// What the player is allowed to get into yet, and where.
//
// New lines open up as an operation grows — measured in property held and money
// banked, because those are the two things you actually build over a run. Where
// you're playing matters too: some trades are simply bigger in some parts of
// the world, and the map already knows which country you're standing in.

import { BUILDINGS, BUILDING_IDS, PRODUCTS } from './constants.js';
import { logEvent } from './state.js';

/** Money on hand counts both colours — you earned it either way. */
export function netWorth(state) {
  return state.cash.clean + state.cash.dirty;
}

export function propertyCount(state) {
  return (state.lots || []).filter((l) => l.owned).length;
}

/**
 * Progress toward opening a building type. Returns null when nothing gates it.
 */
export function unlockStatus(state, typeId) {
  const def = BUILDINGS[typeId];
  if (!def || !def.unlock) return null;
  if (state && state.adminUnlockAll) return null;

  const needProps = def.unlock.properties || 0;
  const needCash = def.unlock.cash || 0;
  const haveProps = propertyCount(state);
  const haveCash = netWorth(state);

  const met = haveProps >= needProps && haveCash >= needCash;
  const missing = [];
  if (haveProps < needProps) missing.push(`${needProps - haveProps} more propert${needProps - haveProps === 1 ? 'y' : 'ies'}`);
  if (haveCash < needCash) missing.push(`$${Math.round(needCash - haveCash).toLocaleString('en-US')} more banked`);

  return {
    locked: !met,
    needProps,
    needCash,
    haveProps,
    haveCash,
    // 0..1 across both requirements, for a progress bar.
    progress: Math.min(
      needProps ? haveProps / needProps : 1,
      needCash ? haveCash / needCash : 1
    ),
    reason: missing.length ? `Needs ${missing.join(' and ')}` : null,
  };
}

export function isUnlocked(state, typeId) {
  const st = unlockStatus(state, typeId);
  return !st || !st.locked;
}

/**
 * Announce anything that has just become available. Called once a day so the
 * player finds out through the radio rather than by hunting the build menu.
 */
export function checkUnlocks(state) {
  state.unlocked = state.unlocked || [];
  for (const id of BUILDING_IDS) {
    const def = BUILDINGS[id];
    if (!def.unlock || state.unlocked.includes(id)) continue;
    if (isUnlocked(state, id)) {
      state.unlocked.push(id);
      const product = def.product ? PRODUCTS[def.product] : null;
      logEvent(
        state,
        product
          ? `Word is you can move ${product.name.toLowerCase()} now. ${def.name} is available to build.`
          : `${def.name} is available to build.`,
        'good'
      );
    }
  }
}

// --- Region -----------------------------------------------------------------

/**
 * How well a product sells where you're playing. Some trades are enormous in
 * one country and marginal in the next, and the map knows which one you're in.
 */
export function regionMultiplier(countryCode, productId) {
  const p = PRODUCTS[productId];
  if (!p) return 1;
  const cc = (countryCode || '').toLowerCase();
  if (p.regionBoost && p.regionBoost[cc]) return p.regionBoost[cc];
  if (p.regionPenalty) return p.regionPenalty;
  return 1;
}

/** A short, readable note about the local trade, for the UI. */
export function regionNote(countryCode, productId) {
  const m = regionMultiplier(countryCode, productId);
  if (m >= 1.6) return 'Huge market here';
  if (m > 1.05) return 'Strong market here';
  if (m < 0.6) return 'Thin market here';
  return null;
}

/**
 * What you'd actually get for your money, before you spend it.
 *
 * The build menu used to show bare multipliers — "×3.69 output" — which tells
 * you this lot is better than some invisible reference but not what the place
 * will DO. Since a bad investment can now bankrupt you, the numbers you are
 * betting on should be on the card.
 *
 * All figures are per day at the given scale, ignoring upgrades and research
 * (which only ever improve on this) and assuming the line runs uninterrupted —
 * so treat output as a ceiling that haulage has to keep up with.
 */
export function buildingPreview(def, scale = 1, capScale = 1) {
  if (!def) return null;
  const cyclesPerDay = def.cycleHours ? 24 / def.cycleHours : 0;
  const rawPerDay = (def.slots || 0) * (def.rawPerSlot || 0) * scale * cyclesPerDay;
  const product = def.product ? PRODUCTS[def.product] : null;
  const packsPerDay = product ? rawPerDay * (product.packsPerRaw || 1) : 0;

  const suppliesPerDay = (def.supplyCostPerSlot || 0) * (def.slots || 0) * scale * cyclesPerDay;
  const upkeepPerDay = def.upkeepPerDay || 0;

  return {
    product: def.product || null,
    productName: product ? product.name : null,
    packName: product ? product.packName : null,
    rawPerDay,
    packsPerDay,
    // The ceiling on what it holds before the line stalls waiting for a lorry.
    holds: (def.capacity || 0) * capScale,
    launderPerDay: def.launderPerDay || 0,
    suppliesPerDay,
    upkeepPerDay,
    runningPerDay: suppliesPerDay + upkeepPerDay,
    // Gross if every pack sold at list. Real takings are lower — blocks
    // saturate — but it is the right number for comparing two properties.
    grossPerDay: product ? packsPerDay * product.basePrice : 0,
  };
}
