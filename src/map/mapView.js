// Leaflet setup and the district overlay. The basemap is plain OSM, darkened
// in CSS, so the game's own data reads on top of it without any API key.

import { PRODUCTS } from '../game/constants.js';
import { streetPrice, saturation } from '../game/economy.js';
import { clamp01 } from '../game/rng.js';

// The basemap is 80% of the screen, so it is worth being exact about.
//
// Standard OSM under a CSS invert was the old answer, and it fought the game
// at every pixel: inverting a raster designed for daylight turns motorways
// pink, and every POI icon, house number and street label stays in the
// picture arguing with the game's own labels and overlays.
//
// CARTO's dark basemap is the obvious replacement and it is NOT usable — it
// answers 200 with "API KEY REQUIRED" stamped across the image, so a status
// check passes and the map ships broken. That is recorded here because it is
// the kind of thing that gets tried twice.
//
// Esri's World Dark Gray Canvas is keyless, genuinely dark, and deliberately
// label-light: roads in two greys, water darker, no POI furniture. It needs
// no invert, which is why the day/night exposure in main.js no longer applies
// one. Tile providers change their terms, though — see CARTO above — so if it
// starts failing we fall back to the old OSM path and put the invert back.
const TILE_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTRIB =
  'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const FALLBACK_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const FALLBACK_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Zoomed right in, the dark canvas has nothing left to say: it stops drawing
// at z16 and everything past that is one tile stretched over thirty-two, which
// is exactly the mush you see at full zoom. Esri's World Imagery is keyless
// like the canvas and serves real photography down to z20 — at that range you
// are looking at the actual roof of the actual building you are about to buy.
//
// So the basemap becomes two layers and a crossfade rather than one
// compromise: the canvas owns the wide view, where dark and label-light is
// the whole point, and the photography owns the close view, where seeing the
// real place is the whole point.
const IMAGERY_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const IMAGERY_ATTRIB = 'Esri, Maxar, Earthstar Geographics';
/** Below this the photography is invisible; above IMAGERY_FULL it is all you see. */
const IMAGERY_FADE_IN = 16.4;
const IMAGERY_FULL = 18;

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
    // Stops at 20, which is where Esri's World Imagery stops serving real
    // pixels. It used to run to 21 on the reasoning that the game's own
    // geometry is vector and stays sharp — but the thing the player is zooming
    // in to SEE is the real building, and past 20 every one of those pixels is
    // one photograph pixel stretched over four. Removing the graininess by not
    // offering the zoom beats compensating for it afterwards.
    maxZoom: 20,
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
    // Touch targets: a fingertip lands several pixels off what it aimed at,
    // and building footprints are small.
    renderer: L.canvas({ tolerance: 8 }),
    tap: true,
    // Tiles appear at full opacity rather than fading in.
    //
    // Leaflet's fade drives tile opacity from requestAnimationFrame, which
    // browsers throttle to nothing when the window is occluded or
    // backgrounded. The tiles then sit in the DOM — loaded, decoded,
    // correctly positioned — at opacity 0, and the map is simply blank until
    // something forces a repaint. Content visibility should not depend on
    // animation frames running; the 200ms fade is not worth that.
    fadeAnimation: false,
  });

  const base = L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIB,
    maxZoom: 20,
    maxNativeZoom: 16, // Esri's Dark Gray Canvas stops here
    crossOrigin: true,
  }).addTo(map);

  // If the dark basemap ever stops answering — a provider changing its terms
  // is exactly how the previous one was lost — drop back to plain OSM and
  // tell the document, so the CSS/runtime filter puts the invert back and the
  // map stays dark instead of suddenly going daylight-white under a dark UI.
  let swapped = false;
  let failures = 0;
  base.on('tileerror', () => {
    if (swapped || ++failures < 4) return;
    swapped = true;
    map.removeLayer(base);
    document.body.classList.add('basemap-needs-invert');
    L.tileLayer(FALLBACK_TILE_URL, {
      attribution: FALLBACK_ATTRIB,
      maxZoom: 20,
      maxNativeZoom: 18,
      detectRetina: true,
      crossOrigin: true,
    }).addTo(map);
  });

  attachImagery(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  return map;
}

/**
 * Fade real aerial photography in as the player zooms to street level.
 *
 * Its own pane, above the canvas basemap and below every vector the game
 * draws, so districts, lots and vehicles keep sitting on top of it.
 *
 * The opacity ramp is driven from `zoomend` and `zoom` rather than CSS,
 * because this codebase has been bitten twice by leaning on the compositor
 * for tile visibility: Leaflet's own fade drives opacity from
 * requestAnimationFrame and leaves tiles at opacity 0 when the window is
 * occluded (hence `fadeAnimation: false` above), and an identity CSS filter
 * on the tile pane promoted it to a layer Safari never painted into. So the
 * ramp is a plain number set on a Leaflet layer, and the pane filter below is
 * only ever applied when it is genuinely not the identity.
 */
function attachImagery(map) {
  const pane = map.createPane('imagery');
  pane.style.zIndex = 250; // tilePane is 200, overlayPane 400
  pane.style.pointerEvents = 'none';
  // Photography is daylight-bright and the rest of the game is not. Knock it
  // back far enough to sit under a dark UI, not so far that the thing the
  // player zoomed in to see is lost again.
  const dim = 'brightness(0.74) saturate(0.82) contrast(1.04)';
  if (dim && dim !== 'none') pane.style.filter = dim;

  const imagery = L.tileLayer(IMAGERY_TILE_URL, {
    attribution: IMAGERY_ATTRIB,
    pane: 'imagery',
    maxZoom: 20,
    maxNativeZoom: 20, // Esri's World Imagery stops here
    opacity: 0,
    crossOrigin: true,
  }).addTo(map);

  const ramp = () => {
    const z = map.getZoom();
    const t = (z - IMAGERY_FADE_IN) / (IMAGERY_FULL - IMAGERY_FADE_IN);
    imagery.setOpacity(clamp01(t));
  };
  map.on('zoomend', ramp);
  map.on('zoom', ramp);
  ramp();
  return imagery;
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

const RAMP_COOL = [[148, 162, 172], [86, 158, 168], [40, 142, 108], [22, 110, 58]];
const RAMP_HEAT = [[152, 158, 166], [216, 150, 82], [212, 86, 56], [158, 32, 28]];
const RAMP_MONEY = [[154, 158, 162], [186, 160, 92], [198, 138, 36], [150, 96, 12]];
const RAMP_REP = [[152, 158, 172], [126, 130, 200], [98, 82, 186], [70, 46, 140]];

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
    // setIcon builds a fresh element, which loses whatever display style the
    // zoom rule had applied to the old one.
    this.setLabelsVisible(this.labelsVisible !== false);
  }

  /** Block names would pile on top of each other below this zoom. */
  syncLabelZoom() {
    this.setLabelsVisible(this.map.getZoom() >= 13);
  }

  setLabelsVisible(visible) {
    this.labelsVisible = visible;
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
