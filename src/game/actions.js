// Player actions. Each one validates, charges, mutates state and returns
// { ok, error } so the UI can report a reason without knowing the rules.

import { parkedPosition } from './state.js';
import {
  BUILDINGS, BUILDING_IDS, COURIERS, DRIVERS, FIXER, RIVALS, MARKET_PROPERTY,
  WHOLESALE_FACTOR,
} from './constants.js';
import {
  lotById, areaScale, areaCapacityScale, lotResale, marketValue, rentPerDay, lotPnL,
} from './lots.js';
import { fetchRoute } from './geo.js';
import { clamp01 } from './rng.js';
import { streetPrice } from './economy.js';
import { unlockStatus } from './progression.js';
import {
  LICENCES, FIREARM_CLASSES, canApply, hasLicence, licenceRecord, MODELS, classOf,
  builtInParts, modelOf, incompatibleParts,
} from './firearms.js';
import { isHeld, claimBlocker, turfUpgradeById, districtName } from './turf.js';
import {
  projectById, canResearch, ITEM_KINDS, itemValue, attachmentById, ATTACHMENT_SLOTS,
} from './research.js';
import { offerForItem, offerForProduct, appetiteFor, operationsIn } from './players.js';
import {
  upgradeById, availableUpgrades, effectsFor, vehicleUpgradeById, vehicleUpgrades, vehicleStats,
  maxRoutesFor, rentUpgradeById, rentUpgrades, rentEffects,
} from './upgrades.js';
import {
  buildingById,
  canAfford,
  createBuilding,
  createVehicle,
  createDriver,
  nextDriverHireFee,
  driverById,
  createRoute,
  courierById,
  districtById,
  buildingLabel,
  typeLabel,
  logEvent,
  routeById,
  spendClean,
} from './state.js';

/** Buy a real building. You own the premises; what runs inside is a separate call. */
export function buyLot(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (lot.owned) return { ok: false, error: 'You already own that one.' };

  const district = districtById(state, lot.districtId);
  const price = marketValue(lot, district);
  if (!canAfford(state, price)) {
    return { ok: false, error: `Need $${price.toLocaleString()} clean for that property.` };
  }

  spendClean(state, price);
  lot.owned = true;
  // What you actually paid, so profit or loss on the way out is real.
  lot.paidPrice = price;
  if (district) district.discovered = true;

  // Buying onto somebody's ground is how they find out about you, and how you
  // find out about them if you hadn't already.
  for (const other of operationsIn(state, lot.districtId)) {
    other.knowsYou = true;
    if (!other.known) {
      other.known = true;
      other.metOn = lot.districtId;
      logEvent(state,
        `Buying here put you on ${other.name}'s doorstep — they already work this block.`,
        'info');
    }
  }
  logEvent(
    state,
    `Bought ${lot.name} in ${district ? district.name : 'the city'} for $${price.toLocaleString()}.`,
    'good'
  );
  return { ok: true, lot, price };
}

/**
 * Sell a property you own but aren't running anything in. You get today's
 * market value less the agent's cut, which may be more or less than you paid.
 */
export function sellLot(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!lot.owned) return { ok: false, error: 'You don’t own that.' };
  if (lot.buildingId) {
    return { ok: false, error: 'Shut the operation down first — sell it from the building.' };
  }

  const district = districtById(state, lot.districtId);
  const proceeds = lotResale(lot, district);
  const pnl = lotPnL(lot, district);

  state.cash.clean += proceeds;
  state.stats.propertyPnL = (state.stats.propertyPnL || 0) + (pnl ? pnl.delta : 0);
  lot.owned = false;
  lot.rented = false;
  lot.paidPrice = null;

  const verdict = pnl
    ? (pnl.delta >= 0
      ? `up $${Math.abs(pnl.delta).toLocaleString()} on what you paid`
      : `down $${Math.abs(pnl.delta).toLocaleString()} on what you paid`)
    : '';
  logEvent(state, `Sold ${lot.name} for $${proceeds.toLocaleString()} — ${verdict}.`,
    pnl && pnl.delta >= 0 ? 'good' : 'bad');
  return { ok: true, proceeds, pnl };
}

/** Put a tenant in. Quiet, legal, and it pays every day without you touching it. */
export function rentOut(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!lot.owned) return { ok: false, error: 'Buy it first.' };
  if (lot.buildingId) return { ok: false, error: 'Something is already running there.' };
  if (lot.rented) return { ok: false, error: 'Already let out.' };

  lot.rented = true;
  lot.tenantSince = state.minutes;
  const d = districtById(state, lot.districtId);
  logEvent(state, `${lot.name} let out at $${rentPerDay(lot, d).toLocaleString()}/day.`, 'good');
  return { ok: true, rent: rentPerDay(lot, d) };
}

/** End a tenancy so the building is yours to use again. Costs a settlement. */
export function endTenancy(state, lotId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!lot.rented) return { ok: false, error: 'Nobody is renting it.' };

  const d = districtById(state, lot.districtId);
  const fee = Math.round(rentPerDay(lot, d) * 30 * MARKET_PROPERTY.tenancyBuyout);
  if (!canAfford(state, fee)) {
    return { ok: false, error: `Settling with the tenant costs $${fee.toLocaleString()} clean.` };
  }
  spendClean(state, fee);
  lot.rented = false;
  logEvent(state, `Tenant out of ${lot.name}. Settlement cost $${fee.toLocaleString()}.`, 'info');
  return { ok: true, fee };
}

/** What can legally go into a building you own, and why not. */
/** Whether an operation makes sense in a building this size, and why not. */
export function fitsBuilding(def, lot) {
  if (lot.areaM2 < def.minAreaM2) {
    return { fits: false, reason: `Needs ${def.minAreaM2} m² — this is ${Math.round(lot.areaM2)} m²` };
  }
  if (def.maxAreaM2 && lot.areaM2 > def.maxAreaM2) {
    return {
      fits: false,
      reason: `Only makes sense up to ${def.maxAreaM2.toLocaleString()} m² — this is ${Math.round(lot.areaM2).toLocaleString()} m²`,
    };
  }
  return { fits: true, reason: null };
}

