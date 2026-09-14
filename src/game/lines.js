// Tooled lines.
//
// Most premises just make their product. A few don't: they make a CHOSEN
// VARIANT of it, picked by the player, and that choice moves output, quality,
// heat and what the thing is worth. Firearms did this first. Body armour does
// the same job with different paperwork and a completely different heat
// profile, and there will be more.
//
// Before this existed the simulation asked `def.product === 'iron'` in five
// separate places and reached straight into firearms.js for the answer. Adding
// a second tooled product that way means finding all five and getting them all
// right, so instead everything asks here and the per-product detail lives in
// one table.

import { BUILDINGS } from './constants.js';
import {
  FIREARM_CLASSES, MODELS as FIREARM_MODELS, DEFAULT_LINE as DEFAULT_FIREARM_LINE,
  modelsFor as firearmModelsFor, classOf as firearmClassOf, modelOf as firearmModelOf,
} from './firearms.js';
import {
  ARMOUR_CLASSES, ARMOUR_MODELS, DEFAULT_ARMOUR_LINE,
  armourModelsFor, armourClassOf, armourModelOf,
} from './armour.js';

/**
 * One entry per product that can be tooled.
 *
 * `noun` is what one finished thing is called, singular, for prose that has to
 * read naturally whether it is talking about a rifle or a vest.
 */
export const LINE_KINDS = {
  iron: {
    product: 'iron',
    noun: 'firearm',
    what: 'Tooled for',
    classes: FIREARM_CLASSES,
    models: FIREARM_MODELS,
    defaultLine: DEFAULT_FIREARM_LINE,
    modelsFor: firearmModelsFor,
    classOf: firearmClassOf,
    modelOf: firearmModelOf,
    // Firearms take bolt-on parts; nothing else does yet.
    takesAttachments: true,
  },
  plate: {
    product: 'plate',
    noun: 'vest',
    what: 'Making',
    classes: ARMOUR_CLASSES,
    models: ARMOUR_MODELS,
    defaultLine: DEFAULT_ARMOUR_LINE,
    modelsFor: armourModelsFor,
    classOf: armourClassOf,
    modelOf: armourModelOf,
    takesAttachments: false,
  },
};

export const TOOLED_PRODUCTS = Object.keys(LINE_KINDS);

/** The kind of line this building runs, or null if it isn't a tooled one. */
export function lineKindOf(building) {
  const def = building && BUILDINGS[building.type];
  return (def && LINE_KINDS[def.product]) || null;
}

export function lineKindFor(productId) {
  return LINE_KINDS[productId] || null;
}

/** Is this a line the player tools? */
export function isTooledLine(building) {
  return !!lineKindOf(building);
}

/** The category it is set up for, or null. */
export function lineClassOf(building) {
  const kind = lineKindOf(building);
  return kind ? kind.classOf(building) : null;
}

/** The specific pattern it builds, or null if none is picked. */
export function lineModelOf(building) {
  const kind = lineKindOf(building);
  return kind ? kind.modelOf(building) : null;
}

/** Every category this kind of line could be set to. */
export function lineClassesFor(building) {
  const kind = lineKindOf(building);
  return kind ? Object.values(kind.classes) : [];
}

/** Every pattern available within what it is currently tooled for. */
export function linePatternsFor(building) {
  const kind = lineKindOf(building);
  if (!kind) return [];
  const cls = kind.classOf(building);
  return cls ? kind.modelsFor(cls.id) : [];
}

/**
 * What the tooling does to a cycle, as one object the sim can just multiply by.
 *
 * A line that isn't tooled returns neutral values rather than null, so callers
 * don't each have to remember to guard.
 */
export function lineEffects(building) {
  const kind = lineKindOf(building);
  if (!kind) {
    return { yieldMult: 1, valueMult: 1, heatMult: 1, qualityAdd: 0, tooled: false };
  }
  const cls = kind.classOf(building);
  const model = kind.modelOf(building);
  const valueMult = cls.valueMult * (model ? model.valueMult : 1);
  return {
    tooled: true,
    yieldMult: cls.yieldMult * (model ? model.yieldMult : 1),
    valueMult,
    heatMult: cls.heatMult,
    // A dearer line turns out fewer, better units; that shows up as quality,
    // which is what the market actually prices.
    qualityAdd: (cls.valueMult - 1) * 0.12 + (model ? (model.valueMult - 1) * 0.3 : 0),
  };
}

/** The licence or certification a category needs before it can be run legally. */
export function lineClassLicence(cls) {
  return (cls && cls.requiresLicence) || null;
}
