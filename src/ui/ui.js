// The console: HUD, left rail (build / fleet / routes / ledger) and the
// contextual inspector. Rendering is plain template strings plus event
// delegation — cheap enough to redraw the whole panel on any state change.

import {
  BUILDINGS, BUILDING_IDS, COURIERS, COURIER_IDS, PRODUCTS, PRODUCT_IDS, SPEEDS,
} from '../game/constants.js';
import { streetPrice, baselinePrice, saturation, sellRatePerHour, rivalShare } from '../game/economy.js';
import { sizeScale, sizeCapacity } from '../game/sim.js';
import { routeLabel, fixerRemaining, muscleCost, operationOptions } from '../game/actions.js';
import {
  KIND_LABEL, lotById, lotResale, priceBreakdown, sqft, marketValue, rentPerDay, lotPnL,
} from '../game/lots.js';
import { crewById } from '../game/crews.js';
import { unlockStatus, regionNote } from '../game/progression.js';
import { availableUpgrades, describeEffects, effectsFor, upkeepFor } from '../game/upgrades.js';
import { FIXER, LEGIT_WEALTH_SWING } from '../game/constants.js';
import { buildingById, courierById, districtById, clockOf } from '../game/state.js';
import { OVERLAYS, overlayValue, overlayColor } from '../map/mapView.js';
import { esc, money, moneyShort, units, pct, km, duration, qualityLabel, clip } from './format.js';
import { clamp01 } from '../game/rng.js';

export class GameUI {
  constructor(game) {
    this.game = game;
    this.tab = 'build';
    this.routeDraft = { fromId: '', toKey: '', cargo: 'packs', product: 'any' };

    this.dom = {
      hud: document.getElementById('hud'),
      rail: document.getElementById('rail'),
      railTabs: document.getElementById('railTabs'),
      railBody: document.getElementById('railBody'),
      inspector: document.getElementById('inspector'),
      inspectorBody: document.getElementById('inspectorBody'),
      inspectorClose: document.getElementById('inspectorClose'),
      ticker: document.getElementById('ticker'),
      city: document.getElementById('hudCity'),
      day: document.getElementById('hudDay'),
      time: document.getElementById('hudTime'),
      clean: document.getElementById('hudClean'),
      dirty: document.getElementById('hudDirty'),
      flow: document.getElementById('hudFlow'),
      speedGroup: document.getElementById('speedGroup'),
      overlaySelect: document.getElementById('overlaySelect'),
      mobileNav: document.getElementById('mobileNav'),
      loading: document.getElementById('loading'),
    };
    this.phone = window.matchMedia('(max-width: 780px)');

    this.buildOverlayOptions();
    this.wire();
  }

  show() {
    for (const id of ['hud', 'rail', 'ticker']) this.dom[id].hidden = false;
    this.syncLayout();
    this.render();
  }

  isPhone() {
    return this.phone.matches;
  }

  /**
   * On a phone the rail and inspector are sheets that slide up over the map,
   * so only one is ever open and the map stays reachable underneath.
   */
  syncLayout() {
    const phone = this.isPhone();
    this.dom.mobileNav.hidden = !phone;
    if (!phone) {
      this.dom.rail.classList.remove('is-open');
      this.dom.inspector.classList.remove('is-open');
      this.dom.rail.hidden = false;
    }
  }

  openSheet(which) {
    if (!this.isPhone()) return;
    const rail = which === 'rail';
    this.dom.rail.classList.toggle('is-open', rail);
    this.dom.inspector.classList.toggle('is-open', which === 'inspector');
    for (const b of this.dom.mobileNav.children) {
      b.classList.toggle('is-on', which === 'map' ? b.dataset.mtab === 'map' : b.dataset.mtab === this.tab);
    }
  }

  closeSheets() {
    this.dom.rail.classList.remove('is-open');
    this.dom.inspector.classList.remove('is-open');
    for (const b of this.dom.mobileNav.children) {
      b.classList.toggle('is-on', b.dataset.mtab === 'map');
    }
    // Dropping the selection too, otherwise the next periodic render sees a
    // selected thing with a closed sheet and immediately re-opens it.
    if (this.game.state && this.game.state.selection) this.game.select(null);
  }

  buildOverlayOptions() {
    this.dom.overlaySelect.innerHTML = OVERLAYS
      .map((o) => `<option value="${o.id}">${esc(o.label)}</option>`)
      .join('');
  }

