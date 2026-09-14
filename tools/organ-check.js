// The black market in parts.
//
// The thing worth pinning is the cold clock. If the valuable organs did not
// spoil faster than the cheap ones, this would just be free money with a heat
// cost — and the whole decision the mechanic exists to pose would be gone.

import { PRODUCTS, BUILDINGS } from '../src/game/constants.js';
import {
  ORGAN_TRADE, viability, organValue, harvest, cullSpoiled, stockValue, pieceWorth,
} from '../src/game/organs.js';
import {
  PARTS, PART_IDS, partsIn, targetsIn, countOf, partValue, wholeBodyValue,
  isTransplantable,
} from '../src/game/anatomy.js';
import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { createState } from '../src/game/state.js';
import * as A from '../src/game/actions.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; print('  FAIL ' + m); } };
const seeded = (n) => () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;

// --- The anatomy ------------------------------------------------------------
ok(PART_IDS.length >= 40, PART_IDS.length + ' parts, which is a whole person');
for (const region of ['head', 'neck', 'thorax', 'abdomen', 'armL', 'armR', 'legL', 'legR']) {
  ok(partsIn(region).length >= 4, `${region} has an inside (${partsIn(region).length} parts)`);
}
for (const id of PART_IDS) {
  const p = PARTS[id];
  ok(!!p.region, `${id} belongs to a region`);
  ok(p.transplant || p.tissue, `${p.name} is worth something to somebody`);
  if (p.transplant) {
    ok(p.transplant.price[0] < p.transplant.price[1] && p.transplant.hours > 0,
      `${p.name} has a transplant price and a cold clock`);
  }
  if (p.tissue) ok(p.tissue[0] < p.tissue[1] && p.tissue[0] > 0, `${p.name} has a tissue price`);
}

// --- Two markets, about a hundred times apart -------------------------------
const whole = wholeBodyValue();
ok(whole.transplant > whole.tissue * 8,
  `intact is worth far more than parted: $${whole.transplant.toLocaleString()} against $${whole.tissue.toLocaleString()}`);

const heart = PARTS.heart;
ok(heart.transplant.price[1] >= 250000, 'a heart is the most valuable single thing here');
ok(heart.transplant.hours <= 6, 'and is good for hours');
ok(heart.tissue[1] < heart.transplant.price[0] / 30,
  'and past that it is worth a fraction of it, not nothing');

// Nothing is ever worthless — that is the whole point of the second market.
const stale = PART_IDS.filter((id) => partValue(PARTS[id], 100000, 1).value <= 0);
ok(stale.length === 0, 'nothing is ever worth nothing: ' + (stale.join(', ') || 'everything keeps a floor'));

// A heart past its window falls back to its valves, not to zero.
const oldHeart = { organ: 'heart', takenAt: 0, quality: 1 };
ok(pieceWorth(oldHeart, 0).market === 'transplant', 'a fresh heart is a transplant');
ok(pieceWorth(oldHeart, 20).market === 'tissue', 'and a day later it is tissue');
ok(pieceWorth(oldHeart, 20).value > 0 && pieceWorth(oldHeart, 20).value < pieceWorth(oldHeart, 0).value / 40,
  'worth a fraction of what it was, which is what makes moving fast matter');

// The curve itself: flat, then off a cliff.
ok(viability('heart', 1) === 1, 'a heart is untouched for the first hour');
ok(viability('heart', 4) > 0 && viability('heart', 4) < 1, 'degrading by the fourth');
ok(viability('heart', 6) === 0, 'and gone as a transplant past its cold time');
ok(viability('cornea', 200) > 0.35, 'corneas are still worth having after eight days');
ok(viability('skull', 5000) === 1, 'and a bone has no clock at all');

// A kidney IS both valuable and keeps a day and a half — which is exactly why
// it is the most trafficked organ there is. What must not exist is something
// at the very top of the range that also keeps.
const dearAndSlow = PART_IDS.filter((id) => {
  const p = PARTS[id];
  return p.transplant && p.transplant.price[1] >= 140000 && p.transplant.hours > 24;
});
ok(dearAndSlow.length === 0, 'nothing at the top of the range also keeps: ' + (dearAndSlow.join(', ') || 'none'));
ok(PARTS.kidney.transplant.hours >= 24 && PARTS.kidney.transplant.price[1] >= 100000,
  'a kidney is valuable AND movable, which is why it is the one that actually trades');

// Components are harvestable but are not things a bullet finds on its own.
ok(!!PARTS.heartValve.component, 'a valve is part of the heart');
ok(!targetsIn('thorax').some((p) => p.id === 'heartValve'),
  'so a wound track cannot strike one directly');
