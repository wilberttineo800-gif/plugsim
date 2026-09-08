// Blocks you actually hold.
//
// The design note asked for turf you can take outright, name yourself, and put
// work into — including buying the police off it entirely, so the only time
// they come is when somebody does something stupid.
//
// A block counts as yours when the rivals are off it and the neighbourhood
// knows you. Until then none of this is available, which is what makes taking
// a block worth doing.

import { clamp01 } from './rng.js';

/** What it takes before a block is yours to do anything with. */
export const CLAIM = {
  maxRivalControl: 0.12,  // they have to be essentially off it
  minRep: 0.45,           // and the street has to know who you are
};

export function isHeld(district) {
  return (district.rivalControl || 0) <= CLAIM.maxRivalControl
    && (district.rep || 0) >= CLAIM.minRep;
}

/** Why a block isn't yours yet, in plain terms. */
export function claimBlocker(district) {
  if ((district.rivalControl || 0) > CLAIM.maxRivalControl) {
    return `${Math.round((district.rivalControl || 0) * 100)}% still held by somebody else`;
  }
  if ((district.rep || 0) < CLAIM.minRep) {
    return `The street barely knows you here — ${Math.round((district.rep || 0) * 100)}% of ${Math.round(CLAIM.minRep * 100)}%`;
  }
  return null;
}

/**
 * What you can do to a block you hold. These are standing arrangements, not
 * one-off purchases — each carries a daily cost, and the money keeps them
 * working.
 */
export const TURF_UPGRADES = {
  lookouts: {
    id: 'lookouts',
    name: 'Corner Lookouts',
    blurb: 'Kids on bikes at either end of the block. You know about a car before it turns in.',
    cost: 9000,
    upkeepPerDay: 210,
    effects: { raidResist: 0.28, stopResist: 0.2 },
  },
  cleanup: {
    id: 'cleanup',
    name: 'Clean the Block Up',
    blurb: 'Lights fixed, rubbish gone, the corner boys moved on. Values follow.',
    cost: 16000,
    upkeepPerDay: 340,
    effects: { crimeRelief: 0.22, marketLift: 0.1 },
  },
  goodwill: {
    id: 'goodwill',
    name: 'Look After People',
    blurb: 'Rent covered here, a funeral paid there. Nobody on this block talks to anybody.',
    cost: 21000,
    upkeepPerDay: 620,
    effects: { repFloor: 0.55, heatRelief: 0.25 },
  },
  patrol: {
    id: 'patrol',
    name: 'Pay the Precinct Off',
    blurb:
      'The patrol car finds somewhere else to be. They still come if somebody does something stupid — this buys quiet, not immunity.',
    cost: 68000,
    upkeepPerDay: 2400,
    effects: { policeSuppression: 0.82, heatRelief: 0.45 },
  },
};

export const TURF_UPGRADE_IDS = Object.keys(TURF_UPGRADES);

export function turfUpgrades(district) {
  const owned = new Set(district.turfUpgrades || []);
  return TURF_UPGRADE_IDS.map((id) => ({ ...TURF_UPGRADES[id], owned: owned.has(id) }));
}

export function turfUpgradeById(id) {
  return TURF_UPGRADES[id] || null;
}

/** Everything standing on this block, combined. */
export function turfEffects(district) {
  const fx = {
    raidResist: 0, stopResist: 0, crimeRelief: 0, marketLift: 0,
    repFloor: 0, heatRelief: 0, policeSuppression: 0,
  };
  for (const id of district.turfUpgrades || []) {
    const u = TURF_UPGRADES[id];
    if (!u) continue;
    for (const [k, v] of Object.entries(u.effects || {})) {
      fx[k] = k === 'repFloor' || k === 'policeSuppression'
        ? Math.max(fx[k], v)
        : fx[k] + v;
    }
  }
  fx.crimeRelief = clamp01(fx.crimeRelief);
  fx.heatRelief = clamp01(fx.heatRelief);
  fx.policeSuppression = clamp01(fx.policeSuppression);
  return fx;
}

/** What the standing arrangements on every block you hold cost you a day. */
export function turfUpkeep(state) {
  let total = 0;
  for (const d of state.districts || []) {
    for (const id of d.turfUpgrades || []) {
      total += (TURF_UPGRADES[id] || {}).upkeepPerDay || 0;
    }
  }
  return total;
}

/** A block's name, which is yours to change once you hold it. */
export function districtName(district) {
  return district.customName || district.name;
}
