// Who people look like.
//
// A model here is not a fixed sprite — it is a PRESET over a handful of
// independent traits: build, skin, hair, facial hair and what they have on.
// That matters for two reasons. Twenty fixed sprites would be twenty drawings
// to maintain and would still all be somebody else's idea of you; twenty
// presets over five traits is twenty starting points and then whatever you
// want. And every person the game generates — drivers, other operations — can
// be given one at random without any of them being a duplicate.

import { makeRng } from './rng.js';

/** Frame. Changes the silhouette, not the anatomy underneath it. */
export const BUILDS = {
  slim:    { id: 'slim', name: 'Slim', shoulder: 0.9, waist: 0.88, height: 1.02, limb: 0.92 },
  regular: { id: 'regular', name: 'Regular', shoulder: 1, waist: 1, height: 1, limb: 1 },
  broad:   { id: 'broad', name: 'Broad', shoulder: 1.12, waist: 1.06, height: 1, limb: 1.1 },
  heavy:   { id: 'heavy', name: 'Heavy', shoulder: 1.08, waist: 1.24, height: 0.98, limb: 1.12 },
  tall:    { id: 'tall', name: 'Tall', shoulder: 1.02, waist: 0.94, height: 1.07, limb: 1.04 },
};
export const BUILD_IDS = Object.keys(BUILDS);

export const SKINS = {
  s1: { id: 's1', name: 'Deep',    base: '#5a4133', lit: '#6d4f3e', dark: '#3e2c23' },
  s2: { id: 's2', name: 'Dark',    base: '#6d5040', lit: '#84624e', dark: '#4b372c' },
  s3: { id: 's3', name: 'Brown',   base: '#8a6247', lit: '#a17656', dark: '#5f4331' },
  s4: { id: 's4', name: 'Tan',     base: '#a97c58', lit: '#c1926a', dark: '#7a583e' },
  s5: { id: 's5', name: 'Olive',   base: '#c09272', lit: '#d6a887', dark: '#8f6a51' },
  s6: { id: 's6', name: 'Fair',    base: '#d6a888', lit: '#e8bd9d', dark: '#a87c62' },
  s7: { id: 's7', name: 'Pale',    base: '#e3bda3', lit: '#f0d0b9', dark: '#b4907a' },
};
export const SKIN_IDS = Object.keys(SKINS);

/**
 * Hair, as a shape and a colour kept separate — otherwise "locs" and "locs but
 * grey" are two entries and the table doubles for no reason.
 */
export const HAIR = {
  bald:     { id: 'bald', name: 'Bald' },
  buzz:     { id: 'buzz', name: 'Buzz cut' },
  short:    { id: 'short', name: 'Short' },
  fade:     { id: 'fade', name: 'Fade' },
  afro:     { id: 'afro', name: 'Afro' },
  locs:     { id: 'locs', name: 'Locs' },
  braids:   { id: 'braids', name: 'Braids' },
  long:     { id: 'long', name: 'Long' },
  bun:      { id: 'bun', name: 'Bun' },
  cap:      { id: 'cap', name: 'Cap' },
  durag:    { id: 'durag', name: 'Durag' },
  beanie:   { id: 'beanie', name: 'Beanie' },
};
export const HAIR_IDS = Object.keys(HAIR);

export const HAIR_COLOURS = {
  black: { id: 'black', name: 'Black', hex: '#1c1a19' },
  dark:  { id: 'dark', name: 'Dark brown', hex: '#33241b' },
  brown: { id: 'brown', name: 'Brown', hex: '#5a3d28' },
  sandy: { id: 'sandy', name: 'Sandy', hex: '#8a6a3f' },
  red:   { id: 'red', name: 'Auburn', hex: '#7b3b22' },
  grey:  { id: 'grey', name: 'Grey', hex: '#7d7b78' },
  bleach:{ id: 'bleach', name: 'Bleached', hex: '#c9bb96' },
};
export const HAIR_COLOUR_IDS = Object.keys(HAIR_COLOURS);

export const FACIAL = {
  none:    { id: 'none', name: 'Clean' },
  stubble: { id: 'stubble', name: 'Stubble' },
  moustache:{ id: 'moustache', name: 'Moustache' },
  goatee:  { id: 'goatee', name: 'Goatee' },
  beard:   { id: 'beard', name: 'Beard' },
  full:    { id: 'full', name: 'Full beard' },
};
export const FACIAL_IDS = Object.keys(FACIAL);

/**
 * What somebody has on underneath. Armour goes over the top of this, so it is
 * what you see when the cabinet is empty — which, early on, it is.
 */
