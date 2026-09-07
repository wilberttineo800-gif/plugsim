// The console: HUD, left rail (build / fleet / routes / ledger) and the
// contextual inspector. Rendering is plain template strings plus event
// delegation — cheap enough to redraw the whole panel on any state change.

import {
  BUILDINGS, BUILDING_IDS, COURIERS, COURIER_IDS, PRODUCTS, PRODUCT_IDS, SPEEDS,
} from '../game/constants.js';
import { streetPrice, baselinePrice, saturation, sellRatePerHour, rivalShare } from '../game/economy.js';
import { levelCapacity, levelYield, upgradeCost } from '../game/sim.js';
import { routeLabel, fixerRemaining, muscleCost, operationOptions } from '../game/actions.js';
import { KIND_LABEL, lotById, lotResale } from '../game/lots.js';
import { crewById } from '../game/crews.js';
import { FIXER } from '../game/constants.js';
import { buildingById, courierById, districtById, clockOf } from '../game/state.js';
import { OVERLAYS, overlayValue, overlayColor } from '../map/mapView.js';
import { esc, money, moneyShort, units, pct, km, duration, qualityLabel } from './format.js';
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
      case 'develop': g.developLot(id, type); break;
      case 'select-lot': g.select('lot', id); break;
      case 'hire': g.hireCourier(type); break;
      case 'fire': g.fireCourier(id); break;
      case 'upgrade': g.upgradeBuilding(id); break;
      case 'toggle': g.toggleBuilding(id); break;
      case 'sell-building': g.sellBuilding(id); break;
      case 'select-building': g.select('building', id); break;
      case 'select-district': g.select('district', id); break;
      case 'select-courier': g.select('courier', id); break;
      case 'focus': g.focusOn(type, id); break;
      case 'remove-route': g.removeRoute(id); break;
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

  renderRail() {
    const map = {
      build: () => this.tabBuild(),
      blocks: () => this.tabBlocks(),
      fleet: () => this.tabFleet(),
      routes: () => this.tabRoutes(),
      ledger: () => this.tabLedger(),
    };
    this.dom.railBody.innerHTML = (map[this.tab] || map.build)();
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
    const opts = operationOptions(lot).map((o) => {
      const short = s.cash.clean < o.def.cost;
      const blocked = !o.fits || short;
      const note = !o.fits ? o.reason : short ? `Need ${moneyShort(o.def.cost)} clean` : null;
      return `
        <button class="card ${blocked ? 'is-locked' : ''}"
          data-action="develop" data-id="${lot.id}" data-type="${o.id}" ${blocked ? 'disabled' : ''}>
          <div class="card__head">
            <span class="card__name">${esc(o.def.name)}</span>
            <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(o.def.cost)}</span>
          </div>
          <div class="card__meta">
            ${o.fits ? `<span style="color:var(--good)">×${o.scale.toFixed(2)} output at ${Math.round(lot.areaM2)} m²</span>` : ''}
            ${note ? `<span style="color:var(--warn)">${esc(note)}</span>` : ''}
          </div>
        </button>`;
    }).join('');
    return `<div class="sect__title" style="margin-top:4px"><span>Fit out ${esc(lot.name)}</span></div>${opts}`;
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
        return `<option value="${r.id}" ${c.routeId === r.id ? 'selected' : ''}>${esc(info.from)} → ${esc(info.to)}</option>`;
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
      `<option value="${b.id}" ${d.fromId === b.id ? 'selected' : ''}>${esc(b.name)} — ${esc(districtById(s, b.districtId)?.name || '')}</option>`
    ).join('');

    const buildingOpts = s.buildings
      .filter((b) => b.id !== d.fromId && b.kind !== 'front')
      .map((b) => `<option value="building:${b.id}" ${d.toKey === `building:${b.id}` ? 'selected' : ''}>▸ ${esc(b.name)}</option>`)
      .join('');

    const districtOpts = [...s.districts]
      .sort((a, b) => b.demandPerHour.weed - a.demandPerHour.weed)
      .map((dd) => `<option value="district:${dd.id}" ${d.toKey === `district:${dd.id}` ? 'selected' : ''}>◆ ${esc(dd.name)} — sells ${units(dd.demandPerHour.weed + dd.demandPerHour.shrooms)}/h</option>`)
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
          <button class="ghostbtn" data-action="remove-route" data-id="${r.id}">Close route</button>
        </div>
      </div>`
    );
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
          <div class="row"><span>Gross revenue</span><span class="money">${money(st.grossRevenue)}</span></div>
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
    this.dom.inspectorBody.innerHTML = html;
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
    const affordable = s.cash.clean >= lot.price;

    const facts =
      `<div class="rows">
        <div class="row"><span>Type</span><span>${esc(KIND_LABEL[lot.kind] || lot.kind)}</span></div>
        <div class="row"><span>Footprint</span><span>${Math.round(lot.areaM2).toLocaleString()} m²</span></div>
        <div class="row"><span>Block</span><span>${esc(d ? d.name : '—')}</span></div>
        ${d ? `<div class="row"><span>Rent level</span><span>${pct(d.rentIndex)}</span></div>` : ''}
      </div>`;

    if (running) {
      return (
        `<h2 class="ttl">${esc(lot.name)}</h2>
        <p class="subttl">Yours · ${esc(BUILDINGS[running.type].name)}</p>
        ${facts}
        <div class="btnrow">
          <button class="primarybtn" data-action="select-building" data-id="${running.id}">Open the operation</button>
        </div>`
      );
    }

    if (lot.owned) {
      return (
        `<h2 class="ttl">${esc(lot.name)}</h2>
        <p class="subttl">Yours · standing empty</p>
        ${facts}
        <div class="sect" style="margin-top:14px">
          <div class="sect__title"><span>Put it to work</span></div>
          ${this.lotDevelopBlock(lot)}
        </div>`
      );
    }

    return (
      `<h2 class="ttl">${esc(lot.name)}</h2>
      <p class="subttl">On the market · ${esc(d ? d.name : '')}</p>
      ${facts}
      <div class="sect" style="margin-top:14px">
        <div class="sect__title"><span>Asking price</span>
          <span class="money" style="font-size:15px">${money(lot.price)}</span></div>
        <button class="primarybtn" style="width:100%" data-action="buy-lot" data-id="${lot.id}"
          ${affordable ? '' : 'disabled'}>
          ${affordable ? 'Buy this building' : `Need ${moneyShort(lot.price)} clean`}
        </button>
        <p class="card__blurb" style="margin-top:8px">
          Buying gets you the premises. You choose what runs inside after that —
          bigger floorplates carry bigger operations.
        </p>
      </div>`
    );
  }

  buildingPanel(b) {
    const s = this.game.state;
    const def = BUILDINGS[b.type];
    const d = districtById(s, b.districtId);
    const up = upgradeCost(b);
    const canUp = b.level < 5 && s.cash.clean >= up;

    let body = '';
    if (def.kind === 'production') {
      const p = PRODUCTS[def.product];
      const cap = def.capacity * levelCapacity(b.level);
      const perCycle = def.slots * def.rawPerSlot * levelYield(b.level);
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
      const cap = def.capacity * levelCapacity(b.level);
      const held = PRODUCT_IDS.reduce((n, p) => n + b.packs[p], 0);
      body =
        `<div class="sect">
          <div class="sect__title"><span>Throughput</span><span>${units(def.rawPerHour * levelYield(b.level))} raw/h</span></div>
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
      const cap = def.capacity * levelCapacity(b.level);
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
          <div class="sect__title"><span>Laundry</span></div>
          <div class="rows">
            <div class="row"><span>Capacity</span><span>${money(def.launderPerDay * levelYield(b.level))}/day</span></div>
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
          <div class="row"><span>Upkeep</span><span>${money(def.upkeepPerDay * (1 + (b.level - 1) * 0.35))}/day</span></div>
          <div class="row"><span>Heat added</span><span class="${def.heatPerDay > 0 ? 'warn' : 'good'}">${def.heatPerDay > 0 ? '+' : ''}${def.heatPerDay.toFixed(2)}/day</span></div>
        </div>
      </div>
      <div class="btnrow">
        ${b.kind !== 'front' ? `<button class="primarybtn" data-action="route-from" data-id="${b.id}" data-tab="routes">Ship from here</button>` : ''}
        <button class="ghostbtn" data-action="upgrade" data-id="${b.id}" ${canUp ? '' : 'disabled'}>
          ${b.level >= 5 ? 'Maxed' : `Upgrade ${moneyShort(up)}`}
        </button>
      </div>
      <div class="btnrow">
        <button class="ghostbtn" data-action="toggle" data-id="${b.id}">${b.active ? 'Shut down' : 'Reopen'}</button>
        <button class="ghostbtn" data-action="sell-building" data-id="${b.id}">Sell up</button>
      </div>`
    );
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
}

export { SPEEDS };
