// The first hour.
//
// A new player lands on a real map with no marker, no base and no idea what the
// game wants from them. SEED rebuilt exactly this after finding that dropping
// people into a simulation didn't work. So: someone talks to you, and there's a
// short list of things to do that unlocks the rest by doing them.
//
// Each step checks the world rather than trusting a flag, so it can't get out
// of step with what the player actually has.

import { BUILDINGS } from './constants.js';

/**
 * Ray. An old head who's been round this city long enough to know which doors
 * open. He talks like someone doing you a favour, because he is.
 */
export const HELPER = {
  name: 'Ray',
  role: 'knows everybody',
  greeting:
    "You're new, so I'll say this once and then you're on your own. This city " +
    "runs on three things: somewhere to make it, somewhere to keep it, and " +
    "somebody to move it. Get those three and you're in business.",
};

const has = (s, kind) => (s.buildings || []).some((b) => b.kind === kind);

export const STEPS = [
  {
    id: 'hq',
    title: 'Find yourself a base',
    brief:
      "First thing: somewhere that's yours. Doesn't have to be much — a flat, " +
      "a lock-up, anything with a door. Buy a building, then set it as your " +
      "headquarters. People round here need to know where to find you.",
    hint: 'Zoom in, click any building, buy it, then press "Make this my HQ".',
    check: (s) => !!s.hqBuildingId,
  },
  {
    id: 'produce',
    title: 'Make something',
    brief:
      "Nobody buys an empty bag. Get a grow going — a spare room does it to " +
      "start. Small building, small yield; that's just how space works. Keep " +
      "a few thousand back when you do: a grow buys its supplies in every " +
      "cycle, and it stops dead the day you can't cover them.",
    hint: 'Buy a building over 55 m² and fit it out as a Grow House.',
    check: (s) => has(s, 'production'),
  },
  {
    id: 'depot',
    title: 'Somewhere to park',
    brief:
      "You'll want wheels, and wheels have to sit somewhere. Car parks are all " +
      "over this map — buy one and put a depot on it. How big it is decides how " +
      "many motors you can run, so buy for the fleet you've got, not the one " +
      "you want. A handful of spaces is plenty to start, and a multi-storey " +
      "will eat everything you have.",
    hint: 'Car parks draw in blue. A small one is a few hundred; buy that.',
    check: (s) => has(s, 'depot'),
  },
  {
    id: 'vehicle',
    title: 'Get something that moves',
    brief:
      "Buy a motor, then hire somebody to drive it. Two different things — the " +
      "van is yours, the driver is staff. Every hand you take on is harder to " +
      "find than the last, so the fee climbs.",
    hint: 'Fleet tab → Dealership, then hire a driver and put them in it.',
    check: (s) => (s.couriers || []).some((c) => c.driverId),
  },
  {
    id: 'route',
    title: 'Open a line',
    brief:
      "Now point it somewhere. Pick up where you make it, drop off where they " +
      "want it. Watch the blocks — some of them shift a lot more than others.",
    hint: 'Routes tab → pick up from your grow, drop off on a block that wants it.',
    check: (s) => (s.routes || []).some((r) => r.active),
  },
  {
    id: 'money',
    title: 'Take your first money',
    brief:
      "That's street money coming in now. It spends nowhere legitimate until " +
      "it's been through something that takes cash over a counter.",
    hint: 'Let a delivery land. Street money shows up top.',
    check: (s) => s.cash.dirty > 0 || (s.stats && s.stats.grossRevenue > 0),
  },
  {
    id: 'wash',
    title: 'Make it clean',
    brief:
      "Buy something honest — a laundrette, a barber's, a car wash. It turns a " +
      "bit of street money into money you can actually spend, every day, " +
      "quietly. That's the whole game, long term.",
    hint: 'Buy a building and fit it out as a legitimate business.',
    check: (s) => (s.buildings || []).some((b) => BUILDINGS[b.type]?.kind === 'front'),
  },
];

/** The step the player is on, or null once they're through it all. */
export function currentStep(state) {
  if (!state || state.tutorialDismissed) return null;
  return STEPS.find((st) => !st.check(state)) || null;
}

/** How far through the introduction they are. */
export function progress(state) {
  const done = STEPS.filter((st) => st.check(state)).length;
  return { done, total: STEPS.length, complete: done === STEPS.length };
}

/**
 * Steps completed since last asked, so the game can say something when one
 * lands rather than silently ticking a box.
 */
export function newlyDone(state) {
  state.tutorialDone = state.tutorialDone || [];
  const fresh = [];
  for (const st of STEPS) {
    if (st.check(state) && !state.tutorialDone.includes(st.id)) {
      state.tutorialDone.push(st.id);
      fresh.push(st);
    }
  }
  return fresh;
}
