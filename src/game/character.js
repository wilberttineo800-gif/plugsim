// You.
//
// Up to now the player has been a balance sheet. This is the body that owns it
// — the thing that gets shot at when a move on a block goes wrong, and the
// reason the cabinet is worth keeping rather than selling.
//
// Equipment comes straight out of the armoury: a piece you kept back is a piece
// you can put on. That closes the loop the cabinet opened. A Level IV plate is
// $6,000 you chose not to take, and this is where you find out whether that was
// the right call.

import { newBody, BODY_PARTS, BODY_PART_IDS } from './health.js';
import {
  randomAppearance, normaliseAppearance, appearanceFrom, TRAITS,
} from './appearance.js';
import { armouryOf } from './armoury.js';
import { ARMOUR_CLASSES, protectionAt } from './armour.js';
import { FIREARM_CLASSES, threatOf } from './firearms.js';
import { MODELS } from './firearms.js';
import { ARMOUR_MODELS } from './armour.js';

/**
 * Where a thing can go.
 *
 * `takes` is which categories fit the slot, so a helmet cannot be worn on the
 * chest and a belt-fed is not a sidearm. `armour` marks the slots that protect
 * rather than the ones that shoot.
 *
 * `kind` is not redundant with `takes`: armour and firearms BOTH have a
 * category called `rifle` — rifle plates and rifles — so matching on the
 * category alone let a carbine be worn on the chest. Every check here has to
 * ask what kind of thing it is first.
 */
export const SLOTS = {
  head: {
    id: 'head', name: 'Head', armour: true, kind: 'plate',
    takes: ['helmet'],
    empty: 'Nothing on your head.',
  },
  torso: {
    id: 'torso', name: 'Body', armour: true, kind: 'plate',
    takes: ['stab', 'carrier', 'covert', 'soft', 'rifle', 'ceramic'],
    empty: 'Nothing on. Every round that finds you finds all of you.',
  },
  offhand: {
    id: 'offhand', name: 'Off hand', armour: true, kind: 'plate',
    takes: ['shield'],
    empty: 'Nothing in your off hand.',
  },
  primary: {
    id: 'primary', name: 'Primary', kind: 'iron',
    takes: ['rifle', 'smg', 'shotgun', 'precision', 'machinegun', 'nfa'],
    empty: 'Nothing long.',
  },
  sidearm: {
    id: 'sidearm', name: 'Sidearm', kind: 'iron',
    takes: ['handgun', 'revolver'],
    empty: 'Nothing on your hip.',
  },
};

export const SLOT_IDS = Object.keys(SLOTS);

export function newCharacter(name = 'You', seed = Date.now()) {
  return {
    name,
    body: newBody(),
    equipped: {},
    // Everybody starts as somebody, picked for them. It is a starting point,
    // not a sentence — every trait on it can be changed.
    appearance: randomAppearance(seed),
  };
}

/** The player's own character, created on demand for a save that predates it. */
export function characterOf(state) {
  if (!state.character) {
    state.character = newCharacter(state.playerName || 'You', (state.seed || 1) * 7919);
  }
  if (!state.character.body) state.character.body = newBody();
  if (!state.character.equipped) state.character.equipped = {};
  state.character.appearance = normaliseAppearance(state.character.appearance);
  return state.character;
}

/**
 * Change one thing about how you look.
 *
 * Validated here rather than left to `normaliseAppearance`, which repairs a
 * bad field by falling back to the PRESET — so a rejected change would
 * silently reset that trait to the model default instead of leaving it alone.
 */
export function setTrait(state, key, value) {
  const trait = TRAITS.find((t) => t.key === key);
  if (!trait) return { ok: false, error: 'No such thing to change.' };
  if (!trait.table[value]) return { ok: false, error: 'No such option.' };
  const ch = characterOf(state);
  ch.appearance = normaliseAppearance({ ...ch.appearance, [key]: value });
  return { ok: true, appearance: ch.appearance };
}

/** Start again from one of the twenty. */
export function setModel(state, modelId) {
  const ch = characterOf(state);
  ch.appearance = normaliseAppearance(appearanceFrom(modelId));
  return { ok: true, appearance: ch.appearance };
}

