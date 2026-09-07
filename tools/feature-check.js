// End-to-end feature check, run against a live game in the browser.
//
//   tools/feature-check.sh
//
// The headless harnesses prove the simulation and the panel markup; this proves
// the actual wiring — that clicking a thing does the thing, in a real session
// with real OSM data.

(function () {
  const g = window.plugsim;
  const out = [];
  let pass = 0, fail = 0;

  const ok = (name, cond, detail) => {
    out.push((cond ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
    cond ? pass++ : fail++;
    return cond;
  };
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const packs = (b) => Object.values(b.packs).reduce((a, v) => a + v, 0);

  if (!g || !g.state) return 'No game running — start one first.';
  const s = g.state;

  out.push('=== world ===');
  ok('city resolved', !!s.cityName && !/^\d+$/.test(s.cityName), s.cityName);
  ok('country known (drives regional demand)', !!s.countryCode, s.countryCode || 'none');
  ok('districts generated', s.districts.length === 37, s.districts.length + ' blocks');
  ok('real neighbourhood names', s.districts.filter((d) => d.realName).length > 5,
    s.districts.filter((d) => d.realName).length + ' of 37 named from OSM');
  ok('buildings surveyed', s.lots.length > 100, s.lots.length + ' on the market');
  ok('rival crews seated', s.crews.length >= 2,
    s.crews.map((c) => c.name).join(', '));
  ok('some blocks are contested', s.districts.some((d) => d.rivalControl > 0.05),
    s.districts.filter((d) => d.rivalControl > 0.05).length + ' held');

  out.push('');
  out.push('=== property ===');
  s.cash.clean = Math.max(s.cash.clean, 250000);
  const forSale = s.lots.filter((l) => !l.owned);
  // Car parks are property too, but they only take a depot — keep them out of
  // the premises picks below.
  const premises = forSale.filter((l) => l.kind !== 'parking');
  const tiny = forSale.filter((l) => l.areaM2 < 30).length;
  ok('a range of sizes exists', forSale.length > 50,
    Math.round(Math.min(...forSale.map((l) => l.areaM2))) + '–' +
    Math.round(Math.max(...forSale.map((l) => l.areaM2))) + ' m², ' + tiny + ' tiny');
  ok('prices vary with size and block',
    new Set(forSale.slice(0, 40).map((l) => l.price)).size > 10);

  const plot = premises.filter((l) => l.areaM2 > 120 && l.areaM2 < 400)
    .sort((a, b) => a.price - b.price)[0];
  const before = s.cash.clean;
  const bought = g.buyLot(plot.id);
  ok('buying a building works', plot.owned === true,
    plot.name + ' for ' + money(plot.price));
  ok('it charges clean money', Math.abs((before - s.cash.clean) - plot.price) < 1);
  ok('what you paid is remembered', plot.paidPrice === plot.price);

  out.push('');
  out.push('=== operations ===');
  g.developLot(plot.id, 'grow_house');
  const growB = s.buildings.find((b) => b.lotId === plot.id);
  ok('fitting out a building works', !!growB, growB && growB.name);
  ok('output scales to the floorplate', growB && growB.scale > 0 && growB.scale < 3.3,
    growB && ('×' + growB.scale.toFixed(2) + ' out, ×' + growB.capScale.toFixed(2) + ' store'));

  // On a re-run the session may already have one; either way there must be a
  // second operation to route to.
  const labLot = s.lots.filter((l) => !l.owned && l.kind !== 'parking' && l.areaM2 > 140)
    .sort((a, b) => a.price - b.price)[0];
  if (labLot) { g.buyLot(labLot.id); g.developLot(labLot.id, 'lab'); }
  const labB = (labLot && s.buildings.find((b) => b.lotId === labLot.id))
    || s.buildings.find((b) => b.kind === 'lab');
  ok('a second operation opens', !!labB, labB && labB.name);

  const upBefore = s.cash.clean;
  const yieldBefore = growB.scale;
  g.upgradeBuilding(growB.id, 'lights');
  ok('upgrades install', (growB.upgrades || []).includes('lights'),
    'level ' + growB.level + ', paid ' + money(upBefore - s.cash.clean));
  ok('upgrades charge clean money', s.cash.clean < upBefore);

  out.push('');
  out.push('=== progression ===');
  // The build menu is the honest test: a gated operation should be offered as
  // locked, with a reason, until the requirements are met.
  const wasUnlocked = s.adminUnlockAll;
  s.adminUnlockAll = false;
  const gateLot = s.lots.find((l) => l.kind !== 'parking' && l.owned && !l.buildingId && !l.rented)
    || s.lots.find((l) => l.kind !== 'parking' && !l.owned);
  g.select('lot', gateLot.id);
  g.ui.goTab('build');
  const buildHtml = document.getElementById('railBody').innerHTML;
  ok('gated operations are shown but locked',
    /Machine Shop|Pill Press|Hash Press/.test(buildHtml) && /more propert|more banked/.test(buildHtml),
    'progression gates visible in the build menu');
  s.adminUnlockAll = wasUnlocked;

  out.push('');
  out.push('=== logistics ===');
  const target = s.districts.slice().sort((a, b) => b.demandPerHour.weed - a.demandPerHour.weed)[0];
  window.__featureTarget = target.id;
  g.createRouteFromDraft({ fromId: growB.id, toKey: 'building:' + labB.id, cargo: 'raw', product: 'any' });
  g.createRouteFromDraft({ fromId: labB.id, toKey: 'district:' + target.id, cargo: 'packs', product: 'any' });
  // Nothing moves without somewhere to keep it — that's the point of a depot.
  // Only meaningful on a fresh session; a re-run already has a yard.
  const hadDepot = s.buildings.some((b) => b.kind === 'depot');
  if (!hadDepot) {
    g.buyVehicle('scooter');
    ok('a vehicle is refused with no depot', s.couriers.length === 0,
      'nothing bought without somewhere to keep it');
  } else {
    out.push('  skip  a vehicle is refused with no depot (session already has one)');
  }

  const carParks = s.lots.filter((l) => l.kind === 'parking' && !l.owned);
  ok('real car parks came back from the map', carParks.length > 0,
    carParks.length + ' on the map, ' +
    (carParks[0] ? carParks[0].spaces + ' spaces at the first' : ''));

  const freePark = carParks.filter((l) => !l.buildingId).sort((a, b) => a.price - b.price)[0];
  if (freePark) {
    g.buyLot(freePark.id);

    // Owned and still empty: this is where the build menu should offer a depot
    // and nothing else, because a car park is no use as premises.
    g.select('lot', freePark.id);
    g.ui.goTab('build');
    // Only the develop buttons count — the tab also lists property you own.
    const offered = Array.from(
      document.querySelectorAll('#railBody [data-action="develop"][data-id="' + freePark.id + '"]')
    ).map((b) => b.dataset.type);
    ok('a car park only offers a depot',
      offered.length === 1 && offered[0] === 'depot',
      'offers: ' + (offered.join(', ') || 'nothing'));

    g.developLot(freePark.id, 'grow_house');
    ok('premises are refused on a car park',
      !s.buildings.some((b) => b.lotId === freePark.id && b.kind === 'grow_house'));

    g.developLot(freePark.id, 'depot');
    const depot = s.buildings.find((b) => b.lotId === freePark.id);
    ok('a depot opens on a car park', !!depot && depot.kind === 'depot',
      depot && (freePark.spaces + ' bays for ' + money(freePark.price)));
  }

  g.buyVehicle('scooter');
  g.buyVehicle('scooter');
  ok('vehicles can be bought once there are bays', s.couriers.length >= 2,
    s.couriers.length + ' in the yard');
  ok('parked vehicles sit in their own bay',
    s.couriers.length < 2 || s.couriers[0].parkSlot !== s.couriers[1].parkSlot,
    'slots ' + s.couriers.map((c) => c.parkSlot).join(', '));

  out.push('');
  out.push('=== market ===');
  g.ui.goTab('market');
  const marketHtml = document.getElementById('railBody').innerHTML;
  ok('market tab lists every product',
    ['Cannabis', 'Psilocybin', 'Hash', 'Pills', 'Firearms'].every((n) => marketHtml.includes(n)));
  ok('market shows a price per pack', /\/pack/.test(marketHtml));
  ok('price history is recording', Object.keys(s.priceHistory || {}).length > 0,
    Object.entries(s.priceHistory || {}).map(([k, v]) => k + '=' + v.length).join(' '));
  ok('blocks show demand', target.demandPerHour.weed > 0,
    target.name + ' takes ' + target.demandPerHour.weed.toFixed(1) + ' packs/h');

  out.push('');
  out.push('=== rent and resale ===');
  const rentLot = s.lots.filter((l) => !l.owned && l.kind !== 'parking')
    .sort((a, b) => a.price - b.price)[0];
  g.buyLot(rentLot.id);
  const r = g.rentOut(rentLot.id);
  ok('a building can be let', rentLot.rented === true);
  const sellLot2 = s.lots.filter((l) => !l.owned && l.kind !== 'parking')
    .sort((a, b) => a.price - b.price)[0];
  g.buyLot(sellLot2.id);
  const cashBeforeSale = s.cash.clean;
  g.sellLot(sellLot2.id);
  ok('a building can be sold back', sellLot2.owned === false,
    'got ' + money(s.cash.clean - cashBeforeSale) + ' back');

  out.push('');
  out.push('=== ui ===');
  const tabs = ['build', 'market', 'blocks', 'fleet', 'routes', 'ledger', 'admin'];
  let tabErrors = 0;
  for (const t of tabs) {
    try { g.ui.goTab(t); if (!document.getElementById('railBody').innerHTML.length) tabErrors++; }
    catch (e) { tabErrors++; out.push('       tab ' + t + ' threw: ' + e.message); }
  }
  ok('every tab renders', tabErrors === 0, tabs.length + ' tabs');
  let panelErrors = 0;
  try {
    g.select('lot', s.lots.find((l) => !l.owned).id);
    g.select('lot', rentLot.id);
    g.select('building', growB.id);
    g.select('district', target.id);
    if (s.couriers.length) g.select('courier', s.couriers[0].id);
    g.select(null);
  } catch (e) { panelErrors++; out.push('       panel threw: ' + e.message); }
  ok('every inspector panel renders', panelErrors === 0);
  ok('map is interactive', g.map.getZoom() > 0, 'zoom ' + g.map.getZoom());

  out.push('');
  out.push('=== diagnostics ===');
  const d = window.plugsimDiag.summary();
  ok('diagnostics recording', d.events > 0, d.events + ' events, ' + d.faults + ' faults');

  out.push('');
  out.push(fail ? fail + ' FAILURE(S), ' + pass + ' passed'
                : 'all ' + pass + ' feature checks passed');
  return out.join('\n');
})()
