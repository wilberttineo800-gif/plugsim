// Bodies: the anatomy, the armour substitution, and the clock.
//
// The clock is the part worth pinning hardest. The whole model rests on the
// claim that treating a wound is a decision with a deadline — if leaving one
// alone were survivable, none of the rest of it would matter.

import {
  BODY_PARTS, BODY_PART_IDS, CAPACITIES, WOUND_TYPES, HEALTH, INFECTION_STAGES,
  newBody, takeHit, stepBody, treat, treatmentCost, capacities, isAlive,
  causeOfDeath, partDamage, openWounds, infectionStage, condition, resolveWoundType,
} from '../src/game/health.js';
import { protectionAt } from '../src/game/armour.js';
import { threatOf, FIREARM_CLASS_IDS } from '../src/game/firearms.js';
import { SLOTS, SLOT_IDS, newCharacter, equip, fitsSlot, slotFor, protectionOf } from '../src/game/character.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; print('  FAIL ' + m); } };
const seeded = (n) => () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;

// --- Anatomy ----------------------------------------------------------------
const share = BODY_PART_IDS.reduce((n, id) => n + BODY_PARTS[id].hitShare, 0);
ok(Math.abs(share - 1) < 0.001, 'presented area sums to one whole person');
ok(BODY_PARTS.thorax.hitShare > BODY_PARTS.neck.hitShare * 5,
  'the chest is a far bigger target than the neck');
ok(BODY_PARTS.armL.hitShare + BODY_PARTS.armR.hitShare
   + BODY_PARTS.legL.hitShare + BODY_PARTS.legR.hitShare > 0.35,
  'limbs are a large share of you, which is why most survivors are hit in one');
ok(BODY_PARTS.neck.bleed > BODY_PARTS.armL.bleed * 2,
  'the neck bleeds far harder than a forearm');

const fresh = newBody();
ok(isAlive(fresh), 'a new body is alive');
ok(Object.values(capacities(fresh)).every((v) => v === 1), 'and everything works');

// --- Armour changes the KIND of wound ---------------------------------------
// This is the single most important claim in the model, so it is checked
// against every firearm category rather than one example.
let substituted = 0, throughAnyway = 0;
for (const cid of FIREARM_CLASS_IDS) {
  const threat = threatOf(cid);
  const iv = protectionAt('ceramic', 'thorax');
  const type = resolveWoundType(threat, iv, seeded(5));
  if (iv >= threat) { ok(type === 'babt', `Level IV turns ${cid} into blunt trauma`); substituted++; }
  else { ok(type !== 'babt', `${cid} defeats even Level IV`); throughAnyway++; }
}
ok(substituted > 0 && throughAnyway > 0,
  `Level IV stops ${substituted} categories and not ${throughAnyway} — it is worth having and not a win button`);

ok(protectionAt('soft', 'thorax') >= threatOf('handgun'), 'a IIIA vest stops handgun rounds');
ok(protectionAt('soft', 'thorax') < threatOf('rifle'), 'and does nothing against a rifle');
ok(protectionAt('soft', 'armL') === 0, 'no vest covers your arms');
ok(protectionAt('ceramic', 'abdomen') === 0, 'and a plate does not cover your abdomen');

// Same round, same place, more armour: strictly less damage every time.
const sev = (prot) => {
  const b = newBody();
  const w = takeHit(b, { part: 'thorax', threat: 0.72, protection: prot, rand: seeded(99) });
  return w.severity;
};
ok(sev(0) > sev(0.5) && sev(0.5) > sev(0.92),
  `more armour is always less damage (${sev(0).toFixed(2)} / ${sev(0.5).toFixed(2)} / ${sev(0.92).toFixed(2)})`);

