// A thousand days of the medical and black-market systems.
//
// playthrough.js answers "can the game be finished". This answers a different
// question: put the new machinery under continuous load for a thousand game
// days and see whether the numbers stay sane — whether wounds resolve, whether
// infection reaches the stages it should at the rates the literature gives,
// whether people die of the right things, whether organs spoil on schedule and
// what the whole trade is actually worth over a long run.
//
// It plays a deliberately reckless operator: gets into fights, is inconsistent
// about getting seen to, holds people, and sells what comes out. That is the
// stress case, not the typical one.

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { createState } from '../src/game/state.js';
import { stepSim } from '../src/game/sim.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { BUILDINGS } from '../src/game/constants.js';
import * as A from '../src/game/actions.js';
import {
  newBody, takeHit, stepBody, treat, openWounds, infectionStage, isAlive,
  causeOfDeath, capacities, BODY_PART_IDS, BODY_PARTS, missingParts,
} from '../src/game/health.js';
import { characterOf, protectionOf, equip } from '../src/game/character.js';
import { stockOf, pieceWorth, ORGAN_TRADE } from '../src/game/organs.js';
import { PARTS } from '../src/game/anatomy.js';
import { captivesOf } from '../src/game/captives.js';

const DAYS = Number(globalThis.SOAK_DAYS || 1000);
let seed = Number(globalThis.SOAK_SEED || 20260914);
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const origin = { lat: 42.3314, lng: -83.0458 };
const districts = generateDistricts(origin, []);
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const lots = syntheticLots(districts);
const st = createState({ origin, cityName: 'Detroit', districts, crews, lots });
st.cash.clean = 500000000;
st.adminUnlockAll = true;
st.discovered = ['back_clinic', 'morgue'];
st.licences = { mortuary: { status: 'active', renewsInDays: 365 } };

function open(type) {
  const lot = cheapestLotFor(st, BUILDINGS[type]);
  if (!lot) return null;
  A.buyLot(st, lot.id);
  return (A.developLot(st, lot.id, type) || {}).building || null;
}
open('hq');
open('morgue');
const vestShop = open('vest_shop');
if (vestShop) {
  A.setProductionLine(st, vestShop.id, 'ceramic');
  A.setModel(st, vestShop.id, 'carbide');
}

const tally = {
  wounds: 0, byType: {}, struck: 0,
  treated: 0, ignored: 0,
  stages: {}, limbsLost: 0, scarred: 0,
  deaths: 0, causes: {},
  snatchTried: 0, snatchGot: 0,
  partsTaken: 0, captivesDied: 0,
  organsHarvested: 0, organsSpoiled: 0, organsSold: 0,
  organRevenue: 0,
  docHired: 0, fitted: 0, fitFailed: 0, fitSpend: 0,
  peakHeat: 0, revivals: 0,
};

/** The player is mortal; when they die, they are replaced and the run goes on. */
function freshBody() {
  const ch = characterOf(st);
  ch.body = newBody();
  tally.revivals++;
}

let vestOn = false;

for (let day = 1; day <= DAYS; day++) {
  for (let h = 0; h < 24; h += 1) stepSim(st, 1, {});
  const atHour = Math.floor((st.minutes || 0) / 60);
  const ch = characterOf(st);

  // Put a plate on once there is one, so the armour path gets exercised too.
  if (!vestOn && vestShop) {
    vestShop.packs.plate = 4;
    const kept = A.keepFirearm(st, vestShop.id);
    if (kept.ok) {
      const piece = (st.armoury || []).find((p) => p.classId === 'ceramic');
      if (piece && equip(st, 'torso', piece.id).ok) vestOn = true;
    }
  }

  // Get shot at, often. Roughly every fifth day.
  if (rand() < 0.2 && ch.body.deadAt == null) {
    const rounds = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < rounds; i++) {
      let r = rand();
      let part = 'thorax';
      for (const id of BODY_PART_IDS) {
        r -= BODY_PARTS[id].hitShare;
        if (r <= 0) { part = id; break; }
      }
      const w = takeHit(ch.body, {
        part,
        threat: 0.3 + rand() * 0.5,
        protection: protectionOf(st, part),
        atHour,
        rand,
      });
      if (!w) continue;
      tally.wounds++;
      tally.byType[w.type] = (tally.byType[w.type] || 0) + 1;
      tally.struck += (w.struck || []).length;
      if (w.tookTheLimb) tally.limbsLost++;
    }
  }

  // Inconsistent about getting seen to: about two thirds of the time, and not
  // always quickly. That is the whole point — a player who always treats
  // immediately never sees any of the rest of the system.
  const untreated = openWounds(ch.body).filter((w) => !w.treated);
  if (untreated.length && rand() < 0.22) {
    tally.treated += treat(ch.body, { atHour });
  } else {
    tally.ignored += untreated.length ? 1 : 0;
  }

  for (const w of openWounds(ch.body)) {
    const s = infectionStage(w).id;
    if (s !== 'clean') tally.stages[s] = (tally.stages[s] || 0) + 1;
  }

  if (ch.body.deadAt != null) {
    tally.deaths++;
    const how = causeOfDeath(ch.body);
    tally.causes[how] = (tally.causes[how] || 0) + 1;
    freshBody();
  }

  // Hold people, take things, sell them.
  const d = st.districts[Math.floor(rand() * st.districts.length)];
  if (rand() < 0.08 && captivesOf(st).length < 4) {
    tally.snatchTried++;
    const got = A.snatchSomebody(st, d.id);
    if (got.ok && got.got) tally.snatchGot++;
  }
  for (const c of captivesOf(st).slice()) {
    if (c.dead) {
      const before = stockOf(st).length;
      A.stripBody(st, c.id);
      tally.organsHarvested += stockOf(st).length - before;
      tally.captivesDied++;
      continue;
    }
    if (rand() < 0.3) {
      const options = A.takeableFrom(c).filter((o) => o.survives && o.part.transplant);
      if (options.length) {
        const pick = options[Math.floor(rand() * options.length)];
        const r = A.takePart(st, c.id, pick.part.id, true);
        if (r.ok) { tally.partsTaken++; tally.organsHarvested++; }
      }
    }
  }

  // Have work done. You cannot sell yourself — you can put something back, and
  // occasionally put something better in, and neither happens without the
  // person you are paying a retainer to.
  if (!A.hasDoc(st) && st.cash.clean > 2000000 && rand() < 0.02) {
    if (A.hireStreetDoc(st).ok) tally.docHired++;
  }
  if (A.hasDoc(st) && rand() < 0.04) {
    const jobs = A.fitmentsFor(st).filter((j) => j.gap && !j.installed);
    if (jobs.length) {
      const job = jobs[Math.floor(rand() * jobs.length)];
      const affordable = job.tiers.filter((o) => o.cost < st.cash.clean * 0.4
        && (!o.tier.needsStock || o.stocked));
      if (affordable.length) {
        const pick = affordable[Math.floor(rand() * affordable.length)];
        const r = A.fitPart(st, job.fitment.id, pick.tier.id);
        if (r.ok) {
          tally.fitted++;
          tally.fitSpend += r.cost || 0;
          if (r.failed) tally.fitFailed++;
        }
      }
    }
  }

  // Move what is on ice before it turns into tissue.
  if (stockOf(st).length >= 3) {
    const before = stockOf(st).length;
    const sale = A.sellOrgans(st);
    if (sale.ok) {
      tally.organsSold += sale.sold || 0;
      tally.organsSpoiled += sale.spoiled || 0;
      tally.organRevenue += sale.net || 0;
    } else {
      tally.organsSpoiled += before;
    }
  }

  tally.peakHeat = Math.max(tally.peakHeat, ...st.districts.map((x) => x.heat || 0));
}

