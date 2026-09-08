// Things happening, somewhere.
//
// The map is the whole premise and it was becoming wallpaper: you bought
// property, set routes, and then lived in the side panels. Nothing ever
// happened *at a place* that you'd only notice by looking at it.
//
// An incident is exactly that. It has a location, a short life, and it is not
// announced in the ticker — you find it because you were looking at the map.
// Some are warnings, some are opportunities, and a few want an answer.

import { clamp01 } from './rng.js';

export const INCIDENTS = {
  eyes: {
    id: 'eyes',
    name: 'Somebody watching',
    blurb: 'A car that has been parked too long, on a block where you work.',
    tone: 'bad',
    hours: 8,
    glyph: '◉',
  },
  queue: {
    id: 'queue',
    name: 'More askers than stock',
    blurb: 'People coming and finding nothing. They will go somewhere else if this holds.',
    tone: 'warn',
    hours: 5,
    glyph: '⋯',
  },
  glut: {
    id: 'glut',
    name: 'Block is drowning',
    blurb: 'Far more here than anybody can shift, and the price is on the floor for it.',
    tone: 'warn',
    hours: 10,
    glyph: '▼',
  },
  tailed: {
    id: 'tailed',
    name: 'Driver picked up a tail',
    blurb: 'Somebody followed a run and turned off late. Nothing happened. This time.',
    tone: 'bad',
    hours: 6,
    glyph: '➤',
  },
  rival_move: {
    id: 'rival_move',
    name: 'Somebody moving in',
    blurb: 'Another operation has started working this block.',
    tone: 'bad',
    hours: 24,
    glyph: '✦',
  },
  good_night: {
    id: 'good_night',
    name: 'Everything went',
    blurb: 'The block cleared everything you put on it and asked for more.',
    tone: 'good',
    hours: 4,
    glyph: '▲',
  },
  approached: {
    id: 'approached',
    name: 'Somebody asking after you',
    blurb: 'A name you half know has been asking whether you deal in volume.',
    tone: 'good',
    hours: 20,
    glyph: '✉',
  },
  raid_scene: {
    id: 'raid_scene',
    name: 'They came through the door',
    blurb: 'Everything on site is gone and the street saw it happen.',
    tone: 'bad',
    hours: 20,
    glyph: '✖',
  },
};

export const INCIDENT_IDS = Object.keys(INCIDENTS);

/** How many can be on the map at once, so it never becomes noise. */
export const MAX_INCIDENTS = 14;

let counter = 0;

/**
 * Put something on the map. Repeats of the same thing in the same place refresh
 * rather than stack — a block that stays glutted is one problem, not forty.
 */
export function raise(state, type, { latlng, districtId = null, buildingId = null, detail = null } = {}) {
  const def = INCIDENTS[type];
  if (!def || !latlng) return null;
  state.incidents = state.incidents || [];

  const existing = state.incidents.find(
    (i) => i.type === type && i.districtId === districtId && i.buildingId === buildingId
  );
  if (existing) {
    existing.until = state.minutes + def.hours * 60;
    existing.seen = false;
    if (detail) existing.detail = detail;
    return existing;
  }

  const incident = {
    id: `i${++counter}`,
    type,
    latlng: { ...latlng },
    districtId,
    buildingId,
    detail,
    at: state.minutes,
    until: state.minutes + def.hours * 60,
    seen: false,
  };
  state.incidents.push(incident);

  // Oldest go first when it gets crowded, but never something unseen and bad.
  if (state.incidents.length > MAX_INCIDENTS) {
    const droppable = state.incidents
      .filter((i) => i.seen || INCIDENTS[i.type].tone !== 'bad')
      .sort((a, b) => a.at - b.at);
    const victim = droppable[0] || state.incidents[0];
    state.incidents = state.incidents.filter((i) => i !== victim);
  }
  return incident;
}

/** Drop anything that has run its course. */
export function stepIncidents(state) {
  if (!state.incidents || !state.incidents.length) return;
  state.incidents = state.incidents.filter((i) => i.until > state.minutes);
}

export function activeIncidents(state) {
  return state.incidents || [];
}

export function unseenCount(state) {
  return (state.incidents || []).filter((i) => !i.seen).length;
}

export function markSeen(state, id) {
  const i = (state.incidents || []).find((x) => x.id === id);
  if (i) i.seen = true;
  return i;
}

/** How far through its life this is, for fading it out. */
export function freshness(state, incident) {
  const def = INCIDENTS[incident.type];
  const span = def.hours * 60;
  return clamp01(1 - (state.minutes - incident.at) / Math.max(1, span));
}
