// Body armour: the product, the chain, the lines and the paperwork.
//
// Armour is deliberately the quiet, early, legal-ish half of the trade, and
// every number below is there to hold that shape rather than to restate it.

import { PRODUCTS, BUILDINGS } from '../src/game/constants.js';
import {
  ARMOUR_CLASSES, ARMOUR_CLASS_IDS, ARMOUR_MODELS, ARMOUR_MODEL_IDS, armourModelsFor,
} from '../src/game/armour.js';
import { LICENCES, licencesFor } from '../src/game/firearms.js';
import { lineKindOf, lineEffects, lineClassesFor, linePatternsFor } from '../src/game/lines.js';
import { ARMOUR_DETAIL, ARMOUR_DETAIL_IDS } from '../src/ui/armourart.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; print('  FAIL ' + m); } };

// --- The product ------------------------------------------------------------
ok(!!PRODUCTS.plate, 'body armour is a product');
ok(PRODUCTS.plate.packsPerRaw > 1, 'a panel finishes into more than one set');

// The whole design claim: armour is the cool business. If this ever stops being
// true the two halves of the trade collapse into one.
ok(PRODUCTS.plate.heatPerPackSold < PRODUCTS.iron.heatPerPackSold * 0.3,
  'selling armour draws a fraction of the attention selling iron does');
ok(PRODUCTS.plate.regionPenalty > PRODUCTS.iron.regionPenalty,
  'and it still sells outside the countries iron needs');

// --- The chain --------------------------------------------------------------
const makes = Object.values(BUILDINGS).filter((d) => d.product === 'plate');
const finishes = Object.values(BUILDINGS).filter((d) => (d.handles || []).includes('plate'));
const sells = Object.values(BUILDINGS).filter((d) => d.sellsLegally === 'plate');
ok(makes.length >= 2, 'two ways to make it: ' + makes.map((d) => d.name).join(', '));
ok(finishes.length >= 1, 'somewhere to finish it: ' + finishes.map((d) => d.name).join(', '));
ok(sells.length >= 1, 'a legal counter: ' + sells.map((d) => d.name).join(', '));

// Reachable before iron is — that is the point of the whole line.
const firstArmour = Math.min(...makes.map((d) => d.unlock.properties));
const firstIron = Math.min(...Object.values(BUILDINGS)
  .filter((d) => d.product === 'iron').map((d) => d.unlock.properties));
ok(firstArmour < firstIron,
  `armour opens up before iron (${firstArmour} properties vs ${firstIron})`);

for (const d of makes.concat(finishes, sells)) {
  ok(d.heatPerDay <= 0.6, `${d.name} runs cool (${d.heatPerDay}/day)`);
}

// --- Classes and patterns ---------------------------------------------------
ok(ARMOUR_CLASS_IDS.length === 8, ARMOUR_CLASS_IDS.length + ' categories');
ok(ARMOUR_MODEL_IDS.length === 16, ARMOUR_MODEL_IDS.length + ' patterns');
for (const id of ARMOUR_CLASS_IDS) {
  ok(armourModelsFor(id).length >= 2, `${id} has at least two patterns to choose between`);
  ok(ARMOUR_CLASSES[id].heatMult < 1, `${id} is cooler than a plain line`);
}
for (const id of ARMOUR_MODEL_IDS) {
  ok(!!ARMOUR_CLASSES[ARMOUR_MODELS[id].category], `${id} belongs to a real category`);
}

// Dearer things take longer, across the board. Without this a category is just
// free money and the choice between them stops being a choice.
const byValue = ARMOUR_CLASS_IDS.slice().sort((a, b) => ARMOUR_CLASSES[a].valueMult - ARMOUR_CLASSES[b].valueMult);
let monotonic = true;
for (let i = 1; i < byValue.length; i++) {
  if (ARMOUR_CLASSES[byValue[i]].yieldMult > ARMOUR_CLASSES[byValue[i - 1]].yieldMult) monotonic = false;
}
ok(monotonic, 'output falls as value rises, with no free lunch anywhere');

// --- Artwork ----------------------------------------------------------------
ok(ARMOUR_DETAIL_IDS.length === ARMOUR_MODEL_IDS.length, 'every pattern is drawn');
for (const id of ARMOUR_MODEL_IDS) {
  ok(!!ARMOUR_DETAIL[id], `${id} has artwork`);
  const d = ARMOUR_DETAIL[id];
  if (d) {
    ok(Array.isArray(d.box) && d.box.length === 4, `${id} declares a box`);
    ok(!/undefined|NaN/.test(d.body), `${id} draws without a broken coordinate`);
  }
}

// --- The tooled-line indirection -------------------------------------------
const vestShop = { id: 'b1', type: 'vest_shop', line: 'ceramic', model: 'carbide' };
const shop = { id: 'b2', type: 'machine_shop', line: 'machinegun', model: 'hammerfall' };
const grow = { id: 'b3', type: 'stash' };
ok(lineKindOf(vestShop).product === 'plate', 'a vest shop is a plate line');
ok(lineKindOf(shop).product === 'iron', 'a machine shop is an iron line');
ok(lineKindOf(grow) === null, 'a stash is not a tooled line at all');
ok(lineEffects(grow).yieldMult === 1 && lineEffects(grow).tooled === false,
  'an untooled building gets neutral values rather than a crash');
ok(lineClassesFor(vestShop).length === 8, 'a vest shop can be tooled eight ways');
ok(linePatternsFor(vestShop).every((m) => m.category === 'ceramic'),
  'and only offers patterns from what it is tooled for');
ok(lineEffects(vestShop).heatMult < lineEffects(shop).heatMult,
  'a Level IV line is cooler than a belt-fed line');

// --- Paperwork --------------------------------------------------------------
ok(licencesFor('armour').length === 2, 'two pieces of armour paperwork');
ok(licencesFor('firearms').length === 3, 'and the three firearms ones are untouched');
const nij = LICENCES.nij07, ffl = LICENCES.ffl07;
ok(nij.cost < ffl.cost, 'certification is cheaper than a manufacturing licence');
ok(nij.processingDays < ffl.processingDays, 'and comes back quicker');
ok(nij.maxHeatToApply > ffl.maxHeatToApply, 'and a lab cares less about your record than the ATF does');
ok(ARMOUR_CLASSES.shield.requiresLicence === 'leSupply',
  'shields need the supply contract, because nobody else buys one');


// --- Both sides of every piece ----------------------------------------------
//
// The character screen turns round now. A pattern with no back drawing falls
// back to its front one, which is not broken but IS a lie — you would be
// looking at a plate's strike face from behind it. So every pattern gets a
// back, and this is what stops the next one added from quietly missing it.
{
  const missing = ARMOUR_DETAIL_IDS.filter((id) => !ARMOUR_DETAIL[id].back);
  ok(missing.length === 0, `every pattern is drawn from behind${
    missing.length ? ': missing ' + missing.join(', ') : ` (all ${ARMOUR_DETAIL_IDS.length})`}`);

  // And the back is its own drawing, not the front one under a new name.
  const same = ARMOUR_DETAIL_IDS.filter((id) => ARMOUR_DETAIL[id].back === ARMOUR_DETAIL[id].body);
  ok(same.length === 0, `and none of them just reuses the front${
    same.length ? ': ' + same.join(', ') : ''}`);
}

print(fail ? `armour: ${fail} FAILED, ${pass} passed` : `armour: all ${pass} checks passed`);