/**
 * How somebody the game generated looks.
 *
 * Derived from their own id rather than stored, so every driver and every
 * rival operation has a face without any of it having to be saved — and looks
 * the same every time the save is opened.
 */
export function appearanceOf(entity) {
  if (!entity) return appearanceFrom('m01');
  if (entity.appearance) return normaliseAppearance(entity.appearance);
  const id = String(entity.id || entity.name || 'x');
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return randomAppearance(h >>> 0);
}

/** The cabinet piece in a slot, or null. */
export function equippedIn(state, slotId) {
  const ch = characterOf(state);
  const id = ch.equipped[slotId];
  if (!id) return null;
  return armouryOf(state).find((p) => p.id === id) || null;
}

/** Does this piece belong in this slot at all? */
export function fitsSlot(slot, piece) {
  if (!slot || !piece) return false;
  const kind = piece.kind || 'iron';
  return kind === slot.kind && slot.takes.includes(piece.classId);
}

/** Which slot, if any, a kept piece could go in. */
export function slotFor(piece) {
  if (!piece) return null;
  return SLOT_IDS.find((id) => fitsSlot(SLOTS[id], piece)) || null;
}

/** Everything in the cabinet that would fit this slot. */
export function candidatesFor(state, slotId) {
  const slot = SLOTS[slotId];
  if (!slot) return [];
  return armouryOf(state).filter((p) => fitsSlot(slot, p));
}

/**
 * Put something on, or take it off with a null piece.
 *
 * A piece can only be in one slot at a time, which is the only rule here worth
 * having: it stops a single vest protecting you twice.
 */
export function equip(state, slotId, pieceId) {
  const ch = characterOf(state);
  const slot = SLOTS[slotId];
  if (!slot) return { ok: false, error: 'No such slot.' };
  if (!pieceId) {
    delete ch.equipped[slotId];
    return { ok: true, piece: null };
  }
  const piece = armouryOf(state).find((p) => p.id === pieceId);
  if (!piece) return { ok: false, error: 'Nothing like that in the cabinet.' };
  if (!fitsSlot(slot, piece)) {
    return { ok: false, error: `A ${piece.name} does not go there.` };
  }
  for (const id of SLOT_IDS) {
    if (ch.equipped[id] === pieceId) delete ch.equipped[id];
  }
  ch.equipped[slotId] = pieceId;
  return { ok: true, piece };
}

/**
 * How well covered a body part is, 0 to 1.
 *
 * The best thing covering it wins rather than the sum — layering a vest under
 * a plate does not add their ratings together, the plate is simply what the
 * round hits first. Quality moves it a little either way, because a plate that
 * came off a badly-run line is a plate that has not been tested.
 */
export function protectionOf(state, partId) {
  const ch = characterOf(state);
  let best = 0;
  for (const slotId of SLOT_IDS) {
    if (!SLOTS[slotId].armour) continue;
    const piece = equippedIn(state, slotId);
    if (!piece) continue;
    const base = protectionAt(piece.classId, partId);
    if (!base) continue;
    const made = 0.88 + (piece.quality || 0.6) * 0.2;
    best = Math.max(best, Math.min(0.97, base * made));
  }
  return best;
}

/** Everything you are wearing, for a readout. */
export function coverage(state) {
  const out = {};
  for (const id of BODY_PART_IDS) out[id] = protectionOf(state, id);
  return out;
}

/** What you are carrying, as a threat level — what you can put back. */
export function armedWith(state) {
  const primary = equippedIn(state, 'primary');
  const sidearm = equippedIn(state, 'sidearm');
  const best = primary || sidearm;
  return best ? threatOf(best.classId) : 0;
}

/** A one-line description of a kept piece, whichever kind it is. */
export function pieceLabel(piece) {
  if (!piece) return '';
  const model = piece.modelId
    ? (piece.kind === 'plate' ? ARMOUR_MODELS : MODELS)[piece.modelId]
    : null;
  const cls = (piece.kind === 'plate' ? ARMOUR_CLASSES : FIREARM_CLASSES)[piece.classId];
  return model ? model.name : (cls ? cls.name.replace(/s$/, '') : 'Kit');
}