/**
 * What you could run in this building. Operations that physically don't belong
 * in a space this size are left out entirely rather than shown greyed — you
 * don't run a closet grow in a warehouse, and the menu shouldn't pretend
 * otherwise. Things gated by progression stay visible, because those are goals.
 */
export function operationOptions(lot, state = null) {
  return BUILDING_IDS.filter((id) => {
    // A car park takes a depot and nothing else; premises take everything but.
    const need = BUILDINGS[id].requiresKind || null;
    if (need ? lot.kind !== need : lot.kind === 'parking') return false;
    return fitsBuilding(BUILDINGS[id], lot).fits;
  }).map((id) => {
    const def = BUILDINGS[id];
    const gate = state ? unlockStatus(state, id) : null;
    const locked = !!(gate && gate.locked);
    return {
      id,
      def,
      fits: true,
      locked,
      gate,
      reason: locked ? gate.reason : null,
      scale: areaScale(lot, def.referenceAreaM2, def.areaExponent),
      capScale: areaCapacityScale(lot, def.referenceAreaM2),
    };
  });
}

/** Fit out a building you own so it starts doing something. */
export function developLot(state, lotId, typeId) {
  const lot = lotById(state, lotId);
  const def = BUILDINGS[typeId];
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!def) return { ok: false, error: 'Unknown operation.' };
  if (!lot.owned) return { ok: false, error: 'Buy the property first.' };
  if (lot.buildingId) return { ok: false, error: 'Something is already running there.' };
  const gate = unlockStatus(state, typeId);
  if (gate && gate.locked) return { ok: false, error: gate.reason };
  if (def.requiresKind && lot.kind !== def.requiresKind) {
    return { ok: false, error: `A ${def.name} only goes on a car park.` };
  }
  if (!def.requiresKind && lot.kind === 'parking') {
    return { ok: false, error: 'A car park is only good for a depot.' };
  }
  const size = fitsBuilding(def, lot);
  if (!size.fits) return { ok: false, error: `${def.name}: ${size.reason}.` };
  if (!canAfford(state, def.cost)) {
    return { ok: false, error: `Fitting out a ${def.name} costs $${def.cost.toLocaleString()} clean.` };
  }

  spendClean(state, def.cost);
  const b = createBuilding(typeId, { lat: lot.center.lat, lng: lot.center.lng }, lot.districtId);
  b.lotId = lot.id;
  b.areaM2 = lot.areaM2;
  b.scale = areaScale(lot, def.referenceAreaM2, def.areaExponent);
  b.capScale = areaCapacityScale(lot, def.referenceAreaM2);
  // Name it for the size it actually is — buildingLabel reads b.scale, which is
  // why it has to be set first. A warehouse grow should not read as a closet.
  b.name = `${typeLabel(b)} · ${lot.name}`;
  b.builtAtMinute = state.minutes;
  state.buildings.push(b);
  lot.buildingId = b.id;

  const district = districtById(state, lot.districtId);
  logEvent(
    state,
    `${def.name} running out of ${lot.name}${district ? `, ${district.name}` : ''}.`,
    'good'
  );
  return { ok: true, building: b, cost: def.cost };
}

export function upgradeBuilding(state, buildingId, upgradeId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'Property is gone.' };

  const u = upgradeById(b.type, upgradeId);
  if (!u) return { ok: false, error: 'No such upgrade.' };
  if ((b.upgrades || []).includes(upgradeId)) {
    return { ok: false, error: 'Already installed.' };
  }
  if (!canAfford(state, u.cost)) {
    return { ok: false, error: `${u.name} costs $${u.cost.toLocaleString()} clean.` };
  }

  spendClean(state, u.cost);
  b.upgrades = (b.upgrades || []).concat(upgradeId);
  // Level is just how built-out the place is, for the marker badge.
  b.level = 1 + b.upgrades.length;
  logEvent(state, `${u.name} installed at ${b.name}.`, 'good');
  return { ok: true, upgrade: u, cost: u.cost };
}

/**
 * How much an auto shop knocks off fitting work. Running your own workshop is
 * supposed to be worth something — the note asks for buildings that actually do
 * a job — so every shop you own cuts the bill, and building it out cuts more.
 */
export function fittingDiscount(state) {
  // An auto shop is the legitimate way to do it; a chop shop is the other way,
  // and cheaper because nothing about it is above board.
  const shops = (state.buildings || []).filter(
    (b) => b.active !== false && (b.type === 'autoshop' || BUILDINGS[b.type].fittingDiscount)
  );
  if (!shops.length) return 0;
  // Best shop leads; extra shops help a little, and the whole thing is capped
  // so the work is never free.
  const best = shops.reduce((n, b) => {
    const base = BUILDINGS[b.type].fittingDiscount ?? 0.15;
    return Math.max(n, base + 0.05 * (b.upgrades || []).length);
  }, 0);
  return Math.min(0.45, best + 0.03 * (shops.length - 1));
}

/** Fit something to a vehicle. Each upgrade goes on once. */
export function upgradeCourier(state, vehicleId, upgradeId) {
  const v = (state.couriers || []).find((c) => c.id === vehicleId);
  if (!v) return { ok: false, error: 'That vehicle is gone.' };

  const def = COURIERS[v.type];
  const u = vehicleUpgradeById(def.class, upgradeId);
  if (!u) return { ok: false, error: 'No such upgrade for this vehicle.' };
  if ((v.upgrades || []).includes(upgradeId)) {
    return { ok: false, error: 'Already fitted.' };
  }

  const discount = fittingDiscount(state);
  const cost = Math.round(u.cost * (1 - discount));
  if (!canAfford(state, cost)) {
    return { ok: false, error: `${u.name} costs $${cost.toLocaleString()} clean.` };
  }

  spendClean(state, cost);
  v.upgrades = (v.upgrades || []).concat(upgradeId);
  logEvent(state,
    discount > 0
      ? `${u.name} fitted to ${v.name} at your own shop — saved $${(u.cost - cost).toLocaleString()}.`
      : `${u.name} fitted to ${v.name}.`,
    'good');
  return { ok: true, upgrade: u, cost, discount };
}

