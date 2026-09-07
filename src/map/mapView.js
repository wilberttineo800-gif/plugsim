// Leaflet setup and the district overlay. The basemap is plain OSM, darkened
// in CSS, so the game's own data reads on top of it without any API key.

import { PRODUCTS } from '../game/constants.js';
import { streetPrice, saturation } from '../game/economy.js';
import { clamp01 } from '../game/rng.js';

// Standard OSM tiles: genuinely keyless and unmetered for light use. CARTO's
// dark basemap now stamps "API KEY REQUIRED" across every tile, so instead the
// tile pane is darkened in CSS (see .leaflet-tile-pane in styles.css) — the
// game keeps its night look without anyone needing an account.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const OVERLAYS = [
  { id: 'demand_weed', label: 'Weed demand' },
  { id: 'demand_shrooms', label: 'Shroom demand' },
  { id: 'price_weed', label: 'Weed price' },
  { id: 'price_shrooms', label: 'Shroom price' },
  { id: 'wealth', label: 'Money' },
  { id: 'rep', label: 'Your rep' },
  { id: 'control', label: 'Rival turf' },
];

export function createMap(elementId, center, zoom = 14) {
  const map = L.map(elementId, {
    center: [center.lat, center.lng],
    zoom,
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    // Touch targets: a fingertip lands several pixels off what it aimed at,
    // and building footprints are small.
    renderer: L.canvas({ tolerance: 8 }),
    tap: true,
  });

  L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIB,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  return map;
}

/** Frame the play area so the whole territory is on screen at the start. */
export function fitToDistricts(map, districts) {
  if (!districts.length) return;
  const pts = [];
  for (const d of districts) for (const c of d.corners) pts.push([c.lat, c.lng]);
  map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
}

// --- Colour ramps -----------------------------------------------------------

function ramp(stops, t) {
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)}, ${Math.round(a[1] + (b[1] - a[1]) * f)}, ${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

const RAMP_COOL = [[70, 92, 112], [58, 118, 132], [82, 172, 142], [162, 220, 138]];
const RAMP_HEAT = [[78, 88, 104], [138, 72, 76], [196, 70, 64], [248, 134, 72]];
const RAMP_MONEY = [[76, 84, 100], [104, 108, 116], [158, 146, 106], [230, 196, 106]];
const RAMP_REP = [[74, 84, 104], [82, 100, 158], [124, 128, 206], [186, 160, 234]];

/** Normalised 0..1 value + colour for a district under the given overlay. */
export function overlayValue(district, overlayId) {
  switch (overlayId) {
    case 'demand_weed':
      return { t: clamp01(district.demandPerHour.weed / PRODUCTS.weed.demandBase[1]), ramp: RAMP_COOL };
    case 'demand_shrooms':
      return { t: clamp01(district.demandPerHour.shrooms / PRODUCTS.shrooms.demandBase[1]), ramp: RAMP_COOL };
    case 'price_weed':
      return { t: clamp01(streetPrice(district, 'weed') / (PRODUCTS.weed.basePrice * 1.9)), ramp: RAMP_MONEY };
    case 'price_shrooms':
      return { t: clamp01(streetPrice(district, 'shrooms') / (PRODUCTS.shrooms.basePrice * 1.9)), ramp: RAMP_MONEY };
    case 'wealth':
      return { t: district.wealth, ramp: RAMP_MONEY };
    case 'rep':
      return { t: district.rep, ramp: RAMP_REP };
    case 'control':
      return { t: clamp01(district.rivalControl || 0), ramp: RAMP_HEAT };
    default:
      return { t: 0.3, ramp: RAMP_COOL };
  }
}

export function overlayColor(district, overlayId) {
  const { t, ramp: r } = overlayValue(district, overlayId);
  return ramp(r, t);
}

// --- District layer ---------------------------------------------------------

export class DistrictLayer {
  /**
   * Districts are the market and turf layer, but they aren't drawn as shapes
   * any more — a hex grid over real streets read as clutter once the actual
   * buildings became the thing you interact with. What survives is the block
   * name, and the overlay value, which now tints the buildings themselves
   * (see LotLayer). Clicking a name still opens the block.
   */
  constructor(map, districts, { onSelect } = {}) {
    this.map = map;
    this.districts = districts;
    this.overlay = 'demand_weed';
    this.selectedId = null;
    this.onSelect = onSelect;
    this.group = L.layerGroup().addTo(map);
    this.labels = new Map();
    // The grid isn't drawn any more, so the selected block gets a temporary
    // outline — otherwise a name on a map tells you nothing about its extent.
    this.highlight = null;

    for (const d of districts) {
      const label = L.marker([d.center.lat, d.center.lng], {
        interactive: true,
        keyboard: false,
        icon: this.iconFor(d),
      });
      label.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        this.onSelect?.(d, e.latlng);
      });
      label.addTo(this.group);
      this.labels.set(d.id, label);
    }

    this.syncLabelZoom();
    map.on('zoomend', () => this.syncLabelZoom());
  }

  iconFor(d) {
    const selected = this.selectedId === d.id;
    return L.divIcon({
      className: 'district-label' + (selected ? ' is-selected' : ''),
      html: `<span>${escapeHtml(shortenName(d.name))}</span>`,
      iconSize: [130, 16],
      iconAnchor: [65, 8],
    });
  }

  setOverlay(id) {
    this.overlay = id;
  }

  setSelected(id) {
    this.selectedId = id;
    this.refresh();
    this.drawHighlight(id);
  }

  /** Outline the selected block so you can see the ground it covers. */
  drawHighlight(id) {
    if (this.highlight) {
      this.map.removeLayer(this.highlight);
      this.highlight = null;
    }
    if (!id) return;
    const d = this.districts.find((x) => x.id === id);
    if (!d) return;
    this.highlight = L.polygon(d.corners.map((c) => [c.lat, c.lng]), {
      color: '#ff8a3d',
      weight: 2,
      opacity: 0.9,
      dashArray: '7,6',
      fill: true,
      fillColor: '#ff8a3d',
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(this.map);
  }

  /** Frame a block without losing the buildings inside it. */
  frame(id) {
    const d = this.districts.find((x) => x.id === id);
    if (!d) return;
    this.map.fitBounds(
      L.latLngBounds(d.corners.map((c) => [c.lat, c.lng])),
      { padding: [60, 60], maxZoom: 16 }
    );
  }

  refresh() {
    for (const d of this.districts) {
      const marker = this.labels.get(d.id);
      if (marker) marker.setIcon(this.iconFor(d));
    }
  }

  /** Block names would pile on top of each other below this zoom. */
  syncLabelZoom() {
    this.setLabelsVisible(this.map.getZoom() >= 13);
  }

  setLabelsVisible(visible) {
    for (const [, marker] of this.labels) {
      const el = marker.getElement();
      if (el) el.style.display = visible ? '' : 'none';
    }
  }
}

/** Real place names run long ("Waterville Historic District"); trim to fit. */
export function shortenName(name) {
  const trimmed = String(name)
    .replace(/\s+(Historic\s+)?District$/i, '')
    .replace(/\s+Neighou?rhood$/i, '');
  return trimmed.length > 17 ? trimmed.slice(0, 16).trimEnd() + '…' : trimmed;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export { saturation };
