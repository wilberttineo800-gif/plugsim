// Everything the player owns, drawn on the map: property markers, standing
// routes, and couriers moving along them in real time.

import { BUILDINGS, COURIERS, PRODUCTS } from '../game/constants.js';
import { gunWithAttachments } from '../ui/art.js';
import { buildingById, districtById } from '../game/state.js';
import { escapeHtml, overlayColor } from './mapView.js';

const ICONS = {
  leaf: '<path d="M12 20c0-6 3-10 8-11-1 6-4 9-8 11Z M12 20C7 18 4 13 4 6c6 1 8 6 8 14Z"/>',
  spore: '<path d="M12 4c4 0 7 2.6 7 5.4 0 1-1 1.6-2.2 1.6H7.2C6 11 5 10.4 5 9.4 5 6.6 8 4 12 4Z"/><path d="M10.4 12h3.2l-.6 7.2a1 1 0 0 1-2 0Z"/>',
  flask: '<path d="M9 3h6v2h-1v4.2l4.4 8A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-1.8-2.8L10 9.2V5H9Z"/>',
  box: '<path d="M12 2 3 6.2V17L12 22l9-5V6.2Zm0 2.3 6.2 2.9L12 10.2 5.8 7.2Z"/>',
  store: '<path d="M4 4h16l1.4 4.6A3 3 0 0 1 18.5 12a3 3 0 0 1-2.5-1.3A3 3 0 0 1 13.5 12 3 3 0 0 1 12 11a3 3 0 0 1-1.5 1A3 3 0 0 1 8 10.7 3 3 0 0 1 5.5 12a3 3 0 0 1-2.9-3.4Z"/><path d="M5 13h14v7H5Z" opacity="0.55"/>',
  washer: '<path d="M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" opacity="0.5"/><circle cx="12" cy="14" r="5"/><circle cx="8" cy="6" r="1.2"/><circle cx="11.5" cy="6" r="1.2"/>',
  wrench: '<path d="M20.3 5.3a5.5 5.5 0 0 1-7.1 7.1L6 19.6 4.4 18l7.2-7.2a5.5 5.5 0 0 1 7.1-7.1l-3 3 2 2 3-3.4Z"/>',
  cup: '<path d="M4 6h12v7a5 5 0 0 1-10 0Z"/><path d="M16 8h2.4a2.6 2.6 0 0 1 0 5.2H16Z" opacity="0.55"/><path d="M4 20h13v2H4Z" opacity="0.55"/>',
  scissors: '<circle cx="6" cy="18" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8 16.4 18.6 3.4l1.6 1.3L9.6 17.8Z"/><path d="M16 16.4 5.4 3.4 3.8 4.7l10.6 13.1Z"/>',
  droplet: '<path d="M12 2.5c4 5 7 8.3 7 11.6a7 7 0 0 1-14 0c0-3.3 3-6.6 7-11.6Z"/>',
  dumbbell: '<path d="M3 9h2.5v6H3Zm3.5-1.5H9v9H6.5Zm8 0H17v9h-2.5ZM18.5 9H21v6h-2.5Z"/><path d="M9 10.6h6v2.8H9Z" opacity="0.6"/>',
  disc: '<circle cx="12" cy="12" r="9" opacity="0.5"/><circle cx="12" cy="12" r="3"/>',
  press: '<path d="M4 3h16v4H4Z"/><path d="M10 7h4v6h-4Z" opacity="0.6"/><path d="M3 13h18v3H3Z"/><path d="M5 18h14v3H5Z" opacity="0.6"/>',
  pill: '<path d="M15.5 3a5.5 5.5 0 0 1 3.9 9.4l-7 7A5.5 5.5 0 0 1 4.6 11.6l7-7A5.5 5.5 0 0 1 15.5 3Z" opacity="0.55"/><path d="m8.1 8.1 7.8 7.8-2.5 2.5-7.8-7.8Z"/>',
  gun: '<path d="M3 7h12l1.5 3H20a1 1 0 0 1 1 1v1h-6l-1 3h-3l1-3H8v4H5v-4a2 2 0 0 1-2-2Z"/>',
  phone: '<path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" opacity="0.55"/><path d="M9.5 4.6h5v1.2h-5Z"/><circle cx="12" cy="19" r="1.2"/>',
  note: '<path d="M2 6h20v12H2Z" opacity="0.5"/><circle cx="12" cy="12" r="3.2"/><path d="M4.5 8.5h2v7h-2Zm13 0h2v7h-2Z"/>',
};

