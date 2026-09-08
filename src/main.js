// Bootstrap: the start screen, the map, and the loop that drives everything.

import { GAME_MINUTES_PER_REAL_SECOND, LOTS, SPEEDS, TICK_MS } from './game/constants.js';
import { generateDistricts, districtAt } from './game/districts.js';
import { generateCrews, applyInitialControl, rehydrateCrews } from './game/crews.js';
import {
  fetchPlaceNames, geocode, reverseGeocode, fetchRoute, fetchBuildings, fetchCountryCode,
  overpassCoolingDown, overpassCooldownSeconds,
} from './game/geo.js';
import { tilesForBounds, loadTiles, lotById } from './game/lots.js';
import {
  createState, saveGame, loadGame, hasSave, clearSave, logEvent,
  buildingById, districtById,
} from './game/state.js';
import { stepSim, recordPrices, catchUp } from './game/sim.js';
import { HELPER, newlyDone } from './game/onboarding.js';
import { generatePlayers, placePlayers } from './game/players.js';
import { attachLocal, connection } from './game/net.js';
import * as A from './game/actions.js';
import { createMap, DistrictLayer, OVERLAYS, fitToDistricts } from './map/mapView.js';
import {
  BuildingLayer, CourierLayer, RouteLayer, LotLayer, PlacementGhost, PlayerMarker, pingIncident,
} from './map/entities.js';
import { GameUI } from './ui/ui.js';
import { toast } from './ui/toast.js';
import { esc } from './ui/format.js';
import * as diag from './game/diagnostics.js';

const SURPRISE_CITIES = [
  { name: 'Detroit, Michigan', lat: 42.3314, lng: -83.0458 },
  { name: 'Marseille, France', lat: 43.2965, lng: 5.3698 },
  { name: 'Medellín, Colombia', lat: 6.2442, lng: -75.5812 },
  { name: 'Naples, Italy', lat: 40.8518, lng: 14.2681 },
  { name: 'Lagos, Nigeria', lat: 6.5244, lng: 3.3792 },
  { name: 'Osaka, Japan', lat: 34.6937, lng: 135.5023 },
  { name: 'Manchester, England', lat: 53.4808, lng: -2.2426 },
  { name: 'Tijuana, Mexico', lat: 32.5149, lng: -117.0382 },
  { name: 'Rotterdam, Netherlands', lat: 51.9244, lng: 4.4777 },
  { name: 'Baltimore, Maryland', lat: 39.2904, lng: -76.6122 },
];

const game = {
  state: null,
  map: null,
  districtLayer: null,
  buildingLayer: null,
  courierLayer: null,
  routeLayer: null,
  lotLayer: null,
  ghost: null,
  ui: null,
  placing: null,
  loopHandle: null,
  lastFrame: 0,
};

// Record faults with enough game state attached to make a report actionable.
// Installed after `game` exists: the snapshot closure reads it, and touching
// a const before its initialiser runs throws.
diag.install(() => {
  const s = game && game.state;
  if (!s) return 'no game running';
  return `day ${Math.floor(s.minutes / 1440) + 1} · ${s.cityName} · ` +
    `${s.buildings.length} buildings · ${s.couriers.length} couriers · ` +
    `${(s.lots || []).length} lots · clean $${Math.round(s.cash.clean)} · ` +
    `speed ${s.speedIndex} · sel ${s.selection ? s.selection.kind : 'none'}`;
});

// --- Start screen -----------------------------------------------------------

const startEl = document.getElementById('startScreen');
const statusEl = document.getElementById('startStatus');
const resultsEl = document.getElementById('cityResults');
const searchInput = document.getElementById('citySearch');

function setStatus(text, bad = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('is-bad', bad);
}

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  setStatus('Searching the map…');
  resultsEl.innerHTML = '';
  const results = await geocode(q);
  if (!results.length) {
    setStatus('Nothing found. Try adding the state or country — “Waterbury, Connecticut”.', true);
    return;
  }
  setStatus('');
  resultsEl.innerHTML = results
    .map((r, i) => `<button class="result" data-i="${i}">
        <b>${esc(r.short)}${r.kind ? `<em>${esc(r.kind.replace(/_/g, ' '))}</em>` : ''}</b>
        <span>${esc(r.name)}</span>
      </button>`)
    .join('');
  resultsEl.querySelectorAll('.result').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = results[Number(btn.dataset.i)];
      startNewGame({ lat: r.lat, lng: r.lng }, r.short);
    });
  });
}

document.getElementById('citySearchBtn').addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

