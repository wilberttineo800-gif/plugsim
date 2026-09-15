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
import { clamp, clamp01 } from './rng.js';
import { streetPrice } from './economy.js';
import { citiesOf, homeCity, cityOfBuilding, foundingCost, quoteShipment } from './cities.js';
import { generateDistricts } from './districts.js';
import { haversineKm } from './geo.js';
import { paySoft } from './sim.js';
import { unlockStatus } from './progression.js';
import {
  LICENCES, FIREARM_CLASSES, canApply, hasLicence, licenceRecord, MODELS, classOf,
  builtInParts, modelOf, incompatibleParts,
} from './firearms.js';
import { lineKindOf } from './lines.js';
import { ORGAN_TRADE, harvest, stockOf, organValue } from './organs.js';
import {
  CAPTIVES, captivesOf, holdingCapacity, snatch as doSnatch, takeFrom,
  takeableFrom, symptomsOf, release as doRelease, gutCompletely,
} from './captives.js';
import {
  takeHit, treat, treatmentCost, openWounds, condition, BODY_PARTS,
  removePart as removePartFrom, missingCount as missingCountOf,
  newBody, causeOfDeath, HEALTH,
} from './health.js';
import { PARTS, countOf, survivesWithout, partValue } from './anatomy.js';
import {
  TIERS, FITMENTS, FITMENT_IDS, tiersFor, fitmentCost, fitmentState,
  installedTier, rollEfficiency,
} from './bionics.js';
import { getStat } from './stats.js';
import { armouryDistrictId } from './armoury.js';
import { addImpairment, impairmentFor, impairmentsOf } from './impairments.js';
import {
  STREET_DOC, docOf, hasDoc, hireDoc, releaseDoc, riskOf,
} from './streetdoc.js';
import {
  characterOf, protectionOf, armedWith, equip, setTrait, setModel as setLookPreset,
} from './character.js';
import {
  armouryEdge, armourGuard, keepFromLine as takeFromLine, releasePiece as letPieceGo,
  canKeep,
} from './armoury.js';
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
  nextId,
  clockOf,
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
    // Some things are not on the menu. A locked building is a goal — it shows
    // greyed with what it wants — but a HIDDEN one is not there at all until
    // somebody has put it to you, because the whole point of it is that you
    // were not looking for it.
    if (BUILDINGS[id].hidden && !isDiscovered(state, id)) return false;
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

/** Things that have been put to you, which is not the same as things unlocked. */
export function isDiscovered(state, id) {
  return !!state && (state.discovered || []).includes(id);
}

/**
 * Somebody puts it to you.
 *
 * Deliberately not a tip, not an unlock notification and not a tab that
 * appears. One oblique line in the log that most players will scroll past,
 * and after it two buildings quietly exist that did not before.
 */
export function offerTheOtherThing(state, route = 'muscle') {
  if (isDiscovered(state, 'back_clinic')) return false;
  state.discovered = (state.discovered || []).concat(['back_clinic', 'morgue']);
  logEvent(state, WHO_PUTS_IT_TO_YOU[route] || WHO_PUTS_IT_TO_YOU.muscle, 'info');
  return true;
}

/**
 * Two ways in, and they are deliberately opposite ways.
 *
 * One is the bottom of the business: take enough blocks by force and somebody
 * who clears up after you asks a question. The other is the TOP of it — buy
 * an honest funeral home, run it a month, and the trade tells you itself,
 * because the only difference between a prep room and the other thing is who
 * the paperwork says the body belongs to. Somebody who never throws a punch
 * should still be able to stumble into this, and the funeral home is how.
 */
const WHO_PUTS_IT_TO_YOU = {
  muscle: 'Somebody took you aside afterwards. Wanted to know whether you ever '
    + 'have anything that needs moving quietly, and whether you had somewhere cold.',
  funeral: 'Your embalmer has been doing this thirty years. Said, without '
    + 'looking up from the table, that a licensed prep room takes in a great '
    + 'deal more than the families ever ask about — and that he knows people '
    + 'who pay for the difference.',
};

/** A month in the trade is long enough for somebody to say it out loud. */
export const FUNERAL_DISCOVERY_DAYS = 28;

/** The honest businesses that put you next to a body every working day. */
export const FUNERAL_TRADE = ['funeral_home', 'crematorium'];

/**
 * A day of running an honest funeral home. Counted rather than checked against
 * a build date, so a place you sell and rebuy does not reset the clock and a
 * place you own but never switched on does not start it.
 */
