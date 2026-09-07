// Mobile layout regression check. Run against a live game in Safari:
//
//   tools/mobile-check.sh
//
// The headless harnesses can't catch layout problems — they have no layout
// engine — so this drives the real page at phone width, opens every panel, and
// fails on anything that overflows the viewport. A <select> sized by its widest
// option is the classic offender.

const W = window.innerWidth;
const g = window.plugsim;
const out = [];
let failures = 0;

function record(label, el) {
  if (!el) { out.push(`MISSING  ${label}`); failures++; return; }
  const wide = Array.from(el.querySelectorAll('*'))
    .filter((n) => n.getBoundingClientRect().right > W + 1);
  const scrolls = el.scrollWidth > el.clientWidth + 1;
  if (scrolls || wide.length) {
    failures++;
    out.push(`OVERFLOW ${label}  scrollW=${el.scrollWidth}/${el.clientWidth}` +
      (wide.length ? `  wideNodes=${wide.length}` : ''));
  } else {
    out.push(`ok       ${label}`);
  }
}

function chrome(label, el) {
  if (!el) { out.push(`MISSING  ${label}`); failures++; return; }
  const r = el.getBoundingClientRect();
  if (r.right > W + 1 || r.left < -1) {
    failures++;
    out.push(`OVERFLOW ${label}  right=${Math.round(r.right)} of ${W}`);
  } else {
    out.push(`ok       ${label}`);
  }
}

if (!g || !g.state) {
  out.push('No game running — start one first, then re-run.');
} else {
  const s = g.state;
  out.push(`viewport ${W}x${window.innerHeight}`);
  out.push(`phone layout active: ${window.matchMedia('(max-width: 780px)').matches}`);
  out.push('');

  chrome('hud', document.getElementById('hud'));
  chrome('speed buttons', document.getElementById('speedGroup'));
  chrome('hud tools', document.querySelector('.hud__tools'));
  chrome('bottom nav', document.getElementById('mobileNav'));

  // Put the world into a state where every panel has real content to render.
  s.cash.clean = Math.max(s.cash.clean, 120000);
  const spare = s.lots.filter((l) => !l.owned && l.areaM2 > 140 && l.areaM2 < 500)
    .sort((a, b) => a.price - b.price);
  if (spare.length >= 3) {
    if (!s.buildings.length) {
      g.buyLot(spare[0].id);
      g.developLot(spare[0].id, 'grow_house');
      g.upgradeBuilding(s.buildings[0].id, 'lights');
    }
    if (!s.lots.some((l) => l.rented)) { g.buyLot(spare[1].id); g.rentOut(spare[1].id); }
    if (!s.lots.some((l) => l.owned && !l.buildingId && !l.rented)) g.buyLot(spare[2].id);
  }
  if (!s.couriers.length) g.hireCourier('bike');

  const body = document.getElementById('inspectorBody');
  const panels = [
    ['lot for sale', () => s.lots.find((l) => !l.owned)],
    ['lot owned empty', () => s.lots.find((l) => l.owned && !l.buildingId && !l.rented)],
    ['lot rented', () => s.lots.find((l) => l.rented)],
    ['lot developed', () => s.lots.find((l) => l.buildingId)],
  ];
  out.push('');
  for (const [label, pick] of panels) {
    const lot = pick();
    if (!lot) { out.push(`skip     ${label} (none in this game)`); continue; }
    g.select('lot', lot.id);
    record(label, body);
  }
  if (s.buildings.length) { g.select('building', s.buildings[0].id); record('building + upgrades', body); }
  g.select('district', s.districts[Math.floor(s.districts.length / 2)].id);
  record('district', body);
  if (s.couriers.length) { g.select('courier', s.couriers[0].id); record('courier', body); }

  out.push('');
  g.ui.openSheet('rail');
  const rail = document.getElementById('railBody');
  for (const tab of ['build', 'market', 'blocks', 'fleet', 'routes', 'ledger', 'admin']) {
    g.ui.goTab(tab);
    record(`tab ${tab}`, rail);
  }

  out.push('');
  if (document.body.scrollWidth > W + 1) {
    failures++;
    out.push(`OVERFLOW page  scrollW=${document.body.scrollWidth} of ${W}`);
  } else {
    out.push('ok       page does not scroll sideways');
  }
  out.push('');
  out.push(failures ? `${failures} LAYOUT PROBLEM(S)` : 'mobile layout clean');
}

out.join('\n');
