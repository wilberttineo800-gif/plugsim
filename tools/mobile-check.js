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

// Anything the code hides by attribute, against what CSS actually does.
// A class setting `display` outruns [hidden]'s display:none on specificity, so
// an element can report itself hidden and stay on screen — which is how the
// panel menu shipped never collapsing, and how it passed a check that asked
// the property instead of the computed style.
{
  const ids = ['rail', 'inspector', 'railTabs', 'startOverlay', 'helpModal',
               'loading', 'ticker', 'mobileNav'];
  const bad = [];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const was = el.hidden;
    el.hidden = true;
    if (getComputedStyle(el).display !== 'none') bad.push(id);
    el.hidden = was;
  }
  if (bad.length) { failures++; out.push(`HIDDEN-NO-OP  ${bad.join(', ')}`); }
  else out.push('ok       [hidden] actually hides');
}
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
  if (!s.couriers.length) {
    // A vehicle needs a bay now, so the panel has something to render.
    const park = s.lots.filter((l) => l.kind === 'parking' && !l.owned)
      .sort((a, b) => a.price - b.price)[0];
    if (park) { g.buyLot(park.id); g.developLot(park.id, 'depot'); }
    g.buyVehicle('bike');
  }

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
  for (const tab of ['build', 'market', 'blocks', 'fleet', 'routes', 'lab', 'cities', 'ledger', 'admin']) {
    g.ui.goTab(tab);
    record(`tab ${tab}`, rail);
  }

  // The panel has to be able to get out of the way.
  //
  // It used to run the full height of the window whatever was in it, so a
  // nearly empty panel still put a tall dark column over the map and there was
  // no way on a desktop to close it at all. Rolling it up has to leave the
  // title bar and nothing else — and a class setting `display` outranks
  // [hidden] on specificity, which is exactly how the tab menu once reported
  // itself closed and stayed on screen.
  out.push('');
  const min = document.getElementById('railMin');
  const railBody = document.getElementById('railBody');
  if (!min) { failures++; out.push('MISSING  the collapse control'); }
  else {
    const wasMin = rail.classList.contains('is-min');
    if (wasMin) min.click();
    const tall = rail.getBoundingClientRect().height;
    min.click();
    const short = rail.getBoundingClientRect().height;
    const gone = getComputedStyle(railBody).display === 'none';
    if (!gone || short >= tall) {
      failures++;
      out.push(`ROLLUP   the panel does not collapse  ${Math.round(tall)} -> ${Math.round(short)}px`
        + (gone ? '' : ', body still displayed'));
    } else {
      out.push(`ok       the panel rolls up  ${Math.round(tall)} -> ${Math.round(short)}px`);
    }
    min.click();
    if (rail.getBoundingClientRect().height <= short) {
      failures++;
      out.push('ROLLUP   and does not come back');
    } else {
      out.push('ok       and comes back');
    }
    if (!wasMin && rail.classList.contains('is-min')) min.click();
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
