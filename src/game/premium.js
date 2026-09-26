// plugsim.premium.v1 — mirrors dev.js's shape on purpose: its own module, its
// own localStorage key, independent of the save system (state.js's SAVE_KEY /
// SAVE_VERSION / migrate()). A save reset or a version bump must never revoke
// a purchase.
//
// Be honest about what this is, same as dev.js: there is no backend, so
// nothing here is unspoofable. Gumroad's license check is the one real thing
// a static site can do without a server of its own — it verifies against an
// actual sale — but the flag it sets is still just localStorage. Someone
// determined can set it themselves in devtools. That's accepted, not solved.

const PREMIUM_KEY = 'plugsim.premium.v1';

// Public identifier, not a secret — the same permalink anyone sees on the
// Gumroad product page.
const GUMROAD_PRODUCT_PERMALINK = 'plugsim-premium';

export function premiumOn() {
  try {
    return localStorage.getItem(PREMIUM_KEY) === '1';
  } catch {
    // Private window, or storage blocked. Assume it is not you.
    return false;
  }
}

/** Called from the "Go premium" modal when the player pastes their Gumroad license key. */
export async function redeemLicenseKey(key) {
  const trimmed = (key || '').trim();
  if (!trimmed) return false;
  try {
    const body = new URLSearchParams({
      product_permalink: GUMROAD_PRODUCT_PERMALINK,
      license_key: trimmed,
    });
    const res = await fetch('https://api.gumroad.com/v2/licenses/verify', { method: 'POST', body });
    const data = await res.json();
    // `success: true` only means "this key exists for this product" — Gumroad
    // still returns it for a purchase that was later refunded or charged
    // back. Check the purchase record itself, or a refunded buyer keeps the
    // unlock forever.
    const p = data && data.purchase;
    if (data && data.success && p && !p.refunded && !p.chargebacked && !(p.disputed && !p.dispute_won)) {
      localStorage.setItem(PREMIUM_KEY, '1');
      return true;
    }
    return false;
  } catch {
    // Offline, or Gumroad unreachable — don't unlock on a guess.
    return false;
  }
}
