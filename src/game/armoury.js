// Keeping one for yourself.
//
// A firearms line turns out finished units and they go out of the door — to a
// block, to a licensed counter, to another operation. This is the other thing
// you can do with one: pull it off the line and keep it.
//
// Three rules make that a decision rather than a freebie.
//
//   1. **You lose the sale.** A kept unit is a unit you did not sell, and the
//      valuable lines are exactly the ones you most want to keep something
//      from. A belt-fed is worth six figures on the street.
//   2. **It is capped.** Six is what a person keeps to hand. Without a cap the
//      right move is to keep everything, and a mechanic with one right answer
//      is not a mechanic.
//   3. **It costs you quietly, every day.** Iron in a drawer is iron somebody
//      can find. Unserialised pieces cost more attention than licensed ones,
//      because that is what they are — the same gun with the number ground off
//      is a different charge.
//
// What it buys you is standing on a block. Moving on a crew is a fight, and
// what you are carrying tips it. The edge has hard diminishing returns so that
// six machine guns is not the answer to the whole midgame.

import { PRODUCTS } from './constants.js';
import { BUILDINGS } from './constants.js';
import { legalPriceFactor } from './firearms.js';
import { lineKindOf, lineKindFor } from './lines.js';
import { streetPrice } from './economy.js';
import { clamp, clamp01 } from './rng.js';

export const ARMOURY = {
  /** What you can keep to hand. A hard number on purpose. */
  cap: 6,
  /** Daily attention per piece, on the block you are based on. */
  heatPerDayLicensed: 0.05,
  heatPerDayStreet: 0.16,
  // Armour is legal to own almost everywhere. A certified vest in a cupboard
  // is not a thing anybody can charge you for, and an uncertified one barely.
  heatPerDayArmour: 0.01,
  heatPerDayArmourStreet: 0.04,
  /** The most any collection can shift a fight, however big it gets. */
  maxEdge: 0.17,
  /**
   * The most armour can take off a move that goes wrong.
   *
   * A vest does not help you WIN a fight — it helps you survive losing one, so
   * it cuts what a backfire costs rather than shifting the odds. That split is
   * the reason keeping both is worth more than keeping six of either.
   */
  maxGuard: 0.4,
  guardScale: 5,
  /** Each further piece is worth this much of the one before it. */
  edgeFalloff: 0.55,
  /** How much armed weight it takes to get most of the way to the ceiling. */
  edgeScale: 6,
  /** A piece sold privately goes for less than the counter would get. */
  resale: 0.82,
};

export function armouryOf(state) {
  return (state && state.armoury) || [];
}

export function armouryCap() {
  return ARMOURY.cap;
}

export function armouryRoom(state) {
  return Math.max(0, ARMOURY.cap - armouryOf(state).length);
}

/**
 * Is this a line you could take a finished unit off?
 *
 * Any tooled line: a machine shop turns out something you might keep, and so
 * does a vest shop. What you keep behaves differently — see `armouryEdge` and
 * `armourGuard` — but taking it is the same act.
 */
export function isKeepableLine(building) {
  return !!lineKindOf(building);
}

/** Kept for the callers that only care about iron. */
export function isFirearmLine(building) {
  const def = building && BUILDINGS[building.type];
  return !!def && def.product === 'iron';
}

/** What product a kept piece came off. Old pieces predate the field. */
function kindOfPiece(piece) {
  return (piece && piece.kind) || 'iron';
}

function classesFor(piece) {
  const kind = lineKindFor(kindOfPiece(piece));
  return kind ? kind.classes : {};
}

function modelsOf(piece) {
  const kind = lineKindFor(kindOfPiece(piece));
  return kind ? kind.models : {};
}

/**
 * What one unit off this line is worth, and what it is.
 *
 * The class and the pattern both move the price — a belt-fed is not a shotgun
 * and a 1911 is not a polymer striker gun — and so does how well the line is
 * actually running, which is what `packQuality` already tracks.
 */
