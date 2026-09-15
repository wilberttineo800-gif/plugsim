// Renders every UI panel against a real game state. The panels are pure string
// builders, so they can be exercised without a DOM — this catches undefined
// references inside template literals, which nothing else would surface until
// a player happened to click that panel.

import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { BUILDINGS } from '../src/game/constants.js';
import { createState, createRoute } from '../src/game/state.js';
import { stepSim } from '../src/game/sim.js';
import * as A from '../src/game/actions.js';
import { haversineKm } from '../src/game/geo.js';
import { GameUI } from '../src/ui/ui.js';

const log = (...a) => print(a.join(' '));

// The character exists on demand; this is the same call the UI makes.
function require_character() {
  return state.character;
}

const origin = { lat: 42.3314, lng: -83.0458 };
const districts = generateDistricts(origin, []);
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const lots = syntheticLots(districts);
const state = createState({ origin, cityName: 'Detroit', districts, crews, lots });

// A populated empire, so panels render with real content rather than empties.
state.cash.clean = 40000000;
// Progression gating is not what these panels are testing, and a firearms line
// sits behind nine properties.
state.adminUnlockAll = true;
function openSite(type) {
  const lot = cheapestLotFor(state, BUILDINGS[type]);
  A.buyLot(state, lot.id);
  return A.developLot(state, lot.id, type).building;
}
const grow = openSite('grow_house');
const lab = openSite('lab');
openSite('stash');
const shop = openSite('laundromat');
openSite('fungi_room');
openSite('depot');
const courier = A.buyVehicle(state, 'sedan').vehicle;
A.assignDriver(state, courier.id, A.hireDriver(state).driver.id);

const held = [...districts].sort((a, b) => b.rivalControl - a.rivalControl)[0];
const open = [...districts].sort((a, b) => a.rivalControl - b.rivalControl)[0];
for (const [to, type] of [[lab.id, 'building'], [held.id, 'district'], [open.id, 'district']]) {
  const r = createRoute({ fromId: grow.id, toType: type, toId: to, cargo: 'packs', product: 'any' });
  const from = grow.latlng;
  const dest = type === 'district' ? districts.find(d => d.id === to).center : lab.latlng;
  r.points = [from, dest];
  r.km = haversineKm(from, dest) * 1.35;
  state.routes.push(r);
}
A.assignCourier(state, courier.id, state.routes[1].id);
// Install a couple of upgrades so the panel renders with effects applied.
A.upgradeBuilding(state, grow.id, 'lights');
A.upgradeBuilding(state, grow.id, 'racks');
A.upgradeBuilding(state, lab.id, 'line');
A.upgradeBuilding(state, shop.id, 'books');
for (let h = 0; h < 24 * 6; h += 0.05) stepSim(state, 0.05, {});

// Build a UI without touching the constructor (which needs a DOM).
const ui = Object.create(GameUI.prototype);
ui.game = { state };
ui.tab = 'build';
ui.routeDraft = { fromId: grow.id, toKey: `district:${held.id}`, cargo: 'packs', product: 'any' };

