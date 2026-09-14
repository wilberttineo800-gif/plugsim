import { generateDistricts } from '../src/game/districts.js';
import { generateCrews, applyInitialControl } from '../src/game/crews.js';
import { syntheticLots, cheapestLotFor } from './fixtures.js';
import { BUILDINGS } from '../src/game/constants.js';
import { createState, saveGame, loadGame } from '../src/game/state.js';
import * as A from '../src/game/actions.js';
import {
  ARMOURY, armouryOf, armouryEdge, armourGuard, armouryHeatPerDay, armouryRoom,
} from '../src/game/armoury.js';

// saveGame/loadGame go through browser storage; stand one up so the round trip
// under test is the real one rather than a hand-rolled copy of it.
globalThis.console = globalThis.console || { warn: print, log: print, error: print };
globalThis.localStorage = {
  _s: {},
  setItem(k, v) { this._s[k] = String(v); },
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  removeItem(k) { delete this._s[k]; },
};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; print('  FAIL ' + m); } };

const origin = { lat: 42.3314, lng: -83.0458 };
const districts = generateDistricts(origin, []);
const crews = generateCrews(districts, origin);
applyInitialControl(districts, crews);
const lots = syntheticLots(districts);
const state = createState({ origin, cityName: 'Detroit', districts, crews, lots });
state.cash.clean = 60000000;
state.adminUnlockAll = true;   // the gate is progression, not what is under test

function openSite(type) {
  const lot = cheapestLotFor(state, BUILDINGS[type]);
  A.buyLot(state, lot.id);
  return A.developLot(state, lot.id, type).building;
}

const shop = openSite('machine_shop');
ok(!!shop, 'a machine shop can be opened');

// Nothing finished yet.
ok(!A.keepFirearm(state, shop.id).ok, 'you cannot keep a unit off an empty line');

shop.packs.iron = 40;
const before = shop.packs.iron;
const r = A.keepFirearm(state, shop.id);
ok(r.ok, 'a finished unit can be kept');
ok(shop.packs.iron === before - 1, 'the unit leaves the line stock');
ok(r.forgone > 0, 'it reports the sale forgone: $' + r.forgone);
ok(!r.piece.serialised, 'a back-room line makes no serial');
ok(!!r.piece.modelId, 'a kept piece always records a pattern, even off an untooled line');
ok(r.piece.name !== 'Handgun', 'so it is named after what it is, not its category: ' + r.piece.name);

// The cap.
for (let i = 0; i < 20; i++) A.keepFirearm(state, shop.id);
ok(armouryOf(state).length === ARMOURY.cap, 'the cabinet caps at ' + ARMOURY.cap);
ok(armouryRoom(state) === 0, 'no room left');
const over = A.keepFirearm(state, shop.id);
ok(!over.ok && /keep/.test(over.error), 'a further one is refused with a reason');

// The edge, and its ceiling.
const edge = armouryEdge(state);
ok(edge > 0 && edge <= ARMOURY.maxEdge + 1e-9, 'a full cabinet gives an edge within the cap: ' + edge.toFixed(3));

// Diminishing returns: one piece is worth more than a sixth of six.
const solo = createState({ origin, cityName: 'x', districts, crews, lots });
solo.armoury = [armouryOf(state)[0]];
const oneEdge = armouryEdge(solo);
ok(oneEdge > edge / ARMOURY.cap, 'the first piece is worth more than an even share');
ok(oneEdge < edge, 'but more pieces still beat one');

// What you keep should matter, not just how many. A belt-fed in the cabinet is
// worth more than six pistols — otherwise the right move is always "hoard".
const mk = (classId, modelId, n) => ({
  armoury: Array.from({ length: n }, (_, i) => ({ id: 'x' + i, classId, modelId })),
});
const oneMG = armouryEdge(mk('machinegun', 'hammerfall', 1));
const sixPistols = armouryEdge(mk('handgun', 'kestrel', 6));
ok(oneMG > sixPistols, 'one belt-fed beats a cabinet full of pistols');
ok(armouryEdge(mk('machinegun', 'hammerfall', 6)) < ARMOURY.maxEdge,
  'even the best full cabinet stays under the ceiling');
ok(armouryEdge(mk('handgun', 'kestrel', 1)) < 0.04,
  'a pistol in a drawer is worth almost nothing');

