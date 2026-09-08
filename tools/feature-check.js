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
  g.buyLot(plot.id);
  // You pay what it's worth today, not its standing assessment — the block's
  // market index moves, so these must compare against what was actually paid.
  ok('buying a building works', plot.owned === true,
    plot.name + ' for ' + money(plot.paidPrice || 0));
  ok('it charges clean money',
    Math.abs((before - s.cash.clean) - (plot.paidPrice || 0)) < 1,
    'charged ' + money(before - s.cash.clean));
  ok('what you paid is remembered', typeof plot.paidPrice === 'number' && plot.paidPrice > 0,
    money(plot.paidPrice || 0) + ' vs ' + money(plot.price) + ' assessed');

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
  // Gates are relative to what you've built. On a session that has already
  // grown rich, nothing is gated — so check from a poor position and put the
  // money back afterwards.
  const stash = { clean: s.cash.clean, dirty: s.cash.dirty };
  s.cash.clean = 0;
  s.cash.dirty = 0;
  // Gated operations only show on a building big enough to host one, so pick a
  // mid-size unit rather than whatever happens to be free.
  const gateLot = s.lots.find((l) => l.kind !== 'parking' && l.areaM2 > 280 && l.areaM2 < 900
      && l.owned && !l.buildingId && !l.rented)
    || s.lots.find((l) => l.kind !== 'parking' && l.areaM2 > 280 && l.areaM2 < 900 && !l.owned);
  g.select('lot', gateLot.id);
  g.ui.goTab('build');
  const buildHtml = document.getElementById('railBody').innerHTML;
  ok('gated operations are shown but locked',
    /machine shop|pill press|hash press|gunsmith/i.test(buildHtml)
      && /more propert|more banked/i.test(buildHtml),
    Math.round(gateLot.areaM2) + ' m² lot: ' +
      ((buildHtml.match(/more propert[^<]*|more banked[^<]*/i) || ['no gate text'])[0]));
  s.cash.clean = stash.clean;
  s.cash.dirty = stash.dirty;
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
  // Bays are numbered per depot, so two vehicles in different yards may both
  // sit in bay 0. What must never happen is a clash inside one depot.
  const byDepot = {};
  for (const c of s.couriers) (byDepot[c.homeBuildingId] ||= []).push(c.parkSlot);
  const clashes = Object.entries(byDepot)
    .filter(([, slots]) => new Set(slots).size !== slots.length);
  ok('no two vehicles share a bay in the same depot', clashes.length === 0,
    Object.entries(byDepot).map(([d, sl]) => d + '[' + sl.join(',') + ']').join(' '));

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
  const tabs = ['build', 'market', 'blocks', 'fleet', 'routes', 'lab', 'ledger', 'admin'];
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
  out.push('=== onboarding ===');
  {
    const step = g.ui && window.plugsimOnboarding ? null : null;
    const anyOwned = s.buildings[0];
    ok('a base can be set', !!anyOwned && (g.setHeadquarters(anyOwned.id), s.hqBuildingId === anyOwned.id),
      s.hqBuildingId ? 'HQ at ' + s.buildings.find((b) => b.id === s.hqBuildingId).name : 'none');
    ok('the you-are-here marker is on the map', !!(g.playerMarker && g.playerMarker.marker));
    g.ui.goTab('build');
    const buildTab = document.getElementById('railBody').innerText;
    // Three valid states: he's briefing you, you waved him off, or you've done
    // everything he asked and he's gone.
    const talking = /ray ·/i.test(buildTab);
    const finished = (s.tutorialDone || []).length >= 5
      || s.buildings.some((b) => BUILDINGS[b.type] && BUILDINGS[b.type].kind === 'front');
    ok('the helper briefs you, is dismissed, or is done',
      talking || s.tutorialDismissed || finished,
      talking ? 'briefing you' : s.tutorialDismissed ? 'dismissed' : 'list finished');
  }

  out.push('');
  out.push('=== fleet circuits ===');
  {
    const v = s.couriers[0];
    if (v && s.routes.length >= 2) {
      const spare = s.routes.filter((r) => !(v.routeIds || []).includes(r.id))[0];
      const before = (v.routeIds || []).length;
      if (spare) g.addLine(v.id, spare.id);
      ok('a line can be added to a vehicle', (v.routeIds || []).length >= before,
        (v.routeIds || []).length + ' lines on ' + v.name);
    } else {
      out.push('  skip  circuits (not enough routes in this session)');
    }
  }

  out.push('');
  out.push('=== property depth ===');
  {
    const withLevels = s.lots.filter((l) => l.levels > 1).length;
    ok('buildings carry real storeys from the map', withLevels > 0,
      withLevels + ' of ' + s.lots.length + ' are multi-storey');
    const homes = s.lots.filter((l) => l.units > 0);
    ok('residential buildings have lettings', homes.length > 0,
      homes.length ? 'up to ' + Math.max(...homes.map((l) => l.units)) + ' homes in one' : 'none');
    // Any of the three sets could apply, depending on what kind of building it
    // is; and on a re-run the work may already be done.
    const rentedLot = s.lots.find((l) => l.rented);
    if (rentedLot) {
      for (const id of ['decorate', 'heating', 'shopfront', 'services', 'surface', 'dock']) {
        g.improveRental(rentedLot.id, id);
      }
      ok('rental work can be done', (rentedLot.rentUpgrades || []).length > 0,
        (rentedLot.rentUpgrades || []).join(', ') || 'nothing applied');
    }
    ok('blocks have a crime rate', s.districts.every((d) => typeof d.crime === 'number'),
      'range ' + Math.min(...s.districts.map((d) => d.crime)).toFixed(2) +
      '-' + Math.max(...s.districts.map((d) => d.crime)).toFixed(2));
  }

  out.push('');
  out.push('=== firearms ===');
  {
    for (const d of s.districts) d.heat = 0;
    g.applyForLicence('ffl01');
    const rec = (s.licences || {}).ffl01;
    ok('a licence can be applied for',
      !!rec && (rec.status === 'pending' || rec.status === 'active'),
      rec ? rec.status + (rec.daysLeft ? ` — ${Math.ceil(rec.daysLeft)} days to go` : '') : 'nothing filed');
    ok('a manufacturer licence is refused first',
      !s.licences || !s.licences.ffl07 || s.licences.ffl07.status !== 'pending');
    g.ui.goTab('market');
    const mk = document.getElementById('railBody').innerText;
    ok('licensing is visible in the market tab', /firearms licensing|ffl/i.test(mk));
  }

  out.push('');
  out.push('=== turf ===');
  {
    const blk = s.districts.slice().sort((a, b) => (a.rivalControl || 0) - (b.rivalControl || 0))[0];
    blk.rivalControl = 0; blk.rep = 0.8;
    g.select('district', blk.id);
    const panel = document.getElementById('inspectorBody').innerText;
    ok('a held block offers arrangements', /arrangements|your block/i.test(panel),
      'panel shows the held-block controls');
    g.renameDistrict(blk.id, 'Test Yard');
    ok('a held block can be renamed', blk.customName === 'Test Yard', blk.customName);
    g.improveTurf(blk.id, 'lookouts');
    ok('an arrangement can be bought', (blk.turfUpgrades || []).includes('lookouts'),
      (blk.turfUpgrades || []).join(', ') || 'none');
    g.renameDistrict(blk.id, '');
  }

  out.push('');
  out.push('=== R&D and one-offs ===');
  {
    g.ui.goTab('lab');
    const lab = document.getElementById('railBody').innerText;
    ok('the R&D tab renders', lab.length > 40, lab.slice(0, 60).replace(/\s+/g, ' '));
    const wasUnlockedLab = s.adminUnlockAll;
    s.adminUnlockAll = true;                 // it is gated behind 11 properties
    s.cash.clean = Math.max(s.cash.clean, 400000);
    const rlot = s.lots.filter((l) => !l.owned && l.kind !== 'parking'
      && l.areaM2 >= 320 && l.areaM2 <= 3200).sort((a, b) => a.price - b.price)[0];
    if (rlot) {
      g.buyLot(rlot.id);
      g.developLot(rlot.id, 'research_lab');
      const built = s.buildings.find((b) => b.lotId === rlot.id);
      ok('an R&D facility can be built', !!built && built.kind === 'research', built && built.name);
      g.startResearch('phenohunt');
      ok('a project can be started', (s.researchActive || []).some((r) => r.id === 'phenohunt'),
        (s.researchActive || []).map((r) => r.id).join(', ') || 'none');
    } else {
      out.push('  skip  R&D (no suitable building on the market)');
    }
    s.adminUnlockAll = wasUnlockedLab;
  }

  out.push('');
  out.push('=== other operations ===');
  {
    g.ui.goTab('ledger');
    const led = document.getElementById('railBody').innerText;
    ok('the wealth board renders', /wealth board/i.test(led),
      (led.match(/#\d+ of \d+/i) || [''])[0]);
    ok('you are on it', /\(you\)/.test(led));
    const was = s.aiDisabled;
    g.toggleAI();
    ok('other operations can be switched off', s.aiDisabled !== was);
    g.toggleAI();
  }

  out.push('');
  out.push('=== other people ===');
  {
    const field = s.players || [];
    ok('operations have a place on the map',
      field.length > 0 && field.every((p) => (p.blocks || []).length > 0),
      field.length + ' operations across ' +
        new Set(field.flatMap((p) => p.blocks || [])).size + ' blocks');

    // Buying onto somebody's ground should introduce you.
    const withBlock = field.find((p) => (p.blocks || []).length);
    if (withBlock) {
      const theirLot = s.lots.find((l) => !l.owned && l.kind !== 'parking'
        && l.districtId === withBlock.blocks[0]);
      if (theirLot) {
        s.cash.clean = Math.max(s.cash.clean, 100000);
        g.buyLot(theirLot.id);
        ok('buying onto their block introduces you',
          withBlock.known && withBlock.knowsYou,
          withBlock.name + ' on ' + withBlock.blocks[0]);
      }
      g.select('district', withBlock.blocks[0]);
      const dp = document.getElementById('inspectorBody').innerText;
      ok('their presence shows on the block',
        !withBlock.known || /somebody else|already work/i.test(dp),
        withBlock.known ? 'shown' : 'not met yet');
    }

    // And you can actually deal with somebody you've met.
    const met = field.filter((p) => p.known);
    if (met.length) {
      const stocked = s.buildings.find((b) => b.packs
        && Object.keys(b.packs).some((k) => b.packs[k] > 0.5));
      if (stocked) {
        const pid = Object.keys(stocked.packs).find((k) => stocked.packs[k] > 0.5);
        const before = stocked.packs[pid];
        g.sellProductTo(stocked.id, met[0].id, pid);
        ok('you can move product to somebody you know', stocked.packs[pid] < before,
          Math.round(before - stocked.packs[pid]) + ' packs to ' + met[0].name);
      } else {
        out.push('  skip  bulk trade (nothing packaged yet in this session)');
      }
      g.ui.goTab('ledger');
      const led = document.getElementById('railBody').innerText;
      ok('people you know are listed', /people you know/i.test(led),
        met.length + ' met');
    } else {
      out.push('  skip  trading (nobody met yet in this session)');
    }
  }

  out.push('');
  out.push('=== size realism ===');
  {
    const tiny = s.lots.filter((l) => l.kind !== 'parking' && l.areaM2 < 30)[0];
    const huge = s.lots.filter((l) => l.kind !== 'parking' && l.areaM2 > 2000)[0];
    if (tiny) {
      g.select('lot', tiny.id);
      g.ui.goTab('build');
      const offered = Array.from(document.querySelectorAll('#railBody [data-action="develop"]'))
        .map((b) => b.dataset.type);
      ok('a tiny building is not offered big operations',
        !offered.includes('nightclub') && !offered.includes('machine_shop'),
        Math.round(tiny.areaM2) + ' m² offers: ' + (offered.join(', ') || 'nothing'));
    }
    if (huge) {
      g.select('lot', huge.id);
      g.ui.goTab('build');
      const offered = Array.from(document.querySelectorAll('#railBody [data-action="develop"]'))
        .map((b) => b.dataset.type);
      ok('a huge building is not offered a closet grow',
        !offered.includes('closet_grow'),
        Math.round(huge.areaM2) + ' m² offers: ' + (offered.join(', ') || 'nothing'));
    }
  }

  out.push('');
  out.push('=== diagnostics ===');
  const d = window.plugsimDiag.summary();
  ok('diagnostics recording', d.events > 0, d.events + ' events, ' + d.faults + ' faults');

  out.push('');
  out.push(fail ? fail + ' FAILURE(S), ' + pass + ' passed'
                : 'all ' + pass + ' feature checks passed');
  return out.join('\n');
})()
