// Where other operations come from.
//
// Right now they're simulated locally. Eventually they should be other people's
// real accounts. Everything the game asks about other operations goes through
// this adapter, so swapping the source is one object rather than a rewrite.
//
// The interface is deliberately small and async, because a real one will be
// over the network and everything that calls it has to already cope with that.

/**
 * Operations simulated on this machine. This is what runs today, and it is a
 * complete implementation of the interface rather than a placeholder — the
 * game genuinely does not know the difference.
 */
export class LocalAdapter {
  constructor(state) {
    this.state = state;
    this.kind = 'local';
    this.label = 'Simulated operations';
  }

  async list() {
    return this.state.aiDisabled ? [] : (this.state.players || []);
  }

  async byId(id) {
    return (this.state.players || []).find((p) => p.id === id) || null;
  }

  /** Nothing to push: they live in this save. */
  async publish() { return { ok: true, local: true }; }

  /** Nothing to pull either — `stepPlayers` already moved them this tick. */
  async refresh() { return { ok: true, local: true }; }

  isLive() { return false; }
}

/**
 * Real accounts over a REST backend.
 *
 * This is written against the shape both Supabase and Firebase expose from a
 * static page — a URL, a public anon key, and row-level rules doing the actual
 * security. It is not wired up because it needs a project that only the account
 * holder can create; `configure()` is the whole setup once there is one.
 *
 * Deliberately unused rather than deleted: the seam is the point, and this
 * documents exactly what a backend has to answer.
 */
export class RestAdapter {
  constructor({ url, key, city }) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.city = city;
    this.kind = 'rest';
    this.label = 'Live operations';
    this.cache = [];
    this.lastFetch = 0;
  }

  headers() {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' };
  }

  /**
   * Everyone else playing this city. Cached for a minute, because a leaderboard
   * does not need to be live to the second and the free tiers meter requests.
   */
  async list() {
    if (Date.now() - this.lastFetch < 60000) return this.cache;
    try {
      const res = await fetch(
        `${this.url}/rest/v1/operations?city=eq.${encodeURIComponent(this.city)}&select=*`,
        { headers: this.headers() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.cache = await res.json();
      this.lastFetch = Date.now();
    } catch (err) {
      // A backend that's down must not take the game with it.
      console.warn('[net] could not reach other operations', err);
    }
    return this.cache;
  }

  async byId(id) {
    return (await this.list()).find((p) => p.id === id) || null;
  }

  /** Put your own row up, so you appear on everyone else's board. */
  async publish(row) {
    try {
      const res = await fetch(`${this.url}/rest/v1/operations`, {
        method: 'POST',
        headers: { ...this.headers(), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(row),
      });
      return { ok: res.ok };
    } catch (err) {
      console.warn('[net] could not publish', err);
      return { ok: false, error: String(err) };
    }
  }

  async refresh() {
    this.lastFetch = 0;
    await this.list();
    return { ok: true };
  }

  isLive() { return true; }
}

/**
 * What the game talks to. Starts local; `useBackend` swaps it without anything
 * else needing to know.
 */
let adapter = null;

export function attachLocal(state) {
  adapter = new LocalAdapter(state);
  return adapter;
}

export function useBackend(config) {
  adapter = new RestAdapter(config);
  return adapter;
}

export function net() {
  return adapter;
}

/** What this build is currently talking to, for the UI to say so plainly. */
export function connection() {
  if (!adapter) return { kind: 'none', label: 'Not connected', live: false };
  return { kind: adapter.kind, label: adapter.label, live: adapter.isLive() };
}