export function lineUnit(state, building) {
  const def = BUILDINGS[building.type];
  const kind = lineKindOf(building);
  if (!kind) return null;
  const cls = kind.classOf(building);
  // A shop with no pattern picked is still building SOMETHING, so a piece taken
  // off it records the class's first pattern rather than nothing. Without this
  // a kept unit has no model, which means no drawing and a name that just
  // repeats its category back at you.
  const model = kind.modelOf(building) || kind.modelsFor(cls.id)[0] || null;
  const quality = (building.packQuality && building.packQuality[kind.product]) || 0.6;
  // Serialised for iron, certified for armour — either way it means the thing
  // has paper behind it and sells over a counter rather than out of a boot.
  const serialised = !!def.needsLicence;
  const piece = {
    kind: kind.product,
    classId: cls.id,
    modelId: model ? model.id : null,
    quality,
    serialised,
  };
  return { ...piece, value: unitValue(state, piece, building) };
}

/**
 * What a piece is worth now.
 *
 * Priced off what iron actually fetches today rather than a number frozen at
 * the moment it was taken, so a collection tracks the market the same way the
 * rest of the ledger does.
 */
export function unitValue(state, piece, building = null) {
  const districts = (state && state.districts) || [];
  const d = districts[0];
  const product = kindOfPiece(piece);
  const base = d ? streetPrice(d, product) : PRODUCTS[product].basePrice;
  const classes = classesFor(piece);
  const cls = classes[piece.classId] || Object.values(classes)[0];
  const model = piece.modelId ? modelsOf(piece)[piece.modelId] : null;
  const legal = piece.serialised && building ? legalPriceFactor(building) : 1;
  return Math.round(
    base
    * cls.valueMult
    * (model ? model.valueMult : 1)
    * (0.75 + clamp01(piece.quality) * 0.5)
    * legal
  );
}

/** What a piece fetches if you let it go again. */
export function pieceValue(state, piece) {
  return Math.round(unitValue(state, piece) * ARMOURY.resale);
}

function pieceName(piece) {
  const model = piece.modelId ? modelsOf(piece)[piece.modelId] : null;
  if (model) return model.name;
  const cls = classesFor(piece)[piece.classId];
  return cls ? cls.name.replace(/s$/, '') : 'Kit';
}

function nextPieceId(state) {
  state.armouryCounter = (state.armouryCounter || 0) + 1;
  return `arm${state.armouryCounter}`;
}

/** Whether a unit could be taken off this line right now, and why not. */
export function canKeep(state, building) {
  if (!building) return { ok: false, error: 'No such premises.' };
  if (!isKeepableLine(building)) {
    return { ok: false, error: 'Only a line you tool turns out something you could keep.' };
  }
  if (armouryRoom(state) <= 0) {
    return {
      ok: false,
      error: `You can keep ${ARMOURY.cap} to hand. Let one go first.`,
    };
  }
  const kind = lineKindOf(building);
  const have = (building.packs && building.packs[kind.product]) || 0;
  if (have < 1) {
    return { ok: false, error: 'Nothing finished on that line yet.' };
  }
  return { ok: true };
}

/**
 * Take one off the line.
 *
 * It leaves the line's stock, so it is a unit that will not be sold — which is
 * the entire cost of doing this and is deliberately not softened.
 */
export function keepFromLine(state, building) {
  const gate = canKeep(state, building);
  if (!gate.ok) return gate;

  const unit = lineUnit(state, building);
  const kind = lineKindOf(building);
  building.packs[kind.product] -= 1;

  const piece = {
    id: nextPieceId(state),
    kind: kind.product,
    classId: unit.classId,
    modelId: unit.modelId,
    quality: unit.quality,
    serialised: unit.serialised,
    fromId: building.id,
    fromName: building.name,
    takenDay: Math.floor((state.minutes || 0) / 1440),
    name: pieceName(unit),
  };
  state.armoury = armouryOf(state).concat([piece]);
  return { ok: true, piece, forgone: unit.value };
}

