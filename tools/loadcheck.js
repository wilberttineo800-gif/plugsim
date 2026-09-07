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
globalThis.performance = { now: () => Date.now() };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.L = {};
globalThis.fetch = () => Promise.reject(new Error('no network in check'));
globalThis.AbortController = class { constructor(){ this.signal = null; } abort(){} };

import('../src/main.js').then(() => {
  print('main.js evaluated OK');
  print('listeners wired: ' + listeners.length);
  print('game API: ' + Object.keys(globalThis.plugsim).filter(k => typeof globalThis.plugsim[k] === 'function').sort().join(', '));
}).catch((e) => {
  print('MAIN.JS FAILED: ' + e);
  print(e && e.stack ? e.stack : '');
});
