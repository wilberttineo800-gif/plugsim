// More than one city.
//
// The map you start on is one place. Once an operation outgrows it — every
// block saturated, product backing up with nowhere to put it — the way forward
// is somewhere else, and the reason it pays is that somewhere else wants
// different things at different prices. `regionMultiplier` already bakes that
// into a district's demand at generation, so a city founded under another
// country code is genuinely a different market rather than a reskin.
//
// Moving weight between cities is not a delivery. A courier works a route you
// can watch; a smuggler takes a consignment, disappears for days, and either
// turns up or doesn't. That is why shipments are their own thing here rather
// than a very long route.

import { haversineKm } from './geo.js';
import { SMUGGLING } from './constants.js';
import { clamp, clamp01 } from './rng.js';

/** The home city, for a save that predates any of this. */
export function homeCity(state) {
  if (state.cities && state.cities.length) return state.cities[0];
  return {
    id: 'city-home',
    name: state.cityName,
    origin: state.origin,
    countryCode: state.countryCode,
    foundedDay: 0,
    home: true,
  };
}

export function citiesOf(state) {
  return state.cities && state.cities.length ? state.cities : [homeCity(state)];
}

export function cityById(state, id) {
  return citiesOf(state).find((c) => c.id === id) || null;
}

/** Which city a district belongs to. Untagged districts are the home city. */
export function cityOfDistrict(state, districtId) {
  const d = (state.districts || []).find((x) => x.id === districtId);
  if (!d) return null;
  return d.cityId ? cityById(state, d.cityId) : homeCity(state);
}

export function cityOfBuilding(state, building) {
  return building ? cityOfDistrict(state, building.districtId) : null;
}

/** Straight-line distance between two cities, in km. */
export function distanceKm(a, b) {
  if (!a || !b) return 0;
  return haversineKm(a.origin, b.origin);
}

/**
 * What it costs to open up somewhere new.
 *
 * Scales with how many places you already run, because the second city is a
 * stretch and the fifth is an organisation. Distance matters too: setting up
 * across a border is a different proposition to the next town over.
 */
export function foundingCost(state, distance) {
  const existing = citiesOf(state).length;
  const reach = 1 + Math.min(2.5, distance / SMUGGLING.distanceCostKm);
  return Math.round(SMUGGLING.foundBase * Math.pow(SMUGGLING.foundGrowth, existing - 1) * reach);
}

/**
 * How long a consignment is in the wind, in game hours.
 *
 * Smugglers do not drive straight there. They wait for the right crossing, the
 * right vehicle, the right night — so this is deliberately slower than the
 * distance alone would suggest, and it is what makes a shipment a commitment.
 */
export function transitHours(distance) {
  return SMUGGLING.baseHours + (distance / SMUGGLING.kmPerHour);
}

/**
 * The chance a consignment is lost, 0-1.
 *
 * Three things drive it: how far it has to go, how much is in one load, and
 * whether it crosses a border. Splitting a big load across several runs is
 * genuinely safer than sending it all at once, which is the decision the whole
 * mechanic exists to pose.
 */
export function seizureChance(distance, amount, crossesBorder, heat = 0) {
  const byDistance = Math.min(SMUGGLING.maxDistanceRisk, distance / SMUGGLING.riskPerKm);
  const byLoad = Math.min(SMUGGLING.maxLoadRisk, amount / SMUGGLING.riskPerUnit);
  const border = crossesBorder ? SMUGGLING.borderRisk : 0;
  const attention = clamp01(heat / 100) * SMUGGLING.heatRisk;
  return clamp(byDistance + byLoad + border + attention, 0.01, SMUGGLING.maxRisk);
}

/** What the smuggler takes to carry it, before anything is lost. */
export function smugglerFee(distance, amount, crossesBorder) {
  const perUnit = SMUGGLING.feePerUnitPerKm * distance * (crossesBorder ? SMUGGLING.borderFeeMult : 1);
  return Math.round(SMUGGLING.feeBase + amount * perUnit);
}

/**
 * Everything about a proposed run, so the UI can show the bet before it is
 * taken: what it costs, how long it is gone, and how likely it is to arrive.
 */
export function quoteShipment(state, fromCity, toCity, amount, heat = 0) {
  const distance = distanceKm(fromCity, toCity);
  const crossesBorder = (fromCity.countryCode || null) !== (toCity.countryCode || null);
  return {
    distance,
    crossesBorder,
    hours: transitHours(distance),
    fee: smugglerFee(distance, amount, crossesBorder),
    risk: seizureChance(distance, amount, crossesBorder, heat),
  };
}