// --- The clock --------------------------------------------------------------
function run({ treatAt = null, part = 'legL', threat = 0.72, days = 30, seed = 11 } = {}) {
  const rand = seeded(seed);
  const b = newBody();
  takeHit(b, { part, threat, protection: 0, atHour: 0, rand });
  let h = 0, died = null, healedAt = null, lostAt = null;
  while (h < 24 * days && b.deadAt == null) {
    if (treatAt != null && h >= treatAt && openWounds(b).some((w) => !w.treated)) {
      treat(b, { atHour: h });
    }
    const r = stepBody(b, 3, { atHour: h });
    h += 3;
    for (const e of r.events) {
      if (e.kind === 'died') died = { day: h / 24, how: e.how };
      if (e.kind === 'healed' && healedAt == null) healedAt = h / 24;
      if (e.kind === 'lost') lostAt = h / 24;
    }
  }
  return { body: b, died, healedAt, lostAt, scar: b.parts[part].scar || 0 };
}

const alone = run({ treatAt: null });
ok(alone.died != null, 'a rifle wound left alone kills you');
ok(alone.died && alone.died.day <= 10, `and does it inside ten days (day ${alone.died && alone.died.day})`);

const early = run({ treatAt: 6 });
ok(early.died == null, 'the same wound seen to inside the contamination window does not');
ok(early.healedAt != null, `and closes (day ${early.healedAt})`);
ok(early.scar < 0.01, 'leaving nothing behind');

const late = run({ treatAt: 60 });
ok(late.scar > 0.01, `seen to two and a half days late leaves permanent damage (${Math.round(late.scar * 100)}%)`);
ok(late.healedAt > early.healedAt, 'and takes longer to close');

// Infection has to actually progress in order, not jump.
const order = INFECTION_STAGES.map((s) => s.at);
ok(order.every((v, i) => i === 0 || v >= order[i - 1]), 'infection stages are ordered');
ok(INFECTION_STAGES.find((s) => s.id === 'osteomyelitis').needsBone,
  'osteomyelitis needs a bone to be in');
ok(INFECTION_STAGES.find((s) => s.id === 'gangrene').needsDeadTissue,
  'gas gangrene needs dead tissue to live on');

// A graze should never reach sepsis before a through-and-through does.
const grazeInf = WOUND_TYPES.graze.infectMult;
ok(grazeInf < WOUND_TYPES.penetrating.infectMult,
  'a retained round is more likely to go bad than a graze');
ok(WOUND_TYPES.penetrating.infectMult > WOUND_TYPES.perforating.infectMult,
  'and more likely than a through-and-through, because the metal is still in there');
ok(WOUND_TYPES.perforating.bleedMult > WOUND_TYPES.penetrating.bleedMult,
  'though a through-and-through bleeds harder, having two holes');

// --- Limbs ------------------------------------------------------------------
const shot = newBody();
for (let i = 0; i < 6; i++) {
  takeHit(shot, { part: 'legL', threat: 0.8, protection: 0, atHour: 0, rand: seeded(20 + i) });
}
stepBody(shot, 1, { atHour: 1 });
ok(shot.parts.legL.lost, 'a leg that takes enough is lost');
ok(capacities(shot).moving < 0.6, 'and moving is halved, not ended — you still have the other one');
ok(capacities(shot).manipulation === 1, 'with the arms untouched');

// --- Death ------------------------------------------------------------------
const head = newBody();
takeHit(head, { part: 'head', threat: 0.9, protection: 0, atHour: 0, rand: seeded(4) });
head.parts.head.scar = 1;
ok(!isAlive(head), 'a destroyed head is fatal');
ok(causeOfDeath(head) === 'never came round', 'and is reported as such: ' + causeOfDeath(head));

// --- Treatment pricing ------------------------------------------------------
const priced = newBody();
takeHit(priced, { part: 'abdomen', threat: 0.7, protection: 0, atHour: 0, rand: seeded(8) });
ok(treatmentCost(priced) > 0, 'being seen to costs money');
treat(priced, { atHour: 1 });
ok(treatmentCost(priced) === 0, 'and nothing once it is done');

// --- Equipment --------------------------------------------------------------
// Armour and firearms BOTH have a category called `rifle`. If a slot matched on
// the category alone a carbine could be worn on the chest, which is exactly the
// bug this pins.
const carbine = { id: 'g', kind: 'iron', classId: 'rifle', modelId: 'kite', name: 'Kite' };
const plates = { id: 'p', kind: 'plate', classId: 'rifle', modelId: 'polyplate', name: 'Poly III+' };
ok(!fitsSlot(SLOTS.torso, carbine), 'a rifle does not go on your chest');
ok(fitsSlot(SLOTS.torso, plates), 'rifle plates do');
ok(fitsSlot(SLOTS.primary, carbine), 'and the rifle goes in the primary slot');
ok(slotFor(carbine) === 'primary' && slotFor(plates) === 'torso', 'each finds its own slot');

