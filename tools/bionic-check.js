// Work done on you.
//
// The rule the whole thing hangs on: you cannot sell yourself. Operating on
// yourself is for putting something back or putting something better in, it
// costs money rather than making it, and none of it happens without somebody
// on a retainer.

import * as A from '../src/game/actions.js';
import {
  TIERS, TIER_IDS, FITMENTS, FITMENT_IDS, tiersFor, fitmentCost, installedEfficiency,
} from '../src/game/bionics.js';
import { STREET_DOC, hasDoc, riskOf } from '../src/game/streetdoc.js';
import {
  newBody, capacities, isAlive, removePart, missingCount,
} from '../src/game/health.js';
import { characterOf } from '../src/game/character.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; print('  FAIL ' + m); } };
const fresh = () => ({
  cash: { clean: 5e7, dirty: 0 }, log: [], minutes: 0,
  buildings: [], districts: [], organs: [], lots: [], stats: {}, streetDoc: null,
});

// --- You cannot sell yourself ----------------------------------------------
ok(typeof A.sellOwnPart === 'undefined', 'there is no way to sell a part off yourself');
ok(typeof A.sellableOffSelf === 'undefined', 'and nothing offers to price you up');

// --- Nothing happens without somebody ---------------------------------------
const s = fresh();
ok(!hasDoc(s), 'no doctor to begin with');
ok(!A.fitPart(s, 'armL', 'prosthetic').ok, 'and nothing can be fitted');
ok(/retainer/i.test(A.fitPart(s, 'armL', 'prosthetic').error), 'with a reason that says why');

ok(A.hireStreetDoc(s).ok, 'somebody can be taken on');
ok(hasDoc(s), 'and is then on a retainer');
ok(!A.hireStreetDoc(s).ok, 'only one of them');
ok(s.streetDoc.skill > 0 && s.streetDoc.skill <= 1, 'with a skill that was rolled once and kept');

// --- The tiers --------------------------------------------------------------
ok(TIER_IDS.length === 4, 'four tiers');
ok(TIERS.crude.efficiency < TIERS.prosthetic.efficiency, 'crude is worse than a prosthetic');
ok(TIERS.prosthetic.efficiency < TIERS.salvaged.efficiency, 'which is worse than somebody else’s own');
ok(TIERS.bionic.efficiency > 1, 'and a bionic is better than what you were born with');
ok(TIERS.bionic.costMult > TIERS.prosthetic.costMult * 3, 'and costs accordingly');

ok(!tiersFor('kidney').includes('crude'), 'you cannot carve a kidney out of wood');
ok(tiersFor('kidney').includes('salvaged'), 'but somebody else’s will do');
ok(tiersFor('armL').includes('crude'), 'a crude arm is a hook and that is fine');

// --- Fitting ----------------------------------------------------------------
const s2 = fresh();
A.hireStreetDoc(s2);
s2.streetDoc.skill = 1;                       // take the doctor out of the equation
const ch2 = characterOf(s2);
ch2.body.parts.armL.lost = true;
ok(capacities(ch2.body).manipulation < 0.6, 'a lost arm halves what you can do with your hands');
const cash0 = s2.cash.clean;
const fit = A.fitPart(s2, 'armL', 'bionic');
ok(fit.ok && !fit.failed, 'a bionic arm goes on');
ok(s2.cash.clean < cash0, 'and it is paid for');
ok(installedEfficiency(ch2.body, 'armL') > 1, 'it works better than the original');
ok(capacities(ch2.body).manipulation > 0.9, `and hands are back above where they were (${
  Math.round(capacities(ch2.body).manipulation * 100)}%)`);

// --- Salvaged comes out of your own stock -----------------------------------
const s3 = fresh();
A.hireStreetDoc(s3); s3.streetDoc.skill = 1;
const ch3 = characterOf(s3);
removePart(ch3.body, 'kidney');
ok(!A.fitPart(s3, 'kidney', 'salvaged').ok, 'nothing to put in with nothing on ice');
// A fit can fail, so this asks whether it EVER goes in rather than whether one
// particular roll did. Testing a probabilistic thing once is testing the seed.
let salvagedIn = false, usedUp = false;
for (let i = 0; i < 40 && !salvagedIn; i++) {
  s3.cash.clean = 5e7;
  s3.organs = [{ organ: 'kidney', takenAt: 0, quality: 0.9 }];
  characterOf(s3).body.installed = {};
  const sal = A.fitPart(s3, 'kidney', 'salvaged');
  if (sal.ok && !sal.failed) { salvagedIn = true; usedUp = (s3.organs || []).length === 0; }
}
ok(salvagedIn, 'with one on ice it goes in');
ok(usedUp, 'and it is used up rather than still being for sale');

