// Session diagnostics.
//
// The player is usually on a phone, or in a different window, when something
// goes wrong — so the game records its own faults rather than relying on
// someone having a console open. Everything is kept in memory and mirrored to
// localStorage, so a hard crash or reload doesn't lose the trail.

const KEY = 'plugsim.diag.v1';
const MAX_EVENTS = 60;

const store = {
  startedAt: Date.now(),
  events: [],
  session: Math.random().toString(36).slice(2, 8),
};

let getSnapshot = () => null;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked — in-memory is still useful.
  }
}

/** Record one fault. Duplicates are counted rather than repeated. */
export function record(kind, message, extra = {}) {
  const text = String(message).slice(0, 400);
  const last = store.events[store.events.length - 1];
  if (last && last.kind === kind && last.message === text) {
    last.count = (last.count || 1) + 1;
    last.lastAt = Date.now();
    persist();
    return;
  }
  store.events.push({
    kind,
    message: text,
    at: Date.now(),
    count: 1,
    ...extra,
    state: getSnapshot(),
  });
  if (store.events.length > MAX_EVENTS) store.events.shift();
  persist();
}

/**
 * Start listening. `snapshot` is called at fault time to attach whatever game
 * state makes the report actionable.
 */
export function install(snapshot) {
  if (window.__plugsimDiag) return;
  window.__plugsimDiag = store;
  if (typeof snapshot === 'function') getSnapshot = snapshot;

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.events)) {
      // Keep the previous session's tail; it may hold the crash that ended it.
      store.events = saved.events.slice(-20).map((e) => ({ ...e, previousSession: true }));
    }
  } catch { /* nothing worth recovering */ }

  window.addEventListener('error', (e) => {
    record('error', e.message, {
      where: `${(e.filename || '').split('/').pop()}:${e.lineno || '?'}`,
      stack: e.error && e.error.stack ? String(e.error.stack).split('\n').slice(0, 4).join(' | ') : null,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    record('rejection', (r && r.message) || r, {
      stack: r && r.stack ? String(r.stack).split('\n').slice(0, 4).join(' | ') : null,
    });
  });

  const nativeError = console.error;
  console.error = (...args) => {
    record('console', args.map(String).join(' '));
    nativeError.apply(console, args);
  };

  const nativeWarn = console.warn;
  console.warn = (...args) => {
    const text = args.map(String).join(' ');
    // Network hiccups are expected and noisy; keep them but mark them apart.
    record(/failed|refused|abort/i.test(text) ? 'network' : 'warn', text);
    nativeWarn.apply(console, args);
  };

  record('info', 'session started', { ua: navigator.userAgent.slice(0, 120) });
}

/** Note something the player did, so a fault has context leading up to it. */
export function trace(what) {
  const last = store.events[store.events.length - 1];
  if (last && last.kind === 'action' && last.message === what) {
    last.count = (last.count || 1) + 1;
    return;
  }
  store.events.push({ kind: 'action', message: String(what).slice(0, 120), at: Date.now(), count: 1 });
  if (store.events.length > MAX_EVENTS) store.events.shift();
}

export function summary() {
  const faults = store.events.filter((e) => ['error', 'rejection', 'console'].includes(e.kind));
  return {
    session: store.session,
    minutesOpen: Math.round((Date.now() - store.startedAt) / 60000),
    faults: faults.length,
    events: store.events.length,
  };
}

/** A plain-text report, for pasting into a message. */
export function report() {
  const s = summary();
  const lines = [
    `plugsim diagnostics · session ${s.session} · open ${s.minutesOpen}m · ${s.faults} fault(s)`,
    `ua: ${navigator.userAgent.slice(0, 110)}`,
    `viewport: ${window.innerWidth}x${window.innerHeight}`,
    '',
  ];
  for (const e of store.events) {
    const when = new Date(e.at).toLocaleTimeString();
    const tag = e.previousSession ? '(prev) ' : '';
    const times = e.count > 1 ? ` x${e.count}` : '';
    lines.push(`${when} ${tag}[${e.kind}]${times} ${e.message}`);
    if (e.where) lines.push(`         at ${e.where}`);
    if (e.stack) lines.push(`         ${e.stack}`);
    if (e.state) lines.push(`         ${e.state}`);
  }
  return lines.join('\n');
}

export function clear() {
  store.events = [];
  persist();
}

export { store as diagnosticsStore };
