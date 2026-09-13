// Ray, after the introduction.
//
// The seven opening steps tell you how to stand something up. They deliberately
// do not care WHAT you build — `has(s, 'production')` is satisfied by a closet
// in a spare room or a warehouse grow, so the path is yours.
//
// What they cannot do is keep up. The game now has licences, research, turf,
// retail margins, other cities and smugglers, and a player who finished the
// introduction has no idea any of it exists. So Ray stays on as a guide: he
// says nothing while you are getting on with it, and speaks up when something
// NEW becomes available to you.
//
// Two rules make that bearable rather than nagging:
//
//   1. Every tip fires once, ever. Seen is seen.
//   2. Sending him away is respected — but a genuinely new thing opening up
//      brings him back, because that is the one moment the guidance is worth
//      interrupting for.

import { BUILDINGS } from './constants.js';
import { LICENCES, hasLicence } from './firearms.js';
import { citiesOf } from './cities.js';

const buildings = (s) => s.buildings || [];
const has = (s, fn) => buildings(s).some(fn);
const ofKind = (s, kind) => has(s, (b) => (BUILDINGS[b.type] || {}).kind === kind);
const countOwned = (s) => (s.lots || []).filter((l) => l.owned).length;

/**
 * Each tip: when it becomes true, what Ray says, and where to go.
 *
 * `when` is checked against the world rather than a flag, so a tip cannot fire
 * for something the player has not actually reached. Order is priority: the
 * first unseen tip whose condition holds is the one he leads with.
 */
export const TIPS = [
  {
    id: 'backlog',
    title: 'Your line is backing up',
    when: (s) => has(s, (b) => /Backing up|full/.test(b.stalledReason || '')),
    says: "You're making more than you can shift. That's not a bad problem, but "
      + "it is a problem — a full room stops working and still costs you rent. "
      + "More vans, or more blocks to sell on. Usually both.",
    go: 'fleet',
  },
  {
    id: 'saturated',
    title: "That block's had enough",
    when: (s) => (s.districts || []).some((d) => (d.supply.weed || 0) > 60),
    says: "You're drowning one block. Price drops the more you put on it, and "
      + "the heat doesn't. Spread it — every block has its own appetite.",
    go: 'blocks',
  },
  {
    id: 'retail',
    title: 'Serve it yourself',
    when: (s) => ofKind(s, 'storage'),
    says: "A place you own can sell straight out the door. Breaks down to "
      + "eighths and quarters instead of going out by the pound, and you keep "
      + "the margin the block's people would've taken. Slower, but it's yours.",
    go: 'build',
  },
  {
    id: 'wash',
    title: 'Street money spends nowhere',
    when: (s) => s.cash.dirty > 500000 && !ofKind(s, 'front'),
    says: "You're sat on street money you can't spend. Property and fit-outs "
      + "want clean. Buy something honest — the fixer'll wash a bit but he takes "
      + "a fat cut for it.",
    go: 'build',
  },
  {
    id: 'licence',
    title: 'Paper before iron',
    when: (s) => has(s, (b) => (BUILDINGS[b.type] || {}).needsLicence)
      && Object.keys(LICENCES).some((id) => !hasLicence(s, id)),
    says: "That line needs paper before it turns out anything legal. Apply "
      + "early — the examiner takes his time, and the line sits idle until it's "
      + "in force.",
    go: 'build',
  },
  {
    id: 'upgrades',
    title: 'Fit the place out',
    when: (s) => buildings(s).length >= 3 && s.cash.clean > 200000,
    says: "Every place takes work — better lights, more racking, a sealed room. "
      + "Costs a bit more a day to run and pays for itself if the place is "
      + "actually busy.",
    go: 'build',
  },
  {
    id: 'turf',
    title: 'Somebody else works this block',
    when: (s) => (s.districts || []).some((d) => (d.rivalControl || 0) > 0.5),
    says: "Crews hold blocks and skim anything moved on them. You can pay it or "
      + "you can take the block. Taking it costs you up front and keeps costing "
      + "you — but it's yours after.",
    go: 'blocks',
  },
  {
    id: 'research',
    title: 'Worth knowing',
    when: (s) => countOwned(s) >= 6 && s.cash.clean > 1000000,
    says: "There's work you can pay somebody to figure out — better yield, "
      + "cleaner product, things you can't buy anywhere. Takes time and it runs "
      + "while you're doing other things.",
    go: 'lab',
  },
  {
    id: 'cities',
    title: "You've outgrown this city",
    when: (s) => citiesOf(s).length === 1 && s.cash.clean > 4000000,
    says: "This map's only got so many blocks in it. Somewhere else wants "
      + "different things at different prices — that's the point of going, not "
      + "the extra room. Costs a lot to open up.",
    go: 'cities',
  },
  {
    id: 'smuggling',
    title: 'Getting it there',
    when: (s) => citiesOf(s).length > 1,
    says: "Weight doesn't drive itself between cities. You hand it to somebody "
      + "and it's gone for days — turns up or it doesn't. Send it in smaller "
      + "loads than you want to. Losing the lot in one go is how people stop.",
    go: 'cities',
  },
];

/**
 * The tip Ray should be leading with, or null if he has nothing new to say.
 *
 * Dismissal is honoured until something he has never mentioned comes true —
 * that is the one moment worth interrupting for, and it is also what stops the
 * guide going quiet forever the first time somebody taps it away.
 */
export function pendingTip(state) {
  if (!state) return null;
  const seen = new Set(state.seenTips || []);
  return TIPS.find((t) => !seen.has(t.id) && t.when(state)) || null;
}

/** Mark it read. Called when it has actually been shown. */
export function markTipSeen(state, id) {
  if (!state) return;
  state.seenTips = [...new Set([...(state.seenTips || []), id])];
}

/** Everything he has already covered, for a "what did he say again" list. */
export function seenTips(state) {
  const seen = new Set((state && state.seenTips) || []);
  return TIPS.filter((t) => seen.has(t.id));
}