const cases = [
  ['tabBuild', () => ui.tabBuild()],
  ['tabFleet', () => ui.tabFleet()],
  ['tabRoutes', () => ui.tabRoutes()],
  ['tabLedger', () => ui.tabLedger()],
  ['crewsSection', () => ui.crewsSection()],
  ['districtPanel (rival-held)', () => ui.districtPanel(held)],
  ['districtPanel (open)', () => ui.districtPanel(open)],
  ['turfSection (held)', () => ui.turfSection(held)],
  ['turfSection (open)', () => ui.turfSection(open)],
  ['buildingPanel grow', () => ui.buildingPanel(state.buildings[0])],
  ['buildingPanel lab', () => ui.buildingPanel(state.buildings[1])],
  ['buildingPanel stash', () => ui.buildingPanel(state.buildings[2])],
  ['buildingPanel laundromat', () => ui.buildingPanel(shop)],
  ['buildingPanel fungi', () => ui.buildingPanel(state.buildings[4])],
  ['courierPanel', () => ui.courierPanel(courier)],
  ['lotPanel (for sale)', () => ui.lotPanel(state.lots.find((l) => !l.owned))],
  ['lotPanel (owned empty)', () => { const l = state.lots.find((x) => !x.owned); A.buyLot(state, l.id); return ui.lotPanel(l); }],
  ['lotPanel (developed)', () => ui.lotPanel(state.lots.find((l) => l.buildingId))],
  ['lotDevelopBlock', () => ui.lotDevelopBlock(state.lots.find((l) => l.owned && !l.buildingId))],
  ['upgradeBlock grow', () => ui.upgradeBlock(grow)],
  ['upgradeBlock lab', () => ui.upgradeBlock(lab)],
  ['upgradeBlock shop', () => ui.upgradeBlock(shop)],
  ['dailyNet', () => String(ui.dailyNet())],
  // The cabinet, both empty and holding something — the populated case is where
  // all the interpolation is, and an empty one renders a different branch.
  ['armouryBlock (empty)', () => ui.armouryBlock() || '<!-- nothing to keep -->'],
  ['armouryBlock (holding)', () => {
    const line = openSite('machine_shop');
    line.packs.iron = 10;
    A.keepFirearm(state, line.id);
    return ui.armouryBlock();
  }],
  ['tabMarket with a cabinet', () => ui.tabMarket()],
  // Both armour lines: a back room with no certification, and a certified
  // plant, which gate their categories differently.
  ['armourLineBlock (back room)', () => {
    const shop = openSite('vest_shop');
    A.setProductionLine(state, shop.id, 'ceramic');
    A.setModel(state, shop.id, 'carbide');
    return ui.armourLineBlock(shop);
  }],
  ['armourLineBlock (certified)', () => {
    const plant = openSite('plate_plant');
    return ui.armourLineBlock(plant);
  }],
  // The character and the film, both unhurt and badly shot up — the injured
  // case is where every interpolation lives.
  ['tabCharacter (unhurt)', () => ui.tabCharacter()],
  ['tabXray (unhurt)', () => ui.tabXray()],
  ['tabCharacter (kitted)', () => {
    const line = state.buildings.find((b) => BUILDINGS[b.type].product === 'plate');
    line.packs.plate = 20;
    A.setProductionLine(state, line.id, 'ceramic');
    A.setModel(state, line.id, 'carbide');
    A.keepFirearm(state, line.id);
    A.setProductionLine(state, line.id, 'helmet');
    A.setModel(state, line.id, 'highcut');
    A.keepFirearm(state, line.id);
    const kept = (state.armoury || []).filter((p) => p.kind === 'plate');
    A.equipGear(state, 'torso', kept.find((p) => p.classId === 'ceramic').id);
    A.equipGear(state, 'head', kept.find((p) => p.classId === 'helmet').id);
    return ui.tabCharacter();
  }],
  // The same character, turned round. Everything on the back — the drag
  // handle, the plate's backer, the retention dial, a slung rifle — is drawn
  // from a different set of art, so it is a second panel's worth of
  // interpolation and needs its own pass.
  ['tabCharacter (back view)', () => {
    ui.figureView = 'back';
    const html = ui.tabCharacter();
    ui.figureView = 'front';
    return html;
  }],
  ['tabXray (shot up)', () => {
    A.takeFire(state, { rounds: 5, threat: 0.8 });
    // Push it forward far enough for the infection clock to have run.
    const ch = require_character();
    return ui.tabXray();
  }],
  // The legal half of the build list. Trades and fronts are two different
  // sections now, and an empty-handed player has to be able to see both.
  ['lotDevelopBlock (legal business)', () => {
    const lot = cheapestLotFor(state, BUILDINGS.funeral_home);
    A.buyLot(state, lot.id);
    const html = ui.lotDevelopBlock(lot);
    if (!/Trades/.test(html)) throw new Error('no Trades group in the build list');
    if (!/Fronts/.test(html)) throw new Error('no Fronts group in the build list');
    if (!/Funeral/.test(html)) throw new Error('funeral home not offered');
    return html;
  }],
  // Back view with a limb gone. Amputation is "don't draw that part", and the
  // back view draws the same parts — so if the two ever stop agreeing, it
  // shows here and nowhere else.
  ['tabCharacter (back, limb lost)', () => {
    const ch = require_character();
    ch.body.parts.armL.lost = true;
    ui.figureView = 'back';
    const html = ui.tabCharacter();
    ui.figureView = 'front';
    const front = ui.tabCharacter();
    ch.body.parts.armL.lost = false;
    if (html === front) throw new Error('back view is identical to the front');
    return html;
  }],
  ['buildingPanel armour line', () => ui.buildingPanel(
    state.buildings.find((b) => BUILDINGS[b.type].product === 'plate'))],
  ['buildingPanel firearms line', () => ui.buildingPanel(
    state.buildings.find((b) => BUILDINGS[b.type].product === 'iron'))],
];

// Every <details> must carry a data-disc key.
//
// The toggle listener ignores a disclosure without one, so nothing about it is
// remembered — and because the rail re-renders every tick, the element snaps
// straight back to whatever the markup hard-codes. In practice that means a
// disclosure defaulting to closed can never be opened and one defaulting to
// open can never be closed, which is exactly how the building-category groups
// shipped. Checking the rendered HTML catches it wherever it is introduced.
function auditDisclosures(html, where) {
  const found = html.match(/<details\b[^>]*>/g) || [];
  return found
    .filter((tag) => !/data-disc=/.test(tag))
    .map(() => where);
}

let failed = 0;
const keyless = [];
for (const [name, fn] of cases) {
  try {
    const html = fn();
    if (typeof html !== 'string' || !html.length) throw new Error('empty output');
    if (html.includes('undefined')) { print(`  ⚠ ${name}: output contains "undefined"`); failed++; continue; }
    if (html.includes('NaN')) { print(`  ⚠ ${name}: output contains "NaN"`); failed++; continue; }
    keyless.push(...auditDisclosures(html, name));
    print(`  ok  ${name.padEnd(28)} ${String(html.length).padStart(5)} chars`);
  } catch (e) {
    print(`  FAIL ${name}: ${e}`);
    failed++;
  }
}
print('');
if (keyless.length) {
  const where = [...new Set(keyless)];
  print(`  ⚠ ${keyless.length} <details> with no data-disc, in: ${where.join(', ')}`);
  print('    Without a key the toggle is never recorded and the next render undoes it.');
  failed += keyless.length;
} else {
  print('  ok  every disclosure has a data-disc key');
}
print('');
print(failed ? `${failed} PANEL(S) BROKEN` : 'all panels render clean');
