// Other people running the same game.
//
// The design note wants a player-driven world with a wealth leaderboard, and
// asked for AI players in the meantime to stand in for real ones — plus an
// admin switch to turn them off, because the player is testing.
//
// These are deliberately not the rival crews. A crew fights you for a block. A
// player is somebody building the same kind of business you are: they buy
// property, they run operations, their net worth moves, and they show up on the
// board above or below you. When there is a backend they become real accounts
// and almost none of this has to change.

import { clamp01 } from './rng.js';

export const AI = {
  count: 7,
  // How fast an AI empire compounds, per game day, before its own luck.
  baseGrowthPerDay: 0.019,
  // Spread, so the board isn't a straight line.
  growthSpread: 0.016,
  // How hard a run can swing in a day — busts, seizures, a good week.
  volatility: 0.05,
  startingWorth: [42000, 480000],
};

const HANDLES = [
  'Sable', 'Novak', 'Dime', 'Renwick', 'Okafor', 'Castellan', 'Brix',
  'Halloran', 'Verity', 'Mbeki', 'Sorokin', 'Tanaka', 'Ferreira', 'Ostrowski',
  'Amaru', 'Kettle', 'Devine', 'Quill', 'Radzki', 'Osei',
];

const STYLES = [
  { id: 'property', label: 'buys buildings', growth: 0.9, volatility: 0.6 },
  { id: 'volume', label: 'moves weight', growth: 1.25, volatility: 1.5 },
  { id: 'legit', label: 'stays clean', growth: 0.8, volatility: 0.35 },
  { id: 'iron', label: 'deals in iron', growth: 1.4, volatility: 1.9 },
];

/** Seed a field of players for a new city. */
export function generatePlayers(rand, count = AI.count) {
  const used = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    let handle = HANDLES[Math.floor(rand() * HANDLES.length) % HANDLES.length];
    while (used.has(handle)) {
      handle = HANDLES[Math.floor(rand() * HANDLES.length) % HANDLES.length];
    }
    used.add(handle);

    const style = STYLES[Math.floor(rand() * STYLES.length) % STYLES.length];
    const [lo, hi] = AI.startingWorth;
    out.push({
      id: `p${i + 1}`,
      name: handle,
      style: style.id,
      styleLabel: style.label,
      worth: Math.round(lo + rand() * (hi - lo)),
      growth: AI.baseGrowthPerDay + (rand() - 0.5) * 2 * AI.growthSpread,
      growthMult: style.growth,
      volatilityMult: style.volatility,
      properties: 2 + Math.floor(rand() * 9),
      // What they were worth a week ago, for the trend arrow.
      lastWeekWorth: null,
      history: [],
    });
  }
  return out;
}

/**
 * Move every AI player on by a day. Compounding with a swing, so the board
 * shuffles rather than sitting still — and a bad run can genuinely go backwards.
 */
export function stepPlayers(state, rand) {
  if (state.aiDisabled) return;
  const players = state.players || [];
  for (const p of players) {
    const swing = (rand() - 0.5) * 2 * AI.volatility * p.volatilityMult;
    const rate = p.growth * p.growthMult + swing;
    p.worth = Math.max(2000, Math.round(p.worth * (1 + rate)));
    // Property roughly tracks the money, which is what makes them look real.
    if (rand() < 0.12) p.properties = Math.max(1, p.properties + (rate > 0 ? 1 : -1));
  }
}

/** Weekly snapshot, so the board can show which way somebody is going. */
export function snapshotPlayers(state) {
  for (const p of state.players || []) {
    p.lastWeekWorth = p.worth;
    p.history = (p.history || []).concat(p.worth).slice(-12);
  }
  if (state.playerProfile) {
    state.playerProfile.lastWeekWorth = playerWorth(state);
    state.playerProfile.history = (state.playerProfile.history || [])
      .concat(playerWorth(state)).slice(-12);
  }
}

/**
 * What the player is worth: money on hand plus everything they own at what it
 * would actually fetch. The same basis the AI figures use, so the board is a
 * fair comparison.
 */
export function playerWorth(state, resaleOf) {
  let worth = state.cash.clean + state.cash.dirty;
  for (const lot of state.lots || []) {
    if (!lot.owned) continue;
    worth += resaleOf ? resaleOf(lot) : (lot.paidPrice || lot.price || 0);
  }
  return Math.round(worth);
}

/**
 * The board. The player is always in it, marked, so their position is readable
 * at a glance rather than needing to be hunted for.
 */
export function leaderboard(state, resaleOf) {
  const you = {
    id: 'you',
    name: (state.playerProfile && state.playerProfile.name) || 'You',
    isYou: true,
    worth: playerWorth(state, resaleOf),
    properties: (state.lots || []).filter((l) => l.owned).length,
    styleLabel: 'your operation',
    lastWeekWorth: state.playerProfile ? state.playerProfile.lastWeekWorth : null,
  };
  const field = state.aiDisabled ? [] : (state.players || []);
  return [you, ...field]
    .sort((a, b) => b.worth - a.worth)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

/** Which way somebody is heading, as a fraction. Null until there's a week of it. */
export function trendOf(entry) {
  if (!entry.lastWeekWorth) return null;
  return clamp01(Math.abs(entry.worth - entry.lastWeekWorth) / Math.max(1, entry.lastWeekWorth)) *
    (entry.worth >= entry.lastWeekWorth ? 1 : -1);
}
