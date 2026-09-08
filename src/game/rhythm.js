// The city's rhythm.
//
// Demand used to be flat around the clock, every day the same, which meant
// there was never a reason to time anything and a block you learned on Monday
// behaved identically on Saturday. A city doesn't work like that.
//
// Everything here **redistributes** demand rather than adding it: each curve is
// normalised so a full week averages 1.0. That matters — the economy is tuned
// against a known daily take, and a rhythm that quietly added 20% would
// rebalance the whole game without anyone noticing.

import { clamp01 } from './rng.js';

/** Where we are in the week, from the running clock. */
export function cityClock(minutes) {
  const totalDays = Math.floor(minutes / 1440);
  const hour = (minutes % 1440) / 60;
  // Day 1 is a Monday; it gives the week a shape people recognise.
  const weekday = totalDays % 7;               // 0 Mon … 6 Sun
  const dayOfMonth = (totalDays % 30) + 1;
  return { day: totalDays + 1, hour, weekday, dayOfMonth };
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * How each trade moves through a day. Twenty-four weights, normalised on use,
 * so only the *shape* here matters and the average is always 1.0.
 *
 * These are shaped after when people actually buy: cannabis climbs through the
 * evening, powder is a late-night trade, tablets belong to the small hours at a
 * weekend, and nobody buys a firearm at four in the morning.
 */
const HOURLY = {
  weed:    [4, 3, 2, 2, 2, 2, 3, 5, 7, 8, 9, 10, 11, 11, 12, 13, 15, 18, 20, 21, 20, 16, 10, 6],
  shrooms: [3, 2, 2, 1, 1, 1, 2, 3, 5, 7, 9, 10, 11, 12, 13, 14, 16, 18, 19, 18, 15, 11, 7, 4],
  hash:    [5, 4, 3, 2, 2, 2, 3, 5, 7, 9, 10, 11, 12, 12, 13, 14, 16, 18, 19, 19, 17, 13, 9, 6],
  coke:    [16, 14, 10, 6, 3, 2, 1, 1, 2, 3, 4, 5, 6, 6, 7, 8, 10, 13, 16, 19, 22, 24, 22, 19],
  pills:   [18, 16, 12, 7, 3, 2, 1, 1, 1, 2, 3, 4, 4, 5, 6, 7, 9, 12, 15, 18, 21, 23, 22, 20],
  iron:    [3, 2, 1, 1, 1, 1, 2, 4, 7, 10, 12, 13, 13, 13, 13, 12, 11, 10, 8, 6, 5, 4, 4, 3],
};

/** How each trade moves through a week. Monday first. */
const WEEKLY = {
  weed:    [0.88, 0.88, 0.92, 1.00, 1.16, 1.24, 0.92],
  shrooms: [0.82, 0.84, 0.90, 1.00, 1.22, 1.32, 0.90],
  hash:    [0.88, 0.90, 0.92, 1.00, 1.15, 1.22, 0.93],
  coke:    [0.66, 0.70, 0.80, 1.00, 1.48, 1.62, 0.74],
  pills:   [0.60, 0.64, 0.74, 0.98, 1.56, 1.72, 0.76],
  iron:    [1.05, 1.06, 1.04, 1.02, 1.06, 0.92, 0.85],
};

function normalised(list) {
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  return list.map((v) => v / mean);
}

// Normalised once at load, so the shapes above can be written by eye.
const HOURLY_N = Object.fromEntries(Object.entries(HOURLY).map(([k, v]) => [k, normalised(v)]));
const WEEKLY_N = Object.fromEntries(Object.entries(WEEKLY).map(([k, v]) => [k, normalised(v)]));

// A short flush spell after payday, then a long slow drain.
const PAYDAY_LIFT = 0.34;
const PAYDAY_DECAY = 3.2;

// Normalised from the shape itself rather than a hand-tuned constant, so
// changing the lift or the decay above can't quietly move the whole economy.
const PAYDAY_BASE = (() => {
  let sum = 0;
  for (let d = 0; d < 15; d++) sum += Math.exp(-d / PAYDAY_DECAY);
  return 1 - PAYDAY_LIFT * (sum / 15);
})();

/**
 * People are flush right after they're paid and skint before it. Two paydays a
 * month, and the curve averages exactly 1.0 across them.
 */
export function paydayFactor(dayOfMonth) {
  const since = Math.min(
    (dayOfMonth - 1 + 30) % 15,   // days since the 1st or the 16th
    (dayOfMonth - 16 + 30) % 15
  );
  return PAYDAY_BASE + PAYDAY_LIFT * Math.exp(-since / PAYDAY_DECAY);
}

/**
 * Everything the clock does to demand for one product, right now. Averages 1.0
 * over a full week, so this never changes how much the city buys — only when.
 */
export function rhythmFactor(minutes, productId) {
  const { hour, weekday, dayOfMonth } = cityClock(minutes);
  const hourly = HOURLY_N[productId] || HOURLY_N.weed;
  const weekly = WEEKLY_N[productId] || WEEKLY_N.weed;

  // Blend between the two nearest hours so the curve is smooth rather than
  // stepping once an hour.
  const i = Math.floor(hour) % 24;
  const j = (i + 1) % 24;
  const t = hour - Math.floor(hour);
  const h = hourly[i] * (1 - t) + hourly[j] * t;

  return h * weekly[weekday] * paydayFactor(dayOfMonth);
}

/** A short, readable line about what the city is doing, for the HUD. */
export function rhythmNote(minutes) {
  const { hour, weekday, dayOfMonth } = cityClock(minutes);
  const day = DAY_NAMES[weekday];
  const night = hour >= 22 || hour < 4;
  const evening = hour >= 18 && hour < 22;
  const smallHours = hour >= 1 && hour < 5;
  const payday = paydayFactor(dayOfMonth) > 1.12;

  if (payday && (weekday === 4 || weekday === 5)) return `${day} · payday weekend`;
  if (payday) return `${day} · people just got paid`;
  if ((weekday === 4 || weekday === 5) && night) return `${day} night · everywhere is busy`;
  if (weekday === 5 && evening) return `${day} evening · filling up`;
  if (smallHours) return `${day} · small hours, powder and pills only`;
  if (night) return `${day} night`;
  if (evening) return `${day} evening`;
  if (hour < 7) return `${day} · dead before dawn`;
  return `${day} · daytime trade`;
}

/** Whether it's dark out, for tinting the map. */
export function isNight(minutes) {
  const { hour } = cityClock(minutes);
  return hour >= 20 || hour < 6;
}

/**
 * How dark, 0 at midday and 1 in the middle of the night. Smooth, so the map
 * fades between day and night rather than snapping.
 */
export function darkness(minutes) {
  const { hour } = cityClock(minutes);
  // Midnight is darkest, midday lightest.
  return clamp01((Math.cos((hour / 24) * Math.PI * 2) + 1) / 2);
}