ok(partsIn('thorax').some((p) => p.id === 'heartValve'),
  'but it is still in there to be taken');

// --- Yield ------------------------------------------------------------------
let hearts = 0, skin = 0, total = 0;
for (let i = 0; i < 100; i++) {
  const got = harvest(null, { atHour: 0, skill: 0.6, rand: seeded(i + 1) });
  total += got.length;
  hearts += got.filter((p) => p.organ === 'heart').length;
  skin += got.filter((p) => p.organ === 'legSkin').length;
}
ok(hearts > 0 && hearts < 100, `a heart does not come out every time (${hearts}/100)`);
ok(skin > hearts, 'and the shallow, robust things come out more often');
ok(total / 100 > 15, `a body yields a lot of separate things (${Math.round(total / 100)} on average)`);

// --- Spoilage runs whether you are watching or not --------------------------
const st = { organs: [{ organ: 'heart', takenAt: 0, quality: 1 }, { organ: 'cornea', takenAt: 0, quality: 1 }] };
const gone = cullSpoiled(st, 24);
ok(gone.length === 0, 'nothing is thrown away at a day — the heart is tissue now, not refuse');
ok(pieceWorth(st.organs[0], 24).market === 'tissue', 'the heart has fallen to the second market');
ok(pieceWorth(st.organs[1], 24).market === 'transplant', 'and the cornea has not');

// --- The cost ---------------------------------------------------------------
const clinic = BUILDINGS.back_clinic;
ok(!!clinic, 'there is somewhere to do it');
ok(clinic.unlock.properties >= 12, 'and it is the last thing that opens up');
const hottest = Object.values(BUILDINGS).every((d) => (d.heatPerDay || 0) <= clinic.heatPerDay);
ok(hottest, 'nothing in the game runs hotter than it does');
ok(ORGAN_TRADE.repHit > 0.25, 'and standing on the block collapses rather than dips');

// --- It cannot happen without the clinic ------------------------------------
const origin = { lat: 42.3314, lng: -83.0458 };
const districts = generateDistricts(origin, []);
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const lots = syntheticLots(districts);
const state = createState({ origin, cityName: 'Detroit', districts, crews, lots });
state.cash.clean = 200000000;
state.adminUnlockAll = true;
ok(!A.hasClinic(state), 'no clinic to begin with');
state.casualties = [{ id: 'c1', districtId: districts[0].id, atHour: 0 }];
ok(!A.harvestCasualty(state, 'c1').ok, 'and nothing can be done with a body without one');

const lot = cheapestLotFor(state, BUILDINGS.back_clinic);
A.buyLot(state, lot.id);
A.developLot(state, lot.id, 'back_clinic');
ok(A.hasClinic(state), 'building one is the opting in');

// Give the block a reason to think well of you first — standing that is
// already nothing cannot fall any further, and that is the correct behaviour
// rather than the thing under test.
districts[0].rep = 0.7;
const repBefore = districts[0].rep, heatBefore = districts[0].heat;
const got = A.harvestCasualty(state, 'c1');
ok(got.ok && got.taken.length > 0, `and then it yields (${got.taken.length})`);
ok(districts[0].rep < repBefore - 0.2,
  `standing on that block collapses (${repBefore.toFixed(2)} -> ${districts[0].rep.toFixed(2)})`);
ok(districts[0].heat > heatBefore, 'and the heat climbs');
ok(state.casualties.length === 0, 'and the body is gone');

const dirtyBefore = state.cash.dirty;
const sale = A.sellOrgans(state);
ok(sale.ok, 'the lot can be moved');
ok(state.cash.dirty > dirtyBefore, 'for street money — there is no clean version of this');
ok(sale.net < sale.gross, `and a broker takes ${Math.round(ORGAN_TRADE.brokerCut * 100)}% off the top`);
ok(!A.sellOrgans(state).ok, 'and then there is nothing left to sell');

print(fail ? `organs: ${fail} FAILED, ${pass} passed` : `organs: all ${pass} checks passed`);

// --- People you are holding -------------------------------------------------
//
// The claim worth pinning: somebody can be sold an organ and live with it.
// There are two kidneys and one is enough; there is one heart and there is no
// version of taking it that anybody walks away from.

import {
  CAPTIVES, snatch, takeFrom, takeableFrom, symptomsOf, holdingCapacity,
  hasColdStorage, release, stepCaptives,
} from '../src/game/captives.js';
import {
  newBody, isAlive, capacities, removePart, missingCount, organFactor, takeHit,
} from '../src/game/health.js';
import { symptomOf, survivesWithout } from '../src/game/anatomy.js';