document.getElementById('btnRandomCity').addEventListener('click', () => {
  const pick = SURPRISE_CITIES[Math.floor(Math.random() * SURPRISE_CITIES.length)];
  startNewGame({ lat: pick.lat, lng: pick.lng }, pick.name.split(',')[0]);
});

document.getElementById('btnLocate').addEventListener('click', () => {
  if (!navigator.geolocation) {
    setStatus('This browser won’t share a location.', true);
    return;
  }
  setStatus('Asking for your location…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const name = (await reverseGeocode(origin.lat, origin.lng)) || 'Your City';
      startNewGame(origin, name);
    },
    () => setStatus('Couldn’t get a location. Search for a city instead.', true),
    { timeout: 8000 }
  );
});

const continueBtn = document.getElementById('btnContinue');
if (hasSave()) {
  continueBtn.hidden = false;
  continueBtn.addEventListener('click', () => {
    const saved = loadGame();
    if (!saved) {
      setStatus('That save is corrupt. Starting fresh.', true);
      clearSave();
      continueBtn.hidden = true;
      return;
    }
    bootGame(saved);
  });
}

// Once a game is running the start screen is gone; make sure nothing in it can
// still fire.
function sealStartScreen() {
  startEl.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
  resultsEl.innerHTML = '';
}

// --- Game start -------------------------------------------------------------

let starting = false;

async function startNewGame(origin, cityName) {
  // A second start would replace the state and then fail on the map, leaving a
  // half-built session with the player's property gone. One double-tap on a
  // search result was enough.
  if (starting || game.state) return;
  starting = true;
  setStatus('Reading the streets around you…');
  document.querySelectorAll('.start__actions button, .start__searchrow button')
    .forEach((b) => { b.disabled = true; });

  // One Overpass call gives real neighbourhood names for the whole play area.
  const pad = 0.035;
  let places = [];
  try {
    places = await fetchPlaceNames(
      origin.lat - pad, origin.lng - pad, origin.lat + pad, origin.lng + pad,
      (attempt, waitMs) => setStatus(`Name service is busy — retrying in ${Math.round(waitMs / 1000)}s…`)
    );
  } catch { /* handled by fallback below */ }

  if (places.length) setStatus(`Found ${places.length} real neighbourhoods. Carving up the map…`);
  else setStatus('Couldn’t reach the name service — using generated district names.');

  // What sells here depends on where "here" is.
  const countryCode = await fetchCountryCode(origin.lat, origin.lng);
  const districts = generateDistricts(origin, places, countryCode);
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);

  // A whole territory holds tens of thousands of buildings, so they stream in
  // by area as you explore. Only the blocks around the start are loaded now.
  setStatus('Surveying the buildings around you…');
  const state = createState({ origin, cityName, countryCode, districts, crews, lots: [] });
  // Other people running the same game in the same city, and where they work.
  state.players = generatePlayers(Math.random);
  placePlayers(state, Math.random);

  const startPad = 0.001; // one tile is plenty to open on
  const startTiles = tilesForBounds(
    origin.lat - startPad, origin.lng - startPad,
    origin.lat + startPad, origin.lng + startPad
  );
  const survey = (s2, w2, n2, e2, cap) => fetchBuildings(s2, w2, n2, e2, cap, (attempt, waitMs) => {
    setStatus(`Survey office is busy — retrying in ${Math.round(waitMs / 1000)}s…`);
  });
  try {
    await loadTiles(state, startTiles, survey);
  } catch (err) {
    console.warn('[start] building survey failed', err);
  }
  if (!state.lots.length) {
    setStatus('The building survey is rate-limited right now. Give it a minute and try again.', true);
    document.querySelectorAll('.start__actions button, .start__searchrow button')
      .forEach((b) => { b.disabled = false; });
    starting = false;
    return;
  }
  setStatus(`${state.lots.length} buildings surveyed. Opening up…`);
  logEvent(state, `Set up shop in ${cityName}. ${districts.length} blocks in reach.`, 'good');
  logEvent(
    state,
    `${crews.map((c) => c.name).join(' and ')} already work this side of town.`,
    'info'
  );
  logEvent(state, 'Every building here can be bought. Zoom in and pick one.', 'info');
  bootGame(state);
}

/**
 * Put the "you are here" dot where it belongs: your real position if you've
 * turned following on, otherwise your headquarters, otherwise where you started.
 */
function syncPlayerMarker() {
  const s = game.state;
  if (!s || !game.playerMarker) return;
  let at = s.playerAt;
  if (!s.followMe) {
    const hq = s.hqBuildingId ? buildingById(s, s.hqBuildingId) : null;
    at = hq ? hq.latlng : (s.playerAt || s.origin);
  }
  game.playerMarker.set(at, { live: !!s.followMe });
}

