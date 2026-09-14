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

print(fail ? `bionics: ${fail} FAILED, ${pass} passed` : `bionics: all ${pass} checks passed`);