/**
 * Make a building you own your headquarters. Only one at a time — moving house
 * is allowed, having two homes is not.
 */
export function setHeadquarters(state, buildingId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'No such property.' };
  if (state.hqBuildingId === buildingId) {
    return { ok: false, error: 'That is already your base.' };
  }
  const previous = state.hqBuildingId ? buildingById(state, state.hqBuildingId) : null;
  state.hqBuildingId = buildingId;
  logEvent(state,
    previous
      ? `Moved base from ${previous.name} to ${b.name}.`
      : `${b.name} is your headquarters now. The block will run a little calmer.`,
    'good');
  return { ok: true, building: b, previous };
}

/**
 * Do work on a property you let out. Unlike a fit-out this survives a change of
 * tenant — it's the building that got better, not the operation.
 */
export function improveRental(state, lotId, upgradeId) {
  const lot = lotById(state, lotId);
  if (!lot) return { ok: false, error: 'No such property.' };
  if (!lot.owned) return { ok: false, error: 'Buy the property first.' };
  if (lot.buildingId) {
    return { ok: false, error: 'Something is running in there. Rental work is for property you let out.' };
  }

  const u = rentUpgradeById(lot.kind, upgradeId);
  if (!u) return { ok: false, error: 'That work does not apply to this building.' };
  lot.rentUpgrades = lot.rentUpgrades || [];
  if (lot.rentUpgrades.includes(upgradeId)) return { ok: false, error: 'Already done.' };
  if (!canAfford(state, u.cost)) {
    return { ok: false, error: `${u.name} costs $${u.cost.toLocaleString()} clean.` };
  }

  const d = districtById(state, lot.districtId);
  const before = rentPerDay(lot, d);
  spendClean(state, u.cost);
  lot.rentUpgrades.push(upgradeId);
  const after = rentPerDay(lot, d);

  logEvent(state,
    `${u.name} finished at ${lot.name}. Rent goes from $${before.toLocaleString()} to $${after.toLocaleString()} a day.`,
    'good');
  return { ok: true, upgrade: u, before, after, cost: u.cost };
}

// --- Firearms licensing -----------------------------------------------------

/**
 * Put in for a licence. It costs money now and takes weeks to come back, and
 * they look at your record before they grant it.
 */
export function applyForLicence(state, id) {
  const def = LICENCES[id];
  if (!def) return { ok: false, error: 'No such licence.' };
  const gate = canApply(state, id);
  if (!gate.ok) return { ok: false, error: gate.reason };
  if (!canAfford(state, def.cost)) {
    return { ok: false, error: `${def.name} costs $${def.cost.toLocaleString()} clean to file.` };
  }

  spendClean(state, def.cost);
  state.licences = state.licences || {};
  state.licences[id] = {
    id,
    status: 'pending',
    daysLeft: def.processingDays,
    // Renewal falls due a year after it's granted.
    renewsInDays: null,
  };
  logEvent(state,
    `Filed for ${def.name}. They'll take about ${def.processingDays} days over it.`,
    'info');
  return { ok: true, licence: def };
}

/** Pay the renewal on a licence you already hold. */
export function renewLicence(state, id) {
  const def = LICENCES[id];
  const rec = licenceRecord(state, id);
  if (!def || !rec || rec.status !== 'active') return { ok: false, error: 'You do not hold that.' };
  if (!canAfford(state, def.renewalPerYear)) {
    return { ok: false, error: `Renewal is $${def.renewalPerYear.toLocaleString()} clean.` };
  }
  spendClean(state, def.renewalPerYear);
  rec.renewsInDays = 365;
  logEvent(state, `${def.name} renewed for another year.`, 'good');
  return { ok: true, licence: def };
}

/** Tool a firearms shop for a different category of weapon. */
export function setProductionLine(state, buildingId, lineId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'No such workshop.' };
  const def = BUILDINGS[b.type];
  if (def.product !== 'iron') return { ok: false, error: 'That is not a firearms shop.' };
  const cls = FIREARM_CLASSES[lineId];
  if (!cls) return { ok: false, error: 'Unknown category.' };
  if (b.line === lineId) return { ok: false, error: 'Already tooled for that.' };

  // NFA is a paperwork problem before it's an engineering one — but only if
  // you're pretending to be legitimate. A back room does what it likes.
  if (cls.requiresLicence && def.needsLicence && !hasLicence(state, cls.requiresLicence)) {
    return { ok: false, error: `${cls.name} need a ${LICENCES[cls.requiresLicence].short} to make lawfully.` };
  }

  b.line = lineId;
  // A pattern belongs to a category; changing the category drops it.
  if (b.model && (MODELS[b.model] || {}).category !== lineId) b.model = null;
  // Retooling costs you the cycle you were in.
  b.cycleProgress = 0;
  logEvent(state, `${b.name} retooled for ${cls.name.toLowerCase()}.`, 'info');
  return { ok: true, line: cls };
}

// --- Turf you hold ----------------------------------------------------------

/** Rename a block you've taken. It shows everywhere the old name did. */
export function renameDistrict(state, districtId, name) {
  const d = districtById(state, districtId);
  if (!d) return { ok: false, error: 'No such block.' };
  if (!isHeld(d)) return { ok: false, error: claimBlocker(d) };

  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) {
    // Clearing it puts the real name back.
    delete d.customName;
    logEvent(state, `${d.name} goes back to its own name.`, 'info');
    return { ok: true, name: d.name };
  }
  const was = districtName(d);
  d.customName = clean;
  logEvent(state, `${was} is called ${clean} now.`, 'good');
  return { ok: true, name: clean };
}