  wire() {
    this.dom.railTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      this.tab = btn.dataset.tab;
      for (const b of this.dom.railTabs.children) b.classList.toggle('is-on', b === btn);
      this.renderRail();
    });

    this.dom.inspectorClose.addEventListener('click', () => this.game.select(null));
    this.dom.railBody.addEventListener('click', (e) => this.onAction(e));
    this.dom.railBody.addEventListener('change', (e) => this.onChange(e));
    this.dom.inspectorBody.addEventListener('click', (e) => this.onAction(e));
    this.dom.inspectorBody.addEventListener('change', (e) => this.onChange(e));

    this.dom.speedGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-speed]');
      if (btn) this.game.setSpeed(Number(btn.dataset.speed));
    });

    this.dom.overlaySelect.addEventListener('change', (e) => {
      this.game.setOverlay(e.target.value);
    });

    this.dom.mobileNav.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mtab]');
      if (!btn) return;
      const target = btn.dataset.mtab;
      if (target === 'map') { this.closeSheets(); return; }
      this.goTab(target);
      this.openSheet('rail');
    });

    document.getElementById('railGrip').addEventListener('click', () => this.closeSheets());
    document.getElementById('inspectorGrip').addEventListener('click', () => this.closeSheets());
    this.phone.addEventListener('change', () => this.syncLayout());

    document.getElementById('btnSave').addEventListener('click', () => this.game.save());
    document.getElementById('btnHelp').addEventListener('click', () => this.game.toggleHelp(true));
    document.getElementById('helpClose').addEventListener('click', () => this.game.toggleHelp(false));
  }

  onChange(e) {
    const field = e.target.closest('[data-field]');
    if (!field) return;
    const { field: name } = field.dataset;
    const value = field.value;

    if (name.startsWith('draft.')) {
      this.routeDraft[name.slice(6)] = value;
      this.renderRail();
      return;
    }
    if (name.startsWith('edit.')) {
      this.game.editRoute(field.dataset.route, { [name.slice(5)]: value });
      return;
    }
    if (name === 'courierRoute') {
      this.game.assignCourier(field.dataset.courier, value || null);
      return;
    }
    if (name === 'overlay') {
      this.game.setOverlay(value);
    }
  }

  onAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const { action, id, type, tab } = btn.dataset;
    const g = this.game;

    switch (action) {
      case 'buy-lot': g.buyLot(id); break;
      case 'sell-lot': g.sellLot(id); break;
      case 'rent-out': g.rentOut(id); break;
      case 'end-tenancy': g.endTenancy(id); break;
      case 'develop': g.developLot(id, type); break;
      case 'select-lot': g.select('lot', id); break;
      case 'hire': g.hireCourier(type); break;
      case 'fire': g.fireCourier(id); break;
      case 'upgrade': g.upgradeBuilding(id, type); break;
      case 'toggle': g.toggleBuilding(id); break;
      case 'sell-building': g.sellBuilding(id); break;
      case 'select-building': g.select('building', id); break;
      case 'select-district': g.select('district', id); break;
      case 'select-courier': g.select('courier', id); break;
      case 'focus': g.focusOn(type, id); break;
      case 'remove-route': g.removeRoute(id); break;
      case 'edit-route':
        this.editingRoute = this.editingRoute === id ? null : id;
        this.renderRail(true);
        break;
      case 'admin-cash': g.adminCash(Number(type)); break;
      case 'admin-unlock': g.adminUnlock(); break;
      case 'admin-cool': g.adminCool(); break;
      case 'admin-day': g.adminSkipDay(); break;
      case 'admin-wipe': g.adminWipe(); break;
      case 'admin-block': g.adminBlock(id); break;
      case 'create-route': g.createRouteFromDraft(this.routeDraft); break;
      case 'route-from':
        this.routeDraft.fromId = id;
        this.goTab(tab || 'routes');
        break;
      case 'route-to':
        this.routeDraft.toKey = `district:${id}`;
        this.goTab('routes');
        break;
      case 'fixer-wash': g.washWithFixer(); break;
      case 'muscle': g.muscleIn(id); break;
      case 'goto-tab': this.goTab(tab); break;
      default: break;
    }
  }

  goTab(tab) {
    this.tab = tab;
    for (const b of this.dom.railTabs.children) b.classList.toggle('is-on', b.dataset.tab === tab);
    this.renderRail();
  }

  // --- Per-frame HUD --------------------------------------------------------

  renderHud() {
    const s = this.game.state;
    const clock = clockOf(s.minutes);
    this.dom.city.textContent = s.cityName;
    this.dom.city.title = s.cityName;
    this.dom.day.textContent = `Day ${clock.day}`;
    this.dom.time.textContent = clock.label;
    this.dom.clean.textContent = money(s.cash.clean);
    this.dom.dirty.textContent = money(s.cash.dirty);

    const flow = this.dailyNet();
    this.dom.flow.textContent = `${flow >= 0 ? '+' : ''}${moneyShort(flow)}`;
    this.dom.flow.style.color = flow >= 0 ? 'var(--good)' : 'var(--bad)';

    for (const b of this.dom.speedGroup.children) {
      b.classList.toggle('is-on', Number(b.dataset.speed) === s.speedIndex);
    }
  }

  /** How much the wealth of a block multiplies a legal business's takings. */
  legitPull(b) {
    const def = BUILDINGS[b.type];
    const d = districtById(this.game.state, b.districtId);
    const swing = LEGIT_WEALTH_SWING * (def.wealthSensitivity || 1);
    return Math.max(0.25, Math.min(2.2, 1 + ((d ? d.wealth : 0.5) - 0.5) * 2 * swing));
  }

  legitTakings(b) {
    const def = BUILDINGS[b.type];
    return def.revenuePerDay * this.legitPull(b) * effectsFor(b).revenueMult * sizeScale(b);
  }

  legitProfit(b) {
    const def = BUILDINGS[b.type];
    return this.legitTakings(b) - upkeepFor(b);
  }

  /** Rough daily P&L: what the streets pay in, minus every fixed cost. */
  dailyNet() {
    const s = this.game.state;
    let income = 0;
    for (const d of s.districts) {
      for (const pid of PRODUCT_IDS) {
        if (d.supply[pid] <= 0.01) continue;
        income += sellRatePerHour(d, pid) * 24 * streetPrice(d, pid);
      }
    }
    let costs = 0;
    for (const b of s.buildings) {
      if (!b.active) continue;
      const def = BUILDINGS[b.type];
      costs += def.upkeepPerDay * (1 + (b.level - 1) * 0.35);
      if (def.kind === 'front') income += this.legitTakings(b);
      if (def.kind === 'production') {
        costs += (def.supplyCostPerSlot * def.slots * 24) / def.cycleHours;
      }
    }
    for (const c of s.couriers) costs += COURIERS[c.type].wagePerDay;
    return income - costs;
  }

  renderTicker() {
    const s = this.game.state;
    const items = s.log.slice(0, 6).map((entry) => {
      const clock = clockOf(entry.minute);
      return (
        `<div class="ticker__item is-${esc(entry.tone)}">` +
        `<span class="ticker__time">D${clock.day} ${clock.label}</span>` +
        `<span class="ticker__text">${esc(entry.text)}</span></div>`
      );
    });
    this.dom.ticker.innerHTML = items.join('') ||
      '<div class="ticker__item"><span class="ticker__text">Nothing on the radio.</span></div>';
  }

  // --- Full render ----------------------------------------------------------

  render() {
    this.renderHud();
    this.renderRail();
    this.renderInspector();
    this.renderTicker();
  }

  renderRail(force = false) {
    const map = {
      build: () => this.tabBuild(),
      blocks: () => this.tabBlocks(),
      market: () => this.tabMarket(),
      fleet: () => this.tabFleet(),
      routes: () => this.tabRoutes(),
      ledger: () => this.tabLedger(),
      admin: () => this.tabAdmin(),
    };
    const html = (map[this.tab] || map.build)();
    if (force || html !== this._lastRailHtml) {
      this.dom.railBody.innerHTML = html;
      this._lastRailHtml = html;
    }
  }

  // --- Build tab ------------------------------------------------------------

  tabBuild() {
    const s = this.game.state;
    const lots = s.lots || [];
    const owned = lots.filter((l) => l.owned);
    const vacant = owned.filter((l) => !l.buildingId);
    const sel = s.selection;
    const selectedLot = sel && sel.kind === 'lot' ? lotById(s, sel.id) : null;

    const intro = !lots.length
      ? '<div class="empty">Still loading the buildings around you…</div>'
      : `<p class="card__blurb" style="margin:0 0 10px">
           Every outline on the map is a real building. Zoom in, click one to see
           what it is and what it costs, then decide what to run inside it.
         </p>`;

    const vacantCards = vacant.length
      ? vacant.map((l) => `
          <button class="card" data-action="select-lot" data-id="${l.id}">
            <div class="card__head">
              <span class="card__name">${esc(l.name)}</span>
              <span class="card__cost" style="color:var(--sodium)">empty</span>
            </div>
            <div class="card__meta">
              <span>${esc(KIND_LABEL[l.kind] || l.kind)}</span>
              <span>${Math.round(l.areaM2)} m²</span>
              <span>${esc(districtById(s, l.districtId)?.name || '')}</span>
            </div>
          </button>`).join('')
      : '';

    return (
      `<div class="sect">
        <div class="sect__title"><span>Property</span><span>${owned.length} owned</span></div>
        ${intro}
        ${selectedLot ? this.lotDevelopBlock(selectedLot) : ''}
      </div>` +
      (vacantCards
        ? `<div class="sect"><div class="sect__title"><span>Empty premises</span><span>${vacant.length}</span></div>${vacantCards}</div>`
        : '') +
      this.ownedList()
    );
  }

  /** A tiny inline chart of where a price has been. */
  sparkline(series, key, color) {
    if (!series || series.length < 2) {
      return '<div class="spark spark--empty">no history yet</div>';
    }
    const vals = series.map((p) => p[key]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;
    const W = 240;
    const H = 34;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - lo) / span) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return (
      `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
            aria-label="price over the last ${vals.length} days">
        <polyline points="${pts.join(' ')}" fill="none" stroke="${esc(color)}"
          stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${W}" cy="${pts[pts.length - 1].split(',')[1]}" r="2.6" fill="${esc(color)}"/>
      </svg>`
    );
  }

  /** What every product is worth right now, where it sells best, what you hold. */
  tabMarket() {
    const s = this.game.state;
    const unlockedProducts = new Set(
      Object.values(BUILDINGS)
        .filter((def) => def.product && !unlockStatus(s, def.id)?.locked)
        .map((def) => def.product)
    );

    const cards = PRODUCT_IDS.map((pid) => {
      const p = PRODUCTS[pid];
      const known = unlockedProducts.has(pid);

      // Where it sells best right now.
      const ranked = [...s.districts]
        .map((d) => ({ d, price: streetPrice(d, pid), rate: sellRatePerHour(d, pid) }))
        .sort((a, b) => b.price - a.price);
      const top = ranked.slice(0, 3);
      const avg = ranked.reduce((n, r) => n + r.price, 0) / Math.max(1, ranked.length);

      // What you're holding, everywhere.
      const held = s.buildings.reduce((n, b) => n + (b.packs[pid] || 0), 0);
      const raw = s.buildings.reduce((n, b) => n + (b.raw[pid] || 0), 0);
      const onStreet = s.districts.reduce((n, d) => n + d.supply[pid], 0);

      const series = (s.priceHistory || {})[pid];
      const first = series && series.length > 1 ? series[0].avg : null;
      const move = first ? (avg - first) / first : 0;
      const region = regionNote(s.countryCode, pid);

      return `
        <div class="card" style="cursor:default;${known ? '' : 'opacity:.55'}">
          <div class="card__head">
            <span class="card__name" style="color:${esc(p.color)}">${esc(p.name)}</span>
            <span class="card__cost">${money(avg)}<span style="color:var(--text-faint)">/pack</span></span>
          </div>
          ${this.sparkline(series, 'avg', p.color)}
          <div class="rows" style="margin-top:6px">
            <div class="row"><span>Since day one</span>
              <span class="${move >= 0 ? 'good' : 'bad'}">${move >= 0 ? '+' : ''}${pct(move)}</span></div>
            <div class="row"><span>Best block</span>
              <span>${top[0] ? `${esc(top[0].d.name)} · ${money(top[0].price)}` : '—'}</span></div>
            ${region ? `<div class="row"><span>This region</span><span class="money">${esc(region)}</span></div>` : ''}
          </div>
          <div class="chips" style="margin-top:7px">
            <span class="chip">${units(raw)} raw</span>
            <span class="chip">${units(held)} packed</span>
            <span class="chip">${units(onStreet)} on the street</span>
          </div>
          ${known ? `<div class="card__meta" style="margin-top:6px">
            ${top.map((t) => `<span>${esc(t.d.name)} ${money(t.price)}</span>`).join('')}
          </div>` : '<div class="card__meta" style="margin-top:6px"><span style="color:var(--text-faint)">You can\u2019t make this yet</span></div>'}
        </div>`;
    }).join('');

    return `<div class="sect">
      <div class="sect__title"><span>Market</span><span>day ${clockOf(s.minutes).day}</span></div>
      <p class="card__blurb" style="margin:0 0 10px">
        Prices are per pack, averaged across blocks and weighted by what each one
        actually absorbs. Flooding a block drops its price; a block that knows you
        pays more.
      </p>
      ${cards}
    </div>`;
  }

  /**
   * Districts have no shape on the map any more, so this is the main way to
   * survey them: every block, ranked by whatever the map overlay is showing.
   */
  tabBlocks() {
    const s = this.game.state;
    const overlay = this.dom.overlaySelect.value || 'demand_weed';
    const product = overlay.includes('shroom') ? 'shrooms' : 'weed';

    const rows = [...s.districts]
      .map((d) => ({ d, v: overlayValue(d, overlay).t }))
      .sort((a, b) => b.v - a.v)
      .map(({ d, v }) => {
        const crew = crewById(s, d.crewId);
        const held = (d.rivalControl || 0) > 0.05;
        const mine = s.buildings.filter((b) => b.districtId === d.id).length;
        return `
          <button class="card" data-action="select-district" data-id="${d.id}">
            <div class="card__head">
              <span class="card__name">${esc(d.name)}</span>
              <span class="card__cost">${money(streetPrice(d, product))}<span style="color:var(--text-faint)">/pack</span></span>
            </div>
            <div class="meter"><i style="width:${Math.round(v * 100)}%;background:${esc(overlayColor(d, overlay))}"></i></div>
            <div class="card__meta">
              <span>absorbs ${units(sellRatePerHour(d, product))}/h</span>
              ${held ? `<span style="color:${esc(crew ? crew.color : 'var(--bad)')}">${pct(d.rivalControl)} held</span>` : '<span style="color:var(--good)">open</span>'}
              ${mine ? `<span style="color:var(--sodium)">${mine} yours</span>` : ''}
            </div>
          </button>`;
      }).join('');

    return (
      `<div class="sect">
        <div class="sect__title"><span>Blocks</span><span>${s.districts.length}</span></div>
        <p class="card__blurb" style="margin:0 0 10px">
          Ranked by what the map is showing. Prices are per pack at current
          saturation — pick where to sell, then run a route there.
        </p>
        ${rows}
      </div>`
    );
  }

  /** The "what do we run here" chooser for a building you already own. */
  lotDevelopBlock(lot) {
    const s = this.game.state;
    if (lot.buildingId) return '';

    const card = (o) => {
      const short = s.cash.clean < o.def.cost;
      const blocked = o.locked || !o.fits || short;
      const note = o.locked ? o.reason
        : !o.fits ? o.reason
        : short ? `Need ${moneyShort(o.def.cost)} clean` : null;
      const region = o.def.product ? regionNote(s.countryCode, o.def.product) : null;
      return `
        <button class="card ${blocked ? 'is-locked' : ''}"
          data-action="develop" data-id="${lot.id}" data-type="${o.id}" ${blocked ? 'disabled' : ''}>
          <div class="card__head">
            <span class="card__name">${esc(o.def.name)}</span>
            <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(o.def.cost)}</span>
          </div>
          <div class="card__blurb">${esc(o.def.blurb)}</div>
          <div class="card__meta">
            ${o.locked ? '' : o.fits ? `<span style="color:var(--good)">×${o.scale.toFixed(2)} output · ×${o.capScale.toFixed(1)} storage</span>` : ''}
            ${note ? `<span style="color:${o.locked ? 'var(--text-faint)' : 'var(--warn)'}">${esc(note)}</span>` : ''}
            ${region && !o.locked ? `<span style="color:var(--money)">${esc(region)}</span>` : ''}
          </div>
          ${o.locked && o.gate ? `<div class="meter" style="margin-top:6px"><i style="width:${Math.round(o.gate.progress * 100)}%"></i></div>` : ''}
        </button>`;
    };

    // The two money paths are the central choice, so they're shown as such.
    const opts = operationOptions(lot, s);
    const illegal = opts.filter((o) => o.def.kind !== 'front');
    const legal = opts.filter((o) => o.def.kind === 'front');

    return (
      `<div class="sect__title" style="margin-top:4px">
        <span>The chain</span><span style="color:var(--text-faint)">street money</span>
      </div>
      ${illegal.map(card).join('')}
      <div class="sect__title" style="margin-top:12px">
        <span>Legitimate business</span><span style="color:var(--good)">clean money</span>
      </div>
      <p class="card__blurb" style="margin:0 0 8px">
        Earns clean money on its own — slower than the chain, but spendable the
        moment it lands, never raided, and it cools the block down. Washes
        street cash on the side.
      </p>
      ${legal.map(card).join('')}`
    );
  }

  ownedList() {
    const s = this.game.state;
    if (!s.buildings.length) return '';
    const rows = s.buildings.map((b) => {
      const d = districtById(s, b.districtId);
      const def = BUILDINGS[b.type];
      const stock = def.kind === 'production'
        ? `${units(b.raw[def.product])} raw`
        : `${units(PRODUCT_IDS.reduce((n, p) => n + b.packs[p], 0))} packs`;
      return (
        `<button class="card" data-action="select-building" data-id="${b.id}">
          <div class="card__head">
            <span class="card__name">${esc(b.name)}${b.level > 1 ? ` <span style="color:var(--sodium)">L${b.level}</span>` : ''}</span>
            <span class="card__cost" style="color:var(--text-dim)">${esc(stock)}</span>
          </div>
          <div class="card__meta">
            <span>${esc(d ? d.name : '—')}</span>
            ${b.stalledReason ? `<span style="color:var(--warn)">${esc(b.stalledReason)}</span>` : ''}
            ${!b.active ? '<span style="color:var(--bad)">Shut down</span>' : ''}
          </div>
        </button>`
      );
    }).join('');
    return `<div class="sect"><div class="sect__title"><span>Your properties</span></div>${rows}</div>`;
  }

  // --- Fleet tab ------------------------------------------------------------

  tabFleet() {
    const s = this.game.state;

    const hire = COURIER_IDS.map((id) => {
      const def = COURIERS[id];
      const short = s.cash.clean < def.cost;
      return (
        `<button class="card ${short ? 'is-locked' : ''}" data-action="hire" data-type="${id}" ${short ? 'disabled' : ''}>
          <div class="card__head">
            <span class="card__name">${esc(def.name)}</span>
            <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(def.cost)}</span>
          </div>
          ${def.blurb ? `<div class="card__blurb">${esc(def.blurb)}</div>` : ''}
          <div class="card__meta">
            <span>${def.capacity} cap</span><span>${def.speedKph} km/h</span>
            <span>${pct(def.stealth)} slick</span><span>${money(def.wagePerDay)}/day</span>
          </div>
        </button>`
      );
    }).join('');

    const fleet = s.couriers.length
      ? s.couriers.map((c) => this.courierCard(c)).join('')
      : '<div class="empty">No couriers. Product doesn’t walk itself to the block.</div>';

    return (
      `<div class="sect"><div class="sect__title"><span>Hire</span></div>${hire}</div>` +
      `<div class="sect"><div class="sect__title"><span>Your fleet</span><span>${s.couriers.length}</span></div>${fleet}</div>`
    );
  }

  courierCard(c) {
    const s = this.game.state;
    const def = COURIERS[c.type];
    const carried = PRODUCT_IDS.reduce((n, p) => n + c.cargo[p], 0);
    const options = ['<option value="">— unassigned —</option>']
      .concat(s.routes.map((r) => {
        const info = routeLabel(s, r);
        return `<option value="${r.id}" ${c.routeId === r.id ? 'selected' : ''}>${esc(clip(info.from, 16))} → ${esc(clip(info.to, 16))}</option>`;
      }))
      .join('');

    return (
      `<div class="card" style="cursor:default">
        <div class="card__head">
          <span class="card__name">${esc(c.name)}</span>
          <span class="card__cost" style="color:var(--text-dim)">${units(carried)}/${def.capacity}</span>
        </div>
        <div class="card__meta">
          <span>${esc(this.phaseLabel(c))}</span><span>${c.tripsCompleted} runs</span>
        </div>
        <div class="field" style="margin:8px 0 0">
          <select data-field="courierRoute" data-courier="${c.id}">${options}</select>
        </div>
        <div class="btnrow">
          <button class="ghostbtn" data-action="select-courier" data-id="${c.id}">Details</button>
          <button class="ghostbtn" data-action="fire" data-id="${c.id}">Let go</button>
        </div>
      </div>`
    );
  }

  phaseLabel(c) {
    switch (c.phase) {
      case 'loading': return 'Loading up';
      case 'outbound': return `On the road ${Math.round(clamp01(c.progress) * 100)}%`;
      case 'returning': return 'Heading back';
      default: return 'Parked';
    }
  }

  // --- Routes tab -----------------------------------------------------------

  tabRoutes() {
    const s = this.game.state;
    const d = this.routeDraft;

    const sources = s.buildings.filter((b) => b.kind !== 'front');
    if (!sources.length) {
      return '<div class="empty">Build something that holds product first — a grow, a lab or a stash.</div>';
    }

    const fromOpts = sources.map((b) =>
      `<option value="${b.id}" ${d.fromId === b.id ? 'selected' : ''}>${esc(clip(b.name, 30))}</option>`
    ).join('');

    const buildingOpts = s.buildings
      .filter((b) => b.id !== d.fromId && b.kind !== 'front')
      .map((b) => `<option value="building:${b.id}" ${d.toKey === `building:${b.id}` ? 'selected' : ''}>▸ ${esc(clip(b.name, 30))}</option>`)
      .join('');

    const districtOpts = [...s.districts]
      .sort((a, b) => b.demandPerHour.weed - a.demandPerHour.weed)
      .map((dd) => `<option value="district:${dd.id}" ${d.toKey === `district:${dd.id}` ? 'selected' : ''}>◆ ${esc(clip(dd.name, 22))} · ${units(dd.demandPerHour.weed + dd.demandPerHour.shrooms)}/h</option>`)
      .join('');

    const list = s.routes.length
      ? s.routes.map((r) => this.routeCard(r)).join('')
      : '<div class="empty">No supply lines yet.</div>';

    return (
      `<div class="sect">
        <div class="sect__title"><span>New supply line</span></div>
        <div class="field"><label>Pick up from</label>
          <select data-field="draft.fromId">${fromOpts}</select></div>
        <div class="field"><label>Drop off at</label>
          <select data-field="draft.toKey">
            <option value="">— choose —</option>
            ${buildingOpts ? `<optgroup label="Your property">${buildingOpts}</optgroup>` : ''}
            <optgroup label="Sell on the street">${districtOpts}</optgroup>
          </select></div>
        <div class="field"><label>Cargo</label>
          <select data-field="draft.cargo">
            <option value="packs" ${d.cargo === 'packs' ? 'selected' : ''}>Packaged product</option>
            <option value="raw" ${d.cargo === 'raw' ? 'selected' : ''}>Raw harvest</option>
          </select></div>
        <div class="field"><label>Product</label>
          <select data-field="draft.product">
            <option value="any" ${d.product === 'any' ? 'selected' : ''}>Anything on hand</option>
            ${PRODUCT_IDS.map((p) => `<option value="${p}" ${d.product === p ? 'selected' : ''}>${esc(PRODUCTS[p].name)}</option>`).join('')}
          </select></div>
        <button class="primarybtn" style="width:100%" data-action="create-route">Open the route</button>
        ${d.cargo === 'raw' && d.toKey.startsWith('district:')
          ? '<p class="card__blurb" style="color:var(--warn)">Raw harvest is worthless on the street — run it through a lab first.</p>'
          : ''}
      </div>
      <div class="sect"><div class="sect__title"><span>Running</span><span>${s.routes.length}</span></div>${list}</div>`
    );
  }

  routeCard(r) {
    const s = this.game.state;
    const info = routeLabel(s, r);
    const assigned = s.couriers.filter((c) => c.routeId === r.id);
    const pending = !r.points;
    return (
      `<div class="card" style="cursor:default">
        <div class="card__head">
          <span class="card__name" style="font-size:13.5px">${esc(info.from)} → ${esc(info.to)}</span>
          <span class="card__cost" style="color:var(--text-dim)">${pending ? '…' : km(r.km)}</span>
        </div>
        <div class="card__meta">
          <span>${esc(info.cargo)}</span>
          <span>${esc(info.product)}</span>
          <span>${assigned.length} courier${assigned.length === 1 ? '' : 's'}</span>
          ${r.points && !r.realRoad ? '<span style="color:var(--text-faint)">est. distance</span>' : ''}
        </div>
        <div class="btnrow">
          <button class="ghostbtn" data-action="edit-route" data-id="${r.id}">Edit</button>
          <button class="ghostbtn" data-action="remove-route" data-id="${r.id}">Close route</button>
        </div>
        ${this.editingRoute === r.id ? this.routeEditor(r) : ''}
      </div>`
    );
  }

  /** Change an existing supply line instead of closing it and rebuilding. */
  routeEditor(r) {
    const s = this.game.state;
    const sources = s.buildings.filter((b) => b.kind !== 'front');
    const fromOpts = sources.map((b) =>
      `<option value="${b.id}" ${r.fromId === b.id ? 'selected' : ''}>${esc(clip(b.name, 30))}</option>`
    ).join('');
    const buildingOpts = s.buildings
      .filter((b) => b.id !== r.fromId && b.kind !== 'front')
      .map((b) => `<option value="building:${b.id}" ${r.toType === 'building' && r.toId === b.id ? 'selected' : ''}>▸ ${esc(clip(b.name, 30))}</option>`)
      .join('');
    const districtOpts = [...s.districts]
      .sort((a, b) => b.demandPerHour.weed - a.demandPerHour.weed)
      .map((dd) => `<option value="district:${dd.id}" ${r.toType === 'district' && r.toId === dd.id ? 'selected' : ''}>◆ ${esc(clip(dd.name, 22))}</option>`)
      .join('');

    return `
      <div class="sect" style="margin:10px 0 0;padding-top:8px;border-top:1px solid var(--line-soft)">
        <div class="field"><label>Pick up from</label>
          <select data-field="edit.fromId" data-route="${r.id}">${fromOpts}</select></div>
        <div class="field"><label>Drop off at</label>
          <select data-field="edit.toKey" data-route="${r.id}">
            ${buildingOpts ? `<optgroup label="Your property">${buildingOpts}</optgroup>` : ''}
            <optgroup label="Sell on the street">${districtOpts}</optgroup>
          </select></div>
        <div class="field"><label>Cargo</label>
          <select data-field="edit.cargo" data-route="${r.id}">
            <option value="packs" ${r.cargo === 'packs' ? 'selected' : ''}>Packaged product</option>
            <option value="raw" ${r.cargo === 'raw' ? 'selected' : ''}>Raw harvest</option>
          </select></div>
        <div class="field"><label>Product</label>
          <select data-field="edit.product" data-route="${r.id}">
            <option value="any" ${r.product === 'any' ? 'selected' : ''}>Anything on hand</option>
            ${PRODUCT_IDS.map((p) => `<option value="${p}" ${r.product === p ? 'selected' : ''}>${esc(PRODUCTS[p].name)}</option>`).join('')}
          </select></div>
        <button class="ghostbtn" style="width:100%" data-action="edit-route" data-id="${r.id}">Done</button>
      </div>`;
  }

  /** Testing controls. Not reachable through ordinary play. */
  tabAdmin() {
    const s = this.game.state;
    const blocks = [...s.districts]
      .sort((a, b) => (b.rivalControl || 0) - (a.rivalControl || 0))
      .slice(0, 8)
      .map((d) => `<button class="card" data-action="admin-block" data-id="${d.id}">
          <div class="card__head"><span class="card__name">${esc(d.name)}</span>
            <span class="card__cost">${pct(d.rivalControl || 0)} held</span></div>
          <div class="card__meta"><span>take it outright</span></div>
        </button>`).join('');

    return `<div class="sect">
      <div class="sect__title"><span>Admin</span><span style="color:var(--bad)">testing only</span></div>
      <p class="card__blurb" style="margin:0 0 10px">
        Shortcuts for trying things out. None of this is reachable in normal play.
      </p>
      <div class="btnrow">
        <button class="ghostbtn" data-action="admin-cash" data-type="100000">+$100k clean</button>
        <button class="ghostbtn" data-action="admin-cash" data-type="1000000">+$1M clean</button>
      </div>
      <div class="btnrow">
        <button class="ghostbtn" data-action="admin-unlock">Unlock everything</button>
        <button class="ghostbtn" data-action="admin-cool">Clear all heat</button>
      </div>
      <div class="btnrow">
        <button class="ghostbtn" data-action="admin-day">Skip a day</button>
        <button class="ghostbtn" data-action="admin-wipe">Wipe save</button>
      </div>
    </div>
    <div class="sect">
      <div class="sect__title"><span>Take a block</span></div>
      ${blocks}
    </div>`;
  }

  // --- Ledger tab -----------------------------------------------------------

  tabLedger() {
    const s = this.game.state;
    const st = s.stats;
    const clock = clockOf(s.minutes);
    const room = fixerRemaining(s);
    const washable = Math.min(room, s.cash.dirty);
    const hasFront = s.buildings.some((b) => b.type === 'front' && b.active);

    const top = [...s.districts]
      .filter((d) => d.revenueTotal > 0)
      .sort((a, b) => b.revenueTotal - a.revenueTotal)
      .slice(0, 6)
      .map((d) => `<div class="row"><span>${esc(d.name)}</span><span class="money">${moneyShort(d.revenueTotal)}</span></div>`)
      .join('') || '<div class="empty">No sales yet.</div>';

    return (
      `<div class="sect">
        <div class="sect__title"><span>The fixer</span><span>${money(room)} left today</span></div>
        <p class="card__blurb" style="margin:0 0 8px">
          Washes street cash on the spot for a ${pct(FIXER.cut)} cut — bad rates, but he'll never
          leave you stuck with money you can't spend.${hasFront ? ' Your Front does it cheaper.' : ''}
        </p>
        <div class="rows" style="margin-bottom:8px">
          <div class="row"><span>Street cash</span><span class="money">${money(s.cash.dirty)}</span></div>
          <div class="row"><span>You'd keep</span><span class="money">${money(washable * (1 - FIXER.cut))}</span></div>
        </div>
        <button class="primarybtn" style="width:100%" data-action="fixer-wash"
          ${washable <= 0 ? 'disabled' : ''}>
          ${washable <= 0 ? (room <= 0 ? 'Fixer’s done for today' : 'No street cash') : `Wash ${money(washable)}`}
        </button>
      </div>
      <div class="sect">
        <div class="sect__title"><span>Books</span><span>Day ${clock.day}</span></div>
        <div class="rows">
          <div class="row"><span>Street revenue</span><span class="money">${money(st.grossRevenue)}</span></div>
          <div class="row"><span>Legal takings</span><span class="good">${money(st.legalRevenue || 0)}</span></div>
          <div class="row"><span>Rent collected</span><span class="good">${money(st.rentCollected || 0)}</span></div>
          <div class="row"><span>Property gains</span>
            <span class="${(st.propertyPnL || 0) >= 0 ? 'good' : 'bad'}">${(st.propertyPnL || 0) >= 0 ? '+' : '−'}${money(Math.abs(st.propertyPnL || 0))}</span></div>
          <div class="row"><span>Washed clean</span><span class="money">${money(st.laundered)}</span></div>
          <div class="row"><span>Spent on the empire</span><span>${money(st.spent)}</span></div>
          <div class="row"><span>Projected net / day</span><span class="${this.dailyNet() >= 0 ? 'good' : 'bad'}">${moneyShort(this.dailyNet())}</span></div>
        </div>
      </div>
      <div class="sect">
        <div class="sect__title"><span>Moved</span></div>
        <div class="rows">
          ${PRODUCT_IDS.map((p) => `<div class="row"><span>${esc(PRODUCTS[p].name)}</span><span>${units(st.packsSold[p])} packs</span></div>`).join('')}
        </div>
      </div>
      <div class="sect">
        <div class="sect__title"><span>Losses</span></div>
        <div class="rows">
          <div class="row"><span>Raids</span><span class="${st.raids ? 'bad' : ''}">${st.raids}</span></div>
          <div class="row"><span>Traffic stops</span><span class="${st.stops ? 'bad' : ''}">${st.stops}</span></div>
          <div class="row"><span>Product seized</span><span class="${st.seized ? 'bad' : ''}">${units(st.seized)}</span></div>
        </div>
      </div>
      <div class="sect">
        <div class="sect__title"><span>Best blocks</span></div>
        <div class="rows">${top}</div>
      </div>
      ${this.crewsSection()}`
    );
  }

  /** Standings: who else is working the city and how much they still hold. */
  crewsSection() {
    const s = this.game.state;
    const crews = s.crews || [];
    if (!crews.length) return '';

    const rows = crews.map((crew) => {
      const blocks = s.districts.filter((d) => d.crewId === crew.id && d.rivalControl > 0.05);
      const grip = blocks.length
        ? blocks.reduce((n, d) => n + d.rivalControl, 0) / blocks.length
        : 0;
      const home = districtById(s, crew.homeDistrictId);
      return (
        `<div class="card" style="cursor:default">
          <div class="card__head">
            <span class="card__name" style="color:${esc(crew.color)}">${esc(crew.name)}</span>
            <span class="card__cost" style="color:var(--text-dim)">${blocks.length} block${blocks.length === 1 ? '' : 's'}</span>
          </div>
          <div class="meter"><i style="width:${grip * 100}%;background:${esc(crew.color)}"></i></div>
          <div class="card__meta">
            <span>avg grip ${pct(grip)}</span>
            <span>base ${esc(home ? home.name : '—')}</span>
            ${crew.pushedBack > 0.05 ? `<span style="color:var(--good)">pushed back ${pct(crew.pushedBack)}</span>` : ''}
          </div>
        </div>`
      );
    }).join('');

    const totalHeld = s.districts.filter((d) => d.rivalControl > 0.05).length;
    return (
      `<div class="sect">
        <div class="sect__title"><span>Who else is out here</span><span>${totalHeld}/${s.districts.length} blocks</span></div>
        ${rows}
      </div>`
    );
  }

  // --- Inspector ------------------------------------------------------------

  renderInspector() {
    const sel = this.game.state.selection;
    if (!sel) {
      this.dom.inspector.hidden = true;
      this.dom.inspector.classList.remove('is-open');
      this._lastInspectorHtml = null;
      return;
    }
    const s = this.game.state;
    let html = '';
    if (sel.kind === 'district') {
      const d = districtById(s, sel.id);
      html = d ? this.districtPanel(d) : '';
    } else if (sel.kind === 'building') {
      const b = buildingById(s, sel.id);
      html = b ? this.buildingPanel(b) : '';
    } else if (sel.kind === 'courier') {
      const c = courierById(s, sel.id);
      html = c ? this.courierPanel(c) : '';
    } else if (sel.kind === 'lot') {
      const l = lotById(s, sel.id);
      html = l ? this.lotPanel(l) : '';
    }
    if (!html) {
      this.dom.inspector.hidden = true;
      return;
    }
    this.dom.inspector.hidden = false;
    if (html !== this._lastInspectorHtml) {
      this.dom.inspectorBody.innerHTML = html;
      this._lastInspectorHtml = html;
    }
    if (this.isPhone() && !this.dom.inspector.classList.contains('is-open')) {
      this.openSheet('inspector');
    }
  }

  districtPanel(d) {
    const s = this.game.state;
    const here = s.buildings.filter((b) => b.districtId === d.id);

    const products = PRODUCT_IDS.map((pid) => {
      const p = PRODUCTS[pid];
      const price = streetPrice(d, pid);
      const base = baselinePrice(d, pid);
      const sat = saturation(d, pid);
      const delta = price / base - 1;
      const cls = pid === 'weed' ? 'weed' : 'shroom';
      return (
        `<div class="sect">
          <div class="sect__title"><span style="color:var(--${cls})">${esc(p.name)}</span>
            <span class="money">${money(price)}<span style="color:var(--text-faint)">/pack</span></span></div>
          <div class="rows">
            <div class="row"><span>vs. baseline</span><span class="${delta >= 0 ? 'good' : 'bad'}">${delta >= 0 ? '+' : ''}${pct(delta)}</span></div>
            <div class="row"><span>Absorbs</span><span>${units(sellRatePerHour(d, pid))}/h</span></div>
            <div class="row"><span>On the block now</span><span>${units(d.supply[pid])} packs</span></div>
            <div class="row"><span>Saturation</span>
              <span class="${sat > 1.2 ? 'bad' : sat > 0.8 ? 'warn' : 'good'}">${pct(Math.min(sat, 3))}</span></div>
          </div>
          <div class="meter meter--${cls}"><i style="width:${Math.min(100, (d.demandPerHour[pid] / p.demandBase[1]) * 100)}%"></i></div>
        </div>`
      );
    }).join('');

    return (
      `<h2 class="ttl">${esc(d.name)}</h2>
      <p class="subttl">${d.realName ? 'Real neighbourhood' : 'Unmapped block'} · ${esc(s.cityName)}</p>
      <div class="chips" style="margin-bottom:14px">
        <span class="chip">${pct(d.wealth)} money</span>
        <span class="chip">${pct(d.density)} density</span>
        <span class="chip ${d.policing > 0.6 ? 'chip--warn' : ''}">${pct(d.policing)} patrolled</span>
      </div>

      <div class="sect">
        <div class="sect__title"><span>Your rep</span><span>${pct(d.rep)}</span></div>
        <div class="meter meter--rep"><i style="width:${d.rep * 100}%"></i></div>
      </div>

      ${this.turfSection(d)}

      ${products}

      <div class="sect">
        <div class="sect__title"><span>Lifetime</span></div>
        <div class="rows">
          <div class="row"><span>Revenue from here</span><span class="money">${moneyShort(d.revenueTotal)}</span></div>
          <div class="row"><span>Your property here</span><span>${here.length}</span></div>
        </div>
      </div>

      <div class="btnrow">
        <button class="primarybtn" data-action="route-to" data-id="${d.id}">Supply this block</button>
        <button class="ghostbtn" data-action="focus" data-type="district" data-id="${d.id}">Centre map</button>
      </div>`
    );
  }

  /** Who else works this block, and what it would take to move them. */
  turfSection(d) {
    const s = this.game.state;
    const crew = crewById(s, d.crewId);
    const control = d.rivalControl || 0;

    if (!crew || control < 0.05) {
      return (
        `<div class="sect">
          <div class="sect__title"><span>Turf</span><span class="good">Open</span></div>
          <p class="card__blurb" style="margin:0">Nobody's working this block. Every customer here is yours to take.</p>
        </div>`
      );
    }

    const cost = muscleCost(d);
    const affordable = s.cash.clean >= cost;
    // Same formula the action rolls against, so the player can read the odds.
    const odds = clamp01(0.28 + d.rep * 0.5 - (control - 0.3) * 0.45);

    return (
      `<div class="sect">
        <div class="sect__title">
          <span>Turf</span>
          <span style="color:${esc(crew.color)}">${esc(crew.name)}</span>
        </div>
        <div class="meter"><i style="width:${control * 100}%;background:${esc(crew.color)}"></i></div>
        <div class="rows" style="margin-top:9px">
          <div class="row"><span>Their grip</span><span>${pct(control)}</span></div>
          <div class="row"><span>Trade they take</span><span class="bad">${pct(rivalShare(d))}</span></div>
          <div class="row"><span>Odds if you move</span>
            <span class="${odds > 0.55 ? 'good' : odds > 0.35 ? 'warn' : 'bad'}">${pct(odds)}</span></div>
        </div>
        <div class="btnrow">
          <button class="ghostbtn" data-action="muscle" data-id="${d.id}" ${affordable ? '' : 'disabled'}>
            ${affordable ? `Muscle in · ${moneyShort(cost)}` : `Need ${moneyShort(cost)} clean`}
          </button>
        </div>
        <p class="card__blurb" style="margin:6px 0 0">
          Selling here steadily wears their grip down for free. Force is faster and draws police.
        </p>
      </div>`
    );
  }

  /** A real building on the map: what it is, what it costs, what fits inside. */
  lotPanel(lot) {
    const s = this.game.state;
    const d = districtById(s, lot.districtId);
    const running = lot.buildingId ? buildingById(s, lot.buildingId) : null;
    const value = marketValue(lot, d);
    const affordable = s.cash.clean >= value;
    const idx = d ? (d.marketIndex || 1) : 1;
    const rising = d ? (d.marketTrend || 0) >= 0 : true;

    const facts =
      `<div class="rows">
        <div class="row"><span>Type</span><span>${esc(KIND_LABEL[lot.kind] || lot.kind)}</span></div>
        <div class="row"><span>Footprint</span><span>${Math.round(sqft(lot.areaM2)).toLocaleString()} ft²</span></div>
        <div class="row"><span></span><span style="color:var(--text-faint)">${Math.round(lot.areaM2).toLocaleString()} m²</span></div>
        <div class="row"><span>Block</span><span>${esc(d ? d.name : '—')}</span></div>
        <div class="row"><span>Local market</span>
          <span class="${idx >= 1 ? 'good' : 'bad'}">${(idx * 100).toFixed(0)}% ${rising ? '▲' : '▼'}</span></div>
      </div>`;

    // What you're up or down, if you own it.
    const pnl = lotPnL(lot, d);
    const position = pnl
      ? `<div class="rows" style="margin-bottom:9px">
          <div class="row"><span>You paid</span><span>${money(pnl.paid)}</span></div>
          <div class="row"><span>Sells for now</span><span class="money">${money(pnl.now)}</span></div>
          <div class="row"><span>Position</span>
            <span class="${pnl.delta >= 0 ? 'good' : 'bad'}">${pnl.delta >= 0 ? '+' : '−'}${money(Math.abs(pnl.delta))}</span></div>
        </div>`
      : '';

    if (running) {
      return (
        `<h2 class="ttl">${esc(lot.name)}</h2>
        <p class="subttl">Yours · ${esc(BUILDINGS[running.type].name)}</p>
        ${facts}
        <div class="sect" style="margin-top:14px">
          <div class="sect__title"><span>As property</span></div>
          ${position}
        </div>
        <div class="btnrow">
          <button class="primarybtn" data-action="select-building" data-id="${running.id}">Open the operation</button>
        </div>`
      );
    }

    if (lot.owned) {
      const rent = rentPerDay(lot, d);
      return (
        `<h2 class="ttl">${esc(lot.name)}</h2>
        <p class="subttl">Yours · ${lot.rented ? 'let to a tenant' : 'standing empty'}</p>
        ${facts}
        <div class="sect" style="margin-top:14px">
          <div class="sect__title"><span>As property</span>
            <span class="money">${money(lotResale(lot, d))}</span></div>
          ${position}
          <div class="btnrow">
            <button class="ghostbtn" data-action="sell-lot" data-id="${lot.id}">
              Sell for ${moneyShort(lotResale(lot, d))}
            </button>
            ${lot.rented
              ? `<button class="ghostbtn" data-action="end-tenancy" data-id="${lot.id}">End tenancy</button>`
              : `<button class="ghostbtn" data-action="rent-out" data-id="${lot.id}">Let for ${money(rent)}/day</button>`}
          </div>
          <p class="card__blurb" style="margin-top:8px">
            ${lot.rented
              ? `Paying <b>${money(rent)}/day</b> in clean money. Nothing to run, nothing to raid — but you can't use the building until the tenancy ends.`
              : 'Let it out for quiet, legal income, or put an operation in it. Values move with the block, so a place you clean up is worth more later.'}
          </p>
        </div>
        ${lot.rented ? '' : `<div class="sect">
          <div class="sect__title"><span>Put it to work</span></div>
          ${this.lotDevelopBlock(lot)}
        </div>`}`
      );
    }

    return (
      `<h2 class="ttl">${esc(lot.name)}</h2>
      <p class="subttl">On the market · ${esc(d ? d.name : '')}</p>
      ${facts}
      <div class="sect" style="margin-top:14px">
        <div class="sect__title"><span>Asking price</span>
          <span class="money" style="font-size:15px">${money(value)}</span></div>
        <div class="rows" style="margin-bottom:9px">
          <div class="row"><span>Rate</span><span>${money(value / Math.max(1, sqft(lot.areaM2)))}/ft²</span></div>
          <div class="row"><span>Would let for</span><span>${money(rentPerDay(lot, d))}/day</span></div>
        </div>
        <button class="primarybtn" style="width:100%" data-action="buy-lot" data-id="${lot.id}"
          ${affordable ? '' : 'disabled'}>
          ${affordable ? 'Buy this building' : `Need ${moneyShort(value)} clean`}
        </button>
        <p class="card__blurb" style="margin-top:8px">
          Priced on floor area, premises type and what the block is doing. Run
          something in it, let it to a tenant, or hold it and sell when the
          street is worth more.
        </p>
      </div>`
    );
  }

  buildingPanel(b) {
    const s = this.game.state;
    const def = BUILDINGS[b.type];
    const d = districtById(s, b.districtId);

    let body = '';
    if (def.kind === 'production') {
      const p = PRODUCTS[def.product];
      const fx = effectsFor(b);
      const cap = def.capacity * fx.capacityMult * sizeCapacity(b);
      const perCycle = def.slots * def.rawPerSlot * fx.yieldMult * sizeScale(b);
      body =
        `<div class="sect">
          <div class="sect__title"><span>Current cycle</span><span>${pct(b.cycleProgress)}</span></div>
          <div class="meter meter--${def.product === 'weed' ? 'weed' : 'shroom'}"><i style="width:${b.cycleProgress * 100}%"></i></div>
          <div class="rows" style="margin-top:9px">
            <div class="row"><span>Yield per cycle</span><span>${units(perCycle)} ${esc(p.rawName.toLowerCase())}</span></div>
            <div class="row"><span>Cycle length</span><span>${duration(def.cycleHours)}</span></div>
            <div class="row"><span>Supplies per cycle</span><span>${money(def.supplyCostPerSlot * def.slots)}</span></div>
          </div>
        </div>
        <div class="sect">
          <div class="sect__title"><span>Raw on site</span><span>${units(b.raw[def.product])} / ${units(cap)}</span></div>
          <div class="meter"><i style="width:${Math.min(100, (b.raw[def.product] / cap) * 100)}%"></i></div>
          <div class="rows" style="margin-top:9px">
            <div class="row"><span>Quality</span><span>${qualityLabel(b.rawQuality[def.product])} · ${pct(b.rawQuality[def.product])}</span></div>
          </div>
        </div>`;
    } else if (def.kind === 'processing') {
      const fx = effectsFor(b);
      const cap = def.capacity * fx.capacityMult * sizeCapacity(b);
      const held = PRODUCT_IDS.reduce((n, p) => n + b.packs[p], 0);
      body =
        `<div class="sect">
          <div class="sect__title"><span>Throughput</span><span>${units(def.rawPerHour * fx.yieldMult * sizeScale(b))} raw/h</span></div>
          <div class="rows">
            ${PRODUCT_IDS.map((pid) => `<div class="row"><span>${esc(PRODUCTS[pid].name)} waiting</span><span>${units(b.raw[pid])} raw</span></div>`).join('')}
          </div>
        </div>
        <div class="sect">
          <div class="sect__title"><span>Packaged</span><span>${units(held)} / ${units(cap)}</span></div>
          <div class="meter"><i style="width:${Math.min(100, (held / cap) * 100)}%"></i></div>
          <div class="rows" style="margin-top:9px">
            ${PRODUCT_IDS.map((pid) => `<div class="row"><span>${esc(PRODUCTS[pid].name)}</span><span>${units(b.packs[pid])} · ${qualityLabel(b.packQuality[pid])}</span></div>`).join('')}
          </div>
        </div>`;
    } else if (def.kind === 'storage') {
      const cap = def.capacity * effectsFor(b).capacityMult * sizeCapacity(b);
      const held = PRODUCT_IDS.reduce((n, p) => n + b.packs[p], 0);
      body =
        `<div class="sect">
          <div class="sect__title"><span>Stored</span><span>${units(held)} / ${units(cap)}</span></div>
          <div class="meter"><i style="width:${Math.min(100, (held / cap) * 100)}%"></i></div>
          <div class="rows" style="margin-top:9px">
            ${PRODUCT_IDS.map((pid) => `<div class="row"><span>${esc(PRODUCTS[pid].name)}</span><span>${units(b.packs[pid])}</span></div>`).join('')}
          </div>
        </div>`;
    } else {
      body =
        `<div class="sect">
          <div class="sect__title"><span>Legal trade</span>
            <span class="${this.legitProfit(b) >= 0 ? 'good' : 'bad'}">${this.legitProfit(b) >= 0 ? '+' : ''}${money(this.legitProfit(b))}/day</span></div>
          <div class="rows">
            <div class="row"><span>Takings</span><span class="money">${money(this.legitTakings(b))}/day</span></div>
            <div class="row"><span>Costs</span><span>${money(upkeepFor(b))}/day</span></div>
            <div class="row"><span>Block wealth</span>
              <span class="${this.legitPull(b) >= 1 ? 'good' : 'warn'}">${pct(districtById(s, b.districtId)?.wealth ?? 0.5)} · ×${this.legitPull(b).toFixed(2)}</span></div>
            <div class="row"><span>Earned today</span><span class="money">${money(b.earnedToday || 0)}</span></div>
          </div>
          <p class="card__blurb" style="margin:7px 0 0">
            This lands as <b>clean</b> money — spendable straight away, and nothing here can be raided.
          </p>
        </div>
        <div class="sect">
          <div class="sect__title"><span>Laundry</span></div>
          <div class="rows">
            <div class="row"><span>Capacity</span><span>${money(def.launderPerDay * effectsFor(b).launderMult * sizeScale(b))}/day</span></div>
            <div class="row"><span>Their cut</span><span>${pct(def.cut)}</span></div>
            <div class="row"><span>Washed today</span><span class="money">${money(b.launderedToday)}</span></div>
          </div>
        </div>`;
    }

    return (
      `<h2 class="ttl">${esc(b.name)}${b.level > 1 ? ` <span style="color:var(--sodium)">L${b.level}</span>` : ''}</h2>
      <p class="subttl">${esc(d ? d.name : '—')}</p>
      ${b.stalledReason ? `<div class="chips" style="margin-bottom:12px"><span class="chip chip--warn">${esc(b.stalledReason)}</span></div>` : ''}
      ${!b.active ? '<div class="chips" style="margin-bottom:12px"><span class="chip chip--bad">Shut down</span></div>' : ''}
      ${body}
      <div class="sect">
        <div class="sect__title"><span>Running costs</span></div>
        <div class="rows">
          <div class="row"><span>Upkeep</span><span>${money(upkeepFor(b))}/day</span></div>
          <div class="row"><span>Heat added</span><span class="${def.heatPerDay > 0 ? 'warn' : 'good'}">${def.heatPerDay > 0 ? '+' : ''}${(def.heatPerDay * effectsFor(b).heatMult).toFixed(2)}/day</span></div>
          ${effectsFor(b).raidResist > 0 ? `<div class="row"><span>Raid resistance</span><span class="good">${pct(effectsFor(b).raidResist)}</span></div>` : ''}
        </div>
      </div>
      ${this.upgradeBlock(b)}
      <div class="btnrow">
        ${b.kind !== 'front' ? `<button class="primarybtn" data-action="route-from" data-id="${b.id}" data-tab="routes">Ship from here</button>` : ''}
      </div>
      <div class="btnrow">
        <button class="ghostbtn" data-action="toggle" data-id="${b.id}">${b.active ? 'Shut down' : 'Reopen'}</button>
        <button class="ghostbtn" data-action="sell-building" data-id="${b.id}">Sell up</button>
      </div>`
    );
  }

  /** Everything that can still be done to this building, priced and explained. */
  upgradeBlock(b) {
    const s = this.game.state;
    const list = availableUpgrades(b);
    if (!list.length) return '';

    const installed = list.filter((u) => u.owned);
    const open = list.filter((u) => !u.owned);

    const row = (u) => {
      const short = s.cash.clean < u.cost;
      const effects = describeEffects(u.effects);
      return `
        <button class="card ${short ? 'is-locked' : ''}"
          data-action="upgrade" data-id="${b.id}" data-type="${u.id}" ${short ? 'disabled' : ''}>
          <div class="card__head">
            <span class="card__name">${esc(u.name)}</span>
            <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(u.cost)}</span>
          </div>
          <div class="card__blurb">${esc(u.blurb)}</div>
          <div class="card__meta">
            ${effects.map((e) => `<span style="color:${e.startsWith('+$') ? 'var(--warn)' : 'var(--good)'}">${esc(e)}</span>`).join('')}
          </div>
        </button>`;
    };

    return `
      <details class="upgrades" ${open.length && !installed.length ? 'open' : ''}>
        <summary>
          <span>Upgrades</span>
          <span class="upgrades__count">${installed.length}/${list.length} installed</span>
        </summary>
        <div class="upgrades__body">
          ${open.length ? open.map(row).join('') : '<div class="empty">Fully built out.</div>'}
          ${installed.length ? `<div class="sect__title" style="margin-top:10px"><span>Installed</span></div>
            <div class="chips">${installed.map((u) => `<span class="chip chip--good">${esc(u.name)}</span>`).join('')}</div>` : ''}
        </div>
      </details>`;
  }

  courierPanel(c) {
    const s = this.game.state;
    const def = COURIERS[c.type];
    const route = s.routes.find((r) => r.id === c.routeId);
    const info = route ? routeLabel(s, route) : null;
    const carried = PRODUCT_IDS.reduce((n, p) => n + c.cargo[p], 0);

    return (
      `<h2 class="ttl">${esc(c.name)}</h2>
      <p class="subttl">${esc(this.phaseLabel(c))}</p>
      <div class="sect">
        <div class="sect__title"><span>Load</span><span>${units(carried)} / ${def.capacity}</span></div>
        <div class="meter"><i style="width:${(carried / def.capacity) * 100}%"></i></div>
        <div class="rows" style="margin-top:9px">
          ${PRODUCT_IDS.filter((p) => c.cargo[p] > 0.01)
            .map((p) => `<div class="row"><span>${esc(PRODUCTS[p].name)}</span><span>${units(c.cargo[p])}</span></div>`)
            .join('') || '<div class="row"><span>Empty</span><span>—</span></div>'}
        </div>
      </div>
      <div class="sect">
        <div class="sect__title"><span>Assignment</span></div>
        ${info
          ? `<div class="rows">
               <div class="row"><span>Route</span><span>${esc(info.from)} → ${esc(info.to)}</span></div>
               <div class="row"><span>Leg</span><span>${km(route.km)}</span></div>
               <div class="row"><span>One way</span><span>${duration(route.km / def.speedKph)}</span></div>
               <div class="row"><span>Runs done</span><span>${c.tripsCompleted}</span></div>
             </div>`
          : '<div class="empty">Parked with no route. Assign one from the Fleet tab.</div>'}
      </div>
      <div class="sect">
        <div class="sect__title"><span>Vehicle</span></div>
        <div class="rows">
          <div class="row"><span>Speed</span><span>${def.speedKph} km/h</span></div>
          <div class="row"><span>Keeps a low profile</span><span>${pct(def.stealth)}</span></div>
          <div class="row"><span>Wage</span><span>${money(def.wagePerDay)}/day</span></div>
        </div>
      </div>
      <div class="btnrow">
        <button class="ghostbtn" data-action="goto-tab" data-tab="fleet">Fleet</button>
        <button class="ghostbtn" data-action="fire" data-id="${c.id}">Let go</button>
      </div>`
    );
  }

  // --- Placement banner -----------------------------------------------------

  setPlacing() { /* property is bought, not placed — nothing to show */ }

  /** Buildings stream in as you explore; this says when that's happening. */
  setLoading(text) {
    if (!this.dom.loading) return;
    this.dom.loading.hidden = !text;
    if (text) this.dom.loading.textContent = text;
  }
}

export { SPEEDS };