export function stepFuneralTrade(state) {
  if (!state || isDiscovered(state, 'back_clinic')) return false;
  const running = (state.buildings || []).some(
    (b) => FUNERAL_TRADE.includes(b.type) && b.active);
  if (!running) return false;
  state.stats = state.stats || {};
  state.stats.funeralDays = (state.stats.funeralDays || 0) + 1;
  if (state.stats.funeralDays < FUNERAL_DISCOVERY_DAYS) return false;
  return offerTheOtherThing(state, 'funeral');
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
  const kind = lineKindOf(b);
  if (!kind) return { ok: false, error: 'That is not a line you tool.' };
  const cls = kind.classes[lineId];
  if (!cls) return { ok: false, error: 'Unknown category.' };
  if (b.line === lineId) return { ok: false, error: 'Already tooled for that.' };

  // NFA — and a ballistic shield — are a paperwork problem before they are an
  // engineering one, but only if you are pretending to be legitimate. A back
  // room does what it likes.
  if (cls.requiresLicence && def.needsLicence && !hasLicence(state, cls.requiresLicence)) {
    return { ok: false, error: `${cls.name} need a ${LICENCES[cls.requiresLicence].short} to make lawfully.` };
  }

  b.line = lineId;
  // A pattern belongs to a category; changing the category drops it.
  if (b.model && (kind.models[b.model] || {}).category !== lineId) b.model = null;
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

  // Somebody who is obviously hurt is somebody who is obviously in a hurry,
  // and the other side prices accordingly.
  const shape = getStat(state, 'deal');
  // A bulk handoff by weight: they take the lot in one go and carry the risk of
  // moving it on, so they do not pay corner money for it.
  const unit = offerForProduct(buyer, productId,
    streetPrice(d, productId) * WHOLESALE_FACTOR) * shape;
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
  const kind = lineKindOf(b);
  if (!kind) return { ok: false, error: 'That is not a line you tool.' };
  const m = kind.models[modelId];
  if (!m) return { ok: false, error: 'Unknown pattern.' };
  if (m.category !== kind.classOf(b).id) {
    return { ok: false, error: `${m.name} is a ${kind.classes[m.category].name.toLowerCase()} pattern — retool the line first.` };
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

  // Your standing on the block is what tips a fight your way — and so does
  // what you are carrying, which is the point of keeping any of it.
  const edge = armouryEdge(state);
  // Taking a block off somebody is a physical thing. On one leg, concussed, or
  // with an arm that does not close, it is a worse idea than it already was —
  // and this is where an injury stops being a number on a screen.
  const fit = getStat(state, 'muscle');
  const odds = clamp01((0.28 + d.rep * 0.5 - (d.rivalControl - 0.3) * 0.45 + edge) * fit);
  const won = Math.random() < odds;

  d.heat = Math.min(100, d.heat + RIVALS.muscleHeat);

  if (!won) {
    // What you were wearing is what decides how badly a bad move goes. Armour
    // does not stop you losing the block; it stops losing it costing as much.
    const guard = armourGuard(state);
    // And it is not only money. A move that goes wrong is people shooting at
    // you, and this is where the cabinet stops being a spreadsheet entry.
    // Somebody who cannot move is somebody who is still standing there.
    const away = getStat(state, 'evade');
    const rounds = 1 + Math.floor(Math.random() * 3) + (Math.random() > away ? 1 : 0);
    const hurt = takeFire(state, { rounds, heat: d.heat });
    spendClean(state, Math.round(cost * RIVALS.muscleBackfireCost * (1 - guard)));
    d.rivalControl = clamp01(d.rivalControl + 0.06 * (1 - guard));
    logEvent(state, `Move on ${crew.name} in ${d.name} went bad. They held the block.`, 'bad');
    reportFire(state, hurt);
    return {
      ok: true, won: false, guard,
      cost: Math.round(cost * RIVALS.muscleBackfireCost * (1 - guard)),
    };
  }

  spendClean(state, cost);
  // Somebody notices what taking a block by force leaves behind, and puts
  // something to you. Only after you have done it enough to be worth asking.
  state.stats.blocksTaken = (state.stats.blocksTaken || 0) + 1;
  if (state.stats.blocksTaken >= 3 && (state.lots || []).filter((l) => l.owned).length >= 6) {
    offerTheOtherThing(state);
  }
  // Taking a block by force leaves people on it. Whether that is anything but
  // a line in the log depends entirely on whether you have built somewhere to
  // take them, which is a decision made long before this moment.
  if (hasClinic(state)) {
    const atHour = Math.floor((state.minutes || 0) / 60);
    const n = 1 + Math.floor(Math.random() * 2);
    state.casualties = (state.casualties || []).concat(
      Array.from({ length: n }, (_, i) => ({
        id: `cas${(state.organCounter = (state.organCounter || 0) + 1)}`,
        districtId: d.id,
        atHour,
      }))
    );
  }
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

  // Washing money is appointments, paperwork and being somewhere at a
  // particular time. Concussed and short of an arm, you get through less of it.
  const capable = getStat(state, 'wash');
  const amount = Math.min(requested || room, room * capable, state.cash.dirty);
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

// --- More than one city -----------------------------------------------------

/**
 * Open up somewhere new.
 *
 * The reason to do it is not more room — it is a different market. A city under
 * another country code prices every product differently, because
 * `regionMultiplier` is baked into district demand when it is generated.
 */
export function foundCity(state, { name, origin, countryCode = null, lots = [] } = {}) {
  if (!name || !origin) return { ok: false, error: 'Nowhere named to go.' };

  const existing = citiesOf(state);
  if (existing.some((c) => c.name.toLowerCase() === String(name).toLowerCase())) {
    return { ok: false, error: `You already work ${name}.` };
  }

  const from = homeCity(state);
  const distance = haversineKm(from.origin, origin);
  const cost = foundingCost(state, distance);
  if (state.cash.clean < cost) {
    return { ok: false, error: `Opening ${name} costs $${cost.toLocaleString()} clean.` };
  }

  const id = `city-${existing.length}`;
  const city = {
    id,
    name,
    origin,
    countryCode,
    foundedDay: clockOf(state.minutes).day,
    home: false,
  };

  const districts = generateDistricts(origin, [], countryCode, id);
  state.cities = [...existing, city];
  state.districts = [...state.districts, ...districts];
  if (lots.length) state.lots = [...state.lots, ...lots];
  state.cash.clean -= cost;

  logEvent(state,
    `You're in ${name} now — ${Math.round(distance).toLocaleString()} km out, `
    + `${districts.length} blocks, and it wants different things to home.`,
    'good');
  return { ok: true, city, districts, cost };
}

/**
 * Hand a consignment to a smuggler.
 *
 * Unlike a route, you do not watch this happen. It leaves, it is gone for days,
 * and it either turns up or it doesn't — so the decision is how much to put in
 * one load, not which road to take.
 */
export function sendShipment(state, fromBuildingId, toBuildingId, productId, amount) {
  const from = buildingById(state, fromBuildingId);
  const to = buildingById(state, toBuildingId);
  if (!from || !to) return { ok: false, error: 'One end of that is gone.' };

  const fromCity = cityOfBuilding(state, from);
  const toCity = cityOfBuilding(state, to);
  if (!fromCity || !toCity) return { ok: false, error: 'Cannot place one of those.' };
  if (fromCity.id === toCity.id) {
    return { ok: false, error: 'Same city — run a route instead, it is cheaper and safer.' };
  }

  const have = (from.packs && from.packs[productId]) || 0;
  const move = Math.min(have, amount || have);
  if (move <= 0.01) return { ok: false, error: 'Nothing there to send.' };

  const district = districtById(state, from.districtId);
  const quote = quoteShipment(state, fromCity, toCity, move, district ? district.heat : 0);
  if (state.cash.dirty + state.cash.clean < quote.fee) {
    return { ok: false, error: `The carry costs $${quote.fee.toLocaleString()}.` };
  }

  from.packs[productId] -= move;
  paySoft(state, quote.fee);

  const shipment = {
    id: nextId('ship'),
    fromCityId: fromCity.id,
    toCityId: toCity.id,
    toBuildingId,
    productId,
    amount: move,
    quality: (from.packQuality && from.packQuality[productId]) || 0.5,
    fee: quote.fee,
    risk: quote.risk,
    sentAtMinute: state.minutes,
    arrivesAtMinute: state.minutes + quote.hours * 60,
  };
  state.shipments = [...(state.shipments || []), shipment];

  logEvent(state,
    `${Math.round(move).toLocaleString()} out to ${toCity.name} — `
    + `${(quote.hours / 24).toFixed(1)} days, $${quote.fee.toLocaleString()} to carry it, `
    + `${Math.round(quote.risk * 100)}% chance it doesn't arrive.`,
    'info');
  return { ok: true, shipment, quote };
}


// --- Keeping one for yourself -----------------------------------------------

/**
 * Take a finished unit off one of your own lines.
 *
 * It comes out of that line's stock, so the cost is the sale you now will not
 * make — and the dearest lines are exactly the ones worth keeping something
 * from. That tension is the whole mechanic, so it is not softened anywhere.
 */
export function keepFirearm(state, buildingId) {
  const b = buildingById(state, buildingId);
  if (!b) return { ok: false, error: 'No such premises.' };
  const gate = canKeep(state, b);
  if (!gate.ok) return gate;

  const res = takeFromLine(state, b);
  if (!res.ok) return res;
  logEvent(state,
    `Kept a ${res.piece.name} off ${b.name}. That is $${res.forgone.toLocaleString()} you won't be selling.`
    + (res.piece.serialised ? '' : ' No number on it.'),
    'info');
  return res;
}

/** Let one go again. A serialised piece has paper behind it and pays clean. */
export function releaseFirearm(state, pieceId) {
  const res = letPieceGo(state, pieceId);
  if (!res.ok) return res;
  logEvent(state,
    `Let the ${res.piece.name} go for $${res.price.toLocaleString()}`
    + (res.clean ? ', through the book.' : ', cash in hand.'),
    'good');
  return res;
}


// --- Getting shot at, and getting seen to -----------------------------------

/**
 * Rounds coming the other way.
 *
 * Each one picks a body part by how much of you it is, then asks what you had
 * on at that spot. A plate covers your chest and nothing else — your arms are
 * the most commonly hit part of anybody who lives to be counted, and no vest
 * made covers them.
 */
export function takeFire(state, { rounds = 1, threat = null, heat = 0 } = {}) {
  const ch = characterOf(state);
  const body = ch.body;
  if (body.deadAt != null) return { wounds: [], died: false };
  // A hotter block is a better-armed block.
  const incoming = threat != null ? threat : clamp(0.3 + (heat / 100) * 0.45, 0.28, 0.8);
  const atHour = Math.floor((state.minutes || 0) / 60);
  const taken = [];
  for (let i = 0; i < rounds; i++) {
    const part = rollPartFor(state);
    const w = takeHit(body, {
      part,
      threat: incoming,
      protection: protectionOf(state, part),
      atHour,
    });
    if (w) taken.push(w);
  }
  return { wounds: taken, died: body.deadAt != null };
}

function rollPartFor() {
  let r = Math.random();
  for (const id of Object.keys(BODY_PARTS)) {
    r -= BODY_PARTS[id].hitShare;
    if (r <= 0) return id;
  }
  return 'thorax';
}

/** Put what just happened to you into the log, in plain words. */
export function reportFire(state, hurt) {
  if (!hurt || !hurt.wounds.length) return;
  const stopped = hurt.wounds.filter((w) => w.type === 'babt');
  const through = hurt.wounds.filter((w) => w.type !== 'babt');
  if (stopped.length && !through.length) {
    logEvent(state,
      `You got hit. The armour held — ${stopped.length === 1 ? 'a bruise' : 'bruises'} and nothing more.`,
      'warn');
    return;
  }
  const worst = through.sort((a, b) => b.severity - a.severity)[0];
  logEvent(state,
    `You got hit${stopped.length ? ' — the armour caught one' : ''}. `
    + `${BODY_PARTS[worst.part].name}, and it went in. Get seen to.`,
    'bad');
}

/**
 * Where you can be seen to, and what each of them costs you.
 *
 * The whole point of having three is that none of them is simply better. Doing
 * it yourself is cheap and often does not work. A street doctor asks nothing
 * and sometimes gets it wrong in a way that does not come back. A hospital
 * will actually fix you, and a hospital that sees a gunshot wound picks up the
 * phone — which is the one cost you cannot pay off with more money, only with
 * a great deal of it.
 */
export const TREATMENT = {
  self: {
    id: 'self', name: 'Do it yourself',
    blurb: 'Boiled water, a needle and whatever is in the cupboard. Sometimes that is enough.',
    costMult: 0.18, fail: 0.38, impairOnFail: 0.3, heat: 0, needsDoc: false, reports: false,
  },
  street: {
    id: 'street', name: 'Street doctor',
    blurb: 'Somebody who asks nothing and has done this before. How often it works depends entirely on who you hired.',
    costMult: 1, fail: null, impairOnFail: 0.45, heat: 0, needsDoc: true, reports: false,
  },
  hospital: {
    id: 'hospital', name: 'Hospital',
    blurb: 'It will work. They are also required to report a gunshot wound, and they do.',
    costMult: 3.4, fail: 0.04, impairOnFail: 0.1, heat: 20, needsDoc: false, reports: true,
  },
};

export const TREATMENT_IDS = Object.keys(TREATMENT);

/** Wounds a hospital is obliged to report. A graze is a graze; a hole is not. */
export function reportableWounds(body) {
  return openWounds(body).filter(
    (w) => !w.treated && ['penetrating', 'perforating', 'avulsive', 'fracture'].includes(w.type)
  );
}

/** What it costs to persuade somebody not to pick up the phone. */
export function hushCost(state) {
  const ch = characterOf(state);
  const n = reportableWounds(ch.body).length;
  if (!n) return 0;
  const worst = Math.max(0, ...(state.districts || []).map((d) => d.heat || 0));
  return Math.round(180000 * n * (1 + worst / 60));
}

/** How likely a given route is to go wrong for you, right now. */
export function treatmentRisk(state, routeId) {
  const route = TREATMENT[routeId];
  if (!route) return 1;
  if (route.fail != null) return route.fail;
  const doc = docOf(state);
  if (!doc) return 1;
  // A street doctor's failure rate IS the doctor. It is the whole reason to
  // care which one answered the phone.
  return clamp(0.42 - doc.skill * 0.34, 0.05, 0.45);
}

export function treatmentPrice(state, routeId) {
  const route = TREATMENT[routeId];
  const ch = characterOf(state);
  if (!route) return 0;
  return Math.round(treatmentCost(ch.body) * route.costMult);
}

/**
 * Get seen to.
 *
 * A failure does not simply waste the money: the wound stays open AND there is
 * a real chance of something permanent, because a repair done badly is worse
 * than one not attempted. That is what makes the cheap route a gamble rather
 * than a discount.
 */
export function getTreated(state, routeId = 'street', { hush = false } = {}) {
  const route = TREATMENT[routeId];
  if (!route) return { ok: false, error: 'No such option.' };
  const ch = characterOf(state);
  const open = openWounds(ch.body).filter((w) => !w.treated);
  if (!open.length) return { ok: false, error: 'Nothing that needs seeing to.' };
  if (route.needsDoc && !hasDoc(state)) {
    return { ok: false, error: 'You do not have anybody on a retainer.' };
  }

  const cost = treatmentPrice(state, routeId);
  const hushFee = route.reports && hush ? hushCost(state) : 0;
  if (!canAfford(state, cost + hushFee)) {
    return {
      ok: false,
      error: `That is $${(cost + hushFee).toLocaleString()}${hushFee ? ' with the quiet money' : ''}.`,
    };
  }
  spendClean(state, cost + hushFee);

  const risk = treatmentRisk(state, routeId);
  const failed = Math.random() < risk;
  let impairment = null;

  if (failed) {
    // The worst wound is the one they were working on when it went wrong.
    const worst = open.slice().sort((a, b) => b.severity - a.severity)[0];
    if (Math.random() < route.impairOnFail) {
      impairment = addImpairment(ch.body, impairmentFor(worst ? worst.part : 'thorax'));
    }
    logEvent(state,
      `${route.name}: it did not take. $${cost.toLocaleString()} gone`
      + (impairment ? `, and you are left with ${impairment.name.toLowerCase()}.` : '.'),
      'bad');
  } else {
    treat(ch.body, { atHour: Math.floor((state.minutes || 0) / 60) });
    logEvent(state, `${route.name}: seen to. $${cost.toLocaleString()}.`, 'good');
  }

  // The phone call happens whether or not the surgery worked.
  let reported = false;
  if (route.reports) {
    const n = reportableWounds(ch.body).length || open.filter(
      (w) => ['penetrating', 'perforating', 'avulsive', 'fracture'].includes(w.type)).length;
    if (n > 0 && !hush) {
      reported = true;
      const d = districtById(state, armouryDistrictId(state)) || (state.districts || [])[0];
      if (d) d.heat = Math.min(100, d.heat + route.heat);
      logEvent(state,
        'They asked how it happened, wrote down what you said, and rang it in. '
        + 'Somebody will come and ask you the same question again.',
        'bad');
    } else if (n > 0 && hush) {
      logEvent(state,
        `Nobody rang anybody. $${hushFee.toLocaleString()}, and it is not a discount you get twice.`,
        'warn');
    }
  }

  return { ok: true, failed, impairment, cost, hush: hushFee, reported, route };
}

/** Put a kept piece on, or take it off with a null id. */
export function equipGear(state, slotId, pieceId) {
  return equip(state, slotId, pieceId || null);
}

/** Change one thing about how you look. */
export function setLook(state, key, value) {
  return setTrait(state, key, value);
}

/** Start again from one of the twenty. */
export function setLookModel(state, modelId) {
  return setLookPreset(state, modelId);
}

// --- The black market in parts ----------------------------------------------
//
// Opting in is building the clinic; there is no switch, and it is the last
// thing that unlocks. Everything here is priced off reported trafficking
// figures, and the number the model is really built around is the one those
// reports bury: the person it came out of is worth a thousand or two and the
// middlemen take the rest. You are the middlemen.

/** Have you built somewhere for this? That IS the opt-in. */
export function hasClinic(state) {
  return (state.buildings || []).some(
    (b) => b.active && (BUILDINGS[b.type] || {}).kind === 'clinic'
  );
}

/** Bodies left on blocks you took, that have not already been dealt with. */
export function casualtiesOf(state) {
  return state.casualties || [];
}

/**
 * Take what is usable.
 *
 * The block finds out. Reputation there does not dip, it collapses, and the
 * heat is worse than anything else in the game — which is the point: this is
 * a great deal of money for a cost you cannot pay off.
 */
export function harvestCasualty(state, casualtyId) {
  if (!hasClinic(state)) {
    return { ok: false, error: 'You have nowhere to do that.' };
  }
  const list = casualtiesOf(state);
  const idx = list.findIndex((c) => c.id === casualtyId);
  if (idx < 0) return { ok: false, error: 'Nothing there.' };
  const cas = list[idx];
  const atHour = Math.floor((state.minutes || 0) / 60);

  // How well it comes out depends on the room: a bigger place is a better
  // table, better cold storage and somebody who has done it before. Derived
  // from the floorplate here rather than importing the simulation's own
  // `sizeScale`, which would pull actions and sim into a cycle.
  const clinic = (state.buildings || []).find((b) => b.type === 'back_clinic' && b.active);
  const def = clinic ? BUILDINGS[clinic.type] : null;
  const room = clinic && def
    ? clamp((clinic.areaM2 || def.referenceAreaM2) / def.referenceAreaM2, 0.4, 2.2)
    : 1;
  const skill = clamp01(0.36 + room * 0.22);
  const taken = harvest(null, { atHour, skill });
  state.organs = stockOf(state).concat(taken);
  state.casualties = list.slice(0, idx).concat(list.slice(idx + 1));

  const d = districtById(state, cas.districtId);
  if (d) {
    d.rep = clamp01(d.rep - ORGAN_TRADE.repHit);
    d.heat = Math.min(100, d.heat + ORGAN_TRADE.heatPerBody);
  }
  logEvent(state,
    `${taken.length} usable off the table. ${d ? d.name : 'The block'} will hear about it.`,
    'bad');
  return { ok: true, taken };
}

/**
 * Move what is on ice.
 *
 * Anything past its cold time is worth nothing and goes out with the rest.
 * The broker takes his cut off the top, and what is left is street money —
 * there is no version of this that pays clean.
 */
export function sellOrgans(state) {
  const atHour = Math.floor((state.minutes || 0) / 60);
  const stock = stockOf(state);
  if (!stock.length) return { ok: false, error: 'Nothing on ice.' };

  let gross = 0, sold = 0, spoiled = 0;
  for (const p of stock) {
    const v = organValue(p, atHour, p.quality);
    if (v <= 0) { spoiled++; continue; }
    gross += v;
    sold++;
  }
  state.organs = [];
  if (!sold) {
    logEvent(state, `${spoiled} went off before anybody would take them.`, 'bad');
    return { ok: true, sold: 0, spoiled, net: 0 };
  }
  const net = Math.round(gross * (1 - ORGAN_TRADE.brokerCut));
  state.cash.dirty += net;
  logEvent(state,
    `${sold} moved through a broker for $${net.toLocaleString()}`
    + (spoiled ? `, ${spoiled} spoiled.` : '.'),
    'info');
  return { ok: true, sold, spoiled, net, gross };
}

// --- People you are holding -------------------------------------------------

export { captivesOf, holdingCapacity, takeableFrom, symptomsOf } from './captives.js';

/**
 * Send somebody to go and get somebody.
 *
 * Costs money whether it works or not, and costs the block either way — a
 * failed attempt is still an attempt people noticed.
 */
export function snatchSomebody(state, districtId) {
  if (!hasClinic(state)) return { ok: false, error: 'You have nowhere to keep anybody.' };
  if (!canAfford(state, CAPTIVES.snatchCost)) {
    return { ok: false, error: `A crew wants $${CAPTIVES.snatchCost.toLocaleString()} for that.` };
  }
  const res = doSnatch(state, districtId);
  if (!res.ok) return res;
  spendClean(state, CAPTIVES.snatchCost);
  const d = districtById(state, districtId);
  if (!res.got) {
    logEvent(state, `It went wrong in ${d ? d.name : 'the block'}. Nobody came back with anybody, and people saw.`, 'bad');
    return { ok: true, got: null };
  }
  logEvent(state, `${res.got.name}. Nobody is looking for them yet.`, 'warn');
  return res;
}

/**
 * Take one specific thing off somebody you are holding.
 *
 * `confirmed` is how the caller says the player has been told what it will do
 * and said go anyway. Without it, anything they have no spare of comes back as
 * a question rather than a refusal or a corpse.
 */
export function takePart(state, captiveId, partId, confirmed = false) {
  if (!hasClinic(state)) return { ok: false, error: 'You have nowhere to do that.' };
  const atHour = Math.floor((state.minutes || 0) / 60);
  const res = takeFrom(state, captiveId, partId, { atHour, confirmed });
  if (!res.ok) return res;
  const c = captivesOf(state).find((x) => x.id === captiveId);
  if (res.died) {
    logEvent(state, `Took the ${res.part.name.toLowerCase()}. That was the one there was no spare of.`, 'bad');
  } else {
    logEvent(state,
      `Took a ${res.part.name.toLowerCase()}. ${res.part.symptom || 'They are still breathing.'}`,
      'warn');
  }
  return res;
}

/** Strip somebody who is already dead, which is everything left at once. */
export function stripBody(state, captiveId) {
  if (!hasClinic(state)) return { ok: false, error: 'You have nowhere to do that.' };
  const list = captivesOf(state);
  const c = list.find((x) => x.id === captiveId);
  if (!c) return { ok: false, error: 'Nobody by that name.' };
  if (!c.dead) return { ok: false, error: 'They are still alive. Take what you want one at a time.' };

  const atHour = Math.floor((state.minutes || 0) / 60);
  const clinic = (state.buildings || []).find(
    (b) => b.active && (BUILDINGS[b.type] || {}).kind === 'clinic'
  );
  const def = clinic ? BUILDINGS[clinic.type] : null;
  const room = clinic && def
    ? clamp((clinic.areaM2 || def.referenceAreaM2) / def.referenceAreaM2, 0.4, 2.2)
    : 1;
  // Whatever has already been taken is already gone.
  const taken = harvest(null, { atHour, skill: clamp01(0.36 + room * 0.22) })
    .filter((piece) => (c.body.missing || {})[piece.organ] == null
      || (c.body.missing[piece.organ] || 0) < 99);
  state.organs = stockOf(state).concat(taken);
  state.captives = list.filter((x) => x.id !== captiveId);

  const d = districtById(state, c.districtId);
  if (d) {
    d.rep = clamp01(d.rep - ORGAN_TRADE.repHit);
    d.heat = Math.min(100, d.heat + ORGAN_TRADE.heatPerBody);
  }
  logEvent(state, `${taken.length} more off the table. Nothing left of them worth keeping.`, 'bad');
  return { ok: true, taken };
}

/** Let somebody go. They know your face and they will use it. */
export function releaseCaptive(state, captiveId) {
  const res = doRelease(state, captiveId);
  if (!res.ok) return res;
  logEvent(state,
    res.captive.dead
      ? 'Put out with the rest of it.'
      : 'Let them go. They walked, and they will talk.',
    res.captive.dead ? 'info' : 'bad');
  return res;
}

/** Take the lot, whether or not they are still breathing when you start. */
export function gutCaptive(state, captiveId) {
  if (!hasClinic(state)) return { ok: false, error: 'You have nowhere to do that.' };
  const atHour = Math.floor((state.minutes || 0) / 60);
  const before = (state.captives || []).find((c) => c.id === captiveId);
  const wasAlive = !!before && !before.dead;
  const res = gutCompletely(state, captiveId, { atHour });
  if (!res.ok) return res;
  state.organs = stockOf(state).concat(res.taken);
  state.captives = (state.captives || []).filter((c) => c.id !== captiveId);

  const d = before ? districtById(state, before.districtId) : null;
  if (d) {
    d.rep = clamp01(d.rep - ORGAN_TRADE.repHit);
    d.heat = Math.min(100, d.heat + ORGAN_TRADE.heatPerBody);
  }
  logEvent(state,
    `${res.taken.length} off the table. ${wasAlive ? 'They were alive when it started.' : ''}`,
    'bad');
  return res;
}

// --- Work done on you -------------------------------------------------------
//
// You cannot sell yourself. What you can do is have something put back, or
// something better put in — and neither happens without somebody who knows
// how, standing in the room, on a retainer.

export { docOf, hasDoc, riskOf, STREET_DOC } from './streetdoc.js';
export { TIERS, FITMENTS, tiersFor, fitmentCost } from './bionics.js';

/** Take a street doctor on. The fee is to get them to answer at all. */
export function hireStreetDoc(state) {
  if (hasDoc(state)) return { ok: false, error: 'You already have somebody.' };
  if (!canAfford(state, STREET_DOC.signingFee)) {
    return { ok: false, error: `Nobody is answering for less than $${STREET_DOC.signingFee.toLocaleString()}.` };
  }
  const res = hireDoc(state);
  if (!res.ok) return res;
  spendClean(state, STREET_DOC.signingFee);
  logEvent(state,
    `${res.doc.name}. On a retainer at $${STREET_DOC.retainerPerDay.toLocaleString()} a day, `
    + 'whether you need them or not.',
    'info');
  return res;
}

export function letDocGo(state) {
  const res = releaseDoc(state);
  if (!res.ok) return res;
  logEvent(state, 'Stopped paying the retainer. Nobody to call now.', 'warn');
  return res;
}

/** Everything that could be fitted to you, and what it would cost. */
export function fitmentsFor(state) {
  const ch = characterOf(state);
  return FITMENT_IDS.map((id) => {
    const info = fitmentState(ch.body, id, missingCountOf);
    if (!info) return null;
    const tiers = tiersFor(id).map((tierId) => ({
      tier: TIERS[tierId],
      cost: fitmentCost(id, tierId),
      risk: riskOf(state, TIERS[tierId], FITMENTS[id]),
      // A salvaged part is one out of your own stock, so there has to be one.
      stocked: !TIERS[tierId].needsStock
        || (state.organs || []).some((p) => p.organ === id
          || (FITMENTS[id].kind === 'region' && false)),
    }));
    return { ...info, tiers };
  }).filter(Boolean);
}

/**
 * Have something fitted.
 *
 * It can go wrong, and how likely that is comes from the tier, the job and the
 * doctor. When it does, the money is gone and so is whatever was being put in
 * — which is the reason to care who you hired.
 */
export function fitPart(state, fitmentId, tierId) {
  if (!hasDoc(state)) {
    return { ok: false, error: 'Nobody to do it. You need somebody on a retainer first.' };
  }
  const f = FITMENTS[fitmentId];
  const tier = TIERS[tierId];
  if (!f || !tier) return { ok: false, error: 'No such job.' };
  if (!tiersFor(fitmentId).includes(tierId)) {
    return { ok: false, error: `You cannot fit a ${tier.name.toLowerCase()} ${f.name.toLowerCase()}.` };
  }

  const ch = characterOf(state);
  const cost = fitmentCost(fitmentId, tierId);
  if (!canAfford(state, cost)) {
    return { ok: false, error: `That is $${cost.toLocaleString()} of work.` };
  }

  // Salvaged means somebody else's, out of your own stock.
  let usedStock = null;
  if (tier.needsStock) {
    const idx = (state.organs || []).findIndex((p) => p.organ === fitmentId);
    if (idx < 0) {
      return { ok: false, error: `You have no ${f.name.toLowerCase()} on ice to put in.` };
    }
    usedStock = state.organs[idx];
  }

  spendClean(state, cost);
  const doc = docOf(state);
  doc.jobs = (doc.jobs || 0) + 1;
  const risk = riskOf(state, tier, f);

  if (Math.random() < risk) {
    doc.lost = (doc.lost || 0) + 1;
    if (usedStock) {
      state.organs = (state.organs || []).filter((p) => p !== usedStock);
    }
    // A failed job is not free of consequence — it costs blood and it costs
    // the thing that was going in.
    ch.body.blood = clamp01(ch.body.blood - 0.12);
    logEvent(state,
      `It did not take. $${cost.toLocaleString()} gone and you are worse off than you were.`,
      'bad');
    return { ok: true, failed: true, cost };
  }

  if (usedStock) state.organs = (state.organs || []).filter((p) => p !== usedStock);
  ch.body.installed = ch.body.installed || {};
  const got = rollEfficiency(tierId);
  ch.body.installed[fitmentId] = { tier: tierId, efficiency: got };
  // Putting something back does not un-take it; it stands in for it.
  logEvent(state,
    `${tier.name} ${f.name.toLowerCase()} fitted. `
    + (got > 1
      ? `About ${Math.round((got - 1) * 100)}% better than the one you were born with.`
      : `Works at about ${Math.round(got * 100)}% of the original.`),
    got > 1 ? 'good' : 'info');
  return { ok: true, failed: false, tier, cost, efficiency: got };
}

// --- Lives ------------------------------------------------------------------
//
// One free. After that you pay, and what you pay doubles each time, so the
// second is a bad week and the fourth is the end of the run whether or not you
// can afford it.

export function livesLeft(state) {
  const n = state.lives;
  return typeof n === 'number' ? n : HEALTH.freeLives;
}

export function nextLifeCost(state) {
  return Math.round(HEALTH.lifeCost * Math.pow(HEALTH.lifeCostGrowth, state.livesBought || 0));
}

/** Buy another. Nobody explains how it works and the price says not to ask. */
export function buyLife(state) {
  const cost = nextLifeCost(state);
  if (!canAfford(state, cost)) {
    return { ok: false, error: `That costs $${cost.toLocaleString()}, and it is not negotiable.` };
  }
  spendClean(state, cost);
  state.lives = livesLeft(state) + 1;
  state.livesBought = (state.livesBought || 0) + 1;
  logEvent(state, `Arrangements made. $${cost.toLocaleString()}. Nobody said for what.`, 'info');
  return { ok: true, cost, lives: state.lives };
}

/**
 * What happens when you stop.
 *
 * A life spent brings you back on a table with half your blood and something
 * permanently wrong that was not wrong before — you do not come back the way
 * you went in. With nothing left to spend, the run is over.
 */
export function resolveDeath(state) {
  const ch = characterOf(state);
  const how = ch.body ? causeOfDeath(ch.body) : 'died';
  if (livesLeft(state) <= 0) {
    state.gameOver = { at: state.minutes || 0, how };
    logEvent(state, `You ${how}. That was the last one.`, 'bad');
    return { revived: false, how };
  }
  state.lives = livesLeft(state) - 1;

  const worstRegion = (ch.body.wounds || [])
    .slice()
    .sort((a, b) => b.severity - a.severity)[0];
  const mark = impairmentFor(worstRegion ? worstRegion.part : 'thorax');

  const kept = { ...(ch.body.impairments || {}) };
  const installed = { ...(ch.body.installed || {}) };
  const missing = { ...(ch.body.missing || {}) };
  ch.body = newBody();
  ch.body.impairments = kept;
  ch.body.installed = installed;
  ch.body.missing = missing;
  ch.body.blood = HEALTH.reviveBlood;
  const imp = addImpairment(ch.body, mark);

  logEvent(state,
    `You ${how}. Somebody brought you back and it cost you something: `
    + `${imp ? imp.name.toLowerCase() : 'permanent damage'}. `
    + `${livesLeft(state)} left.`,
    'bad');
  return { revived: true, how, impairment: imp, left: livesLeft(state) };
}