// Every part says what being short of it is actually like.
const noSymptom = PART_IDS.filter((id) => !symptomOf(id));
ok(noSymptom.length === 0, 'every part has a symptom: ' + (noSymptom.join(', ') || 'all of them'));

// Survivability is about spares, not about importance.
const b1 = newBody();
ok(removePart(b1, 'kidney').survives, 'one kidney is survivable — there were two');
ok(isAlive(b1), 'and they are still alive');
ok(!removePart(b1, 'kidney').survives, 'the second is not');
ok(!isAlive(b1), 'and they are not');

const b2 = newBody();
ok(!removePart(b2, 'heart').survives, 'there is no spare heart');
ok(!isAlive(b2), 'so taking it is killing them');

const b3 = newBody();
removePart(b3, 'lung');
ok(isAlive(b3), 'one lung is survivable');
ok(capacities(b3).breathing < 1, `and breathing is worse for it (${Math.round(capacities(b3).breathing * 100)}%)`);
removePart(b3, 'spleen'); removePart(b3, 'gallbladder'); removePart(b3, 'eye');
ok(isAlive(b3), 'as are a spleen, a gallbladder and an eye');
ok(capacities(b3).sight === 0.5, 'with half the sight gone');
ok(symptomsOf({ body: b3 }).length === 4, 'and four things now wrong with them');

// Capacities no region supplies start whole rather than at zero.
ok(capacities(newBody()).sight === 1, 'somebody with both eyes can see');

// Holding people needs somewhere to hold them.
const hold = {
  districts: [{ id: 'd1', name: 'A block', heat: 8, rep: 0.4 }],
  buildings: [], minutes: 0, captives: [],
};
ok(holdingCapacity(hold) === 0, 'nowhere to keep anybody to begin with');
ok(!snatch(hold, 'd1').ok, 'so nobody can be taken');
hold.buildings.push({ id: 'b', type: 'morgue', active: true });
ok(holdingCapacity(hold) > 0, 'a funeral home is somewhere to keep people');
ok(hasColdStorage(hold), 'and it has a cold room, which is the point of it');

const before = hold.districts[0].heat;
let snatchRand = seeded(2);
const tries = [];
for (let i = 0; i < 6; i++) tries.push(snatch(hold, 'd1', { rand: snatchRand }));
ok(hold.districts[0].heat > before, 'trying raises the temperature whether it works or not');
ok(tries.some((r) => r.got) && tries.some((r) => !r.got), 'and it does not always work');
ok(hold.captives.length <= holdingCapacity(hold), 'never more than there is room for');

// Taking from somebody alive gives a better piece than cutting up a corpse.
const c = hold.captives.find((x) => !x.dead);
if (c) {
  const got = takeFrom(hold, c.id, 'kidney', { atHour: 0 });
  ok(got.ok && got.survives && !got.died, 'a kidney comes out and they live');
  ok(got.piece.quality > 0.55, `and it is in good condition (${got.piece.quality.toFixed(2)})`);
  ok(takeableFrom(c).find((r) => r.part.id === 'kidney').left === 1, 'one kidney left');
  ok(takeableFrom(c).find((r) => r.part.id === 'heart').survives === false,
    'and the heart is offered with the truth attached');
  // Nothing that cannot be undone happens on one tap.
  const asked = takeFrom(hold, c.id, 'heart', { atHour: 1 });
  ok(!asked.ok && asked.needsConfirm, 'asking for the heart asks back rather than doing it');
  ok(/kill/i.test(asked.warning), 'and says what it will do: ' + JSON.stringify(asked.warning.slice(0, 48)));
  ok(!hold.captives.find((x) => x.id === c.id).dead, 'and they are still alive having been asked');
  const killed = takeFrom(hold, c.id, 'heart', { atHour: 1, confirmed: true });
  ok(killed.ok && killed.died, 'confirmed, it kills them');
  ok(!takeFrom(hold, c.id, 'kidney', { atHour: 2 }).ok, 'and you cannot operate on a corpse one piece at a time');
}

// Letting somebody go is worse for you than a body nobody finds.
const alive = hold.captives.find((x) => !x.dead);
if (alive) {
  // Six snatch attempts have already driven standing to nothing, and nothing
  // cannot fall further — which is correct behaviour, not the thing under test.
  hold.districts[0].rep = 0.6;
  const repBefore = hold.districts[0].rep, heatBefore2 = hold.districts[0].heat;
  release(hold, alive.id);
  ok(hold.districts[0].heat > heatBefore2, 'somebody who walks is somebody who talks');
  ok(hold.districts[0].rep < repBefore, 'and the block hears all of it');
}

