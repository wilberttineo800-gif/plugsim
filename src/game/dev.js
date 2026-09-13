// Whether the testing tools exist for whoever is looking.
//
// The game is a public link, so everyone it is shared with gets the same
// JavaScript — which meant the admin tab, and the free-money button on it, was
// sitting on the page for every visitor.
//
// Be honest about what this is: it HIDES the tools, it does not secure them.
// Everything runs client-side, so anyone determined can set the flag themselves
// or edit state from a console. That is fine. The point is that somebody you
// send the link to does not casually find a "give me $10m" button — not that
// the game is tamper-proof, which a static page can never be.
//
// Its own module rather than living in main.js, because the UI needs it too and
// importing main.js from the UI would be a cycle.

const DEV_KEY = 'plugsim.dev.v1';

/** Turn it on for yourself once with ?dev=1; it sticks on this device. */
export function devToolsOn() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('dev') === '1') localStorage.setItem(DEV_KEY, '1');
    if (params.get('dev') === '0') localStorage.removeItem(DEV_KEY);
    return localStorage.getItem(DEV_KEY) === '1';
  } catch (err) {
    // Private window, or storage blocked. Assume it is not you.
    return false;
  }
}