export const CLOTHING = {
  tee:       { id: 'tee', name: 'T-shirt', sleeve: 'short', legs: 'jeans' },
  hoodie:    { id: 'hoodie', name: 'Hoodie', sleeve: 'long', legs: 'jeans', hood: true },
  jacket:    { id: 'jacket', name: 'Jacket', sleeve: 'long', legs: 'jeans', collar: true },
  tracksuit: { id: 'tracksuit', name: 'Tracksuit', sleeve: 'long', legs: 'track', stripe: true },
  shirt:     { id: 'shirt', name: 'Button-up', sleeve: 'long', legs: 'trousers', collar: true },
  vest:      { id: 'vest', name: 'Vest', sleeve: 'none', legs: 'shorts' },
  coveralls: { id: 'coveralls', name: 'Coveralls', sleeve: 'long', legs: 'coverall' },
  puffer:    { id: 'puffer', name: 'Puffer', sleeve: 'long', legs: 'jeans', quilted: true },
};
export const CLOTHING_IDS = Object.keys(CLOTHING);

export const CLOTH_COLOURS = {
  black:   { id: 'black', name: 'Black', hex: '#22262b' },
  charcoal:{ id: 'charcoal', name: 'Charcoal', hex: '#343a42' },
  navy:    { id: 'navy', name: 'Navy', hex: '#25334a' },
  olive:   { id: 'olive', name: 'Olive', hex: '#434a33' },
  grey:    { id: 'grey', name: 'Grey', hex: '#565e68' },
  rust:    { id: 'rust', name: 'Rust', hex: '#6d3b28' },
  cream:   { id: 'cream', name: 'Cream', hex: '#9e9581' },
  burgundy:{ id: 'burgundy', name: 'Burgundy', hex: '#4a2230' },
  white:   { id: 'white', name: 'White', hex: '#aab2ba' },
  forest:  { id: 'forest', name: 'Forest', hex: '#2c4034' },
};
export const CLOTH_COLOUR_IDS = Object.keys(CLOTH_COLOURS);

/**
 * Twenty starting points.
 *
 * Deliberately a spread rather than twenty variations on one person: different
 * frames, different ages, different ideas about what to wear to work. Each is
 * only a default — every trait on it can be changed afterwards.
 */
export const MODELS = [
  { id: 'm01', name: 'Ash',    build: 'regular', skin: 's3', hair: 'fade',   hairColour: 'black',  facial: 'stubble',   clothing: 'hoodie',    cloth: 'black' },
  { id: 'm02', name: 'Bex',    build: 'slim',    skin: 's6', hair: 'bun',    hairColour: 'dark',   facial: 'none',      clothing: 'jacket',    cloth: 'charcoal' },
  { id: 'm03', name: 'Cass',   build: 'broad',   skin: 's1', hair: 'locs',   hairColour: 'black',  facial: 'beard',     clothing: 'puffer',    cloth: 'olive' },
  { id: 'm04', name: 'Dov',    build: 'heavy',   skin: 's4', hair: 'buzz',   hairColour: 'grey',   facial: 'full',      clothing: 'coveralls', cloth: 'navy' },
  { id: 'm05', name: 'Esi',    build: 'regular', skin: 's2', hair: 'braids', hairColour: 'black',  facial: 'none',      clothing: 'tracksuit', cloth: 'burgundy' },
  { id: 'm06', name: 'Finn',   build: 'tall',    skin: 's7', hair: 'short',  hairColour: 'sandy',  facial: 'stubble',   clothing: 'shirt',     cloth: 'white' },
  { id: 'm07', name: 'Gita',   build: 'slim',    skin: 's4', hair: 'long',   hairColour: 'black',  facial: 'none',      clothing: 'tee',       cloth: 'rust' },
  { id: 'm08', name: 'Hal',    build: 'heavy',   skin: 's5', hair: 'bald',   hairColour: 'black',  facial: 'goatee',    clothing: 'jacket',    cloth: 'black' },
  { id: 'm09', name: 'Isa',    build: 'regular', skin: 's3', hair: 'afro',   hairColour: 'black',  facial: 'none',      clothing: 'hoodie',    cloth: 'forest' },
  { id: 'm10', name: 'Jody',   build: 'broad',   skin: 's6', hair: 'cap',    hairColour: 'brown',  facial: 'beard',     clothing: 'coveralls', cloth: 'grey' },
  { id: 'm11', name: 'Kemi',   build: 'regular', skin: 's1', hair: 'braids', hairColour: 'bleach', facial: 'none',      clothing: 'puffer',    cloth: 'cream' },
  { id: 'm12', name: 'Lev',    build: 'tall',    skin: 's7', hair: 'long',   hairColour: 'red',    facial: 'moustache', clothing: 'shirt',     cloth: 'olive' },
  { id: 'm13', name: 'Mara',   build: 'slim',    skin: 's5', hair: 'short',  hairColour: 'dark',   facial: 'none',      clothing: 'tracksuit', cloth: 'navy' },
  { id: 'm14', name: 'Nico',   build: 'regular', skin: 's4', hair: 'durag',  hairColour: 'black',  facial: 'stubble',   clothing: 'tee',       cloth: 'white' },
  { id: 'm15', name: 'Omar',   build: 'broad',   skin: 's2', hair: 'buzz',   hairColour: 'black',  facial: 'full',      clothing: 'jacket',    cloth: 'rust' },
  { id: 'm16', name: 'Pia',    build: 'slim',    skin: 's6', hair: 'bun',    hairColour: 'grey',   facial: 'none',      clothing: 'shirt',     cloth: 'burgundy' },
  { id: 'm17', name: 'Quen',   build: 'heavy',   skin: 's3', hair: 'beanie', hairColour: 'black',  facial: 'beard',     clothing: 'puffer',    cloth: 'charcoal' },
  { id: 'm18', name: 'Rue',    build: 'regular', skin: 's7', hair: 'fade',   hairColour: 'bleach', facial: 'none',      clothing: 'hoodie',    cloth: 'grey' },
  { id: 'm19', name: 'Sena',   build: 'tall',    skin: 's1', hair: 'locs',   hairColour: 'dark',   facial: 'goatee',    clothing: 'tracksuit', cloth: 'black' },
  { id: 'm20', name: 'Tobi',   build: 'regular', skin: 's5', hair: 'cap',    hairColour: 'brown',  facial: 'stubble',   clothing: 'vest',      cloth: 'olive' },
];