// The catalogue outgrew per-model glyphs; a marker reads by class instead.
const CLASS_GLYPH = { foot: '✦', twowheel: '◈', car: '▰', van: '▮', truck: '▭', air: '▲' };
function glyphFor(type) {
  const def = COURIERS[type];
  return (def && CLASS_GLYPH[def.class]) || '▰';
}

function svgIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;
}

/** Manages building markers, keeping the DOM in sync with state.buildings. */
export class BuildingLayer {
  constructor(map, { onSelect } = {}) {
    this.map = map;
    this.onSelect = onSelect;
    this.group = L.layerGroup().addTo(map);
    this.markers = new Map();
    this.selectedId = null;
  }

  sync(state) {
    // Attachments are drawn on the marker, so the layer needs to see them.
    this.fittedFor = (b) => (state.items || [])
      .filter((it) => it.kind === 'attachment' && it.equippedTo === b.id)
      .map((it) => it.variant);

    const seen = new Set();
    for (const b of state.buildings) {
      seen.add(b.id);
      let marker = this.markers.get(b.id);
      if (!marker) {
        marker = L.marker([b.latlng.lat, b.latlng.lng], {
          icon: this.iconFor(b),
          riseOnHover: true,
          zIndexOffset: 400,
        });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          this.onSelect?.(b);
        });
        marker.addTo(this.group);
        this.markers.set(b.id, marker);
      } else {
        marker.setIcon(this.iconFor(b));
      }
    }
    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        this.group.removeLayer(marker);
        this.markers.delete(id);
      }
    }
  }

  setSelected(id) {
    this.selectedId = id;
  }

  iconFor(b) {
    const def = BUILDINGS[b.type];
    const classes = [
      'bmark',
      `bmark--${b.type}`,
      this.selectedId === b.id ? 'is-selected' : '',
      !b.active ? 'is-off' : '',
      b.stalledReason ? 'is-stalled' : '',
    ].filter(Boolean).join(' ');

    // The name sits above the chip and is part of the same marker, so reading
    // it and tapping it are the same gesture — clicking the label opens the
    // business exactly as clicking the building does.
    const label = escapeHtml(b.name.split(' · ')[0]);
    const art = def.product === 'iron'
      ? gunWithAttachments(b.line || 'handgun', this.fittedFor?.(b) || [], { size: 40 })
      : svgIcon(def.icon);

    return L.divIcon({
      className: '',
      html:
        `<div class="${classes}">` +
        `<div class="bmark__label">${label}</div>` +
        `<div class="bmark__chip">${art}</div>` +
        (b.level > 1 ? `<div class="bmark__lvl">${b.level}</div>` : '') +
        `</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }
}

/**
 * Real building footprints, straight from OSM. These are the properties the
 * player buys, so they're drawn as their actual traced outlines.
 */
export class LotLayer {
  /** Tooltips follow a cursor; on touch they just stick open after a tap. */
  static isTouch() {
    return window.matchMedia('(hover: none)').matches;
  }

  constructor(map, { onSelect } = {}) {
    this.map = map;
    this.onSelect = onSelect;
    this.group = L.layerGroup().addTo(map);
    this.shapes = new Map();
    this.selectedId = null;
    this.minZoom = 16;
    this.overlay = 'demand_weed';
    this.districts = new Map();
    this.lots = [];
    map.on('moveend zoomend', () => this.render());
  }

  setDistricts(districts) {
    this.districts = new Map(districts.map((d) => [d.id, d]));
  }

  setOverlay(id) {
    this.overlay = id;
    this.restyle();
  }

  /** The full catalogue; only the part on screen is ever drawn. */
  setAll(lots) {
    this.lots = lots;
    this.render();
  }

  /**
   * Draw the buildings currently in view. A city holds tens of thousands of
   * them, so the layer is rebuilt from the viewport rather than holding every
   * polygon alive at once.
   */
  render() {
    if (this.map.getZoom() < this.minZoom) {
      if (this.shapes.size) { this.group.clearLayers(); this.shapes.clear(); }
      return;
    }
    const bounds = this.map.getBounds().pad(0.25);
    const wanted = new Set();

    for (const lot of this.lots) {
      if (!bounds.contains([lot.center.lat, lot.center.lng])) continue;
      wanted.add(lot.id);
      if (this.shapes.has(lot.id)) continue;

      const poly = L.polygon(
        lot.polygon.map((p) => [p.lat, p.lng]),
        this.styleFor(lot)
      );
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        poly.closeTooltip();
        this.onSelect?.(lot, e.latlng);
      });
      if (!LotLayer.isTouch()) {
        poly.bindTooltip(lot.kind === 'parking'
          ? `${lot.name} · ${lot.spaces} spaces`
          : `${lot.name} · ${Math.round(lot.areaM2)} m²`,
          { direction: 'top', opacity: 0.9, className: 'lot-tip' });
      }
      poly.addTo(this.group);
      this.shapes.set(lot.id, poly);
    }

    for (const [id, poly] of this.shapes) {
      if (!wanted.has(id)) {
        this.group.removeLayer(poly);
        this.shapes.delete(id);
      }
    }
  }

  styleFor(lot) {
    const selected = this.selectedId === lot.id;
    // Car parks read as tarmac, not premises — you can see the fleet's options
    // at a glance without hunting through the building stock.
    if (lot.kind === 'parking' && !lot.buildingId) {
      const owned = lot.owned;
      return { color: owned ? '#2f8fa8' : '#4b6f7d', weight: selected ? 3 : 1.4,
               opacity: 1, dashArray: owned ? null : '4 3',
               fillColor: '#5fd0e8', fillOpacity: owned ? 0.42 : 0.22 };
    }
    if (lot.buildingId) {
      return { color: '#c2560c', weight: selected ? 3 : 2, opacity: 1,
               fillColor: '#ff8a3d', fillOpacity: 0.6 };
    }
    if (lot.rented) {
      return { color: '#5b56b8', weight: selected ? 3 : 1.8, opacity: 1,
               fillColor: '#8f8ce0', fillOpacity: 0.55 };
    }
    if (lot.owned) {
      return { color: '#a8801c', weight: selected ? 3 : 1.8, opacity: 1,
               fillColor: '#f0cf72', fillOpacity: 0.55 };
    }
    // Anything not yours is tinted by whatever the map is currently showing,
    // so demand, price and rival turf still read geographically.
    const district = this.districts.get(lot.districtId);
    const fill = district ? overlayColor(district, this.overlay) : '#9fb8d0';
    return { color: selected ? '#c2560c' : fill, weight: selected ? 3 : 1.1,
             opacity: selected ? 1 : 0.85, fillColor: fill,
             fillOpacity: selected ? 0.55 : 0.34 };
  }

  /** Repaint what's drawn without rebuilding it. */
  restyle() {
    for (const [id, poly] of this.shapes) {
      const lot = this.lots.find((l) => l.id === id);
      if (lot) poly.setStyle(this.styleFor(lot));
    }
  }

  refresh() {
    this.restyle();
  }

  setSelected(id) {
    this.selectedId = id;
    this.restyle();
  }
}

/** Standing supply lines. */
export class RouteLayer {
  constructor(map) {
    this.map = map;
    this.group = L.layerGroup().addTo(map);
    this.lines = new Map();
    this.highlightId = null;
  }

  sync(state) {
    const seen = new Set();
    for (const r of state.routes) {
      if (!r.points) continue;
      seen.add(r.id);
      const latlngs = r.points.map((p) => [p.lat, p.lng]);
      let line = this.lines.get(r.id);
      const style = this.styleFor(r);
      if (!line) {
        line = L.polyline(latlngs, style).addTo(this.group);
        this.lines.set(r.id, line);
      } else {
        line.setLatLngs(latlngs);
        line.setStyle(style);
      }
    }
    for (const [id, line] of this.lines) {
      if (!seen.has(id)) {
        this.group.removeLayer(line);
        this.lines.delete(id);
      }
    }
  }

  styleFor(r) {
    const highlighted = this.highlightId === r.id;
    const color = r.cargo === 'raw' ? '#7a8ea0' : PRODUCTS[r.product]?.color || '#ff8a3d';
    return {
      color,
      weight: highlighted ? 4 : 2,
      opacity: highlighted ? 0.95 : 0.5,
      dashArray: r.realRoad ? null : '5,7',
      interactive: false,
    };
  }

  highlight(routeId) {
    this.highlightId = routeId;
    for (const [id, line] of this.lines) {
      const on = id === routeId;
      line.setStyle({ weight: on ? 4 : 2, opacity: on ? 0.95 : 0.5 });
    }
  }
}

/** Couriers, redrawn every frame while they're on the road. */
export class CourierLayer {
  constructor(map, { onSelect } = {}) {
    this.map = map;
    this.onSelect = onSelect;
    this.group = L.layerGroup().addTo(map);
    this.markers = new Map();
  }

  sync(state) {
    const seen = new Set();
    for (const c of state.couriers) {
      if (!c.position) continue;
      seen.add(c.id);
      let marker = this.markers.get(c.id);
      const laden = Object.values(c.cargo).some((v) => v > 0.01);
      const html =
        `<div class="cmark ${laden ? 'is-laden' : ''} ${c.phase === 'idle' ? 'is-idle' : ''}">` +
        `<span>${glyphFor(c.type)}</span></div>`;
      const icon = L.divIcon({ className: '', html, iconSize: [20, 20], iconAnchor: [10, 10] });

      if (!marker) {
        marker = L.marker([c.position.lat, c.position.lng], { icon, zIndexOffset: 600 });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          this.onSelect?.(c);
        });
        marker.addTo(this.group);
        this.markers.set(c.id, marker);
      } else {
        marker.setLatLng([c.position.lat, c.position.lng]);
        marker.setIcon(icon);
      }
    }
    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        this.group.removeLayer(marker);
        this.markers.delete(id);
      }
    }
  }
}

/** A short-lived ring where something went wrong. */
export function pingIncident(map, latlng, kind = 'stop') {
  const marker = L.marker([latlng.lat, latlng.lng], {
    interactive: false,
    icon: L.divIcon({
      className: '',
      html: `<div class="ping ping--${kind}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
  }).addTo(map);
  setTimeout(() => map.removeLayer(marker), 2200);
}

