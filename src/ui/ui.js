// The console: HUD, left rail (build / fleet / routes / ledger) and the
// contextual inspector. Rendering is plain template strings plus event
// delegation — cheap enough to redraw the whole panel on any state change.

import {
  BUILDINGS, BUILDING_IDS, COURIERS, COURIER_IDS, COURIER_CLASSES,
  PRODUCTS, PRODUCT_IDS, SPEEDS, SPEED_NOTES,
  UNIT_LADDER, RETAIL_MARKUP,
} from '../game/constants.js';
import { streetPrice, baselinePrice, saturation, sellRatePerHour, rivalShare } from '../game/economy.js';
import { cityPrice, PRICE_SAMPLE_HOURS } from '../game/sim.js';
import { sizeScale, sizeCapacity, rentBonusFor } from '../game/sim.js';
import { routeLabel, fixerRemaining, muscleCost, operationOptions, fleetSpaces, fittingDiscount } from '../game/actions.js';
import { HELPER, currentStep, progress as onboardingProgress } from '../game/onboarding.js';
import { pendingTip } from '../game/guide.js';
import {
  LICENCES, LICENCE_IDS, FIREARM_CLASSES, FIREARM_CLASS_IDS, canApply, licenceRecord,
  hasLicence, classOf, MODELS, modelsFor, modelOf, incompatibleParts, builtInParts,
} from '../game/firearms.js';
import { turfUpgrades, turfUpkeep, turfEffects, isHeld, claimBlocker, districtName } from '../game/turf.js';
import { rhythmNote, rhythmFactor, darkness, cityClock, DAY_NAMES } from '../game/rhythm.js';
import {
  RESEARCH, PROJECTS, PROJECT_IDS, FIELDS, projectById, canResearch, isResearched,
  ITEM_KINDS, tierById, itemValue,
  ATTACHMENTS, ATTACHMENT_SLOTS, attachmentById, attachmentEffects, fittedTo,
} from '../game/research.js';
import {
  gunArt, gunWithAttachments, attachmentArt, productArt, modelArt, modelWithAttachments,
  vehicleArt,
} from './art.js';
import {
  leaderboard, trendOf, knownOperations, operationsIn, turfWarning,
  offerForItem, offerForProduct,
} from '../game/players.js';
import { connection } from '../game/net.js';
import {
  KIND_LABEL, lotById, lotResale, priceBreakdown, sqft, marketValue, rentPerDay, lotPnL,
} from '../game/lots.js';
import { crewById } from '../game/crews.js';

import { summary as diagnosticsSummary, report as diagnosticsReport, clear as diagnosticsClear } from '../game/diagnostics.js';
import { unlockStatus, regionNote, buildingPreview} from '../game/progression.js';
import { citiesOf, cityOfDistrict, distanceKm, foundingCost, openableFrom, quoteShipment,
  homeCity } from '../game/cities.js';
