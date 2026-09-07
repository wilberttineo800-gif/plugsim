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

const origin = { lat: 42.3314, lng: -83.0458 };
const districts = generateDistricts(origin, []);
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const lots = syntheticLots(districts);
const state = createState({ origin, cityName: 'Detroit', districts, crews, lots });

// A populated empire, so panels render with real content rather than empties.
state.cash.clean = 400000;
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
];

let failed = 0;
for (const [name, fn] of cases) {
  try {
    const html = fn();
    if (typeof html !== 'string' || !html.length) throw new Error('empty output');
    if (html.includes('undefined')) { print(`  ⚠ ${name}: output contains "undefined"`); failed++; continue; }
    if (html.includes('NaN')) { print(`  ⚠ ${name}: output contains "NaN"`); failed++; continue; }
    print(`  ok  ${name.padEnd(28)} ${String(html.length).padStart(5)} chars`);
  } catch (e) {
    print(`  FAIL ${name}: ${e}`);
    failed++;
  }
}
print('');
print(failed ? `${failed} PANEL(S) BROKEN` : 'all panels render clean');