// Heat.
ok(armouryHeatPerDay(state) > 0, 'keeping them costs attention daily');
const licensedish = { ...armouryOf(state)[0], serialised: true };
solo.armoury = [licensedish];
const lic = armouryHeatPerDay(solo);
solo.armoury = [armouryOf(state)[0]];
ok(lic < armouryHeatPerDay(solo), 'a serialised piece is quieter than one with no number');

// Selling one back.
const dirtyBefore = state.cash.dirty;
const sold = A.releaseFirearm(state, armouryOf(state)[0].id);
ok(sold.ok, 'a piece can be let go');
ok(state.cash.dirty > dirtyBefore, 'an unserialised piece pays street money');
ok(armouryOf(state).length === ARMOURY.cap - 1, 'and leaves the cabinet');
ok(!A.releaseFirearm(state, 'nope').ok, 'selling something you do not have is refused');

// Survives a save.
ok(saveGame(state), 'the game saves');
const back = loadGame();
ok(back && armouryOf(back).length === ARMOURY.cap - 1, 'the cabinet survives a save/load');

// A save written before the cabinet existed must load clean rather than throw.
// The version matches, so migrate() is skipped — this is exactly the class of
// bug that shipped when new products were added, and it is why the backfill
// runs on every load instead of only on a version bump.
const key = Object.keys(localStorage._s)[0];
const old = JSON.parse(localStorage._s[key]);
delete old.armoury; delete old.armouryCounter;
localStorage._s[key] = JSON.stringify(old);
const migrated = loadGame();
ok(migrated && Array.isArray(migrated.armoury) && migrated.armoury.length === 0,
  'a save written before the cabinet loads clean');
ok(armouryEdge(migrated) === 0 && armouryHeatPerDay(migrated) === 0, 'and costs nothing');

// --- Armour in the cabinet ---------------------------------------------------
// You can keep a vest as readily as a gun, and what it does is deliberately a
// different thing: iron shifts whether you win a fight, armour shifts what
// losing one costs. Keeping one of each therefore beats keeping two of either.

state.armoury = [];
const vests = openSite('vest_shop');
A.setProductionLine(state, vests.id, 'ceramic');
A.setModel(state, vests.id, 'carbide');
vests.packs.plate = 20;

const kept = A.keepFirearm(state, vests.id);
ok(kept.ok, 'a vest can be kept off an armour line');
ok(kept.piece.kind === 'plate', 'and it records what kind of thing it is');
ok(kept.piece.name === 'Carbide IV', 'named after the pattern: ' + kept.piece.name);
ok(vests.packs.plate === 19, 'it leaves the line stock');
ok(!kept.piece.serialised, 'a back-room armour line makes nothing certified');

ok(armouryEdge(state) === 0, 'a vest does not help you win a fight');
ok(armourGuard(state) > 0, 'it helps you survive losing one: ' + armourGuard(state).toFixed(3));
ok(armourGuard(state) <= ARMOURY.maxGuard + 1e-9, 'and is capped');

// A vest in a cupboard is not a thing anybody can charge you for.
const ironOnly = { armoury: [{ id: 'i1', kind: 'iron', classId: 'handgun', modelId: 'kestrel' }] };
const vestOnly = { armoury: [{ id: 'v1', kind: 'plate', classId: 'ceramic', modelId: 'carbide' }] };
ok(armouryHeatPerDay(vestOnly) < armouryHeatPerDay(ironOnly),
  'armour draws far less attention than iron does');

// The cap is shared: six things, whatever mix.
for (let i = 0; i < 20; i++) A.keepFirearm(state, vests.id);
ok(armouryOf(state).length === ARMOURY.cap, 'the cap counts iron and armour together');

// Selling one back prices it off armour, not off iron.
const vestPrice = A.releaseFirearm(state, armouryOf(state)[0].id);
ok(vestPrice.ok && vestPrice.price > 0, 'a vest can be let go for ' + vestPrice.price);

// And an old piece written before any of this still works.
const legacy = { armoury: [{ id: 'l1', classId: 'handgun', modelId: 'kestrel' }] };
ok(armouryEdge(legacy) > 0, 'a piece saved before kinds existed still counts as iron');
ok(armourGuard(legacy) === 0, 'and is not mistaken for armour');

print(fail ? `armoury: ${fail} FAILED, ${pass} passed` : `armoury: all ${pass} checks passed`);