/**
 * Track the player's real position. The note asked for walking around town to
 * move you on the map; where the browser won't allow it, the HQ stands in.
 */
game.toggleFollowMe = () => {
  const s = game.state;
  if (!s) return;
  if (s.followMe) {
    if (game.geoWatch != null) navigator.geolocation.clearWatch(game.geoWatch);
    game.geoWatch = null;
    s.followMe = false;
    syncPlayerMarker();
    toast('Back to following your HQ.', 'info');
    game.ui.render();
    return;
  }
  if (!navigator.geolocation) return toast('This browser won\u2019t share a location.', 'bad');
  toast('Asking for your location\u2026', 'info');
  game.geoWatch = navigator.geolocation.watchPosition(
    (pos) => {
      s.followMe = true;
      s.playerAt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      syncPlayerMarker();
      game.ui.render();
    },
    () => {
      s.followMe = false;
      game.geoWatch = null;
      toast('Couldn\u2019t get a location. Staying on your HQ.', 'bad');
      game.ui.render();
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 }
  );
};

game.setHeadquarters = (id) => {
  diag.trace('set hq');
  const r = A.setHeadquarters(game.state, id);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.building.name} is home now.`, 'good', 3200);
  syncPlayerMarker();
  game.buildingLayer.sync(game.state);
  game.ui.render();
};

game.addLine = (vehicleId, routeId) => {
  diag.trace('add line');
  const r = A.addRouteToVehicle(game.state, vehicleId, routeId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`On ${r.count} line${r.count === 1 ? '' : 's'} now.`, 'good', 2400);
  game.routeLayer.sync(game.state);
  game.ui.render();
};

game.dropLine = (vehicleId, routeId) => {
  diag.trace('drop line');
  const r = A.removeRouteFromVehicle(game.state, vehicleId, routeId);
  if (!r.ok) return toast(r.error, 'bad');
  game.routeLayer.sync(game.state);
  game.ui.render();
};

game.improveRental = (lotId, upgradeId) => {
  diag.trace('improve rental');
  const r = A.improveRental(game.state, lotId, upgradeId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.upgrade.name} done — rent now $${r.after.toLocaleString()}/day.`, 'good', 3600);
  game.ui.render();
};

game.applyForLicence = (id) => {
  diag.trace('apply licence');
  const r = A.applyForLicence(game.state, id);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Application filed for ${r.licence.short}.`, 'good', 3600);
  game.ui.render();
};

game.renewLicence = (id) => {
  const r = A.renewLicence(game.state, id);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.licence.short} renewed.`, 'good');
  game.ui.render();
};

game.setProductionLine = (buildingId, lineId) => {
  diag.trace('retool');
  const r = A.setProductionLine(game.state, buildingId, lineId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Retooled for ${r.line.name.toLowerCase()}.`, 'good', 3000);
  game.ui.render();
};

game.renameDistrict = (districtId, name) => {
  const r = A.renameDistrict(game.state, districtId, name);
  if (!r.ok) return toast(r.error, 'bad');
  game.districtLayer.sync?.(game.state);
  game.ui.render();
};

game.improveTurf = (districtId, upgradeId) => {
  diag.trace('improve turf');
  const r = A.improveTurf(game.state, districtId, upgradeId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.upgrade.name} in place — $${r.upgrade.upkeepPerDay.toLocaleString()}/day.`, 'good', 3600);
  game.ui.render();
};

game.endTurfUpgrade = (districtId, upgradeId) => {
  const r = A.endTurfUpgrade(game.state, districtId, upgradeId);
  if (!r.ok) return toast(r.error, 'bad');
  game.ui.render();
};

game.startResearch = (projectId) => {
  diag.trace('start research');
  const r = A.startResearch(game.state, projectId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.project.name} is on the bench.`, 'good', 3000);
  game.ui.render();
};

game.cancelResearch = (projectId) => {
  A.cancelResearch(game.state, projectId);
  game.ui.render();
};

game.equipItem = (itemId, targetId) => {
  const r = A.equipItem(game.state, itemId, targetId);
  if (!r.ok) return toast(r.error, 'bad');
  if (r.target) toast(`${r.item.name} fitted to ${r.target.name}.`, 'good', 2800);
  game.ui.render();
};

game.sellItem = (itemId) => {
  const r = A.sellItem(game.state, itemId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Sold ${r.item.name} for $${r.price.toLocaleString()}.`, 'good', 3400);
  game.ui.render();
};

game.setPlayerName = (name) => {
  const s = game.state;
  s.playerProfile = s.playerProfile || {};
  const clean = String(name || '').trim().slice(0, 24);
  s.playerProfile.name = clean || null;
  game.ui.render();
};

