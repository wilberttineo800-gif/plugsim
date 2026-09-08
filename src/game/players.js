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

/**
 * Where an operation is. Other people are somewhere real on this map, and you
 * find them the way you'd find them in life: by expanding into a block they're
 * already working, or by hearing about them.
 */
export const PRESENCE = {
  // Blocks each operation works, at the start.
  blocksEach: [1, 3],
  // Chance per day that being active in the same block gets you noticed.
  noticePerDay: 0.22,
  // How far a rumour travels without you doing anything.
  rumourPerDay: 0.02,
};

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
      // Where they work. Filled in by placePlayers once districts are known.
      blocks: [],
      // Whether you've found out about them yet, and whether they know you.
      known: false,
      knowsYou: false,
      metOn: null,
      // What they'll trade, refreshed as the market moves.
      offers: [],
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


/**
 * Put every operation somewhere on the map. They settle where a business would:
 * dense blocks with real demand, spread out so they aren't all on one corner.
 */
export function placePlayers(state, rand) {
  const districts = state.districts || [];
  if (!districts.length) return;

  const ranked = districts
    .map((d) => ({
      d,
      worth: d.density * 0.6
        + ((d.demandPerHour?.weed || 0) + (d.demandPerHour?.shrooms || 0)) * 0.05
        - d.policing * 0.3
        + rand() * 0.4,
    }))
    .sort((a, b) => b.worth - a.worth);

  const taken = new Set();
  const [lo, hi] = PRESENCE.blocksEach;
  for (const p of state.players || []) {
    const want = lo + Math.floor(rand() * (hi - lo + 1));
    p.blocks = [];
    for (const entry of ranked) {
      if (p.blocks.length >= want) break;
      // Operations overlap sometimes, but not everybody on one street.
      if (taken.has(entry.d.id) && rand() > 0.3) continue;
      p.blocks.push(entry.d.id);
      taken.add(entry.d.id);
    }
  }
}

/** Everybody working this block, whether or not you've noticed them. */
export function operationsIn(state, districtId) {
  if (state.aiDisabled) return [];
  return (state.players || []).filter((p) => (p.blocks || []).includes(districtId));
}

/** Everybody you've actually found out about. */
export function knownOperations(state) {
  if (state.aiDisabled) return [];
  return (state.players || []).filter((p) => p.known);
}

/**
 * Finding out about each other. You notice somebody by working the same ground
 * — selling there, or buying property there — and they notice you the same way.
 * Neither of you is told; it just becomes apparent, which is the point.
 */
export function stepDiscovery(state, days, rand) {
  if (state.aiDisabled) return [];
  const found = [];

  for (const p of state.players || []) {
    const blocks = p.blocks || [];
    if (!blocks.length) continue;

    // Are you actually doing anything where they are?
    const activeThere = blocks.some((id) => {
      const d = (state.districts || []).find((x) => x.id === id);
      if (!d) return false;
      const selling = Object.values(d.supply || {}).some((v) => v > 0.5);
      const owning = (state.lots || []).some((l) => l.owned && l.districtId === id);
      return selling || owning;
    });

    const chance = activeThere
      ? PRESENCE.noticePerDay * days
      : PRESENCE.rumourPerDay * days;

    if (!p.known && rand() < chance) {
      p.known = true;
      p.metOn = blocks[0];
      found.push({ player: p, how: activeThere ? 'ran into' : 'heard about' });
    }
    // They find out about you on the same terms, from their side.
    if (!p.knowsYou && activeThere && rand() < chance) p.knowsYou = true;
  }

  return found;
}

/**
 * Somebody else already works this block. Told plainly, because walking into
 * an established operation should feel like walking into one.
 */
export function turfWarning(state, districtId) {
  const here = operationsIn(state, districtId).filter((p) => p.known);
  if (!here.length) return null;
  return here.length === 1
    ? `${here[0].name} already works this block.`
    : `${here.map((p) => p.name).join(' and ')} already work this block.`;
}


// --- Trading with them ------------------------------------------------------
//
// The design note wanted a player market: things you make sold to other people
// rather than to nobody. NPC prices are deliberately poor, exactly as SEED does
// it, so dealing with an operation is the good option and finding one matters.

/** How much better than the street a given operation pays, by what they do. */
const APPETITE = {
  property: { iron: 0.9, weed: 1.0, shrooms: 1.0, hash: 1.05, pills: 1.0, item: 1.25 },
  volume:   { iron: 1.0, weed: 1.35, shrooms: 1.3, hash: 1.25, pills: 1.2, item: 1.0 },
  legit:    { iron: 0.8, weed: 0.85, shrooms: 0.9, hash: 0.95, pills: 1.0, item: 1.4 },
  iron:     { iron: 1.55, weed: 0.9, shrooms: 0.9, hash: 1.0, pills: 1.15, item: 1.1 },
};

/**
 * What an operation will pay for a one-off. Somebody who buys buildings wants
 * a pattern less than somebody who deals in iron does.
 */
export function offerForItem(player, baseValue) {
  const appetite = (APPETITE[player.style] || APPETITE.volume).item;
  // Bigger operations can afford to pay closer to what a thing is worth.
  const depth = 0.75 + Math.min(0.45, player.worth / 4000000);
  return Math.round(baseValue * appetite * depth);
}

/**
 * What they'll pay per pack, against the street price you'd otherwise get.
 * Selling in bulk to somebody who wants it beats grinding it out on a corner —
 * that's the whole reason to look for people.
 */
export function offerForProduct(player, productId, streetUnit) {
  const appetite = (APPETITE[player.style] || APPETITE.volume)[productId] || 1;
  const depth = 0.8 + Math.min(0.4, player.worth / 5000000);
  return Math.round(streetUnit * appetite * depth * 100) / 100;
}

/**
 * How much of a product an operation can absorb in one go. Sized so a trade is
 * worth crossing the room for — a small operation takes a few hours of street
 * selling off your hands, a large one takes most of a day's.
 */
export function appetiteFor(player, productId) {
  const appetite = (APPETITE[player.style] || APPETITE.volume)[productId] || 1;
  return Math.max(25, Math.round((player.worth / 3600) * appetite));
}