export const MODEL_IDS = MODELS.map((m) => m.id);

/** A full appearance from a preset, with every trait spelled out. */
export function appearanceFrom(modelId) {
  const m = MODELS.find((x) => x.id === modelId) || MODELS[0];
  return {
    model: m.id,
    build: m.build,
    skin: m.skin,
    hair: m.hair,
    hairColour: m.hairColour,
    facial: m.facial,
    clothing: m.clothing,
    cloth: m.cloth,
  };
}

/**
 * One at random, seeded.
 *
 * Seeded rather than Math.random so that everybody the game generates for a
 * given run looks the same every time it is loaded — an operation you have
 * been trading with for two hundred days should not change face on reload.
 */
export function randomAppearance(seed) {
  const rand = makeRng(seed >>> 0);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const base = appearanceFrom(pick(MODEL_IDS));
  // Then shuffle a couple of traits off the preset, so two people who rolled
  // the same model are still not the same person.
  base.skin = pick(SKIN_IDS);
  base.hairColour = pick(HAIR_COLOUR_IDS);
  base.cloth = pick(CLOTH_COLOUR_IDS);
  if (rand() < 0.5) base.hair = pick(HAIR_IDS);
  if (rand() < 0.4) base.facial = pick(FACIAL_IDS);
  if (rand() < 0.4) base.clothing = pick(CLOTHING_IDS);
  return base;
}

/** Make sure every field is something that exists, for an old or hand-edited save. */
export function normaliseAppearance(a) {
  const base = appearanceFrom((a && a.model) || 'm01');
  if (!a) return base;
  const keep = (val, table, fallback) => (table[val] ? val : fallback);
  return {
    model: base.model,
    build: keep(a.build, BUILDS, base.build),
    skin: keep(a.skin, SKINS, base.skin),
    hair: keep(a.hair, HAIR, base.hair),
    hairColour: keep(a.hairColour, HAIR_COLOURS, base.hairColour),
    facial: keep(a.facial, FACIAL, base.facial),
    clothing: keep(a.clothing, CLOTHING, base.clothing),
    cloth: keep(a.cloth, CLOTH_COLOURS, base.cloth),
  };
}

/** The trait tables, for a UI that wants to offer every one of them. */
export const TRAITS = [
  { key: 'build', name: 'Build', table: BUILDS, ids: BUILD_IDS },
  { key: 'skin', name: 'Skin', table: SKINS, ids: SKIN_IDS, swatch: (v) => v.base },
  { key: 'hair', name: 'Hair', table: HAIR, ids: HAIR_IDS },
  { key: 'hairColour', name: 'Hair colour', table: HAIR_COLOURS, ids: HAIR_COLOUR_IDS, swatch: (v) => v.hex },
  { key: 'facial', name: 'Facial hair', table: FACIAL, ids: FACIAL_IDS },
  { key: 'clothing', name: 'Clothing', table: CLOTHING, ids: CLOTHING_IDS },
  { key: 'cloth', name: 'Colour', table: CLOTH_COLOURS, ids: CLOTH_COLOUR_IDS, swatch: (v) => v.hex },
];