game.toggleAI = () => {
  const s = game.state;
  s.aiDisabled = !s.aiDisabled;
  toast(s.aiDisabled ? 'Other operations off.' : 'Other operations back on.', 'info');
  game.ui.render();
};

// Exposed so the headless load check can run a real boot; nothing in the game
// calls this.
game.__boot = (state) => bootGame(state);

// Exposed for the browser check, which measures every drawing's geometry —
// a clipped muzzle can't be seen from the markup alone.
import('./ui/art.js').then((art) => { window.__plugsimArt = art; }).catch(() => {});

game.sellItemTo = (itemId, playerId) => {
  diag.trace('sell item to operation');
  const r = A.sellItemTo(game.state, itemId, playerId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.buyer.name} took ${r.item.name} for $${r.price.toLocaleString()}.`, 'good', 3600);
  game.ui.render();
};

game.sellProductTo = (buildingId, playerId, productId) => {
  diag.trace('sell product to operation');
  const r = A.sellProductTo(game.state, buildingId, playerId, productId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(
    `${r.buyer.name} took ${Math.round(r.moved)} packs for $${Math.round(r.gross).toLocaleString()}.`,
    'good', 3800);
  game.ui.render();
};

game.dismissHelper = () => {
  game.state.tutorialDismissed = true;
  toast('Ray\u2019s around if you need him \u2014 press ? for the rundown.', 'info', 4000);
  game.ui.render();
};

function bootGame(state) {
  if (game.map) return; // already running; a second boot would corrupt it
  rehydrateCrews(state);
  game.state = state;
  startEl.hidden = true;

  game.map = createMap('map', state.origin, 14);
  game.districtLayer = new DistrictLayer(game.map, state.districts, {
    onSelect: (d) => game.select('district', d.id),
  });
  game.routeLayer = new RouteLayer(game.map);
  game.buildingLayer = new BuildingLayer(game.map, {
    onSelect: (b) => game.select('building', b.id),
  });
  game.courierLayer = new CourierLayer(game.map, {
    onSelect: (c) => game.select('courier', c.id),
  });
  game.lotLayer = new LotLayer(game.map, {
    onSelect: (lot) => game.select('lot', lot.id),
  });
  game.lotLayer.setDistricts(state.districts);
  game.lotLayer.setAll(state.lots || []);
  game.ghost = new PlacementGhost(game.map);
  game.playerMarker = new PlayerMarker(game.map);
  syncPlayerMarker();
  fitToDistricts(game.map, state.districts);

  game.map.on('click', () => {
    // On a phone, reaching for the map is how you ask for the map back.
    if (game.ui && game.ui.isPhone && game.ui.isPhone()) game.ui.closeSheets();
    else game.select(null);
  });
  game.map.on('moveend zoomend', () => scheduleTileSweep());

  // Saved routes have geometry already; only refetch ones that never resolved.
  for (const r of state.routes) {
    if (!r.points) {
      const from = buildingById(state, r.fromId);
      const to = r.toType === 'district'
        ? districtById(state, r.toId)?.center
        : buildingById(state, r.toId)?.latlng;
      if (from && to) {
        fetchRoute(from.latlng, to).then((res) => {
          r.points = res.points; r.km = res.km; r.driveMinutes = res.driveMinutes; r.realRoad = res.real;
        });
      }
    }
  }

  if (!Object.keys(state.priceHistory || {}).length) recordPrices(state);
  // Other operations come through an adapter, so a real backend is a swap.
  attachLocal(state);
  // Saves from before operations had a place on the map need one.
  if ((state.players || []).some((p) => !(p.blocks || []).length)) {
    placePlayers(state, Math.random);
  }

  // The world doesn't stop because you closed the tab. Run it forward over the
  // time you were away, then say what happened while you were gone.
  if (state.savedAt) {
    const away = catchUp(state, Date.now() - state.savedAt);
    if (away) game.awayReport = away;
    delete state.savedAt;
  }

  game.ui = new GameUI(game);
  sealStartScreen();
  game.ui.show();
  game.buildingLayer.sync(state);
  game.courierLayer.sync(state);
  game.routeLayer.sync(state);

  startLoop();
  wireVisibility();
  wireKeys();
  scheduleTileSweep();
  game.autosave = setInterval(() => {
    if (game.state && !game.saveDisabled) saveGame(game.state);
  }, 60000);

  if (game.awayReport) {
    const a = game.awayReport;
    const span = a.hours >= 48
      ? `${Math.round(a.hours / 24)} days`
      : a.hours >= 1.5 ? `${Math.round(a.hours)} hours` : `${Math.round(a.hours * 60)} minutes`;
    const made = a.earnedClean + a.earnedDirty;
    const bits = [`${span} passed while you were gone`];
    if (a.trips) bits.push(`${a.trips} deliveries ran`);
    if (Math.abs(made) > 1) {
      bits.push(`${made >= 0 ? 'took' : 'lost'} $${Math.abs(Math.round(made)).toLocaleString('en-US')}`);
    }
    if (a.incidents) bits.push(`${a.incidents} run-in${a.incidents === 1 ? '' : 's'} with police`);
    logEvent(state, bits.join(' · ') + '.', made >= 0 ? 'good' : 'bad');
    toast(bits.join(' · ') + '.', made >= 0 ? 'good' : 'bad', 9000);
    if (a.capped) {
      toast('The trail goes cold after a week — the world caught up that far.', 'info', 7000);
    }
    game.awayReport = null;
  }

  if (!state.buildings.length) {
    toast('Zoom in, click a building you like, and buy it. Press ? for the rundown.', 'info', 8000);
  }
}

// --- Streaming buildings ----------------------------------------------------

let sweepTimer = null;
let sweeping = false;

/** Debounced: pull in any unloaded buildings under the current view. */
function scheduleTileSweep() {
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(runTileSweep, 550);
}

async function runTileSweep() {
  if (sweeping || !game.state) return;
  if (game.map.getZoom() < LOTS.minZoomForFetch) return;
  if (overpassCoolingDown()) {
    // The survey service is refusing; come back when it has recovered rather
    // than adding to the pile.
    game.ui.setLoading(`Survey office is swamped — back in ${overpassCooldownSeconds()}s`);
    setTimeout(() => { game.ui.setLoading(null); scheduleTileSweep(); }, 5000);
    return;
  }

  const b = game.map.getBounds();
  const keys = tilesForBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
  const pending = keys.filter((k) => !(game.state.loadedTiles || []).includes(k));
  if (!pending.length) return;

  sweeping = true;
  game.ui.setLoading(`Surveying ${pending.length} more block${pending.length === 1 ? '' : 's'}…`);
  try {
    const fresh = await loadTiles(game.state, keys, fetchBuildings);
    if (fresh.length) {
      game.lotLayer.setAll(game.state.lots);
      game.ui.renderRail();
      logEvent(game.state, `${fresh.length} more buildings surveyed.`, 'info');
    }
  } catch (err) {
    console.warn('[sweep] failed', err);
  } finally {
    sweeping = false;
    game.ui.setLoading(null);
    // More tiles may remain if this sweep hit its cap.
    if ((game.state.loadedTiles || []).length && game.map.getZoom() >= LOTS.minZoomForFetch) {
      const after = tilesForBounds(
        game.map.getBounds().getSouth(), game.map.getBounds().getWest(),
        game.map.getBounds().getNorth(), game.map.getBounds().getEast()
      ).filter((k) => !game.state.loadedTiles.includes(k));
      if (after.length) scheduleTileSweep();
    }
  }
}

// --- Loop -------------------------------------------------------------------

function startLoop() {
  if (game.loopHandle) clearInterval(game.loopHandle);
  game.lastFrame = performance.now();
  let sincePanelRender = 0;

  game.loopHandle = setInterval(() => {
    const now = performance.now();
    const realSeconds = Math.min(0.5, (now - game.lastFrame) / 1000);
    game.lastFrame = now;

    const speed = SPEEDS[game.state.speedIndex] || 0;
    if (speed > 0) {
      const gameHours = (realSeconds * GAME_MINUTES_PER_REAL_SECOND * speed) / 60;
      stepSim(game.state, gameHours, {
        onIncident: (latlng, kind) => pingIncident(game.map, latlng, kind),
      });
    }

    game.buildingLayer.sync(game.state);
    game.courierLayer.sync(game.state);
    game.routeLayer.sync(game.state);
    game.ui.renderHud();

    sincePanelRender += realSeconds;
    if (sincePanelRender > 0.6) {
      sincePanelRender = 0;
      game.lotLayer.refresh(game.state.lots || []);
      game.ui.renderTicker();

      // Say something when a step lands, rather than silently ticking a box.
      if (!game.state.tutorialDismissed) {
        for (const step of newlyDone(game.state)) {
          toast(`${HELPER.name}: that's "${step.title.toLowerCase()}" done.`, 'good', 4200);
        }
        // The build tab holds Ray's card, so keep it current as steps complete.
        if (game.ui.tab === 'build') game.ui.renderRail();
      }
      // Don't yank a panel out from under someone mid-interaction.
      if (!isEditing()) {
        game.ui.renderInspector();
        if (game.ui.tab === 'fleet' || game.ui.tab === 'routes') game.ui.renderRail();
      }
    }
  }, TICK_MS);
}