// The loop closes: a vital organ replaced is a body that stays alive.
const s4 = fresh();
A.hireStreetDoc(s4); s4.streetDoc.skill = 1;
const ch4 = characterOf(s4);
removePart(ch4.body, 'kidney'); removePart(ch4.body, 'kidney');
ok(!isAlive(ch4.body), 'both kidneys gone is death');
ch4.body.deadAt = null;
for (let i = 0; i < 40 && !isAlive(ch4.body); i++) {
  s4.cash.clean = 5e7;
  s4.organs = [{ organ: 'kidney', takenAt: 0, quality: 0.9 }];
  A.fitPart(s4, 'kidney', 'salvaged');
}
ok(isAlive(ch4.body), 'and one put back is a body that lives');

// --- It can go wrong --------------------------------------------------------
const s5 = fresh();
A.hireStreetDoc(s5);
s5.streetDoc.skill = 0.45;
const hard = riskOf(s5, TIERS.bionic, FITMENTS.heart);
const easy = riskOf(s5, TIERS.crude, FITMENTS.armL);
ok(hard > easy, `a bionic heart is riskier than a wooden leg (${Math.round(hard * 100)}% vs ${Math.round(easy * 100)}%)`);
const good = fresh(); A.hireStreetDoc(good); good.streetDoc.skill = 0.95;
ok(riskOf(good, TIERS.bionic, FITMENTS.heart) < hard, 'and a better doctor is a better bet');

let failures = 0, spent = 0;
const s6 = fresh();
A.hireStreetDoc(s6); s6.streetDoc.skill = 0.5;
for (let i = 0; i < 60; i++) {
  s6.cash.clean = 5e7;
  characterOf(s6).body.installed = {};
  const r = A.fitPart(s6, 'legL', 'bionic');
  if (r.failed) { failures++; spent += r.cost; }
}
ok(failures > 0 && failures < 60, `a mediocre doctor loses some of them (${failures}/60)`);
ok(spent > 0, 'and a failed job still costs the money');

// --- The retainer -----------------------------------------------------------
ok(STREET_DOC.retainerPerDay > 0, 'the retainer is a daily bill');
ok(A.letDocGo(s6).ok, 'and can be stopped');
ok(!hasDoc(s6), 'after which there is nobody to call');
ok(!A.fitPart(s6, 'armL', 'crude').ok, 'and nothing can be fitted again');


// --- What being hurt costs you ----------------------------------------------
// Until now an injury was tracked, progressing, and invisible to every other
// system. These pin that it bites.
import { STATS, STAT_IDS, getStat, allStats, activePenalties } from '../src/game/stats.js';
import { IMPAIRMENTS, addImpairment } from '../src/game/impairments.js';
import { rollEfficiency, TIERS as BTIERS } from '../src/game/bionics.js';

const hurt = fresh();
const hb = characterOf(hurt).body;
ok(STAT_IDS.every((id) => getStat(hurt, id) === 1), 'an unhurt body is at full on every stat');

hb.parts.legL.lost = true;
ok(getStat(hurt, 'muscle') < 1, 'a lost leg makes taking a block harder');
ok(getStat(hurt, 'evade') < getStat(hurt, 'muscle'), 'and getting away harder still');
ok(getStat(hurt, 'deal') === 1, 'while it does not change what a handoff is worth');

const head = fresh();
const hd = characterOf(head).body;
hd.parts.head.scar = 0.5;
ok(getStat(head, 'deal') < 1, 'a head injury changes what you negotiate');
ok(getStat(head, 'wash') < 1, 'and how much money you can move');

// Floors, so the game never silently stops responding.
const wrecked = fresh();
const wb = characterOf(wrecked).body;
for (const id of ['legL', 'legR', 'armL', 'armR']) wb.parts[id].lost = true;
wb.parts.head.scar = 0.9;
ok(STAT_IDS.every((id) => getStat(wrecked, id) >= STATS[id].floor - 1e-9),
  'every stat has a floor, however bad it gets');
ok(activePenalties(wrecked).length > 0, 'and the player is told about all of it');

// --- Impairments ------------------------------------------------------------
const imp = fresh();
const ib = characterOf(imp).body;
const beforeImp = getStat(imp, 'manipulation') || 1;
addImpairment(ib, 'palsy');
ok(getStat(imp, 'muscle') < 1, 'a nerve palsy costs you, permanently');
addImpairment(ib, 'chronicPain');
ok(getStat(imp, 'deal') < 1, 'and chronic pain costs you everywhere');
ok(Object.keys(IMPAIRMENTS).every((id) => IMPAIRMENTS[id].symptom && IMPAIRMENTS[id].effect),
  'every impairment says what it is like and what it does');

// --- Bionics improve, by 15-25% ---------------------------------------------
const rolls = [];
for (let i = 0; i < 200; i++) rolls.push(rollEfficiency('bionic'));
ok(Math.min(...rolls) >= 1.15 && Math.max(...rolls) <= 1.25,
  `a bionic limb comes out between 115% and 125% (${Math.round(Math.min(...rolls) * 100)}-${Math.round(Math.max(...rolls) * 100)}%)`);