const ch = characterOf(st);
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—');

print('');
print(`SOAK — ${DAYS} game days of the medical and black-market systems`);
print('');
print('WOUNDS');
print(`  taken            ${tally.wounds}`);
print(`  by type          ${Object.keys(tally.byType).sort((a, b) => tally.byType[b] - tally.byType[a])
  .map((k) => `${k} ${tally.byType[k]}`).join(', ')}`);
print(`  structures hit   ${(tally.struck / Math.max(1, tally.wounds)).toFixed(1)} per wound`);
print(`  seen to          ${tally.treated}`);
print(`  limbs taken off  ${tally.limbsLost}`);
print('');
print('INFECTION (wound-days spent at each stage)');
for (const k of Object.keys(tally.stages).sort((a, b) => tally.stages[b] - tally.stages[a])) {
  print(`  ${k.padEnd(16)} ${tally.stages[k]}`);
}
print('');
print('MORTALITY');
print(`  deaths           ${tally.deaths} in ${DAYS} days`);
for (const k of Object.keys(tally.causes)) print(`  ${k.padEnd(16)} ${tally.causes[k]}`);
print('');
print('THE OTHER THING');
print(`  snatches         ${tally.snatchGot}/${tally.snatchTried} (${pct(tally.snatchGot, tally.snatchTried)})`);
print(`  taken off people ${tally.partsTaken} while they were alive`);
print(`  died on the table${String(tally.captivesDied).padStart(4)}`);
print(`  harvested        ${tally.organsHarvested} pieces`);
print(`  sold             ${tally.organsSold}, spoiled ${tally.organsSpoiled} (${pct(tally.organsSpoiled, tally.organsSold + tally.organsSpoiled)} wasted)`);
print(`  organ revenue    $${Math.round(tally.organRevenue).toLocaleString()}`
  + ` ($${Math.round(tally.organRevenue / Math.max(1, tally.organsSold)).toLocaleString()} a piece)`);
print('');
print('WORK DONE ON YOU');
print(`  doctors hired    ${tally.docHired}`);
print(`  things fitted    ${tally.fitted - tally.fitFailed} of ${tally.fitted} attempts`);
print(`  spent on it      $${Math.round(tally.fitSpend).toLocaleString()}`);
print(`  peak block heat  ${Math.round(tally.peakHeat)}`);
print('');
print('AT THE END');
print(`  alive            ${isAlive(ch.body)}`);
print(`  wounds open      ${openWounds(ch.body).length}`);
const gone = BODY_PART_IDS.filter((id) => ch.body.parts[id].lost).map((id) => BODY_PARTS[id].name);
print(`  lost outright    ${gone.join(', ') || 'nothing'}`);
print(`  short of         ${missingParts(ch.body).map((m) => `${m.part.name}${m.n > 1 ? ` x${m.n}` : ''}`).join(', ') || 'nothing'}`);
print(`  capacities       ${Object.entries(capacities(ch.body)).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}`);
print(`  clean            $${Math.round(st.cash.clean).toLocaleString()}`);
print(`  street           $${Math.round(st.cash.dirty).toLocaleString()}`);
print('');