/**
 * A hidden tab is throttled by the browser, so the loop crawls rather than
 * running — switch tabs for ten minutes and almost no time passes, which reads
 * as the game being broken. Treat a hidden tab exactly like a closed one: the
 * world runs on in real time and catches up when you come back.
 */
function wireVisibility() {
  let hiddenAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (!hiddenAt || !game.state) return;
    const away = Date.now() - hiddenAt;
    hiddenAt = null;
    // Under half a minute isn't worth reporting; the loop absorbs it.
    if (away < 30000) { game.lastFrame = performance.now(); return; }

    const report = catchUp(game.state, away, {});
    game.lastFrame = performance.now();
    if (!report) return;

    const made = report.earnedClean + report.earnedDirty;
    const span = report.hours >= 1.5
      ? `${Math.round(report.hours)} hours`
      : `${Math.round(report.hours * 60)} minutes`;
    const bits = [`${span} passed while the tab was in the background`];
    if (report.trips) bits.push(`${report.trips} deliveries`);
    if (Math.abs(made) > 1) {
      bits.push(`${made >= 0 ? 'took' : 'lost'} $${Math.abs(Math.round(made)).toLocaleString('en-US')}`);
    }
    logEvent(game.state, bits.join(' · ') + '.', made >= 0 ? 'good' : 'bad');
    toast(bits.join(' · ') + '.', made >= 0 ? 'good' : 'info', 6000);
    game.ui.render();
  });
}