/** Put a standing arrangement on a block you hold. */
export function improveTurf(state, districtId, upgradeId) {
  const d = districtById(state, districtId);
  if (!d) return { ok: false, error: 'No such block.' };
  if (!isHeld(d)) return { ok: false, error: claimBlocker(d) };

  const u = turfUpgradeById(upgradeId);
  if (!u) return { ok: false, error: 'No such arrangement.' };
  d.turfUpgrades = d.turfUpgrades || [];
  if (d.turfUpgrades.includes(upgradeId)) return { ok: false, error: 'Already in place.' };
  if (!canAfford(state, u.cost)) {
    return { ok: false, error: `${u.name} costs $${u.cost.toLocaleString()} clean to set up.` };
  }

  spendClean(state, u.cost);
  d.turfUpgrades.push(upgradeId);
  logEvent(state,
    `${u.name} on ${districtName(d)}. $${u.upkeepPerDay.toLocaleString()} a day to keep it that way.`,
    'good');
  return { ok: true, upgrade: u };
}

/** Stop paying for an arrangement. */
export function endTurfUpgrade(state, districtId, upgradeId) {
  const d = districtById(state, districtId);
  if (!d) return { ok: false, error: 'No such block.' };
  d.turfUpgrades = (d.turfUpgrades || []).filter((id) => id !== upgradeId);
  const u = turfUpgradeById(upgradeId);
  if (u) logEvent(state, `${u.name} on ${districtName(d)} stops.`, 'info');
  return { ok: true };
}

// --- Research and the things it makes ---------------------------------------

/** Put a project on the bench. */
export function startResearch(state, projectId) {
  const p = projectById(projectId);
  if (!p) return { ok: false, error: 'No such project.' };
  if (!(state.buildings || []).some((b) => b.kind === 'research' && b.active)) {
    return { ok: false, error: 'You need an R&D facility running first.' };
  }
  const gate = canResearch(state, projectId);
  if (!gate.ok) return { ok: false, error: gate.reason };
  if (!canAfford(state, p.cost)) {
    return { ok: false, error: `${p.name} costs $${p.cost.toLocaleString()} clean to set up.` };
  }

  spendClean(state, p.cost);
  state.researchActive = state.researchActive || [];
  state.researchActive.push({ id: projectId, hoursDone: 0 });
  logEvent(state, `${p.name} is on the bench.`, 'info');
  return { ok: true, project: p };
}

/** Abandon a project. The money spent setting it up is gone. */
export function cancelResearch(state, projectId) {
  state.researchActive = (state.researchActive || []).filter((r) => r.id !== projectId);
  const p = projectById(projectId);
  if (p) logEvent(state, `${p.name} shelved.`, 'info');
  return { ok: true };
}

/**
 * Fit a one-off to something. A building item goes on a building, a vehicle
 * item on a vehicle, and each thing carries one at a time.
 */
export function equipItem(state, itemId, targetId) {
  const item = (state.items || []).find((it) => it.id === itemId);
  if (!item) return { ok: false, error: 'No such item.' };
  const kind = ITEM_KINDS[item.kind];
  if (!kind) return { ok: false, error: 'Unknown item.' };

  if (!targetId) {
    item.equippedTo = null;
    return { ok: true, item };
  }

  const target = kind.slot === 'vehicle'
    ? (state.couriers || []).find((c) => c.id === targetId)
    : buildingById(state, targetId);
  if (!target) {
    return { ok: false, error: `A ${kind.name.toLowerCase()} fits a ${kind.slot}.` };
  }

  if (kind.slot === 'firearm') {
    // An attachment goes on a firearms line, and a line carries several.
    const def = BUILDINGS[target.type];
    if (!def || def.product !== 'iron') {
      return { ok: false, error: 'An attachment bolts onto a firearms line.' };
    }
    const a = attachmentById(item.variant);
    if (a && a.needsLicence && def.needsLicence && !hasLicence(state, a.needsLicence)) {
      return { ok: false, error: `A ${a.name.toLowerCase()} needs a ${LICENCES[a.needsLicence].short} on a licensed line.` };
    }
    const onIt = (state.items || []).filter(
      (o) => o.kind === 'attachment' && o.equippedTo === targetId && o.id !== item.id
    );
    if (onIt.length >= ATTACHMENT_SLOTS) {
      return { ok: false, error: `A line carries ${ATTACHMENT_SLOTS} attachments. Take one off first.` };
    }
    if (onIt.some((o) => o.variant === item.variant)) {
      return { ok: false, error: `That line already has ${a ? a.name.toLowerCase() : 'one of those'} on it.` };
    }
    if (incompatibleParts(target).includes(item.variant)) {
      const cls = classOf(target);
      return { ok: false, error: `${a ? a.name : 'That'} does not go on ${cls.name.toLowerCase()}.` };
    }
    if (builtInParts(target).includes(item.variant)) {
      const m = modelOf(target);
      return { ok: false, error: `A ${m.name} comes with ${a ? a.name.toLowerCase() : 'that'} already.` };
    }
    item.equippedTo = targetId;
    logEvent(state, `${item.name} fitted to ${target.name}.`, 'good');
    return { ok: true, item, target };
  }

  // Everything else is one at a time — take off whatever is already on it.
  for (const other of state.items || []) {
    if (other.id !== item.id && other.kind !== 'attachment' && other.equippedTo === targetId) {
      other.equippedTo = null;
    }
  }
  item.equippedTo = targetId;
  logEvent(state, `${item.name} fitted to ${target.name}.`, 'good');
  return { ok: true, item, target };
}

/** Sell a one-off. Rarity and your standing set what it fetches. */
export function sellItem(state, itemId) {
  const idx = (state.items || []).findIndex((it) => it.id === itemId);
  if (idx < 0) return { ok: false, error: 'No such item.' };
  const item = state.items[idx];
  const price = itemValue(state, item);
  state.items.splice(idx, 1);
  state.cash.clean += price;
  state.stats.legalRevenue = (state.stats.legalRevenue || 0) + price;
  logEvent(state, `Sold ${item.name} for $${price.toLocaleString()}.`, 'good');
  return { ok: true, item, price };
}