ok(new Set(rolls.map((r) => Math.round(r * 100))).size > 3, 'and not always the same number');

const up = fresh();
A.hireStreetDoc(up); up.streetDoc.skill = 1;
const ub = characterOf(up).body;
const base = getStat(up, 'muscle');
let n = 0;
while (!ub.installed.legL && n++ < 30) { up.cash.clean = 5e8; A.fitPart(up, 'legL', 'bionic'); }
ok(getStat(up, 'muscle') > base, 'fitting one to a leg you still have makes you better than you were');
n = 0;
while (!ub.installed.legR && n++ < 30) { up.cash.clean = 5e8; A.fitPart(up, 'legR', 'bionic'); }
ok(getStat(up, 'muscle') > 1.05, `and two of them is a real difference (${Math.round(getStat(up, 'muscle') * 100)}%)`);

// --- Lives ------------------------------------------------------------------
const mortal = fresh();
ok(A.livesLeft(mortal) === 1, 'one free life');
characterOf(mortal).body.blood = 0;
const first = A.resolveDeath(mortal);
ok(first.revived, 'the first death is survivable');
ok(A.livesLeft(mortal) === 0, 'and spends the free one');
ok(!!first.impairment, 'you do not come back the way you went in');
ok(characterOf(mortal).body.blood < 1, 'and you come back short of blood');

characterOf(mortal).body.blood = 0;
const second = A.resolveDeath(mortal);
ok(!second.revived, 'the second is not');
ok(!!mortal.gameOver, 'and the run is over');

const rich = fresh();
const cost1 = A.nextLifeCost(rich);
ok(A.buyLife(rich).ok, 'another can be bought');
ok(A.nextLifeCost(rich) > cost1 * 2 - 1, `and the next one costs more ($${cost1.toLocaleString()} then $${A.nextLifeCost(rich).toLocaleString()})`);

// --- Treatment --------------------------------------------------------------
import { takeHit as hit } from '../src/game/health.js';

/** Put a wound of the kind a hospital has to report into a body. */
function reportableHit(body, part = 'thorax') {
  for (let i = 0; i < 60; i++) {
    const w = hit(body, { part, threat: 0.7, protection: 0, atHour: 0, rand: Math.random });
    if (w && ['penetrating', 'perforating', 'avulsive', 'fracture'].includes(w.type)) return w;
  }
  return null;
}
const pat = fresh();
const pb = characterOf(pat).body;
reportableHit(pb, 'legL');

ok(A.TREATMENT_IDS.length === 3, 'three ways to be seen to');
ok(A.treatmentRisk(pat, 'self') > A.treatmentRisk(pat, 'hospital'),
  'doing it yourself goes wrong more often than a hospital does');
ok(A.treatmentPrice(pat, 'hospital') > A.treatmentPrice(pat, 'self') * 5,
  'and costs a great deal more');
ok(!A.getTreated(pat, 'street').ok, 'a street doctor you have not hired cannot see you');
A.hireStreetDoc(pat);
ok(A.treatmentRisk(pat, 'street') < A.treatmentRisk(pat, 'self'),
  'and one you have is better than doing it yourself');

ok(A.reportableWounds(pb).length > 0, 'a hole is the kind of thing a hospital reports');
ok(A.hushCost(pat) > 0, 'and there is a price for it not to');

const loud = fresh();
loud.districts = [{ id: 'd1', name: 'A block', heat: 5, rep: 0.3 }];
const lb = characterOf(loud).body;
reportableHit(lb);
loud.buildings = [{ id: 'b1', type: 'hq', active: true, districtId: 'd1' }];
const heatBefore = loud.districts[0].heat;
A.getTreated(loud, 'hospital');
ok(loud.districts[0].heat > heatBefore, 'a hospital rings it in and the block gets hot');

const quiet = fresh();
quiet.districts = [{ id: 'd1', name: 'A block', heat: 5, rep: 0.3 }];
quiet.buildings = [{ id: 'b1', type: 'hq', active: true, districtId: 'd1' }];
const qb = characterOf(quiet).body;
reportableHit(qb);
const qHeat = quiet.districts[0].heat;
const hushed = A.getTreated(quiet, 'hospital', { hush: true });
ok(hushed.ok && !hushed.reported, 'paying the quiet money stops the call');
ok(quiet.districts[0].heat === qHeat, 'and the block never hears about it');
ok(hushed.hush > 0, 'and it is not cheap');

// Failure can leave something permanent.
let leftMark = 0;
for (let i = 0; i < 80; i++) {
  const bad = fresh();
  const bb = characterOf(bad).body;
  reportableHit(bb, 'legL');
  const r = A.getTreated(bad, 'self');
  if (r.ok && r.impairment) leftMark++;
}
ok(leftMark > 0, `patching yourself up can leave something permanent (${leftMark}/80)`);

print(fail ? `bionics+stats+lives: ${fail} FAILED in total` : `bionics+stats+lives: all ${pass} checks passed in total`);