/** Ghost marker that follows the cursor while placing a property. */
export class PlacementGhost {
  constructor(map) {
    this.map = map;
    this.marker = null;
  }

  show(typeId) {
    this.hide();
    const def = BUILDINGS[typeId];
    this.typeId = typeId;
    this.marker = L.marker(this.map.getCenter(), {
      interactive: false,
      zIndexOffset: 900,
      icon: L.divIcon({
        className: '',
        html: `<div class="bmark bmark--${typeId} is-ghost"><div class="bmark__chip">${svgIcon(def.icon)}</div></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    }).addTo(this.map);
  }

  move(latlng) {
    if (this.marker) this.marker.setLatLng(latlng);
  }

  hide() {
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
  }
}

export { svgIcon, escapeHtml, buildingById, districtById };


/**
 * Where you are on the map. Defaults to your headquarters; if you turn on
 * following, it tracks your real position so walking around town moves you in
 * the game.
 */
export class PlayerMarker {
  constructor(map) {
    this.map = map;
    this.marker = null;
    this.live = false;
  }

  set(latlng, { live = false } = {}) {
    if (!latlng) return this.clear();
    const html = `<div class="pmark ${live ? 'pmark--live' : ''}"></div>`;
    const icon = L.divIcon({ className: '', html, iconSize: [16, 16], iconAnchor: [8, 8] });
    if (!this.marker) {
      this.marker = L.marker([latlng.lat, latlng.lng], {
        icon, zIndexOffset: 1200, interactive: false,
      }).addTo(this.map);
    } else {
      this.marker.setLatLng([latlng.lat, latlng.lng]);
      if (live !== this.live) this.marker.setIcon(icon);
    }
    this.live = live;
  }

  clear() {
    if (this.marker) { this.map.removeLayer(this.marker); this.marker = null; }
  }
}