// --- Losing limbs in combat -------------------------------------------------
let lost = 0, kept = 0;
for (let i = 0; i < 400; i++) {
  const body = newBody();
  const w = takeHit(body, { part: 'legL', threat: 0.92, protection: 0, rand: seeded(i + 40) });
  if (w.tookTheLimb) lost++; else kept++;
}
ok(lost > 0, `heavy rounds take limbs off outright (${lost} of 400)`);
ok(kept > lost, 'but not most of the time');

let lightLost = 0;
for (let i = 0; i < 400; i++) {
  const body = newBody();
  const w = takeHit(body, { part: 'legL', threat: 0.34, protection: 0, rand: seeded(i + 900) });
  if (w.tookTheLimb) lightLost++;
}
ok(lightLost < lost, `and a handgun does it far less often (${lightLost} against ${lost})`);


// --- Hidden, not advertised -------------------------------------------------
//
// None of this is a goal shown greyed out with a target attached. It is not in
// the build list, not in the guide, and not a tab that appears. Somebody has to
// put it to you, and until they do it does not exist as far as the game is
// concerned.
import { operationOptions, isDiscovered, offerTheOtherThing, hasClinic as clinicOf } from '../src/game/actions.js';

const virgin = {
  discovered: [], lots: [], stats: {}, log: [],
  cash: { clean: 1e9, dirty: 0 }, buildings: [], districts: [], organs: [], captives: [],
};
const plot = { id: 'L1', owned: true, kind: 'building', areaM2: 400, districtId: 'd1' };
virgin.lots.push(plot);

const menu = operationOptions(plot, virgin).map((o) => o.id);
ok(!menu.includes('back_clinic'), 'the clinic is not on the build menu');
ok(!menu.includes('morgue'), 'nor the funeral home');
ok(menu.length > 40, `while everything else is (${menu.length} options)`);
ok(!isDiscovered(virgin, 'back_clinic'), 'and nothing has been put to you');
ok(!clinicOf(virgin), 'so there is nowhere to do any of it');

// Not surfaced by the guide either — the whole point is stumbling on it.
import { TIPS } from '../src/game/guide.js';
// Word boundaries matter here: "nobody" and "somebody" contain "body", and
// without \b this flags four perfectly innocent tips.
const leaks = TIPS.filter((tip) =>
  /\b(organ|organs|harvest|harvesting|kidney|morgue|cadaver|corpse|corpses)\b/i
    .test(`${tip.says} ${tip.title}`));
ok(leaks.length === 0, 'and the guide never mentions it: ' + (leaks.map((t) => t.id).join(', ') || 'never'));

offerTheOtherThing(virgin);
const menu2 = operationOptions(plot, virgin).map((o) => o.id);
ok(menu2.includes('back_clinic') && menu2.includes('morgue'), 'once somebody asks, both exist');
ok(virgin.log.length === 1, 'announced by exactly one line in the log');
ok(!/organ|harvest|kidney/i.test(virgin.log[0].text),
  'which does not say what it is: ' + JSON.stringify(virgin.log[0].text.slice(0, 60)));
ok(offerTheOtherThing(virgin) === false, 'and it is only ever put to you once');

// Taking the lot works on somebody alive, and carries on through the moment
// they stop being somebody alive.
import { gutCompletely } from '../src/game/captives.js';
const gutState = {
  districts: [{ id: 'd1', name: 'A block', heat: 5, rep: 0.4 }],
  buildings: [{ id: 'b', type: 'morgue', active: true }],
  minutes: 0, captives: [], organs: [],
};
let gutRand = seeded(17);
let victim = null;
for (let i = 0; i < 12 && !victim; i++) victim = snatch(gutState, 'd1', { rand: gutRand }).got;
if (victim) {
  const gut = gutCompletely(gutState, victim.id, { atHour: 0 });
  ok(gut.startedAlive, 'the procedure starts on somebody alive');
  ok(gut.taken.length > 30, `and takes everything (${gut.taken.length} pieces)`);
  ok(gut.died, 'they do not survive it');
  const fresh = gut.taken.filter((p) => p.quality > 0.6).length;
  ok(fresh > 0 && fresh < gut.taken.length,
    `what came out before they died is in better condition (${fresh} of ${gut.taken.length})`);
}

print(fail ? `organs+captives+self: ${fail} FAILED in total` : `organs+captives+self: all ${pass} checks passed in total`);