import {
  availableUpgrades, describeEffects, effectsFor, upkeepFor, vehicleUpgrades, vehicleStats,
  maxRoutesFor, rentUpgrades,
} from '../game/upgrades.js';
import { FIXER, LEGIT_WEALTH_SWING } from '../game/constants.js';
import {
  buildingById, courierById, districtById, clockOf, nextDriverHireFee, driverById,
  buildingLabel, typeLabel, typeLabelFor,
} from '../game/state.js';
import { OVERLAYS, overlayValue, overlayColor } from '../map/mapView.js';
import { esc, money, moneyShort, units, pct, km, duration, qualityLabel, clip, crimeLabel } from './format.js';
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

    // Which disclosures the player has open. Panels are rebuilt on a timer, so
    // without this any list they expanded would snap shut under them.
    this.openDisclosures = new Set();

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

  /**
   * Push a sheet down to dismiss it. Dragging starts on the grip, or anywhere
   * in the sheet's body when it's already scrolled to the top — which is how
   * every sheet on a phone behaves, so it's what a player will try first.
   */
  makeDraggable(sheet, grip) {
    if (!sheet) return;
    let startY = 0;
    let dy = 0;
    let dragging = false;
    let fromGrip = false;

    const body = sheet.querySelector('.rail__body, #inspectorBody') || sheet;

    const begin = (e) => {
      if (!this.isPhone() || !sheet.classList.contains('is-open')) return;
      fromGrip = grip && (e.target === grip || grip.contains(e.target));
      // From the body, only when there's nothing above to scroll to — otherwise
      // the player is trying to scroll, not dismiss.
      if (!fromGrip && body.scrollTop > 0) return;
      dragging = true;
      startY = e.clientY;
      dy = 0;
      sheet.style.transition = 'none';
      // Capture keeps the gesture even if the thumb leaves the sheet. Some
      // pointers can't be captured; that's not a reason to abandon the drag.
      try { sheet.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    };

    const move = (e) => {
      if (!dragging) return;
      dy = e.clientY - startY;
      if (dy < 0) dy = dy * 0.25;          // a little resistance upward
      sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
      // Once it's clearly a drag, stop the body scrolling under it.
      if (Math.abs(dy) > 6) e.preventDefault();
    };

    const end = () => {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
      // Far enough down and it goes; otherwise it springs back.
      if (dy > 90) this.closeSheets();
    };

    sheet.addEventListener('pointerdown', begin);
    sheet.addEventListener('pointermove', move, { passive: false });
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
    sheet.addEventListener('lostpointercapture', end);
  }

  closeSheets() {
    this.dom.rail.classList.remove('is-open');
    this.dom.inspector.classList.remove('is-open');
    this.dom.rail.style.transform = '';
    this.dom.inspector.style.transform = '';
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
    // `toggle` doesn't bubble, so it has to be caught in the capture phase.
    for (const host of [this.dom.railBody, this.dom.inspectorBody]) {
      host.addEventListener('toggle', (e) => {
        const d = e.target.closest ? e.target : null;
        if (!d || d.tagName !== 'DETAILS' || !d.dataset.disc) return;
        if (d.open) {
          this.openDisclosures.add(d.dataset.disc);
          this.openDisclosures.delete('!' + d.dataset.disc);
        } else {
          this.openDisclosures.delete(d.dataset.disc);
          this.openDisclosures.add('!' + d.dataset.disc);
        }
      }, true);
    }

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
    // A sheet with a handle looks draggable, so make it draggable. Tapping the
    // grip still closes it; now so does pushing it down.
    this.makeDraggable(this.dom.rail, document.getElementById('railGrip'));
    this.makeDraggable(this.dom.inspector, document.getElementById('inspectorGrip'));
    this.phone.addEventListener('change', () => this.syncLayout());

    // Tap to go to where you are; hold (or tap again when already there) to
    // follow your real position around town.
    document.getElementById('btnWhereAmI').addEventListener('click', () => {
      const g = this.game;
      const s = g.state;
      const hq = s.hqBuildingId ? s.buildings.find((b) => b.id === s.hqBuildingId) : null;
      const at = s.followMe ? s.playerAt : (hq ? hq.latlng : s.playerAt || s.origin);
      const alreadyThere = at && g.map.getZoom() >= 17
        && g.map.distance([at.lat, at.lng], g.map.getCenter()) < 120;
      if (alreadyThere) { g.toggleFollowMe(); return; }
      if (at) g.map.setView([at.lat, at.lng], Math.max(17, g.map.getZoom()));
    });
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
    if (name === 'vehicleDriver') {
      this.game.assignDriver(field.dataset.vehicle, value || null);
      return;
    }
    if (name === 'courierRoute') {
      if (value) this.game.addLine(field.dataset.courier, value);
      return;
    }
    if (name === 'sellItemTo') {
      if (value) this.game.sellItemTo(value, field.dataset.player);
      return;
    }
    if (name === 'playerName') {
      this.game.setPlayerName(value);
      return;
    }
    if (name === 'equipItem') {
      this.game.equipItem(field.dataset.item, value || null);
      return;
    }
    if (name === 'buildingName') {
      this.game.renameBuilding(field.dataset.building, value);
      return;
    }
    if (name === 'districtName') {
      this.game.renameDistrict(field.dataset.district, value);
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
      case 'hire': g.buyVehicle(type); break;
      case 'hire-driver': g.hireDriver(); break;
      case 'sell-vehicle': g.sellVehicle(id); break;
      case 'fire': g.fireCourier(id); break;
      case 'upgrade': g.upgradeBuilding(id, type); break;
      case 'upgrade-courier': g.upgradeCourier(id, type); break;
      case 'set-hq': g.setHeadquarters(id); break;
      case 'drop-line': g.dropLine(id, type); break;
      case 'improve-rental': g.improveRental(id, type); break;
      case 'apply-licence': g.applyForLicence(type); break;
      case 'renew-licence': g.renewLicence(type); break;
      case 'set-line': g.setProductionLine(id, type); break;
      case 'set-model': g.setModel(id, type); break;
      case 'improve-turf': g.improveTurf(id, type); break;
      case 'end-turf': g.endTurfUpgrade(id, type); break;
      case 'start-research': g.startResearch(type); break;
      case 'cancel-research': g.cancelResearch(type); break;
      case 'sell-item': g.sellItem(id); break;
      case 'fit-attachment': g.equipItem(id, type); break;
      case 'unfit': g.equipItem(id, null); break;
      case 'toggle-ai': g.toggleAI(); break;
      case 'sell-to': {
        const [pid, product] = String(type).split(':');
        g.sellProductTo(id, pid, product);
        break;
      }
      case 'dismiss-helper': g.dismissHelper(type); break;
      case 'toggle': g.toggleBuilding(id); break;
      case 'toggle-selling': g.toggleSelling(id); break;
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
      case 'diag-copy': g.copyDiagnostics(); break;
      case 'diag-clear': diagnosticsClear(); this.renderRail(true); break;
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
      case 'found-city': g.foundCity(type); break;
      case 'goto-tab':
        // Acting on a tip counts as having heard it.
        if (type && g.dismissHelper) g.dismissHelper(type);
        this.goTab(tab);
        break;
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

    // What the city is doing right now — a Friday night trades very differently
    // from a Tuesday morning, and that should be visible without arithmetic.
    const pulse = document.getElementById('hudPulse');
    if (pulse) {
      const note = rhythmNote(s.minutes);
      if (pulse.textContent !== note) pulse.textContent = note;
      pulse.classList.toggle('is-busy', /busy|payday|filling/.test(note));
    }

    const flow = this.dailyNet();
    // Anything stopped because the money ran out is the one thing that must not
    // be quiet — it ends a run without the player ever seeing why.
    const broke = s.buildings.filter((b) => b.stalledBroke);
    const warn = document.getElementById('hudWarning');
    if (warn) {
      const show = broke.length > 0;
      warn.hidden = !show;
      if (show) {
        const text = broke.length === 1
          ? `${broke[0].name.split(' · ')[0]} has stopped — no money for supplies`
          : `${broke.length} sites stopped — no money for supplies`;
        if (warn.textContent !== text) warn.textContent = text;
      }
    }
    this.dom.flow.textContent = `${flow >= 0 ? '+' : ''}${moneyShort(flow)}`;
    this.dom.flow.style.color = flow >= 0 ? 'var(--good)' : 'var(--bad)';

    for (const b of this.dom.speedGroup.children) {
      const idx = Number(b.dataset.speed);
      b.classList.toggle('is-on', idx === s.speedIndex);
      if (!b.title) b.title = SPEED_NOTES[SPEEDS[idx]] || '';
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
        income += sellRatePerHour(d, pid, s.minutes) * 24 * streetPrice(d, pid);
      }
    }
    let costs = 0;
    for (const b of s.buildings) {
      if (!b.active) continue;
      const def = BUILDINGS[b.type];
      costs += upkeepFor(b);
      if (def.kind === 'front') income += this.legitTakings(b);
      if (def.kind === 'production') {
        costs += (def.supplyCostPerSlot * def.slots * sizeScale(b) * 24) / def.cycleHours;
      }
    }
    for (const d of s.drivers || []) costs += d.wagePerDay;
    for (const v of s.couriers) costs += COURIERS[v.type].upkeepPerDay;
    // Rent you collect and arrangements you pay for are both real daily money.
    const rentLift = 1 + rentBonusFor(s);
    for (const lot of s.lots || []) {
      if (lot.owned && lot.rented) {
        income += rentPerDay(lot, districtById(s, lot.districtId)) * rentLift;
      }
    }
    costs += turfUpkeep(s);
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


  /**
   * Where you operate, what is in the wind, and where you could go next.
   *
   * The argument for a second city is not more room — it is a different market.
   * So each city leads with what it pays for your biggest earner, and each
   * destination leads with what opening it would cost against what the trip
   * would then be worth.
   */
  tabCities() {
    const s = this.game.state;
    const cities = citiesOf(s);
    const home = homeCity(s);

    const cityRows = cities.map((c) => {
      const blocks = s.districts.filter((d) => (d.cityId || 'city-home') === c.id);
      const mine = s.buildings.filter((b) => {
        const d = s.districts.find((x) => x.id === b.districtId);
        return d && (d.cityId || 'city-home') === c.id;
      }).length;
      const best = blocks.slice().sort((a, b) =>
        (b.demandPerHour.weed || 0) - (a.demandPerHour.weed || 0))[0];
      const km = c.home ? 0 : distanceKm(home, c);
      return `<div class="card">
        <div class="card__head">
          <span class="card__name">${esc(c.name)}${c.home ? ' <span style="color:var(--text-faint)">· home</span>' : ''}</span>
          <span class="card__cost">${mine} ${mine === 1 ? 'place' : 'places'}</span>
        </div>
        <div class="card__meta">
          <span>${blocks.length} blocks</span>
          ${km ? `<span>${Math.round(km).toLocaleString()} km out</span>` : ''}
          ${best ? `<span style="color:var(--money)">${money(streetPrice(best, 'weed'))}/lb</span>` : ''}
          ${c.countryCode ? `<span style="color:var(--text-faint)">${esc(String(c.countryCode).toUpperCase())}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    const flights = (s.shipments || []).map((sh) => {
      const to = cities.find((c) => c.id === sh.toCityId);
      const hoursLeft = Math.max(0, (sh.arrivesAtMinute - s.minutes) / 60);
      return `<div class="card">
        <div class="card__head">
          <span class="card__name">${units(sh.amount)} ${esc(PRODUCTS[sh.productId].packName)}</span>
          <span class="card__cost">to ${esc(to ? to.name : '?')}</span>
        </div>
        <div class="card__meta">
          <span>${(hoursLeft / 24).toFixed(1)} days out</span>
          <span class="${sh.risk > 0.3 ? 'warn' : ''}">${Math.round(sh.risk * 100)}% it doesn't arrive</span>
          <span style="color:var(--text-faint)">${money(sh.fee)} to carry</span>
        </div>
      </div>`;
    }).join('');

    const options = openableFrom(s).slice(0, 8).map((d) => {
      const cost = foundingCost(s, d.distance);
      const short = s.cash.clean < cost;
      const q = quoteShipment(s, home, d, 100, 0);
      return `<button class="card ${short ? 'is-locked' : ''}"
        data-action="found-city" data-type="${esc(d.name)}" ${short ? 'disabled' : ''}>
        <div class="card__head">
          <span class="card__name">${esc(d.name)}</span>
          <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(cost)}</span>
        </div>
        <div class="card__meta">
          <span>${Math.round(d.distance).toLocaleString()} km</span>
          <span>${(q.hours / 24).toFixed(1)} days by smuggler</span>
          <span class="${q.risk > 0.3 ? 'warn' : ''}">${Math.round(q.risk * 100)}% risk on 100 lb</span>
          ${d.crossesBorder ? '<span style="color:var(--warn)">border</span>' : ''}
        </div>
      </button>`;
    }).join('');

    return `<div class="sect">
        <div class="sect__title"><span>Where you operate</span><span>${cities.length}</span></div>
        ${cityRows}
      </div>
      ${(s.shipments || []).length ? `<div class="sect">
        <div class="sect__title"><span>In the wind</span><span>${s.shipments.length}</span></div>
        <p class="card__blurb" style="margin:0 0 8px">
          Handed to a smuggler. Nothing to watch — it either turns up or it
          doesn't, and splitting a load across runs is safer than sending it all
          at once.
        </p>
        ${flights}
      </div>` : ''}
      <div class="sect">
        <div class="sect__title"><span>Open somewhere new</span>
          <span style="color:var(--text-faint)">clean money</span></div>
        <p class="card__blurb" style="margin:0 0 8px">
          Not more room — a different market. Another country prices every
          product differently, which is the whole reason to move weight there
          rather than sell it at home.
        </p>
        ${options || '<div class="empty">Nowhere left on the list.</div>'}
      </div>`;
  }

  renderRail(force = false) {
    const map = {
      build: () => this.tabBuild(),
      blocks: () => this.tabBlocks(),
      market: () => this.tabMarket(),
      fleet: () => this.tabFleet(),
      routes: () => this.tabRoutes(),
      lab: () => this.tabLab(),
      cities: () => this.tabCities(),
      ledger: () => this.tabLedger(),
      admin: () => this.tabAdmin(),
    };
    const html = this.helperRail() + (map[this.tab] || map.build)();
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

  /**
   * Should this disclosure render open? The player's own choice wins; otherwise
   * fall back to whatever the panel considers a sensible default.
   */
  discOpen(key, fallback) {
    const open = this.openDisclosures;
    if (!open) return fallback;
    if (open.has(key)) return true;
    if (open.has('!' + key)) return false;
    return fallback;
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
            aria-label="price over the last ${Math.max(1, Math.round((vals.length - 1) * 6 / 24))} days">
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
      const art = productArt(pid, {
        size: 34, color: known ? p.color : 'var(--text-faint)',
      });

      // Where it sells best right now.
      const ranked = [...s.districts]
        .map((d) => ({ d, price: streetPrice(d, pid), rate: sellRatePerHour(d, pid, s.minutes) }))
        .sort((a, b) => b.price - a.price);
      const top = ranked.slice(0, 3);
      // Demand-weighted, matching how the history series is recorded.
      const avg = cityPrice(s, pid).avg;

      // What you're holding, everywhere.
      const held = s.buildings.reduce((n, b) => n + (b.packs[pid] || 0), 0);
      const raw = s.buildings.reduce((n, b) => n + (b.raw[pid] || 0), 0);
      const onStreet = s.districts.reduce((n, d) => n + d.supply[pid], 0);

      const series = (s.priceHistory || {})[pid];
      const first = series && series.length > 1 ? series[0].avg : null;
      const move = first ? (avg - first) / first : 0;
      const spanDays = series && series.length > 1
        ? Math.max(1, Math.round((series.length - 1) * PRICE_SAMPLE_HOURS / 24))
        : 0;
      const region = regionNote(s.countryCode, pid);

      return `
        <div class="card card--goods" style="cursor:default;${known ? '' : 'opacity:.55'}">
          <div class="card__head">
            <span class="card__name" style="color:${esc(p.color)}">
              <span class="goods__art">${art}</span>${esc(p.name)}</span>
            <span class="card__cost">${money(avg)}<span style="color:var(--text-faint)">/pack</span></span>
          </div>
          ${this.sparkline(series, 'avg', p.color)}
          <div class="rows" style="margin-top:6px">
            <div class="row"><span>Last ${spanDays} day${spanDays === 1 ? '' : 's'}</span>
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
    </div>` + this.licenceBlock();
  }

  /**
   * Firearms paperwork. Two ways to sell iron — over a counter with a licence,
   * or on the street for a lot more and a lot more risk — and this is where the
   * legal route gets bought.
   */
  licenceBlock() {
    const s = this.game.state;
    const worstHeat = Math.round(Math.max(0, ...s.districts.map((d) => d.heat || 0)));

    const rows = LICENCE_IDS.map((id) => {
      const def = LICENCES[id];
      const rec = licenceRecord(s, id);
      const gate = canApply(s, id);
      const short = s.cash.clean < def.cost;

      if (rec && rec.status === 'active') {
        const due = Math.max(0, Math.round(rec.renewsInDays ?? 365));
        return `<div class="card">
          <div class="card__head">
            <span class="card__name">${esc(def.name)}</span>
            <span class="card__cost good">in force</span>
          </div>
          <div class="card__meta">
            <span class="${due < 45 ? 'warn' : ''}">renews in ${due} days</span>
            <span>${money(def.renewalPerYear)}/year</span>
          </div>
          ${due < 60 ? `<div class="btnrow">
            <button class="ghostbtn" data-action="renew-licence" data-type="${id}">
              Renew now · ${moneyShort(def.renewalPerYear)}</button>
          </div>` : ''}
        </div>`;
      }

      if (rec && rec.status === 'pending') {
        return `<div class="card">
          <div class="card__head">
            <span class="card__name">${esc(def.name)}</span>
            <span class="card__cost warn">with the examiner</span>
          </div>
          <div class="card__meta"><span>${Math.ceil(rec.daysLeft)} days to go</span></div>
        </div>`;
      }

      const blocked = !gate.ok || short;
      return `<button class="card ${blocked ? 'is-locked' : ''}"
        data-action="apply-licence" data-type="${id}" ${blocked ? 'disabled' : ''}>
        <div class="card__head">
          <span class="card__name">${esc(def.name)}</span>
          <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(def.cost)}</span>
        </div>
        <div class="card__blurb">${esc(def.blurb)}</div>
        <div class="card__meta">
          <span>${def.processingDays} days to come back</span>
          <span>${money(def.renewalPerYear)}/year after</span>
          ${rec && rec.status === 'lapsed' ? '<span class="bad">lapsed</span>' : ''}
        </div>
        ${!gate.ok ? `<div class="card__meta"><span class="warn">${esc(gate.reason)}</span></div>` : ''}
      </button>`;
    }).join('');

    return `<div class="sect">
      <div class="sect__title"><span>Firearms licensing</span><span>heat ${worstHeat}</span></div>
      <p class="card__blurb" style="margin:0 0 10px">
        Iron sells two ways. Over a counter it's clean money at legal prices, and
        nobody comes through the door. Unserialised on the street it's worth far
        more, and it's the hottest thing you can move.
      </p>
      ${rows}
    </div>`;
  }

  /**
   * The board. Other operations in the same city, and where you stand against
   * them. AI for now; the shape doesn't change when they're real people.
   */
  leaderboardSection() {
    const s = this.game.state;
    const board = leaderboard(s, (lot) => lotResale(lot, districtById(s, lot.districtId)));
    const you = board.find((e) => e.isYou);

    const rows = board.map((e) => {
      const t = trendOf(e);
      const arrow = t == null ? '' : t >= 0.005 ? '▲' : t <= -0.005 ? '▼' : '·';
      const cls = t == null ? '' : t > 0 ? 'good' : t < 0 ? 'bad' : '';
      return `<div class="row ${e.isYou ? 'row--you' : ''}">
        <span>${e.rank}. ${esc(e.name)}${e.isYou ? ' <b>(you)</b>' : ''}
          <span style="color:var(--text-faint)"> · ${esc(e.styleLabel)}</span></span>
        <span class="money">${moneyShort(e.worth)}
          <span class="${cls}">${arrow}</span></span>
      </div>`;
    }).join('');

    return `<div class="sect">
      <div class="sect__title">
        <span>Wealth board</span>
        <span>${you ? `#${you.rank} of ${board.length}` : ''}</span>
      </div>
      <div class="field">
        <label>What they call you</label>
        <input type="text" data-field="playerName" maxlength="24"
          value="${esc((s.playerProfile && s.playerProfile.name) || '')}" placeholder="You">
      </div>
      <div class="rows" style="margin-top:9px">${rows}</div>
      ${s.aiDisabled
        ? '<p class="card__blurb" style="margin:8px 0 0">Other operations are switched off.</p>'
        : `<p class="card__blurb" style="margin:8px 0 0">
            Everyone here is building the same kind of business. Net worth is
            money plus what your property would fetch.
            <span style="color:var(--text-faint)">${esc(connection().label)}.</span>
          </p>`}
    </div>` + this.contactsSection();
  }

  /**
   * The people you've actually met, and what they'll take off you. You only
   * find somebody by working the same ground as them, which is why this fills
   * up slowly rather than being handed to you.
   */
  contactsSection() {
    const s = this.game.state;
    if (s.aiDisabled) return '';
    const met = knownOperations(s);
    const total = (s.players || []).length;

    if (!met.length) {
      return `<div class="sect">
        <div class="sect__title"><span>People you know</span><span>0 of ${total}</span></div>
        <p class="card__blurb" style="margin:0">
          You haven't run into anybody yet. Work the same blocks as somebody
          else — sell there, buy there — and you'll find each other. They'll
          take product in bulk and pay properly for anything you've made.
        </p>
      </div>`;
    }

    // What you could actually hand over right now.
    const items = s.items || [];
    const stocked = s.buildings.filter(
      (b) => b.packs && PRODUCT_IDS.some((p) => b.packs[p] > 0.5)
    );

    const cards = met.map((p) => {
      const where = (p.blocks || [])
        .map((id) => districtById(s, id))
        .filter(Boolean)
        .map((d) => districtName(d));

      // Best product offer they'd make against the street, for the headline.
      let best = null;
      for (const b of stocked) {
        for (const pid of PRODUCT_IDS) {
          if (b.packs[pid] <= 0.5) continue;
          const d = districtById(s, b.districtId);
          const street = streetPrice(d, pid);
          const offer = offerForProduct(p, pid, street);
          if (!best || offer / street > best.ratio) {
            best = { building: b, pid, offer, street, ratio: offer / street };
          }
        }
      }

      const itemOpts = items.length
        ? `<div class="field" style="margin:8px 0 0">
            <select data-field="sellItemTo" data-player="${p.id}">
              <option value="">— sell them something you made —</option>
              ${items.map((it) => `<option value="${it.id}">${esc(clip(it.name, 22))} · ${moneyShort(offerForItem(p, itemValue(s, it)))}</option>`).join('')}
            </select>
          </div>`
        : '';

      return `<div class="card" style="cursor:default">
        <div class="card__head">
          <span class="card__name">${esc(p.name)}</span>
          <span class="card__cost">${moneyShort(p.worth)}</span>
        </div>
        <div class="card__blurb">${esc(p.styleLabel[0].toUpperCase() + p.styleLabel.slice(1))}.
          ${where.length ? `Works ${esc(where.slice(0, 2).join(' and '))}.` : ''}</div>
        <div class="card__meta">
          <span>${p.properties} properties</span>
          <span class="${p.knowsYou ? 'warn' : 'good'}">${p.knowsYou ? 'knows about you' : "doesn't know you yet"}</span>
        </div>
        ${best ? `<div class="card__meta">
          <span class="${best.ratio >= 1 ? 'good' : 'warn'}">
            pays ${money(best.offer)}/pack for ${esc(PRODUCTS[best.pid].name.toLowerCase())}
            (street ${money(best.street)})</span>
        </div>
        <div class="btnrow">
          <button class="ghostbtn" data-action="sell-to" data-id="${best.building.id}"
            data-type="${p.id}:${best.pid}">
            Move ${esc(PRODUCTS[best.pid].name.toLowerCase())} to ${esc(p.name)}
          </button>
        </div>` : ''}
        ${itemOpts}
      </div>`;
    }).join('');

    return `<div class="sect">
      <div class="sect__title"><span>People you know</span><span>${met.length} of ${total}</span></div>
      <p class="card__blurb" style="margin:0 0 10px">
        They take product in bulk and pay properly for things you've made —
        better than grinding it out on a corner, which is the point of knowing
        anybody.
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
              <span>absorbs ${units(sellRatePerHour(d, product, s.minutes))}/h</span>
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

  /**
   * What this property would actually DO, before you commit to it.
   *
   * Bare multipliers told you a lot was better than some invisible reference,
   * not what the place produces or holds — and a bad buy can bankrupt you now,
   * so the numbers you are betting on belong on the card.
   */
  previewRow(o) {
    const p = buildingPreview(o.def, o.scale, o.capScale);
    if (!p) return '';
    const bits = [];
    if (p.packsPerDay > 0) {
      bits.push(`<span style="color:var(--good)">makes ${units(p.packsPerDay)} ${esc(p.packName || 'units')}/day</span>`);
    }
    if (p.holds > 0) {
      // Capacity is in RAW units and output is in packs, so say which — and
      // say it in days, because "four days of harvest" is the number that
      // actually tells you how much haulage to put behind it.
      const days = p.holdsDays >= 1 ? Math.round(p.holdsDays) : p.holdsDays.toFixed(1);
      bits.push(`<span>holds ${units(p.holds)}${p.holdsName ? ` ${esc(p.holdsName)}` : ''}`
        + `${p.holdsDays > 0 ? ` · ${days} days' worth` : ''}</span>`);
    }
    if (p.launderPerDay > 0) {
      bits.push(`<span style="color:var(--money)">washes ${moneyShort(p.launderPerDay)}/day</span>`);
    }
    if (p.runningPerDay > 0) {
      bits.push(`<span style="color:var(--warn)">costs ${moneyShort(p.runningPerDay)}/day to run</span>`);
    }
    if (p.grossPerDay > 0) {
      bits.push(`<span style="color:var(--money)">${moneyShort(p.grossPerDay)}/day if it all sells</span>`);
    }
    if (!bits.length) return '';
    return `<div class="card__meta">${bits.join('')}</div>`;
  }

  /**
   * What a pound actually goes out of the door as.
   *
   * Blocks and other operations buy by weight in one handoff. Nobody on a
   * corner buys a pound, so serving it yourself means breaking it down — and
   * that breakdown margin is the whole reason to hold a counter rather than
   * just dropping weight somewhere.
   */
  breakdownRow(b) {
    const s = this.game.state;
    const d = s.districts.find((x) => x.id === b.districtId);
    if (!d) return '';
    // Price the product it is actually holding most of.
    const pid = PRODUCT_IDS
      .filter((p) => (b.packs[p] || 0) > 0)
      .sort((a, c) => b.packs[c] - b.packs[a])[0];
    if (!pid) return '';
    const unit = streetPrice(d, pid) * RETAIL_MARKUP;
    const cells = UNIT_LADDER
      .filter((u) => u.perPound > 1)
      .map((u) => `<div class="row"><span>${u.perPound} × ${esc(u.name)}</span>`
        + `<span>${money(unit / u.perPound)} each</span></div>`)
      .join('');
    return `<details class="upgrades" style="margin-top:8px">
      <summary>How a pound of ${esc(PRODUCTS[pid].name.toLowerCase())} breaks down`
      + ` · ${money(unit)}/lb served</summary>
      <div class="rows">${cells}</div>
      <p class="card__blurb" style="margin:6px 0 0">
        Dropping the same weight on a block pays ${money(streetPrice(d, pid))} —
        the block's own people keep the rest.
      </p>
    </details>`;
  }

  /**
   * Bucket what can go on this lot into named groups.
   *
   * 52 building types, 24 of them fronts, is a scroll rather than a choice.
   * Production splits by what it MAKES, because that is how you actually think
   * about it — "where do I put another grow" — and everything else splits by
   * what it is for.
   */
  buildGroups(opts) {
    const groups = new Map();
    const put = (key, o) => {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    };
    for (const o of opts) {
      const def = o.def;
      if (def.kind === 'production' && def.product) {
        put(`Making ${PRODUCTS[def.product].name.toLowerCase()}`, o);
      } else if (def.kind === 'processing') {
        put('Processing', o);
      } else if (def.kind === 'storage' || def.kind === 'depot') {
        put('Storage and haulage', o);
      } else if (def.kind === 'front') {
        put('Legitimate business', o);
      } else {
        put('Base and research', o);
      }
    }
    // Production first and in a stable order, then the rest.
    return [...groups.entries()].sort((a, b) => {
      const rank = (k) => (k.startsWith('Making') ? 0
        : k === 'Processing' ? 1
        : k === 'Storage and haulage' ? 2
        : k === 'Base and research' ? 3 : 4);
      return rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]);
    });
  }

  /**
   * One collapsible group. Anything with more than a handful inside starts
   * shut, and the summary carries the count and how many you can afford right
   * now — so a closed group still tells you whether it is worth opening.
   */
  buildGroup(label, items, card, openByDefault) {
    const usable = items.filter((o) => !o.locked).length;
    const cheapest = items
      .filter((o) => !o.locked)
      .map((o) => o.def.cost)
      .sort((a, b) => a - b)[0];
    const open = openByDefault && items.length <= 5 ? ' open' : '';
    return `<details class="upgrades" style="margin-top:8px"${open}>
      <summary>${esc(label)}
        <span style="color:var(--text-faint)">· ${items.length}</span>
        ${usable === 0
          ? '<span style="color:var(--text-faint)">· none available yet</span>'
          : `<span style="color:var(--good)">· from ${moneyShort(cheapest)}</span>`}
      </summary>
      ${items.map(card).join('')}
    </details>`;
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
            <span class="card__name">${esc(typeLabelFor(o.def, o.scale))}</span>
            <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(o.def.cost)}</span>
          </div>
          <div class="card__blurb">${esc(o.def.blurb)}</div>
          ${o.locked ? '' : this.previewRow(o)}
          <div class="card__meta">
            ${o.locked ? '' : o.fits ? `<span style="color:var(--good)">×${o.scale.toFixed(2)} output · ×${o.capScale.toFixed(1)} storage</span>` : ''}
            ${note ? `<span style="color:${o.locked ? 'var(--text-faint)' : 'var(--warn)'}">${esc(note)}</span>` : ''}
            ${region && !o.locked ? `<span style="color:var(--money)">${esc(region)}</span>` : ''}
          </div>
          ${o.locked && o.gate ? `<div class="meter" style="margin-top:6px"><i style="width:${Math.round(o.gate.progress * 100)}%"></i></div>` : ''}
        </button>`;
    };

    // The two money paths are the central choice, so they're shown as such.
    // Only what actually belongs in a building this size is listed.
    const opts = operationOptions(lot, s);
    const illegal = opts.filter((o) => o.def.kind !== 'front');
    const legal = opts.filter((o) => o.def.kind === 'front');

    if (!opts.length) {
      return `<div class="empty">
        Nothing sensible runs in ${Math.round(lot.areaM2).toLocaleString()} m².
        ${lot.areaM2 < 30
          ? 'Too small for anything but storage — and you already have the option of letting it.'
          : 'Too big for the small operations and too small for the large ones. Let it out, or hold it and sell it on.'}
      </div>`;
    }

    return (
      `<p class="card__blurb" style="margin:0 0 8px">
        Only what actually fits ${Math.round(lot.areaM2).toLocaleString()} m² is
        listed — the rest either needs more room or makes no sense at this size.
      </p>` +
      (illegal.length ? `<div class="sect__title" style="margin-top:4px">
        <span>The chain</span><span style="color:var(--text-faint)">street money</span>
      </div>
      ${this.buildGroups(illegal)
        .map(([label, items]) => this.buildGroup(label, items, card, true))
        .join('')}` : '') +
      (legal.length ? `<div class="sect__title" style="margin-top:12px">
        <span>Legitimate business</span><span style="color:var(--good)">clean money</span>
      </div>
      <p class="card__blurb" style="margin:0 0 8px">
        Earns clean money on its own — slower than the chain, but spendable the
        moment it lands, never raided, and it cools the block down. Washes
        street cash on the side.
      </p>
      ${this.buildGroup('Fronts', legal, card, false)}` : '')
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
    const owned = {};
    for (const c of s.couriers) owned[c.type] = (owned[c.type] || 0) + 1;

    // Bays cap the fleet, so lead with them — buying a vehicle with nowhere to
    // put it is the first thing a player will try.
    const bays = fleetSpaces(s);
    const bayCards = bays.depots.length
      ? bays.depots.map((d) =>
          `<div class="card"><div class="card__row">
             <strong>${esc(clip(d.building.name, 26))}</strong>
             <span>${d.parked.length}/${d.spaces} bays</span></div>
           <p class="card__blurb">${esc(d.lot ? d.lot.name : 'Depot')}</p></div>`).join('')
      : `<div class="empty">No depot yet. Car parks show on the map in blue —
         buy one and fit it out as a depot, and its real size decides how many
         vehicles you can run.</div>`;
    const bayHeader =
      `<div class="sect">
        <div class="sect__title"><span>Parking</span><span>${bays.used}/${bays.total} bays</span></div>
        ${bayCards}
      </div>`;

    // Grouped by class, so a growing catalogue stays readable.
    const dealership = Object.values(COURIER_CLASSES).map((cls) => {
      const models = COURIER_IDS
        .filter((id) => COURIERS[id].class === cls.id)
        .sort((a, b) => COURIERS[a].cost - COURIERS[b].cost);
      if (!models.length) return '';

      const cards = models.map((id) => {
        const def = COURIERS[id];
        const short = s.cash.clean < def.cost;
        const have = owned[id] || 0;
        const pace = def.direct
          ? `${def.airKph} km/h direct`
          : `${def.paceFactor <= 1 ? '' : '+'}${Math.round((def.paceFactor - 1) * 100)}% pace`;
        return `
          <button class="card ${short ? 'is-locked' : ''}" data-action="hire" data-type="${id}" ${short ? 'disabled' : ''}>
            <div class="card__head">
              <span class="card__name">${esc(def.name)}${have ? ` <span style="color:var(--sodium)">×${have}</span>` : ''}</span>
              <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(def.cost)}</span>
            </div>
            <div class="card__blurb">${esc(def.blurb)}</div>
            <div class="card__meta">
              <span>${units(def.capacity)} cap</span>
              <span>${esc(pace)}</span>
              <span>${pct(def.stealth)} slick</span>
              <span>${money(def.upkeepPerDay)}/day upkeep</span>
            </div>
          </button>`;
      }).join('');

      return `<details class="upgrades" data-disc="deal-${cls.id}"
        ${this.discOpen(`deal-${cls.id}`, cls.id === 'car') ? 'open' : ''}>
        <summary><span>${esc(cls.name)}</span>
          <span class="upgrades__count">${models.length} model${models.length === 1 ? '' : 's'}</span></summary>
        <div class="upgrades__body">
          <p class="card__blurb" style="margin:0 0 8px">${esc(cls.note)}</p>
          ${cards}
        </div>
      </details>`;
    }).join('');

    const fleet = s.couriers.length
      ? s.couriers.map((c) => this.courierCard(c)).join('')
      : '<div class="empty">No vehicles yet. Product doesn’t walk itself to the block.</div>';

    const drivers = s.drivers || [];
    const idle = drivers.filter((d) => !s.couriers.some((v) => v.driverId === d.id));
    const fee = nextDriverHireFee(s);
    const canHire = s.cash.clean >= fee;

    return (
      bayHeader +
      `<div class="sect">
        <div class="sect__title"><span>Drivers</span><span>${drivers.length} on the payroll</span></div>
        <p class="card__blurb" style="margin:0 0 9px">
          Vehicles are yours to buy; someone still has to drive them. Every driver
          you take on is harder to find than the last, so the fee to bring one in
          climbs each time.
        </p>
        <div class="rows" style="margin-bottom:9px">
          <div class="row"><span>Next hire costs</span><span class="money">${money(fee)}</span></div>
          <div class="row"><span>Daily wages</span><span>${money(drivers.reduce((n, d) => n + d.wagePerDay, 0))}/day</span></div>
          <div class="row"><span>Sitting idle</span>
            <span class="${idle.length ? 'warn' : 'good'}">${idle.length}</span></div>
        </div>
        <button class="primarybtn" style="width:100%" data-action="hire-driver" ${canHire ? '' : 'disabled'}>
          ${canHire ? `Hire a driver · ${moneyShort(fee)}` : `Need ${moneyShort(fee)} clean`}
        </button>
        ${drivers.length ? `<div class="chips" style="margin-top:9px">${drivers.map((d) => {
          const inVehicle = s.couriers.find((v) => v.driverId === d.id);
          return `<span class="chip ${inVehicle ? 'chip--good' : 'chip--warn'}">${esc(d.name)} · ${money(d.wagePerDay)}/d</span>`;
        }).join('')}</div>` : ''}
      </div>` +
      `<div class="sect">
        <div class="sect__title"><span>Dealership</span><span>${bays.total - bays.used} bay${bays.total - bays.used === 1 ? '' : 's'} free</span></div>
        <p class="card__blurb" style="margin:0 0 10px">
          Travel time is the real drive on these roads, scaled by what the vehicle
          is. Bigger carries more and moves slower; air ignores the roads entirely.
        </p>
        ${dealership}
      </div>` +
      `<div class="sect"><div class="sect__title"><span>Your fleet</span><span>${s.couriers.length}</span></div>${fleet}</div>`
    );
  }

  courierCard(c) {
    const s = this.game.state;
    const def = COURIERS[c.type];
    const fitted = vehicleStats(c, def);
    const carried = PRODUCT_IDS.reduce((n, p) => n + c.cargo[p], 0);
    const driver = c.driverId ? driverById(s, c.driverId) : null;

    const taken = new Set(s.couriers.filter((v) => v.id !== c.id && v.driverId).map((v) => v.driverId));
    const driverOpts = ['<option value="">— nobody driving —</option>']
      .concat((s.drivers || [])
        .filter((d) => !taken.has(d.id))
        .map((d) => `<option value="${d.id}" ${c.driverId === d.id ? 'selected' : ''}>${esc(d.name)} · ${money(d.wagePerDay)}/d</option>`))
      .join('');

    // A vehicle holds a circuit now, so the picker adds a line rather than
    // replacing the lot.
    const circuit = c.routeIds || (c.routeId ? [c.routeId] : []);
    const max = maxRoutesFor(def, c);
    const spare = s.routes.filter((r) => !circuit.includes(r.id));
    const routeOpts = [`<option value="">— add a line (${circuit.length}/${max}) —</option>`]
      .concat(spare.map((r) => {
        const info = routeLabel(s, r);
        return `<option value="${r.id}">${esc(clip(info.from, 16))} → ${esc(clip(info.to, 16))}</option>`;
      }))
      .join('');

    const circuitChips = circuit.length
      ? `<div class="chips" style="margin-top:8px">${circuit.map((id) => {
          const r = s.routes.find((x) => x.id === id);
          if (!r) return '';
          const info = routeLabel(s, r);
          const live = c.routeId === id;
          return `<button class="chip ${live ? 'chip--good' : ''}"
            data-action="drop-line" data-id="${c.id}" data-type="${id}"
            title="Take this line off ${esc(c.name)}">${live ? '▸ ' : ''}${esc(clip(info.to, 14))} ✕</button>`;
        }).join('')}</div>`
      : '';

    return (
      `<div class="card" style="cursor:default">
        <div class="card__head">
          <span class="card__name">${esc(c.name)}</span>
          <span class="card__cost" style="color:var(--text-dim)">${units(carried)}/${units(fitted.capacity)}</span>
        </div>
        <div class="card__meta">
          <span>${driver ? esc(driver.name) : '<span style="color:var(--warn)">parked, no driver</span>'}</span>
          <span>${esc(this.phaseLabel(c))}</span>
          <span>${c.tripsCompleted} runs</span>
        </div>
        <div class="field" style="margin:8px 0 0">
          <select data-field="vehicleDriver" data-vehicle="${c.id}">${driverOpts}</select>
        </div>
        ${circuitChips}
        <div class="field" style="margin:6px 0 0">
          <select data-field="courierRoute" data-courier="${c.id}"
            ${driver && circuit.length < max && spare.length ? '' : 'disabled'}>${routeOpts}</select>
        </div>
        ${circuit.length >= max && max > 1
          ? '<p class="card__blurb" style="margin:4px 0 0">Full circuit. Something bigger would carry more lines.</p>'
          : ''}
        <div class="btnrow">
          <button class="ghostbtn" data-action="select-courier" data-id="${c.id}">Details</button>
          <button class="ghostbtn" data-action="sell-vehicle" data-id="${c.id}">Sell</button>
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

  // --- R&D tab ---------------------------------------------------------------

  tabLab() {
    const s = this.game.state;
    const labs = (s.buildings || []).filter((b) => b.kind === 'research' && b.active);
    if (!labs.length) {
      return `<div class="empty">
        No R&amp;D facility. Build one and you can develop your own strains,
        processes and patterns — and the benches turn up the occasional thing
        nobody else has.
      </div>` + this.itemsSection();
    }

    const power = labs.reduce((n, b) => n + sizeScale(b), 0);
    const active = (s.researchActive || []).map((job) => {
      const p = projectById(job.id);
      if (!p) return '';
      const frac = Math.min(1, (job.hoursDone || 0) / p.hours);
      const left = Math.max(0, p.hours - (job.hoursDone || 0));
      const days = left / (RESEARCH.basePerHour * Math.max(0.1, power) * 24);
      return `<div class="card">
        <div class="card__head">
          <span class="card__name">${esc(p.name)}</span>
          <span class="card__cost">${pct(frac)}</span>
        </div>
        <div class="meter"><i style="width:${frac * 100}%"></i></div>
        <div class="card__meta">
          <span>${days < 1 ? 'less than a day' : `about ${Math.ceil(days)} days`} to go</span>
        </div>
        <div class="btnrow">
          <button class="ghostbtn" data-action="cancel-research" data-type="${p.id}">Shelve it</button>
        </div>
      </div>`;
    }).join('');

    const byField = Object.values(FIELDS).map((field) => {
      const rows = PROJECT_IDS
        .filter((id) => PROJECTS[id].field === field.id)
        .map((id) => {
          const p = PROJECTS[id];
          const done = isResearched(s, id);
          const gate = canResearch(s, id);
          const short = s.cash.clean < p.cost;
          if (done) {
            return `<div class="card">
              <div class="card__head">
                <span class="card__name">${esc(p.name)}</span>
                <span class="card__cost good">done</span>
              </div>
              <div class="card__meta"><span class="good">${esc(p.result)}</span></div>
            </div>`;
          }
          const blocked = !gate.ok || short;
          return `<button class="card ${blocked ? 'is-locked' : ''}"
            data-action="start-research" data-type="${id}" ${blocked ? 'disabled' : ''}>
            <div class="card__head">
              <span class="card__name">${esc(p.name)}</span>
              <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(p.cost)}</span>
            </div>
            <div class="card__blurb">${esc(p.blurb)}</div>
            <div class="card__meta">
              <span>${esc(p.result)}</span>
              ${!gate.ok ? `<span class="warn">${esc(gate.reason)}</span>` : ''}
            </div>
          </button>`;
        }).join('');
      return `<div class="sect">
        <div class="sect__title"><span>${esc(field.name)}</span></div>${rows}</div>`;
    }).join('');

    return `<div class="sect">
      <div class="sect__title"><span>On the bench</span>
        <span>${(s.researchActive || []).length}/${RESEARCH.maxProjects}</span></div>
      <p class="card__blurb" style="margin:0 0 10px">
        ${labs.length} ${labs.length === 1 ? 'facility' : 'facilities'} working.
        A bigger floorplate gets through the work faster.
      </p>
      ${active || '<div class="empty">Nothing on the bench.</div>'}
    </div>` + byField + this.itemsSection();
  }

  /** Things that exist only because you made them. */
  itemsSection() {
    const s = this.game.state;
    const items = s.items || [];
    if (!items.length) {
      return `<div class="sect">
        <div class="sect__title"><span>Your own work</span><span>0</span></div>
        <p class="card__blurb" style="margin:0">
          Every so often the benches turn something up that only exists because
          you made it. The more property and money behind the work, the better
          what comes out of it.
        </p>
      </div>`;
    }

    const cards = items.map((it) => {
      const kind = ITEM_KINDS[it.kind];
      const tier = tierById(it.tier);
      const worth = itemValue(s, it);
      const fittedTo = it.equippedTo
        ? (s.buildings.find((b) => b.id === it.equippedTo)
          || s.couriers.find((c) => c.id === it.equippedTo))
        : null;

      // Only things it actually fits.
      const targets = kind.slot === 'vehicle' ? s.couriers : s.buildings.filter((b) => b.kind !== 'front');
      const opts = ['<option value="">— not fitted —</option>']
        .concat(targets.map((t) => `<option value="${t.id}" ${it.equippedTo === t.id ? 'selected' : ''}>${esc(clip(t.name, 26))}</option>`))
        .join('');

      return `<div class="card" style="cursor:default;border-left:3px solid ${esc(tier.color)}">
        <div class="card__head">
          <span class="card__name">${esc(it.name)}</span>
          <span class="card__cost" style="color:${esc(tier.color)}">${esc(tier.name)}</span>
        </div>
        <div class="card__blurb">${esc(kind.blurb)}</div>
        <div class="card__meta">
          <span>${esc(kind.name)}</span>
          <span>worth ${moneyShort(worth)}</span>
          ${fittedTo ? `<span class="good">on ${esc(clip(fittedTo.name, 18))}</span>` : ''}
        </div>
        <div class="field" style="margin:8px 0 0">
          <select data-field="equipItem" data-item="${it.id}">${opts}</select>
        </div>
        <div class="btnrow">
          <button class="ghostbtn" data-action="sell-item" data-id="${it.id}">Sell for ${moneyShort(worth)}</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="sect">
      <div class="sect__title"><span>Your own work</span><span>${items.length}</span></div>
      <p class="card__blurb" style="margin:0 0 10px">
        Rarity is what these are worth, and every copy you make of the same
        thing is worth less than the last.
      </p>
      ${cards}
    </div>`;
  }

  // --- Routes tab -----------------------------------------------------------

  tabRoutes() {
    const s = this.game.state;
    const d = this.routeDraft;

    const sources = s.buildings.filter((b) => b.kind !== 'front');
    if (!sources.length) {
      return '<div class="empty">Build something that holds product first — a grow, a lab or a stash.</div>';
    }

    // The dropdown has no blank option, so it always *shows* a source selected.
    // If the draft doesn't agree, accepting what's on screen fires no change
    // event and the route is refused for having no origin. Keep them in step.
    if (!sources.some((b) => b.id === d.fromId)) d.fromId = sources[0].id;

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

  /** What can still be fitted to this vehicle, priced with its effect. */
  vehicleUpgradeBlock(c) {
    const s = this.game.state;
    const def = COURIERS[c.type];
    const list = vehicleUpgrades(c, def);
    if (!list.length) return '';
    const installed = list.filter((u) => u.owned);
    const open = list.filter((u) => !u.owned);

    // Your own workshop does the fitting cheaper.
    const discount = fittingDiscount(s);

    const row = (u) => {
      const price = Math.round(u.cost * (1 - discount));
      const short = s.cash.clean < price;
      const bits = [];
      const fx = u.effects || {};
      if (fx.capacityMult) bits.push(`${fx.capacityMult >= 1 ? '+' : ''}${Math.round((fx.capacityMult - 1) * 100)}% capacity`);
      if (fx.paceMult) bits.push(`${fx.paceMult <= 1 ? '−' : '+'}${Math.round(Math.abs(1 - fx.paceMult) * 100)}% travel time`);
      if (fx.turnaroundMult) bits.push(`${fx.turnaroundMult <= 1 ? '−' : '+'}${Math.round(Math.abs(1 - fx.turnaroundMult) * 100)}% turnaround`);
      if (fx.stealthAdd) bits.push(`+${Math.round(fx.stealthAdd * 100)} slick`);
      return `
        <button class="card ${short ? 'is-locked' : ''}"
          data-action="upgrade-courier" data-id="${c.id}" data-type="${u.id}" ${short ? 'disabled' : ''}>
          <div class="card__head">
            <span class="card__name">${esc(u.name)}</span>
            <span class="card__cost ${short ? 'is-short' : ''}">${discount > 0
              ? `<s style="opacity:.5">${moneyShort(u.cost)}</s> ${moneyShort(price)}`
              : moneyShort(price)}</span>
          </div>
          <div class="card__blurb">${esc(u.blurb)}</div>
          <div class="card__meta">${bits.map((b) => `<span style="color:${b.startsWith('+') && !b.includes('travel') && !b.includes('turnaround') ? 'var(--good)' : b.startsWith('−') ? 'var(--good)' : 'var(--warn)'}">${esc(b)}</span>`).join('')}</div>
        </button>`;
    };

    return `
      <details class="upgrades" data-disc="veh-${c.id}"
        ${this.discOpen(`veh-${c.id}`, open.length > 0) ? 'open' : ''}>
        <summary><span>Fit out</span>
          <span class="upgrades__count">${installed.length}/${list.length} fitted</span></summary>
        <div class="upgrades__body">
          ${discount > 0 ? `<p class="card__blurb" style="color:var(--good);margin:0 0 8px">
            Your auto shop does the work — ${Math.round(discount * 100)}% off fitting.</p>` : ''}
          ${open.length ? open.map(row).join('') : '<div class="empty">Nothing left to fit.</div>'}
          ${installed.length ? `<div class="sect__title" style="margin-top:10px"><span>Fitted</span></div>
            <div class="chips">${installed.map((u) => `<span class="chip chip--good">${esc(u.name)}</span>`).join('')}</div>` : ''}
        </div>
      </details>`;
  }

  /** Testing controls. Not reachable through ordinary play. */
  tabAdmin() {
    const s = this.game.state;
    const diagSummary = diagnosticsSummary();
    const blocks = [...s.districts]
      .sort((a, b) => (b.rivalControl || 0) - (a.rivalControl || 0))
      .slice(0, 8)
      .map((d) => `<button class="card" data-action="admin-block" data-id="${d.id}">
          <div class="card__head"><span class="card__name">${esc(districtName(d))}</span>
            <span class="card__cost">${pct(d.rivalControl || 0)} held</span></div>
          <div class="card__meta"><span>take it outright</span></div>
        </button>`).join('');

    return `<div class="sect">
      <div class="sect__title"><span>Admin</span><span style="color:var(--bad)">testing only</span></div>
      <p class="card__blurb" style="margin:0 0 10px">
        Shortcuts for trying things out. None of this is reachable in normal play.
      </p>
      <div class="btnrow">
        <button class="ghostbtn" data-action="toggle-ai">${s.aiDisabled ? 'Enable' : 'Disable'} other operations</button>
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
      <div class="sect__title"><span>Diagnostics</span>
        <span class="${diagSummary.faults ? 'bad' : 'good'}">${diagSummary.faults} fault${diagSummary.faults === 1 ? '' : 's'}</span></div>
      <p class="card__blurb" style="margin:0 0 8px">
        This session has been recording its own errors. Copy the report and send
        it over if something goes wrong — it carries what you were doing at the time.
      </p>
      <div class="btnrow">
        <button class="primarybtn" data-action="diag-copy">Copy report</button>
        <button class="ghostbtn" data-action="diag-clear">Clear</button>
      </div>
      <div class="rows" style="margin-top:9px">
        <div class="row"><span>Session</span><span>${esc(diagSummary.session)}</span></div>
        <div class="row"><span>Open for</span><span>${diagSummary.minutesOpen} min</span></div>
        <div class="row"><span>Events recorded</span><span>${diagSummary.events}</span></div>
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
    const hasFront = s.buildings.some((b) => b.kind === 'front' && b.active);

    const top = [...s.districts]
      .filter((d) => d.revenueTotal > 0)
      .sort((a, b) => b.revenueTotal - a.revenueTotal)
      .slice(0, 6)
      .map((d) => `<div class="row"><span>${esc(districtName(d))}</span><span class="money">${moneyShort(d.revenueTotal)}</span></div>`)
      .join('') || '<div class="empty">No sales yet.</div>';

    return (
      this.leaderboardSection() +
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
            <div class="row"><span>Absorbs</span><span>${units(sellRatePerHour(d, pid, s.minutes))}/h</span></div>
            <div class="row"><span>On the block now</span><span>${units(d.supply[pid])} packs</span></div>
            <div class="row"><span>Saturation</span>
              <span class="${sat > 1.2 ? 'bad' : sat > 0.8 ? 'warn' : 'good'}">${pct(Math.min(sat, 3))}</span></div>
          </div>
          <div class="meter meter--${cls}"><i style="width:${Math.min(100, (d.demandPerHour[pid] / p.demandBase[1]) * 100)}%"></i></div>
        </div>`
      );
    }).join('');

    return (
      `<h2 class="ttl">${esc(districtName(d))}</h2>
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

      ${this.operationsHere(d)}

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
  /**
   * Somebody else already works here. Only shown once you've actually found
   * them — walking into an established operation should be a discovery, not
   * something the interface hands you in advance.
   */
  operationsHere(d) {
    const s = this.game.state;
    const here = operationsIn(s, d.id).filter((p) => p.known);
    if (!here.length) return '';

    return `<div class="sect">
      <div class="sect__title"><span>Somebody else's ground</span><span class="warn">${here.length}</span></div>
      <p class="card__blurb" style="margin:0 0 8px">${esc(turfWarning(s, d.id) || '')}</p>
      <div class="chips">
        ${here.map((p) => `<span class="chip ${p.knowsYou ? 'chip--warn' : ''}">
          ${esc(p.name)} · ${moneyShort(p.worth)}${p.knowsYou ? ' · knows you' : ''}</span>`).join('')}
      </div>
      <p class="card__blurb" style="margin:8px 0 0">
        You can still build here. They'll notice, and so will you.
      </p>
    </div>`;
  }

  /**
   * A block you actually hold: yours to name, and yours to put standing
   * arrangements on. Until you hold it this only says what's missing.
   */
  heldBlock(d) {
    const s = this.game.state;
    const held = isHeld(d);
    const blocker = claimBlocker(d);

    if (!held) {
      return `<div class="sect">
        <div class="sect__title"><span>Claiming it</span><span class="warn">not yet yours</span></div>
        <p class="card__blurb" style="margin:0">
          Push the other crew off and get known here, and the block becomes yours
          to name and to run. ${esc(blocker || '')}
        </p>
      </div>`;
    }

    const fx = turfEffects(d);
    const list = turfUpgrades(d);
    const running = list.filter((u) => u.owned);
    const open = list.filter((u) => !u.owned);
    const bill = running.reduce((n, u) => n + u.upkeepPerDay, 0);

    const card = (u) => {
      const short = s.cash.clean < u.cost;
      return `<button class="card ${short ? 'is-locked' : ''}"
        data-action="improve-turf" data-id="${d.id}" data-type="${u.id}" ${short ? 'disabled' : ''}>
        <div class="card__head">
          <span class="card__name">${esc(u.name)}</span>
          <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(u.cost)}</span>
        </div>
        <div class="card__blurb">${esc(u.blurb)}</div>
        <div class="card__meta"><span class="warn">${money(u.upkeepPerDay)}/day to keep</span></div>
      </button>`;
    };

    return `<div class="sect">
      <div class="sect__title"><span>Your block</span><span class="good">held</span></div>
      <div class="field">
        <label>What it's called</label>
        <input type="text" data-field="districtName" data-district="${d.id}"
          value="${esc(districtName(d))}" maxlength="40" placeholder="${esc(d.name)}">
      </div>
      ${running.length ? `<div class="chips" style="margin:8px 0">
        ${running.map((u) => `<button class="chip chip--good" data-action="end-turf"
          data-id="${d.id}" data-type="${u.id}" title="Stop paying for this">${esc(u.name)} ✕</button>`).join('')}
      </div>
      <div class="rows">
        <div class="row"><span>Standing costs</span><span class="warn">${money(bill)}/day</span></div>
        ${fx.policeSuppression ? `<div class="row"><span>Police presence</span>
          <span class="good">${pct(1 - fx.policeSuppression)} of normal</span></div>` : ''}
      </div>` : ''}
      <details class="upgrades" data-disc="turf-${d.id}"
        ${this.discOpen(`turf-${d.id}`, false) ? 'open' : ''}>
        <summary><span>Arrangements</span>
          <span class="upgrades__count">${running.length}/${list.length}</span></summary>
        <div class="upgrades__body">
          ${open.length ? open.map(card).join('') : '<div class="empty">Everything is arranged.</div>'}
        </div>
      </details>
    </div>`;
  }

  turfSection(d) {
    const s = this.game.state;
    const crew = crewById(s, d.crewId);
    const control = d.rivalControl || 0;

    if (!crew || control < 0.05) {
      return (
        `<div class="sect">
          <div class="sect__title"><span>Turf</span><span class="good">Open</span></div>
          <p class="card__blurb" style="margin:0">Nobody's working this block. Every customer here is yours to take.</p>
        </div>` + this.heldBlock(d)
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
      </div>` + this.heldBlock(d)
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
        ${lot.levels > 1 ? `<div class="row"><span>Storeys</span><span>${lot.levels}</span></div>` : ''}
        ${lot.units > 0 ? `<div class="row"><span>Lettings</span><span>${lot.units} ${lot.units === 1 ? 'home' : 'homes'}</span></div>` : ''}
        ${lot.kind === 'parking' ? `<div class="row"><span>Spaces</span><span>${lot.spaces}</span></div>` : ''}
        <div class="row"><span>Block</span><span>${esc(d ? d.name : '—')}</span></div>
        <div class="row"><span>Local market</span>
          <span class="${idx >= 1 ? 'good' : 'bad'}">${(idx * 100).toFixed(0)}% ${rising ? '▲' : '▼'}</span></div>
        ${d && d.crime != null ? `<div class="row"><span>Crime</span>
          <span class="${d.crime > 0.55 ? 'bad' : d.crime > 0.3 ? 'warn' : 'good'}">${crimeLabel(d.crime)}</span></div>` : ''}
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
        <p class="subttl">Yours · ${esc(typeLabel(running))}</p>
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
        ${this.rentalWorkBlock(lot)}
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
            <div class="row"><span>Supplies per cycle</span><span>${money(def.supplyCostPerSlot * def.slots * sizeScale(b))}</span></div>
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
      const selling = b.selling !== false;
      const rate = (def.sellsPerHour || 0) * effectsFor(b).yieldMult * Math.sqrt(sizeCapacity(b));
      body =
        (def.sellsPerHour ? `<div class="sect">
          <div class="sect__title"><span>Street sales</span>
            <span class="${selling ? 'good' : 'bad'}">${selling ? 'serving the block' : 'holding only'}</span></div>
          <div class="rows">
            <div class="row"><span>Sells up to</span><span>${units(rate)}/h</span></div>
            <div class="row"><span>Moved today</span><span>${units(b.soldToday || 0)} packs</span></div>
            <div class="row"><span>Retail premium</span><span class="good">+${Math.round((RETAIL_MARKUP - 1) * 100)}% over dropping weight</span></div>
          </div>
          ${this.breakdownRow(b)}
          <div class="btnrow">
            <button class="ghostbtn" data-action="toggle-selling" data-id="${b.id}">
              ${selling ? 'Stop selling here' : 'Start selling here'}
            </button>
          </div>
          <p class="card__blurb" style="margin:6px 0 0">
            Sells straight onto ${esc(d ? d.name : 'this block')} without a courier.
            Whoever holds the block still takes their cut.
          </p>
        </div>` : '') +
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
      <div class="field" style="margin:0 0 12px">
        <label>What you call it</label>
        <input type="text" data-field="buildingName" data-building="${b.id}"
          value="${esc(buildingLabel(b))}" maxlength="32" placeholder="${esc(typeLabel(b))}">
      </div>
      ${this.firearmLineBlock(b)}
      ${this.upgradeBlock(b)}
      <div class="btnrow">
        ${b.kind !== 'front' ? `<button class="primarybtn" data-action="route-from" data-id="${b.id}" data-tab="routes">Ship from here</button>` : ''}
      </div>
      <div class="btnrow">
        ${s.hqBuildingId === b.id
          ? '<button class="ghostbtn" disabled>★ Your headquarters</button>'
          : `<button class="ghostbtn" data-action="set-hq" data-id="${b.id}">Make this my HQ</button>`}
      </div>
      <div class="btnrow">
        <button class="ghostbtn" data-action="toggle" data-id="${b.id}">${b.active ? 'Shut down' : 'Reopen'}</button>
        <button class="ghostbtn" data-action="sell-building" data-id="${b.id}">Sell up</button>
      </div>`
    );
  }

  /**
   * Ray's card. The first thing a new player should read, and the thing that
   * tells them what to do next without a wall of tutorial text.
   */
  /**
   * Ray, wherever you are.
   *
   * He used to live on the Build tab, which meant a new player had to already
   * be looking in the right place to be told where to look. He now sits above
   * whatever tab you are on.
   *
   * Two things he might have to say, in priority order: a new thing has opened
   * up, or you are still standing the operation up. He never prescribes WHICH
   * building — the opening steps check `has(s, 'production')`, so a closet and
   * a warehouse grow both satisfy it, and the path stays yours.
   */
  helperRail() {
    const s = this.game.state;
    const tip = pendingTip(s);
    const step = tip ? null : currentStep(s);
    if (!tip && !step) return '';

    const p = onboardingProgress(s);
    const first = !tip && p.done === 0;

    if (tip) {
      // Something new has opened up. Worth interrupting for, even if he was
      // sent away earlier — that is the whole point of him staying on.
      return `<div class="sect sect--helper">
        <div class="sect__title">
          <span>${esc(HELPER.name)} · ${esc(HELPER.role)}</span>
          <span style="color:var(--sodium)">something new</span>
        </div>
        <div class="card" style="margin-top:4px">
          <div class="card__head"><span class="card__name">${esc(tip.title)}</span></div>
          <div class="card__blurb">${esc(tip.says)}</div>
        </div>
        <div class="btnrow">
          ${tip.go ? `<button class="ghostbtn" data-action="goto-tab" data-tab="${esc(tip.go)}"
            data-type="${esc(tip.id)}">Show me</button>` : ''}
          <button class="ghostbtn" data-action="dismiss-helper" data-type="${esc(tip.id)}">Got it</button>
        </div>
      </div>`;
    }

    return `<div class="sect sect--helper">
      <div class="sect__title">
        <span>${esc(HELPER.name)} · ${esc(HELPER.role)}</span>
        <span>${p.done}/${p.total}</span>
      </div>
      ${first ? `<p class="card__blurb" style="margin:0 0 10px">${esc(HELPER.greeting)}</p>` : ''}
      <div class="meter"><i style="width:${(p.done / p.total) * 100}%"></i></div>
      <div class="card" style="margin-top:10px">
        <div class="card__head"><span class="card__name">${esc(step.title)}</span></div>
        <div class="card__blurb">${esc(step.brief)}</div>
        <div class="card__meta"><span class="good">${esc(step.hint)}</span></div>
      </div>
      <div class="btnrow">
        <button class="ghostbtn" data-action="dismiss-helper">I've got it from here</button>
      </div>
    </div>`;
  }

  /**
   * Work you can do to a property you let out. Survives a change of tenant,
   * because it's the building that got better.
   */
  rentalWorkBlock(lot) {
    const s = this.game.state;
    if (lot.buildingId) return '';
    const list = rentUpgrades(lot);
    if (!list.length) return '';

    const d = districtById(s, lot.districtId);
    const done = list.filter((u) => u.owned);
    const open = list.filter((u) => !u.owned);
    const nowRent = rentPerDay(lot, d);

    const row = (u) => {
      const short = s.cash.clean < u.cost;
      // Show the actual difference this makes, not an abstract multiplier.
      const after = rentPerDay({ ...lot, rentUpgrades: (lot.rentUpgrades || []).concat(u.id) }, d);
      const gain = after - nowRent;
      const payback = gain > 0 ? Math.ceil(u.cost / gain) : null;
      return `
        <button class="card ${short ? 'is-locked' : ''}"
          data-action="improve-rental" data-id="${lot.id}" data-type="${u.id}" ${short ? 'disabled' : ''}>
          <div class="card__head">
            <span class="card__name">${esc(u.name)}</span>
            <span class="card__cost ${short ? 'is-short' : ''}">${moneyShort(u.cost)}</span>
          </div>
          <div class="card__blurb">${esc(u.blurb)}</div>
          <div class="card__meta">
            <span class="good">+${money(gain)}/day</span>
            ${payback ? `<span>pays back in ${payback} days</span>` : ''}
            ${u.addUnits ? `<span>+${u.addUnits} letting</span>` : ''}
          </div>
        </button>`;
    };

    return `
      <details class="upgrades" data-disc="rent-${lot.id}"
        ${this.discOpen(`rent-${lot.id}`, open.length > 0) ? 'open' : ''}>
        <summary><span>Improve it</span>
          <span class="upgrades__count">${done.length}/${list.length} done · ${money(nowRent)}/day</span></summary>
        <div class="upgrades__body">
          ${open.length ? open.map(row).join('') : '<div class="empty">Nothing left worth doing.</div>'}
          ${done.length ? `<div class="sect__title" style="margin-top:10px"><span>Done</span></div>
            <div class="chips">${done.map((u) => `<span class="chip chip--good">${esc(u.name)}</span>`).join('')}</div>` : ''}
        </div>
      </details>`;
  }

  /** What a firearms shop is tooled for, and what else it could be. */
  firearmLineBlock(b) {
    const s = this.game.state;
    const def = BUILDINGS[b.type];
    if (def.product !== 'iron') return '';

    const current = classOf(b);
    const licensed = !!def.needsLicence;
    const fitted = fittedTo(s, b.id);
    const rows = FIREARM_CLASS_IDS.map((id) => {
      const cls = FIREARM_CLASSES[id];
      const live = cls.id === current.id;
      // A licensed shop can't tool for NFA without the stamp; a back room can.
      const blocked = live
        || (licensed && cls.requiresLicence && !hasLicence(s, cls.requiresLicence));
      const why = cls.requiresLicence && licensed && !hasLicence(s, cls.requiresLicence)
        ? `Needs ${LICENCES[cls.requiresLicence].short}` : null;
      return `<button class="card card--art ${live ? '' : blocked ? 'is-locked' : ''}"
        data-action="set-line" data-id="${b.id}" data-type="${id}" ${blocked ? 'disabled' : ''}>
        <div class="card__art">${gunWithAttachments(id, live ? fitted : [], {
          size: 74, color: live ? 'var(--sodium)' : 'var(--text-dim)', accent: 'var(--money)',
        })}</div>
        <div class="card__head">
          <span class="card__name">${live ? '▸ ' : ''}${esc(cls.name)}</span>
          <span class="card__cost" style="color:var(--text-dim)">${cls.valueMult.toFixed(2)}× value</span>
        </div>
        <div class="card__blurb">${esc(cls.blurb)}</div>
        <div class="card__meta">
          <span class="${cls.yieldMult >= 1 ? 'good' : 'warn'}">${cls.yieldMult.toFixed(2)}× output</span>
          <span class="${cls.heatMult <= 1 ? 'good' : 'bad'}">${cls.heatMult.toFixed(2)}× heat</span>
          ${why ? `<span class="warn">${esc(why)}</span>` : ''}
        </div>
      </button>`;
    }).join('');

    const fx = attachmentEffects(s, b);
    const chosen = modelOf(b);
    const showcase = `
      <div class="showcase">
        <div class="showcase__art">${chosen
          ? modelWithAttachments(chosen.id, fitted, {
              size: 158, color: 'var(--text)', accent: 'var(--sodium)',
            })
          : gunWithAttachments(current.id, fitted, {
              size: 148, color: 'var(--text)', accent: 'var(--sodium)',
            })}</div>
        <div class="showcase__meta">
          <div class="showcase__name">${esc(chosen ? chosen.name : current.name)}</div>
          ${chosen ? `<div class="showcase__stats"><span>${esc(current.name)}</span></div>` : ''}
          <div class="showcase__stats">
            <span>${fitted.length}/${ATTACHMENT_SLOTS} fitted</span>
            ${fx.qualityAdd > 0 ? `<span class="good">+${Math.round(fx.qualityAdd * 100)} quality</span>` : ''}
            ${fx.valueMult > 1 ? `<span class="money">+${Math.round((fx.valueMult - 1) * 100)}% value</span>` : ''}
            ${fx.heatMult > 1 ? `<span class="bad">+${Math.round((fx.heatMult - 1) * 100)}% heat</span>` : ''}
          </div>
          ${fitted.length ? `<div class="chips">${fitted.map((vid) => {
            const a = attachmentById(vid);
            const it = (s.items || []).find((x) => x.variant === vid && x.equippedTo === b.id);
            return `<button class="chip chip--art" data-action="unfit" data-id="${it ? it.id : ''}"
              title="Take it off">${attachmentArt(vid, { size: 22 })}${esc(a ? a.name : vid)} ✕</button>`;
          }).join('')}</div>` : '<p class="card__blurb" style="margin:0">Nothing bolted on yet. Attachments come out of an R&amp;D facility.</p>'}
        </div>
      </div>`;

    const patterns = modelsFor(current.id);
    const patternPicker = patterns.length ? `
      <details class="upgrades" data-disc="model-${b.id}"
        ${this.discOpen(`model-${b.id}`, !chosen) ? 'open' : ''}>
        <summary><span>Pattern</span>
          <span class="upgrades__count">${esc(chosen ? chosen.name : 'not set')}</span></summary>
        <div class="upgrades__body">
          <p class="card__blurb" style="margin:0 0 8px">
            Which ${esc(current.name.toLowerCase().replace(/s$/, ''))} this line actually builds.
            More work per unit means fewer of them and more for each.
          </p>
          ${patterns.map((m) => {
            const live = chosen && chosen.id === m.id;
            return `<button class="card card--art ${live ? '' : ''}"
              data-action="set-model" data-id="${b.id}" data-type="${m.id}" ${live ? 'disabled' : ''}>
              <div class="card__art">${modelArt(m.id, {
                size: 116, color: live ? 'var(--sodium)' : 'var(--text-dim)',
              })}</div>
              <div class="card__head">
                <span class="card__name">${live ? '▸ ' : ''}${esc(m.name)}</span>
                <span class="card__cost" style="color:var(--text-dim)">${moneyShort(PRODUCTS.iron.basePrice * m.valueMult)} each</span>
              </div>
              <div class="card__blurb">${esc(m.blurb)}</div>
              <div class="card__meta">
                <span class="${m.yieldMult >= 1 ? 'good' : 'warn'}">${m.yieldMult.toFixed(2)}× output</span>
                <span style="color:var(--text-faint)">${m.valueMult.toFixed(2)}× a plain unit</span>
              </div>
            </button>`;
          }).join('')}
        </div>
      </details>` : '';

    return showcase + patternPicker + `
      <details class="upgrades" data-disc="line-${b.id}"
        ${this.discOpen(`line-${b.id}`, false) ? 'open' : ''}>
        <summary><span>Tooled for</span>
          <span class="upgrades__count">${esc(current.name)}</span></summary>
        <div class="upgrades__body">
          <p class="card__blurb" style="margin:0 0 8px">
            Retooling costs you the cycle you're part-way through.
          </p>
          ${rows}
        </div>
      </details>` + this.attachmentBench(b, fitted);
  }

  /**
   * Attachments you've made that would fit this line. Crafted in R&D, bolted on
   * here — and what's fitted shows on the weapon itself, above and on the map.
   */
  attachmentBench(b, fitted) {
    const s = this.game.state;
    const spare = (s.items || []).filter((it) => it.kind === 'attachment' && !it.equippedTo);
    if (!spare.length && !fitted.length) return '';
    if (!spare.length) return '';

    const cards = spare.map((it) => {
      const a = attachmentById(it.variant);
      if (!a) return '';
      const tier = tierById(it.tier);
      const already = fitted.includes(it.variant);
      const full = fitted.length >= ATTACHMENT_SLOTS;
      const barred = incompatibleParts(b).includes(it.variant);
      const included = builtInParts(b).includes(it.variant);
      const blocked = already || full || barred || included;
      const e = a.effect || {};
      return `<button class="card card--attach ${blocked ? 'is-locked' : ''}"
        data-action="fit-attachment" data-id="${it.id}" data-type="${b.id}"
        ${blocked ? 'disabled' : ''} style="border-left:3px solid ${esc(tier.color)}">
        <div class="card__art card__art--small">${attachmentArt(it.variant, { size: 40 })}</div>
        <div class="card__head">
          <span class="card__name">${esc(it.name)}</span>
          <span class="card__cost" style="color:${esc(tier.color)}">${esc(tier.name)}</span>
        </div>
        <div class="card__blurb">${esc(a.blurb)}</div>
        <div class="card__meta">
          ${e.qualityAdd ? `<span class="good">+${Math.round(e.qualityAdd * 100)} quality</span>` : ''}
          ${e.valueMult ? `<span class="money">+${Math.round((e.valueMult - 1) * 100)}% value</span>` : ''}
          ${e.heatMult ? `<span class="bad">+${Math.round((e.heatMult - 1) * 100)}% heat</span>` : ''}
          ${e.yieldMult ? `<span class="warn">${Math.round((e.yieldMult - 1) * 100)}% output</span>` : ''}
          ${barred ? `<span class="warn">does not go on ${esc(classOf(b).name.toLowerCase())}</span>`
            : included ? '<span class="warn">this pattern has one already</span>'
            : already ? '<span class="warn">already on this line</span>'
            : full ? '<span class="warn">no slots left</span>' : ''}
        </div>
      </button>`;
    }).join('');

    return `<details class="upgrades" data-disc="att-${b.id}"
      ${this.discOpen(`att-${b.id}`, spare.length > 0 && fitted.length < ATTACHMENT_SLOTS) ? 'open' : ''}>
      <summary><span>Bolt something on</span>
        <span class="upgrades__count">${spare.length} made</span></summary>
      <div class="upgrades__body">${cards}</div>
    </details>`;
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
      <details class="upgrades" data-disc="up-${b.id}"
        ${this.discOpen(`up-${b.id}`, open.length > 0) ? 'open' : ''}>
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
    const fitted = vehicleStats(c, def);

    return (
      `<h2 class="ttl">${esc(c.name)}</h2>
      <p class="subttl">${esc(this.phaseLabel(c))}</p>
      <div class="sect">
        <div class="sect__title"><span>Load</span><span>${units(carried)} / ${units(fitted.capacity)}</span></div>
        <div class="meter"><i style="width:${Math.min(100, (carried / fitted.capacity) * 100)}%"></i></div>
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
               <div class="row"><span>One way</span>
                 <span>${duration(((route.driveMinutes ?? (route.km / 22) * 60) * (def.paceFactor || 1)) / 60)}</span></div>
               <div class="row"><span>Turnaround</span>
                 <span>${duration((def.loadMinutes + def.unloadMinutes) / 60)}</span></div>
               <div class="row"><span>Runs done</span><span>${c.tripsCompleted}</span></div>
             </div>`
          : '<div class="empty">Parked with no route. Assign one from the Fleet tab.</div>'}
      </div>
      <div class="sect">
        <div class="sect__title"><span>Vehicle</span></div>
        <div class="rows">
          <div class="row"><span>Pace</span>
            <span class="${def.paceFactor <= 1 ? 'good' : 'warn'}">${def.paceFactor <= 1 ? '' : '+'}${Math.round((def.paceFactor - 1) * 100)}% vs a car</span></div>
          <div class="row"><span>Keeps a low profile</span><span>${pct(fitted.stealth)}</span></div>
          <div class="row"><span>Vehicle upkeep</span><span>${money(def.upkeepPerDay)}/day</span></div>
          ${(() => {
            const d = c.driverId ? driverById(s, c.driverId) : null;
            return d
              ? `<div class="row"><span>Driver</span><span>${esc(d.name)} · ${money(d.wagePerDay)}/day</span></div>`
              : '<div class="row"><span>Driver</span><span class="warn">nobody — it isn’t going anywhere</span></div>';
          })()}
        </div>
      </div>
      ${this.vehicleUpgradeBlock(c)}
      <div class="btnrow">
        <button class="ghostbtn" data-action="goto-tab" data-tab="fleet">Fleet</button>
        <button class="ghostbtn" data-action="sell-vehicle" data-id="${c.id}">Sell vehicle</button>
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
