// Bootstrap: the start screen, the map, and the loop that drives everything.

import { GAME_MINUTES_PER_REAL_SECOND, LOTS, SPEEDS, TICK_MS } from './game/constants.js';
import { generateDistricts, districtAt } from './game/districts.js';
import { generateCrews, applyInitialControl, rehydrateCrews } from './game/crews.js';
import { fetchPlaceNames, geocode, reverseGeocode, fetchRoute, fetchBuildings } from './game/geo.js';
import { buildLots, territoryBbox, lotById } from './game/lots.js';
import {
  createState, saveGame, loadGame, hasSave, clearSave, logEvent,
  buildingById, districtById,
} from './game/state.js';
import { stepSim } from './game/sim.js';
import * as A from './game/actions.js';
import { createMap, DistrictLayer, OVERLAYS, fitToDistricts } from './map/mapView.js';
import { BuildingLayer, CourierLayer, RouteLayer, LotLayer, PlacementGhost, pingIncident } from './map/entities.js';
import { GameUI } from './ui/ui.js';
import { toast } from './ui/toast.js';
import { esc } from './ui/format.js';

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
    setStatus('Nothing found. Try a city, a postcode, or a street.', true);
    return;
  }
  setStatus('');
  resultsEl.innerHTML = results
    .map((r, i) => `<button class="result" data-i="${i}"><b>${esc(r.short)}</b><span>${esc(r.name)}</span></button>`)
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

// --- Game start -------------------------------------------------------------

async function startNewGame(origin, cityName) {
  setStatus('Reading the streets around you…');
  document.querySelectorAll('.start__actions button, .start__searchrow button')
    .forEach((b) => { b.disabled = true; });

  // One Overpass call gives real neighbourhood names for the whole play area.
  const pad = 0.035;
  let places = [];
  try {
    places = await fetchPlaceNames(origin.lat - pad, origin.lng - pad, origin.lat + pad, origin.lng + pad);
  } catch { /* handled by fallback below */ }

  if (places.length) setStatus(`Found ${places.length} real neighbourhoods. Carving up the map…`);
  else setStatus('Couldn’t reach the name service — using generated district names.');

  const districts = generateDistricts(origin, places);
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);

  setStatus('Surveying every building on these blocks…');
  const box = territoryBbox(districts);
  let lots = [];
  try {
    const ways = await fetchBuildings(box.south, box.west, box.north, box.east, LOTS.fetchCap);
    lots = buildLots(ways, districts);
  } catch (err) {
    console.warn('[start] building survey failed', err);
  }
  if (!lots.length) {
    setStatus('Couldn’t reach the building survey. Try again in a moment.', true);
    document.querySelectorAll('.start__actions button, .start__searchrow button')
      .forEach((b) => { b.disabled = false; });
    return;
  }
  setStatus(`${lots.length} buildings on the market. Opening up…`);

  const state = createState({ origin, cityName, districts, crews, lots });
  logEvent(state, `Set up shop in ${cityName}. ${districts.length} blocks in reach.`, 'good');
  logEvent(
    state,
    `${crews.map((c) => c.name).join(' and ')} already work this side of town.`,
    'info'
  );
  logEvent(state, `${lots.length} buildings are up for sale. Zoom in and pick one.`, 'info');
  bootGame(state);
}

function bootGame(state) {
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
  game.lotLayer.build(state.lots || []);
  game.ghost = new PlacementGhost(game.map);
  fitToDistricts(game.map, state.districts);

  game.map.on('click', () => game.select(null));

  // Saved routes have geometry already; only refetch ones that never resolved.
  for (const r of state.routes) {
    if (!r.points) {
      const from = buildingById(state, r.fromId);
      const to = r.toType === 'district'
        ? districtById(state, r.toId)?.center
        : buildingById(state, r.toId)?.latlng;
      if (from && to) {
        fetchRoute(from.latlng, to).then((res) => {
          r.points = res.points; r.km = res.km; r.realRoad = res.real;
        });
      }
    }
  }

  game.ui = new GameUI(game);
  game.ui.show();
  game.buildingLayer.sync(state);
  game.courierLayer.sync(state);
  game.routeLayer.sync(state);

  startLoop();
  wireKeys();
  setInterval(() => { if (game.state) saveGame(game.state); }, 60000);

  if (!state.buildings.length) {
    toast('Zoom in, click a building you like, and buy it. Press ? for the rundown.', 'info', 8000);
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
      // Don't yank a panel out from under someone mid-interaction.
      if (!isEditing()) {
        game.ui.renderInspector();
        if (game.ui.tab === 'fleet' || game.ui.tab === 'routes') game.ui.renderRail();
      }
    }
  }, TICK_MS);
}

function isEditing() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'SELECT' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
}

// --- Game API used by the UI ------------------------------------------------

game.select = (kind, id) => {
  game.state.selection = kind ? { kind, id } : null;
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

game.focusOn = (kind, id) => {
  const target = kind === 'district'
    ? districtById(game.state, id)?.center
    : buildingById(game.state, id)?.latlng;
  if (target) game.map.setView([target.lat, target.lng], Math.max(game.map.getZoom(), 15));
};

game.setSpeed = (i) => {
  game.state.speedIndex = i;
  game.ui.renderHud();
};

game.save = () => {
  if (saveGame(game.state)) toast('Saved.', 'good', 1800);
  else toast('Save failed — browser storage is full or blocked.', 'bad');
};

game.toggleHelp = (open) => {
  document.getElementById('helpModal').hidden = !open;
};

game.buyLot = (lotId) => {
  const r = A.buyLot(game.state, lotId);
  if (!r.ok) return toast(r.error, 'bad');
  toast(`${r.lot.name} is yours. Now decide what runs there.`, 'good', 4200);
  game.lotLayer.refresh(game.state.lots);
  game.ui.render();
};

game.developLot = (lotId, typeId) => {
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

game.hireCourier = (typeId) => {
  const r = A.hireCourier(game.state, typeId);
  if (!r.ok) return toast(r.error, 'bad');
  game.ui.renderRail();
  game.courierLayer.sync(game.state);
};

game.fireCourier = (id) => {
  A.fireCourier(game.state, id);
  if (game.state.selection?.id === id) game.select(null);
  game.ui.renderRail();
  game.courierLayer.sync(game.state);
};

game.upgradeBuilding = (id) => {
  const r = A.upgradeBuilding(game.state, id);
  if (!r.ok) return toast(r.error, 'bad');
  toast('Upgraded.', 'good', 1800);
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

game.removeRoute = (id) => {
  A.removeRoute(game.state, id);
  game.routeLayer.sync(game.state);
  game.ui.renderRail();
};

game.createRouteFromDraft = async (draft) => {
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