// --- Dealing with other operations ------------------------------------------

/**
 * Sell a one-off to somebody who actually wants it. Better than putting it on
 * the open market, which is the point of knowing people.
 */
export function sellItemTo(state, itemId, playerId) {
  const idx = (state.items || []).findIndex((it) => it.id === itemId);
  if (idx < 0) return { ok: false, error: 'No such item.' };
  const buyer = (state.players || []).find((p) => p.id === playerId);
  if (!buyer) return { ok: false, error: 'No such operation.' };
  if (!buyer.known) return { ok: false, error: "You haven't met them." };

  const item = state.items[idx];
  const price = offerForItem(buyer, itemValue(state, item));
  state.items.splice(idx, 1);
  state.cash.clean += price;
  state.stats.legalRevenue = (state.stats.legalRevenue || 0) + price;
  state.stats.tradedWithPlayers = (state.stats.tradedWithPlayers || 0) + price;
  logEvent(state, `${buyer.name} took ${item.name} for $${price.toLocaleString()}.`, 'good');
  return { ok: true, item, price, buyer };
}

/**
 * Move product in bulk to another operation. Street money, because it is, but
 * without grinding it out a pack at a time — and they can only take so much.
 */
export function sellProductTo(state, buildingId, playerId, productId, amount) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'No such premises.' };
  const buyer = (state.players || []).find((p) => p.id === playerId);
  if (!buyer) return { ok: false, error: 'No such operation.' };
  if (!buyer.known) return { ok: false, error: "You haven't met them." };

  const have = (b.packs && b.packs[productId]) || 0;
  if (have <= 0.01) return { ok: false, error: 'Nothing packaged to sell there.' };

  const d = districtById(state, b.districtId);
  const room = appetiteFor(buyer, productId);
  const move = Math.min(have, amount || have, room);
  if (move <= 0.01) {
    return { ok: false, error: `${buyer.name} can't take any more of that right now.` };
  }

  // A bulk handoff by weight: they take the lot in one go and carry the risk of
  // moving it on, so they do not pay corner money for it.
  const unit = offerForProduct(buyer, productId,
    streetPrice(d, productId) * WHOLESALE_FACTOR);
  const gross = move * unit;
  b.packs[productId] -= move;
  state.cash.dirty += gross;
  state.stats.grossRevenue = (state.stats.grossRevenue || 0) + gross;
  state.stats.tradedWithPlayers = (state.stats.tradedWithPlayers || 0) + gross;
  state.stats.packsSold[productId] = (state.stats.packsSold[productId] || 0) + move;

  // A wholesale handoff is quieter than serving a street, but it isn't nothing.
  if (d) d.heat = Math.min(100, d.heat + move * 0.01);

  logEvent(state,
    `${buyer.name} took ${Math.round(move)} packs off you for $${Math.round(gross).toLocaleString()}.`,
    'good');
  return { ok: true, buyer, moved: move, unit, gross };
}

/** Call a place whatever you like. Blank puts its given name back. */
export function renameBuilding(state, buildingId, name) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'No such place.' };
  const clean = String(name || '').trim().slice(0, 32);
  const was = buildingLabel(b);
  b.label = clean || (BUILDINGS[b.type] || {}).name || 'The Place';
  if (buildingLabel(b) !== was) {
    logEvent(state, `${was} goes by ${buildingLabel(b)} now.`, 'info');
  }
  return { ok: true, name: buildingLabel(b) };
}

/** Set up a firearms line for a specific pattern within its category. */
export function setModel(state, buildingId, modelId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'No such workshop.' };
  const def = BUILDINGS[b.type];
  if (def.product !== 'iron') return { ok: false, error: 'That is not a firearms shop.' };
  const m = MODELS[modelId];
  if (!m) return { ok: false, error: 'Unknown pattern.' };
  if (m.category !== classOf(b).id) {
    return { ok: false, error: `${m.name} is a ${FIREARM_CLASSES[m.category].name.toLowerCase()} pattern — retool the line first.` };
  }
  if (b.model === modelId) return { ok: false, error: 'Already set up for that.' };

  b.model = modelId;
  b.cycleProgress = 0;
  logEvent(state, `${b.name} set up to build the ${m.name}.`, 'info');
  return { ok: true, model: m };
}

export { availableUpgrades, effectsFor };

export function toggleBuilding(state, buildingId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'Property is gone.' };
  b.active = !b.active;
  return { ok: true, active: b.active };
}

export function sellBuilding(state, buildingId) {
  const idx = state.buildings.findIndex((b) => b.id === buildingId);
  if (idx < 0) return { ok: false, error: 'Property is gone.' };
  const b = state.buildings[idx];
  const lot = b.lotId ? lotById(state, b.lotId) : null;
  const district = districtById(state, b.districtId);
  // Today's market value for the property, plus scrap on the equipment.
  const propertyValue = lot ? lotResale(lot, district) : 0;
  const scrap = Math.round(BUILDINGS[b.type].cost * MARKET_PROPERTY.fitOutScrap);
  const pnl = lot ? lotPnL(lot, district) : null;
  const refund = propertyValue + scrap;
  if (lot) {
    state.stats.propertyPnL = (state.stats.propertyPnL || 0) + (pnl ? pnl.delta : 0);
    lot.owned = false;
    lot.rented = false;
    lot.paidPrice = null;
    lot.buildingId = null;
  }

  state.buildings.splice(idx, 1);
  state.routes = state.routes.filter((r) => r.fromId !== b.id && r.toId !== b.id);
  for (const c of state.couriers) {
    if (c.routeId && !routeById(state, c.routeId)) { c.routeId = null; c.phase = 'idle'; }
    if (c.homeBuildingId === b.id) c.homeBuildingId = state.buildings[0]?.id || null;
  }
  state.cash.clean += refund;
  logEvent(state, `Sold ${b.name} for $${refund.toLocaleString()} clean.`, 'info');
  return { ok: true, refund };
}