function isEditing() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'SELECT' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}

// --- Game API used by the UI ------------------------------------------------

game.select = (kind, id, opts = {}) => {
  const previous = game.state.selection;
  game.state.selection = kind ? { kind, id } : null;
  // Lets the map controls move out from under the inspector.
  document.body.classList.toggle('has-inspector', !!kind);

  // Selecting property you own moves in for a proper look at the block. Only
  // your own — browsing what's for sale shouldn't yank the map around.
  const changed = !previous || previous.kind !== kind || previous.id !== id;
  if (changed && opts.focus !== false) {
    if (kind === 'building') {
      const b = buildingById(game.state, id);
      if (b) flyToPoint(b.latlng);
    } else if (kind === 'lot') {
      const l = lotById(game.state, id);
      if (l && l.owned) flyToPoint(l.center);
    }
  }
  game.districtLayer.setSelected(kind === 'district' ? id : null);
  game.buildingLayer.setSelected(kind === 'building' ? id : null);
  game.buildingLayer.sync(game.state);
  game.lotLayer.setSelected(kind === 'lot' ? id : null, game.state.lots || []);
  game.ui.renderInspector();
  if (kind === 'lot') game.ui.renderRail();
};

game.setOverlay = (id) => {
  game.districtLayer.setOverlay(id);
  game.lotLayer.setOverlay(id, game.state.lots || []);
};

/**
 * Bring a point into view at close range. On a phone the inspector sheet covers
 * the lower half of the screen, so the target is nudged upward to land in the
 * band that's actually visible rather than behind the sheet.
 */
function flyToPoint(latlng, minZoom = 18) {
  const zoom = Math.max(game.map.getZoom(), minZoom);
  let center = L.latLng(latlng.lat, latlng.lng);
  if (game.ui && game.ui.isPhone()) {
    // The sheet takes roughly the lower 60% of a phone screen, so aim for the
    // middle of the band left above it rather than the middle of the map.
    const shift = game.map.getSize().y * 0.31;
    center = game.map.unproject(game.map.project(center, zoom).add([0, shift]), zoom);
  }
  game.map.flyTo(center, zoom, { duration: 0.55 });
}

game.focusOn = (kind, id) => {
  if (kind === 'district') {
    game.districtLayer.frame(id);
    return;
  }
  const target = buildingById(game.state, id)?.latlng;
  if (target) flyToPoint(target);
};

game.setSpeed = (i) => {
  game.state.speedIndex = i;
  game.ui.renderHud();
};

game.save = () => {
  game.saveDisabled = false;
  if (saveGame(game.state)) toast('Saved.', 'good', 1800);
  else toast('Save failed — browser storage is full or blocked.', 'bad');
};

game.toggleHelp = (open) => {
  document.getElementById('helpModal').hidden = !open;
};

