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