/** Buy a vehicle. It is an asset — it sits parked until someone drives it. */
/** Every depot you run, with how many bays are spoken for. */
export function depots(state) {
  return (state.buildings || [])
    .filter((b) => b.kind === 'depot')
    .map((b) => {
      const lot = lotById(state, b.lotId);
      const spaces = (lot && lot.spaces) || 0;
      const parked = (state.couriers || []).filter((c) => c.homeBuildingId === b.id);
      return { building: b, lot, spaces, parked, free: Math.max(0, spaces - parked.length) };
    });
}

export function fleetSpaces(state) {
  const all = depots(state);
  return {
    total: all.reduce((a, d) => a + d.spaces, 0),
    used: all.reduce((a, d) => a + d.parked.length, 0),
    depots: all,
  };
}

export function buyVehicle(state, typeId) {
  const def = COURIERS[typeId];
  if (!def) return { ok: false, error: 'Unknown vehicle.' };

  // A vehicle has to have somewhere to live, and the map decides how much room
  // there is — a surface lot or a multi-storey you actually own.
  const open = depots(state).filter((d) => d.free > 0)
    .sort((a, b) => b.free - a.free)[0];
  if (!open) {
    const any = depots(state).length;
    return {
      ok: false,
      error: any
        ? 'Every bay is taken. Buy another car park and put a depot on it.'
        : 'Nowhere to keep it. Buy a car park on the map and fit it out as a depot first.',
    };
  }
  if (!canAfford(state, def.cost)) {
    return { ok: false, error: `A ${def.name} costs $${def.cost.toLocaleString()} clean.` };
  }
  spendClean(state, def.cost);

  const home = open.building.id;
  const v = createVehicle(typeId, home);
  // Take the lowest free bay, so the yard fills up in order.
  const taken = new Set(open.parked.map((c) => c.parkSlot));
  let slot = 0;
  while (taken.has(slot)) slot++;
  v.parkSlot = slot;

  const sameType = state.couriers.filter((x) => x.type === typeId).length + 1;
  v.name = `${def.name} #${sameType}`;
  v.position = parkedPosition(state, v) || { ...state.origin };
  state.couriers.push(v);
  logEvent(state,
    `Bought a ${def.name} for $${def.cost.toLocaleString()}. Parked at ${open.building.name}.`,
    'good');
  return { ok: true, vehicle: v };
}

/**
 * Take on a driver. Each one is harder to find than the last, so the fee climbs
 * — the people willing to do this work are not an unlimited supply.
 */
export function hireDriver(state) {
  state.drivers = state.drivers || [];
  if (state.drivers.length >= DRIVERS.maxRoster) {
    return { ok: false, error: 'Nobody else in this city wants the job.' };
  }
  const fee = nextDriverHireFee(state);
  if (!canAfford(state, fee)) {
    return { ok: false, error: `Bringing someone else in costs $${fee.toLocaleString()} clean.` };
  }
  spendClean(state, fee);
  const d = createDriver(state.drivers.length);
  d.hiredAtMinute = state.minutes;
  state.drivers.push(d);
  logEvent(state, `${d.name} is driving for you — $${fee.toLocaleString()} up front, $${d.wagePerDay}/day.`, 'good');
  return { ok: true, driver: d, fee };
}

export function fireDriver(state, driverId) {
  const idx = (state.drivers || []).findIndex((d) => d.id === driverId);
  if (idx < 0) return { ok: false, error: 'Already gone.' };
  const [d] = state.drivers.splice(idx, 1);
  for (const v of state.couriers) {
    if (v.driverId === d.id) { v.driverId = null; v.phase = 'idle'; v.routeId = null; }
  }
  logEvent(state, `${d.name} is off the payroll.`, 'info');
  return { ok: true };
}

/** Put a driver in a vehicle, or take them out of it. */
export function assignDriver(state, vehicleId, driverId) {
  const v = courierById(state, vehicleId);
  if (!v) return { ok: false, error: 'That vehicle is gone.' };
  const d = driverId ? driverById(state, driverId) : null;
  if (driverId && !d) return { ok: false, error: 'That driver is gone.' };

  // One driver, one vehicle.
  if (d) {
    for (const other of state.couriers) {
      if (other.id !== v.id && other.driverId === d.id) {
        other.driverId = null;
        other.phase = 'idle';
      }
    }
  }
  v.driverId = d ? d.id : null;
  if (!d) { v.phase = 'idle'; v.progress = 0; }
  else if (v.routeId) { v.phase = 'loading'; v.progress = 0; v.dwellLeft = 0; }
  return { ok: true };
}

export function sellVehicle(state, vehicleId) {
  const idx = state.couriers.findIndex((c) => c.id === vehicleId);
  if (idx < 0) return { ok: false, error: 'Already gone.' };
  const v = state.couriers[idx];
  const def = COURIERS[v.type];
  // Vehicles lose value the moment you drive them off the forecourt.
  const back = Math.round(def.cost * 0.55);
  state.couriers.splice(idx, 1);
  state.cash.clean += back;
  logEvent(state, `Sold the ${def.name} for $${back.toLocaleString()}.`, 'info');
  return { ok: true, back };
}



/**
 * Create a standing route. The road geometry is fetched in the background —
 * the route is usable the moment it resolves, and falls back to a padded
 * straight line if the router can't be reached.
 */