game.buyLot = (lotId) => {
  diag.trace('buy lot');
  const r = A.buyLot(game.state, lotId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.lot.name} is yours. Now decide what runs there.`, 'good', 4200);
  game.lotLayer.refresh(game.state.lots);
  game.ui.render();
};

game.sellLot = (lotId) => {
  diag.trace('sell lot');
  const r = A.sellLot(game.state, lotId);
  if (!r.ok) return toast(r.error, 'bad');
  const d = r.pnl ? (r.pnl.delta >= 0 ? `+${Math.round(r.pnl.delta).toLocaleString()}` : `${Math.round(r.pnl.delta).toLocaleString()}`) : '';
  toast(`Sold for ${Math.round(r.proceeds).toLocaleString()} (${d} on what you paid).`,
    r.pnl && r.pnl.delta >= 0 ? 'good' : 'warn', 4600);
  game.select(null);
  game.lotLayer.refresh();
  game.ui.render();
};

game.rentOut = (lotId) => {
  diag.trace('rent out');
  const r = A.rentOut(game.state, lotId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Let out at ${r.rent.toLocaleString()}/day, clean.`, 'good');
  game.lotLayer.refresh();
  game.ui.render();
};

game.endTenancy = (lotId) => {
  const r = A.endTenancy(game.state, lotId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Tenant settled for ${r.fee.toLocaleString()}. The building is yours again.`, 'info');
  game.ui.render();
};

game.developLot = (lotId, typeId) => {
  diag.trace('develop lot');
  const r = A.developLot(game.state, lotId, typeId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.building.name} is up and running.`, 'good');
  game.lotLayer.refresh(game.state.lots);
  game.buildingLayer.sync(game.state);
  game.select('building', r.building.id);
  game.ui.render();
};

// Placement mode is gone — property is bought, not dropped.
game.beginPlacement = () => {};
game.cancelPlacement = () => { game.ui.setPlacing(null); };

game.buyVehicle = (typeId) => {
  diag.trace('buy vehicle');
  const r = A.buyVehicle(game.state, typeId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.vehicle.name} is yours. It needs a driver.`, 'good', 3600);
  game.ui.renderRail(true);
  game.courierLayer.sync(game.state);
};

game.hireDriver = () => {
  diag.trace('hire driver');
  const r = A.hireDriver(game.state);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.driver.name} signed on for ${Math.round(r.fee).toLocaleString()}.`, 'good', 3600);
  game.ui.renderRail(true);
};

game.assignDriver = (vehicleId, driverId) => {
  const r = A.assignDriver(game.state, vehicleId, driverId);
  if (!r.ok) return toast(r.error, 'bad');
  game.ui.renderRail(true);
  game.courierLayer.sync(game.state);
};

game.sellVehicle = (id) => {
  const r = A.sellVehicle(game.state, id);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Sold for ${r.back.toLocaleString()}.`, 'info');
  if (game.state.selection?.id === id) game.select(null);
  game.ui.renderRail(true);
  game.courierLayer.sync(game.state);
};

game.upgradeCourier = (id, upgradeId) => {
  diag.trace('upgrade vehicle');
  const r = A.upgradeCourier(game.state, id, upgradeId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.upgrade.name} fitted.`, 'good', 2600);
  game.ui.render();
};

game.upgradeBuilding = (id, upgradeId) => {
  diag.trace('upgrade');
  const r = A.upgradeBuilding(game.state, id, upgradeId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.upgrade.name} installed.`, 'good', 2600);
  game.buildingLayer.sync(game.state);
  game.ui.render();
};

game.toggleBuilding = (id) => {
  A.toggleBuilding(game.state, id);
  game.buildingLayer.sync(game.state);
  game.ui.render();
};

game.sellBuilding = (id) => {
  const r = A.sellBuilding(game.state, id);
  if (!r.ok) return toast(r.error, 'bad');
  game.lotLayer.refresh(game.state.lots);
  toast(`Sold for ${r.refund.toLocaleString()} clean.`, 'info');
  game.select(null);
  game.buildingLayer.sync(game.state);
  game.routeLayer.sync(game.state);
  game.ui.render();
};

game.assignCourier = (courierId, routeId) => {
  A.assignCourier(game.state, courierId, routeId);
};

game.washWithFixer = () => {
  const r = A.washWithFixer(game.state);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`Washed ${Math.round(r.amount).toLocaleString()} — kept ${Math.round(r.clean).toLocaleString()} clean.`, 'good');
  game.ui.render();
};

game.muscleIn = (districtId) => {
  diag.trace('muscle in');
  const r = A.muscleIn(game.state, districtId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(
    r.won ? `Block's opening up. Cost you ${Math.round(r.cost).toLocaleString()}.`
          : `That went badly. Out ${Math.round(r.cost).toLocaleString()} and they still hold it.`,
    r.won ? 'good' : 'bad',
    4200
  );
  game.districtLayer.refresh();
  game.ui.render();
};