/** Let one go again. Serialised provenance pays clean; the rest pays street. */
export function releasePiece(state, pieceId) {
  const list = armouryOf(state);
  const idx = list.findIndex((p) => p.id === pieceId);
  if (idx < 0) return { ok: false, error: 'Nothing like that in the cabinet.' };
  const piece = list[idx];
  const price = pieceValue(state, piece);
  state.armoury = list.slice(0, idx).concat(list.slice(idx + 1));
  if (piece.serialised) {
    state.cash.clean += price;
    state.stats.legalRevenue = (state.stats.legalRevenue || 0) + price;
  } else {
    state.cash.dirty += price;
  }
  return { ok: true, piece, price, clean: piece.serialised };
}

/**
 * How much what you carry tips a fight, 0 to `maxEdge`.
 *
 * Sorted so the best piece counts most, then falling off hard. The second gun
 * is worth about half the first and the sixth is worth almost nothing, which
 * is what stops the answer being "keep six of the dearest thing you build".
 */
export function armouryEdge(state) {
  // Only what you are carrying tips a fight. A vest in a cupboard does not
  // make anybody back down — see `armourGuard` for what it does do.
  const list = armouryOf(state).filter((p) => kindOfPiece(p) === 'iron');
  if (!list.length) return 0;

  // What a piece is worth in a fight tracks what it is. The raw spread between
  // a cheap shotgun and a belt-fed is about a hundred to one, which would make
  // everything but the machine gun irrelevant, so it goes through a square
  // root first — a belt-fed is worth several pistols, not a hundred of them.
  const weights = list
    .map((p) => {
      const classes = classesFor(p);
      const cls = classes[p.classId] || Object.values(classes)[0];
      const model = p.modelId ? modelsOf(p)[p.modelId] : null;
      return Math.sqrt(cls.valueMult * (model ? model.valueMult : 1));
    })
    .sort((a, b) => b - a);

  // Best piece counts most, then falls away hard: the second is worth about
  // half the first and the sixth almost nothing.
  let sum = 0;
  weights.forEach((w, i) => { sum += w * Math.pow(ARMOURY.edgeFalloff, i); });

  // Saturating rather than linear, so the cap is approached and never reached.
  // A pistol in a drawer is worth almost nothing; a full cabinet of the best
  // thing you build is worth most of the ceiling and no more.
  return clamp(
    ARMOURY.maxEdge * (1 - Math.exp(-sum / ARMOURY.edgeScale)),
    0, ARMOURY.maxEdge
  );
}

/** What keeping them costs in attention, per day, on the block you work from. */
export function armouryHeatPerDay(state) {
  return armouryOf(state).reduce((n, p) => {
    if (kindOfPiece(p) === 'plate') {
      return n + (p.serialised ? ARMOURY.heatPerDayArmour : ARMOURY.heatPerDayArmourStreet);
    }
    return n + (p.serialised ? ARMOURY.heatPerDayLicensed : ARMOURY.heatPerDayStreet);
  }, 0);
}

/**
 * How much of a bad move the armour absorbs, 0 to `maxGuard`.
 *
 * Deliberately not the same mechanic as the guns. Iron shifts whether you win;
 * armour shifts what losing costs you. Keeping one of each is therefore worth
 * more than keeping two of either, which is the decision the cap exists to
 * make interesting.
 */
export function armourGuard(state) {
  const list = armouryOf(state).filter((p) => kindOfPiece(p) === 'plate');
  if (!list.length) return 0;
  const weights = list
    .map((p) => {
      const classes = classesFor(p);
      const cls = classes[p.classId] || Object.values(classes)[0];
      const model = p.modelId ? modelsOf(p)[p.modelId] : null;
      return Math.sqrt(cls.valueMult * (model ? model.valueMult : 1));
    })
    .sort((a, b) => b - a);
  let sum = 0;
  weights.forEach((w, i) => { sum += w * Math.pow(ARMOURY.edgeFalloff, i); });
  return clamp(
    ARMOURY.maxGuard * (1 - Math.exp(-sum / ARMOURY.guardScale)),
    0, ARMOURY.maxGuard
  );
}

/** Which block wears that attention: where you are based, else where you started. */
export function armouryDistrictId(state) {
  const buildings = (state && state.buildings) || [];
  if (state && state.hqBuildingId) {
    const hq = buildings.find((b) => b.id === state.hqBuildingId);
    if (hq) return hq.districtId;
  }
  return buildings.length ? buildings[0].districtId : null;
}