export async function addRoute(state, spec, onReady) {
  const from = buildingById(state, spec.fromId);
  if (!from) return { ok: false, error: 'Pick a pickup point.' };

  const toLatLng =
    spec.toType === 'district'
      ? districtById(state, spec.toId)?.center
      : buildingById(state, spec.toId)?.latlng;
  if (!toLatLng) return { ok: false, error: 'Pick a drop-off.' };

  const duplicate = state.routes.find(
    (r) => r.fromId === spec.fromId && r.toId === spec.toId && r.cargo === spec.cargo && r.product === spec.product
  );
  if (duplicate) return { ok: false, error: 'You already run that exact route.' };

  const route = createRoute(spec);
  state.routes.push(route);

  const result = await fetchRoute(from.latlng, toLatLng);
  route.points = result.points;
  route.km = result.km;
  route.driveMinutes = result.driveMinutes;
  route.realRoad = result.real;
  onReady?.(route);
  return { ok: true, route };
}

export function removeRoute(state, routeId) {
  const idx = state.routes.findIndex((r) => r.id === routeId);
  if (idx < 0) return { ok: false, error: 'Route is gone.' };
  const [route] = state.routes.splice(idx, 1);
  for (const c of state.couriers) {
    c.routeIds = (c.routeIds || []).filter((id) => id !== route.id);
    if (c.routeId === route.id) {
      c.routeIndex = 0;
      c.routeId = c.routeIds[0] || null;
      c.progress = 0;
      if (!c.routeId) c.phase = 'idle';
    }
  }
  return { ok: true };
}

/** Put a vehicle on one line, replacing whatever circuit it had. */
export function assignCourier(state, courierId, routeId) {
  const c = courierById(state, courierId);
  if (!c) return { ok: false, error: 'Courier is gone.' };
  const route = routeId ? routeById(state, routeId) : null;
  if (routeId && !route) return { ok: false, error: 'Route is gone.' };

  c.routeIds = route ? [route.id] : [];
  c.routeIndex = 0;
  c.routeId = route ? route.id : null;
  c.phase = route ? 'loading' : 'idle';
  c.progress = 0;
  // The vehicle still lives at its depot; a route is work, not an address.
  if (route) {
    const from = buildingById(state, route.fromId);
    if (from) c.position = from.latlng;
  }
  return { ok: true };
}

/** Add another line to a vehicle's circuit, if it's big enough to carry one. */
export function addRouteToVehicle(state, courierId, routeId) {
  const c = courierById(state, courierId);
  if (!c) return { ok: false, error: 'Vehicle is gone.' };
  const route = routeById(state, routeId);
  if (!route) return { ok: false, error: 'Route is gone.' };

  c.routeIds = Array.isArray(c.routeIds) ? c.routeIds : (c.routeId ? [c.routeId] : []);
  if (c.routeIds.includes(routeId)) return { ok: false, error: 'Already on that line.' };

  const def = COURIERS[c.type];
  const max = maxRoutesFor(def, c);
  if (c.routeIds.length >= max) {
    return {
      ok: false,
      error: `A ${def.name} can only work ${max} line${max === 1 ? '' : 's'} at once. Something bigger would carry more.`,
    };
  }
  c.routeIds.push(routeId);
  if (!c.routeId) { c.routeId = routeId; c.routeIndex = c.routeIds.length - 1; c.phase = 'loading'; }
  return { ok: true, count: c.routeIds.length, max };
}

/** Take a line off a vehicle's circuit. */
export function removeRouteFromVehicle(state, courierId, routeId) {
  const c = courierById(state, courierId);
  if (!c) return { ok: false, error: 'Vehicle is gone.' };
  c.routeIds = (c.routeIds || []).filter((id) => id !== routeId);
  if (c.routeId === routeId) {
    c.routeIndex = 0;
    c.routeId = c.routeIds[0] || null;
    c.phase = c.routeId ? 'loading' : 'idle';
    c.progress = 0;
  }
  return { ok: true, count: c.routeIds.length };
}

/** What it costs to run a crew off a block — dearer the harder they hold it. */
export function muscleCost(district) {
  const control = district.rivalControl || 0;
  return Math.round(RIVALS.muscleBaseCost + RIVALS.muscleCostPerControl * control * control);
}

/**
 * Push a rival off a block by force. Odds turn on how hard they hold it and
 * how well the neighbourhood already knows you. Win and their grip drops for
 * good; lose and you're out most of the money with the block hotter than
 * before. Either way the police notice.
 */
export function muscleIn(state, districtId) {
  const d = districtById(state, districtId);
  if (!d) return { ok: false, error: 'No such block.' };
  if (!d.crewId || (d.rivalControl || 0) < 0.05) {
    return { ok: false, error: 'Nobody left to push out here.' };
  }

  const crew = (state.crews || []).find((c) => c.id === d.crewId);
  if (!crew) return { ok: false, error: 'Nobody left to push out here.' };

  const cost = muscleCost(d);
  if (!canAfford(state, cost)) {
    return { ok: false, error: `Need $${cost.toLocaleString()} clean to move on them.` };
  }

  // Your standing on the block is what tips a fight your way.
  const odds = clamp01(0.28 + d.rep * 0.5 - (d.rivalControl - 0.3) * 0.45);
  const won = Math.random() < odds;

  d.heat = Math.min(100, d.heat + RIVALS.muscleHeat);

  if (!won) {
    spendClean(state, Math.round(cost * RIVALS.muscleBackfireCost));
    d.rivalControl = clamp01(d.rivalControl + 0.06);
    logEvent(state, `Move on ${crew.name} in ${d.name} went bad. They held the block.`, 'bad');
    return { ok: true, won: false, cost: Math.round(cost * RIVALS.muscleBackfireCost) };
  }

  spendClean(state, cost);
  const [lo, hi] = RIVALS.muscleKnockdown;
  const knock = lo + Math.random() * (hi - lo);
  d.rivalControl = clamp01(d.rivalControl - knock);
  // Permanent: their natural hold on this block is broken, not just suppressed.
  d.baseControl = clamp01((d.baseControl || 0) - knock * 0.75);
  crew.pushedBack = (crew.pushedBack || 0) + knock;
  state.stats.blocksTaken = (state.stats.blocksTaken || 0) + 1;
  logEvent(state, `Pushed ${crew.name} out of ${d.name}. The block is opening up.`, 'good');
  return { ok: true, won: true, cost, knock };
}