game.editRoute = (routeId, changes) => {
  diag.trace('edit route');
  const r = A.editRoute(game.state, routeId, changes, async (route) => {
    const from = buildingById(game.state, route.fromId);
    const to = route.toType === 'district'
      ? districtById(game.state, route.toId)?.center
      : buildingById(game.state, route.toId)?.latlng;
    if (!from || !to) return;
    const res = await fetchRoute(from.latlng, to);
    route.points = res.points; route.km = res.km; route.driveMinutes = res.driveMinutes; route.realRoad = res.real;
    game.routeLayer.sync(game.state);
    game.ui.renderRail(true);
  });
  if (!r.ok) return toast(r.error, 'bad');
  if (r.rerouted) toast('Route changed — re-plotting the drive.', 'info');
  game.routeLayer.sync(game.state);
};

// --- Admin (testing only) ---------------------------------------------------

game.adminCash = (amount) => {
  A.adminGrant(game.state, amount);
  game.ui.render();
  toast(`Added ${amount.toLocaleString()} clean.`, 'info');
};
game.adminUnlock = () => {
  const r = A.adminUnlockAll(game.state);
  game.ui.render();
  toast(r.on ? 'Everything unlocked.' : 'Unlocks back to normal.', 'info');
};
game.adminCool = () => { A.adminCoolOff(game.state); game.ui.render(); toast('Heat cleared.', 'info'); };
game.adminBlock = (id) => { A.adminBuyBlock(game.state, id); game.districtLayer.refresh(); game.ui.render(); toast('Block taken.', 'info'); };
game.adminSkipDay = () => {
  stepSim(game.state, 24, {});
  game.ui.render();
  toast('Skipped a day.', 'info');
};
game.copyDiagnostics = async () => {
  const text = diag.report();
  try {
    await navigator.clipboard.writeText(text);
    toast('Diagnostics copied — paste it in a message.', 'good', 4000);
  } catch {
    // Clipboard is blocked outside a secure context or without permission.
    console.log(text);
    toast('Clipboard blocked. The report is in the browser console.', 'warn', 5000);
  }
};

game.adminWipe = () => {
  // Stop the autosave first, or it writes the old state straight back.
  game.saveDisabled = true;
  clearSave();
  toast('Save wiped and autosave paused. Reload to start fresh.', 'warn', 6000);
};

game.toggleSelling = (id) => {
  const b = buildingById(game.state, id);
  if (!b) return;
  b.selling = b.selling === false;
  toast(b.selling ? 'Now serving the block.' : 'Holding stock only.', 'info', 2600);
  game.ui.render();
};

game.removeRoute = (id) => {
  A.removeRoute(game.state, id);
  game.routeLayer.sync(game.state);
  game.ui.renderRail();
};

game.createRouteFromDraft = async (draft) => {
  diag.trace('create route');
  if (!draft.fromId) return toast('Pick where the product is coming from.', 'bad');
  if (!draft.toKey) return toast('Pick a drop-off.', 'bad');
  const [toType, toId] = draft.toKey.split(':');

  const spec = { fromId: draft.fromId, toType, toId, cargo: draft.cargo, product: draft.product };
  const r = await A.addRoute(game.state, spec, () => {
    game.routeLayer.sync(game.state);
    game.ui.renderRail();
  });
  if (!r.ok) return toast(r.error, 'bad');
  toast('Route open. Put a courier on it in the Fleet tab.', 'good', 4200);
  game.routeLayer.sync(game.state);
  game.ui.renderRail();
};

// --- Keys -------------------------------------------------------------------

function wireKeys() {
  document.addEventListener('keydown', (e) => {
    if (isEditing()) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        game.setSpeed(game.state.speedIndex === 0 ? 1 : 0);
        break;
      case '1': game.setSpeed(1); break;
      case '2': game.setSpeed(2); break;
      case '3': game.setSpeed(3); break;
      case '4': game.setSpeed(4); break;
      case '5': game.setSpeed(5); break;
      case 's': case 'S': game.save(); break;
      case '?': game.toggleHelp(document.getElementById('helpModal').hidden); break;
      case 'Escape':
        if (game.placing) game.cancelPlacement();
        else if (!document.getElementById('helpModal').hidden) game.toggleHelp(false);
        else game.select(null);
        break;
      default: break;
    }
  });
}

// Expose for debugging from the console.
window.plugsim = game;
window.plugsimDiag = diag;