const st = { armoury: [plates, carbine, { id: 'h', kind: 'plate', classId: 'helmet', modelId: 'highcut', quality: 0.7 }] };
equip(st, 'torso', 'p'); equip(st, 'head', 'h');
ok(protectionOf(st, 'thorax') > 0.6, 'wearing plates protects the chest');
ok(protectionOf(st, 'armL') === 0, 'and still not the arms');
st.armoury.push({ id: 'v', kind: 'plate', classId: 'soft', modelId: 'patrol', quality: 0.7 });
equip(st, 'torso', 'v');
ok(st.character.equipped.torso === 'v', 'putting something else on replaces what was there');
ok(SLOT_IDS.filter((id) => st.character.equipped[id] === 'p').length === 0,
  'and the piece it replaced is off');
ok(equip(st, 'primary', 'p').ok === false, 'plates cannot be carried as a primary');

print(fail ? `health: ${fail} FAILED, ${pass} passed` : `health: all ${pass} checks passed`);

// --- Appearance -------------------------------------------------------------
// Twenty presets over seven independent traits. The point of doing it that way
// rather than twenty sprites is that nobody the game generates is a duplicate,
// and that everything about yours can be changed afterwards.
import {
  MODELS as LOOK_MODELS, MODEL_IDS, TRAITS, randomAppearance, normaliseAppearance,
  appearanceFrom, BUILDS, SKINS, HAIR, CLOTHING,
} from '../src/game/appearance.js';
import { appearanceOf, setTrait, setModel as setLookPreset } from '../src/game/character.js';

ok(LOOK_MODELS.length === 20, 'twenty character models');
ok(new Set(MODEL_IDS).size === 20, 'all distinct');
ok(TRAITS.length === 7, 'seven traits to change');
for (const m of LOOK_MODELS) {
  const a = appearanceFrom(m.id);
  ok(BUILDS[a.build] && SKINS[a.skin] && HAIR[a.hair] && CLOTHING[a.clothing],
    `${m.name} is built out of traits that exist`);
}

const people = new Set();
for (let i = 0; i < 200; i++) people.add(JSON.stringify(randomAppearance(i)));
ok(people.size > 190, `200 generated people give ${people.size} distinct looks`);
ok(JSON.stringify(randomAppearance(42)) === JSON.stringify(randomAppearance(42)),
  'and the same seed is always the same person, so nobody changes face on reload');

// Somebody the game made has a face without any of it being saved.
const driver = { id: 'c7', name: 'A driver' };
ok(!!appearanceOf(driver).skin, 'a generated person has an appearance');
ok(JSON.stringify(appearanceOf(driver)) === JSON.stringify(appearanceOf({ id: 'c7' })),
  'derived from their id, so it survives a reload without being stored');
ok(JSON.stringify(appearanceOf({ id: 'c7' })) !== JSON.stringify(appearanceOf({ id: 'c8' })),
  'and two people are not the same person');

// Nonsense in a hand-edited or ancient save does not crash the drawing.
const junk = normaliseAppearance({ build: 'nope', skin: null, hair: 42, clothing: 'x' });
ok(BUILDS[junk.build] && SKINS[junk.skin] && HAIR[junk.hair] && CLOTHING[junk.clothing],
  'a broken appearance is repaired rather than rendered');

const me = { seed: 3 };
setLookPreset(me, 'm11');
ok(me.character.appearance.model === 'm11', 'you can start again from a preset');
setTrait(me, 'hair', 'afro');
ok(me.character.appearance.hair === 'afro', 'and change one thing about it');
setTrait(me, 'hair', 'not-a-hairstyle');
ok(me.character.appearance.hair === 'afro', 'and a bad value is refused rather than kept');

print(fail ? `appearance: ${fail} FAILED in total` : `appearance: all ${pass} checks passed in total`);
