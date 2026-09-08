// Evaluate main.js against a minimal DOM shim, so a module-level fault (a
// temporal dead zone error, a bad import, a syntax slip) is caught without a
// browser. This exists because one such fault took out the whole game and the
// shim was too thin to see it.
//   jsc -m tools/loadcheck.js

// Minimal DOM/browser shim — enough for main.js's top-level code to evaluate.
const listeners = [];
const mkEl = (id) => ({
  id, hidden: false, textContent: '', innerHTML: '', value: '',
  dataset: {}, style: {}, children: [],
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  addEventListener: (ev) => listeners.push(`${id}:${ev}`),
  querySelectorAll: () => [], querySelector: () => null,
  appendChild(){}, remove(){}, closest: () => null, focus(){},
});
const cache = new Map();
globalThis.document = {
  getElementById: (id) => { if (!cache.has(id)) cache.set(id, mkEl(id)); return cache.get(id); },
  querySelectorAll: () => [],
  addEventListener: (ev) => listeners.push(`document:${ev}`),
  createElement: (t) => mkEl(t),
  get activeElement() { return null; },
};
globalThis.window = globalThis;
globalThis.addEventListener = (ev) => listeners.push('window:' + ev);
globalThis.console = globalThis.console || { log(){}, warn(){}, error(){}, info(){} };
if (!globalThis.console.error) globalThis.console.error = () => {};
if (!globalThis.console.warn) globalThis.console.warn = () => {};
globalThis.navigator = { userAgent: 'jsc-shim', clipboard: { writeText: () => Promise.resolve() }, geolocation: { getCurrentPosition(){} } };
globalThis.localStorage = {
  _d: {}, getItem(k){ return this._d[k] ?? null; },
  setItem(k, v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; },
};
globalThis.matchMedia = () => ({
  matches: false, media: '', addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
globalThis.performance = { now: () => Date.now() };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 0;
// Leaflet, shimmed just far enough to run bootGame. This exists because a
// reference error inside bootGame — an import that was never added — cannot be
// seen by evaluating the module alone, and has shipped twice.
function leafletStub(extra = {}) {
  const self = {
    addTo() { return self; },
    on() { return self; },
    off() { return self; },
    remove() { return self; },
    setLatLng() { return self; },
    setIcon() { return self; },
    setStyle() { return self; },
    setLatLngs() { return self; },
    bindTooltip() { return self; },
    closeTooltip() { return self; },
    openTooltip() { return self; },
    addLayer() { return self; },
    removeLayer() { return self; },
    clearLayers() { return self; },
    getLatLng() { return { lat: 0, lng: 0 }; },
    getElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }),
    getTooltip: () => null,
    setOpacity() { return self; },
    setZIndexOffset() { return self; },
    bringToFront() { return self; },
    redraw() { return self; },
    ...extra,
  };
  return self;
}

const stubMap = leafletStub({
  getZoom: () => 14,
  setZoom: () => stubMap,
  setView: () => stubMap,
  fitBounds: () => stubMap,
  getCenter: () => ({ lat: 0, lng: 0 }),
  getBounds: () => ({
    contains: () => true,
    pad: () => ({ contains: () => true, getSouth: () => 0, getWest: () => 0, getNorth: () => 1, getEast: () => 1 }),
    getSouth: () => 0, getWest: () => 0, getNorth: () => 1, getEast: () => 1,
  }),
  distance: () => 0,
  invalidateSize: () => stubMap,
  createPane: () => ({ style: {} }),
  getPane: () => ({ style: {} }),
  addControl: () => stubMap,
  removeControl: () => stubMap,
});

globalThis.L = {
  map: () => stubMap,
  layerGroup: () => leafletStub(),
  polygon: () => leafletStub(),
  polyline: () => leafletStub(),
  marker: () => leafletStub(),
  tileLayer: () => leafletStub(),
  canvas: () => leafletStub(),
  divIcon: (o) => o,
  latLngBounds: () => ({ extend() { return this; }, isValid: () => true, pad() { return this; } }),
  control: Object.assign(() => leafletStub(), {
    scale: () => leafletStub(),
    attribution: () => leafletStub(),
    zoom: () => leafletStub(),
  }),
  DomEvent: { stopPropagation() {}, preventDefault() {}, disableClickPropagation() {} },
  Control: class { constructor() {} onAdd() { return { style: {} }; } addTo() { return this; } },
};
globalThis.fetch = () => Promise.reject(new Error('no network in check'));
globalThis.AbortController = class { constructor(){ this.signal = null; } abort(){} };

import('../src/main.js').then(async () => {
  print('main.js evaluated OK');
  print('listeners wired: ' + listeners.length);
  const api = Object.keys(globalThis.plugsim).filter(k => typeof globalThis.plugsim[k] === 'function');
  print('game API: ' + api.sort().join(', '));

  // Now actually boot a game. Evaluating the module proves the imports resolve;
  // only running bootGame proves the names it uses were imported at all.
  const { generateDistricts } = await import('../src/game/districts.js');
  const { generateCrews, applyInitialControl } = await import('../src/game/crews.js');
  const { createState } = await import('../src/game/state.js');
  const { syntheticLots } = await import('./fixtures.js');

  const origin = { lat: 41.5581, lng: -73.0515 };
  const districts = generateDistricts(origin, [], 'us');
  const crews = generateCrews(districts, origin);
  applyInitialControl(districts, crews);
  const state = createState({
    origin, cityName: 'Loadcheck', countryCode: 'us', districts, crews,
    lots: syntheticLots(districts, 6),
  });

  try {
    globalThis.plugsim.__boot(state);
    print('bootGame ran OK');
  } catch (e) {
    print('BOOTGAME FAILED: ' + e);
    print(e && e.stack ? String(e.stack).split('\n').slice(0, 5).join('\n') : '');
    return;
  }

  // And render every tab and panel through the real UI, which is where an
  // unimported helper or a bad template shows up.
  let broke = 0;
  for (const tab of ['build', 'market', 'blocks', 'fleet', 'routes', 'lab', 'ledger', 'admin']) {
    try { globalThis.plugsim.ui.goTab(tab); }
    catch (e) { broke++; print('  tab ' + tab + ' threw: ' + e); }
  }
  print(broke ? broke + ' TAB(S) BROKEN' : 'every tab renders through the real UI');
}).catch((e) => {
  print('MAIN.JS FAILED: ' + e);
  print(e && e.stack ? e.stack : '');
});
