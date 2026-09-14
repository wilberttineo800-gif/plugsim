// What is left behind when something does not heal cleanly.
//
// Distinct from a wound, which closes, and from a missing part, which is
// simply absent. An impairment is a part that is still attached, still alive,
// and does not work — and it does not go away. These are the things that
// accumulate across a long run so that a veteran character reads differently
// from a new one.
//
// Every one of them comes from something the player could have done otherwise:
// a wound left too long, a treatment that went wrong, a fracture that set
// without anybody setting it.

export const IMPAIRMENTS = {
  palsy: {
    id: 'palsy', name: 'Nerve palsy',
    blurb: 'The arm is there and it is warm and it does nothing. Nerves do not knit like skin does.',
    symptom: 'The hand will not close when you tell it to.',
    effect: { manipulation: -0.3 },
    from: 'a wound that took the nerve, or a repair that missed it',
  },
  footDrop: {
    id: 'footDrop', name: 'Foot drop',
    blurb: 'The peroneal nerve, and the toe catches on every kerb in the city.',
    symptom: 'You lift the whole leg to clear the ground, every step.',
    effect: { moving: -0.28 },
    from: 'a lower-leg wound, or a fasciotomy done late',
  },
  malunion: {
    id: 'malunion', name: 'Malunion',
    blurb: 'It set. Nobody set it, so it set crooked, and only breaking it again fixes that.',
    symptom: 'It aches before rain and it will not take full weight.',
    effect: { moving: -0.18 },
    from: 'a fracture nobody treated',
  },
  chronicPain: {
    id: 'chronicPain', name: 'Chronic pain',
    blurb: 'Old fractures and whatever is still in there. It is not constant, which is worse.',
    symptom: 'Some days everything is harder and there is no reason for it.',
    effect: { consciousness: -0.12, manipulation: -0.1 },
    from: 'retained fragments and old breaks',
  },
  adhesions: {
    id: 'adhesions', name: 'Adhesions',
    blurb: 'Scar tissue where the bowel was opened, bound to itself.',
    symptom: 'You eat small and often, and sometimes not at all.',
    effect: { consciousness: -0.1, moving: -0.08 },
    from: 'an abdominal wound, or somebody going in through one',
  },
  visionLoss: {
    id: 'visionLoss', name: 'Vision loss',
    blurb: 'Not blind. Worse than it was, permanently, on that side.',
    symptom: 'You turn your head to see things you used to just see.',
    effect: { sight: -0.35 },
    from: 'a head wound, or a repair around the eye that went wrong',
  },
};

export const IMPAIRMENT_IDS = Object.keys(IMPAIRMENTS);

/** What a given body part, gone wrong, tends to leave behind. */
export const BY_REGION = {
  head: ['visionLoss', 'chronicPain'],
  neck: ['palsy', 'chronicPain'],
  thorax: ['chronicPain', 'adhesions'],
  abdomen: ['adhesions', 'chronicPain'],
  armL: ['palsy', 'chronicPain', 'malunion'],
  armR: ['palsy', 'chronicPain', 'malunion'],
  legL: ['footDrop', 'malunion', 'chronicPain'],
  legR: ['footDrop', 'malunion', 'chronicPain'],
};

/** Mark a body as permanently worse. */
export function addImpairment(body, id) {
  if (!IMPAIRMENTS[id]) return null;
  body.impairments = body.impairments || {};
  body.impairments[id] = (body.impairments[id] || 0) + 1;
  return IMPAIRMENTS[id];
}

/** Everything wrong with somebody for good. */
export function impairmentsOf(body) {
  const m = (body && body.impairments) || {};
  return Object.keys(m)
    .filter((id) => IMPAIRMENTS[id])
    .map((id) => ({ impairment: IMPAIRMENTS[id], n: m[id] }));
}

/** One that fits where the damage was, for a treatment that went wrong. */
export function impairmentFor(regionId, rand = Math.random) {
  const list = BY_REGION[regionId] || ['chronicPain'];
  return list[Math.floor(rand() * list.length)];
}