/** How much the fixer will still take today. */
export function fixerRemaining(state) {
  return Math.max(0, FIXER.dailyLimit - (state.fixerUsedToday || 0));
}

/**
 * Wash street cash without owning a Front. He takes a brutal cut and only
 * handles so much a day, but he keeps a run from dead-ending.
 */
export function washWithFixer(state, requested) {
  const room = fixerRemaining(state);
  if (room <= 0) return { ok: false, error: 'The fixer’s done for today. Come back tomorrow.' };
  if (state.cash.dirty <= 0) return { ok: false, error: 'No street cash to wash.' };

  const amount = Math.min(requested || room, room, state.cash.dirty);
  if (amount <= 0) return { ok: false, error: 'Nothing to wash.' };

  const clean = amount * (1 - FIXER.cut);
  state.cash.dirty -= amount;
  state.cash.clean += clean;
  state.fixerUsedToday = (state.fixerUsedToday || 0) + amount;
  state.stats.laundered += amount;
  logEvent(
    state,
    `Fixer washed $${Math.round(amount).toLocaleString()} — you kept $${Math.round(clean).toLocaleString()}.`,
    'info'
  );
  return { ok: true, amount, clean };
}

/** Change a route in place rather than closing it and building a new one. */
export function editRoute(state, routeId, changes, refetch) {
  const route = routeById(state, routeId);
  if (!route) return { ok: false, error: 'Route is gone.' };

  const nextTo = changes.toKey ? changes.toKey.split(':') : null;
  const nextFrom = changes.fromId || route.fromId;
  const nextToType = nextTo ? nextTo[0] : route.toType;
  const nextToId = nextTo ? nextTo[1] : route.toId;

  // A route from a building to itself spins at tick rate and exposes your own
  // stock to seizure on a delivery that goes nowhere.
  if (nextToType === 'building' && nextFrom === nextToId) {
    return { ok: false, error: 'A route can’t start and end at the same place.' };
  }

  const movedEnd = nextToType !== route.toType || nextToId !== route.toId;
  const movedStart = nextFrom !== route.fromId;
  // Changing what a courier is carrying mid-run would convert whatever is
  // aboard into the new kind for free, skipping the lab entirely.
  const changedCargo = changes.cargo && changes.cargo !== route.cargo;
  const changedProduct = changes.product && changes.product !== route.product;

  if (changedCargo) route.cargo = changes.cargo;
  if (changedProduct) route.product = changes.product;
  if (movedStart) route.fromId = nextFrom;
  if (movedEnd) { route.toType = nextToType; route.toId = nextToId; }

  if (movedStart || movedEnd || changedCargo || changedProduct) {
    // Anyone mid-run goes back to the source and starts the new job clean,
    // taking whatever they were carrying with them.
    for (const c of state.couriers) {
      if (c.routeId !== route.id) continue;
      c.phase = 'loading';
      c.progress = 0;
      c.dwellLeft = 0;
      if (changedCargo) {
        // Put it back rather than letting it change type in transit.
        returnCargoToSource(state, c, route);
      }
    }
  }
  if (movedStart || movedEnd) {
    route.points = null;
    route.km = null;
    refetch?.(route);
  }
  return { ok: true, route, rerouted: movedStart || movedEnd, cargoReset: changedCargo };
}

/** Hand a courier's load back to its pickup point, as the kind it actually is. */
function returnCargoToSource(state, courier, route) {
  const source = buildingById(state, route.fromId);
  const pool = source
    ? (courier.cargoKind === 'raw' ? source.raw : source.packs)
    : null;
  for (const pid of Object.keys(courier.cargo)) {
    const amount = courier.cargo[pid];
    if (amount <= 0) continue;
    if (pool) pool[pid] += amount;
    courier.cargo[pid] = 0;
  }
}

// --- Admin -----------------------------------------------------------------
// Testing conveniences. Deliberately separate from the game's own rules so
// nothing here can be reached by ordinary play.

export function adminGrant(state, cleanAmount = 100000, dirtyAmount = 0) {
  state.cash.clean += cleanAmount;
  state.cash.dirty += dirtyAmount;
  logEvent(state, `[admin] granted $${cleanAmount.toLocaleString()} clean.`, 'info');
  return { ok: true };
}

export function adminBuyBlock(state, districtId) {
  const d = districtById(state, districtId);
  if (!d) return { ok: false, error: 'No such block.' };
  d.rivalControl = 0;
  d.baseControl = 0;
  d.heat = 0;
  d.rep = 1;
  logEvent(state, `[admin] took ${d.name} outright.`, 'info');
  return { ok: true };
}

export function adminCoolOff(state) {
  for (const d of state.districts) d.heat = 0;
  logEvent(state, '[admin] all heat cleared.', 'info');
  return { ok: true };
}

export function adminUnlockAll(state) {
  state.adminUnlockAll = !state.adminUnlockAll;
  if (state.adminUnlockAll) state.unlocked = BUILDING_IDS.slice();
  logEvent(state, `[admin] unlock-all ${state.adminUnlockAll ? 'on' : 'off'}.`, 'info');
  return { ok: true, on: state.adminUnlockAll };
}

/** Describe a route in the words the player thinks in. */
export function routeLabel(state, route) {
  const from = buildingById(state, route.fromId);
  const to =
    route.toType === 'district'
      ? districtById(state, route.toId)
      : buildingById(state, route.toId);
  const cargo = route.cargo === 'raw' ? 'raw' : 'packs';
  const product = route.product === 'any' ? 'all' : route.product;
  return {
    from: from ? from.name : '—',
    // A block you've renamed reads by its new name everywhere the old one did.
    to: to ? (route.toType === 'district' ? districtName(to) : to.name) : '—',
    cargo,
    product,
    km: route.km,
  };
}
