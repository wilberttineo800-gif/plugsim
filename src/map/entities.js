// Everything the player owns, drawn on the map: property markers, standing
// routes, and couriers moving along them in real time.

import { BUILDINGS, PRODUCTS } from '../game/constants.js';
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
};

const VEHICLE_GLYPH = { bike: '◈', sedan: '▰', van: '▮' };

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

    return L.divIcon({
      className: '',
      html:
        `<div class="${classes}">` +
        `<div class="bmark__chip">${svgIcon(def.icon)}</div>` +
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
    this.minZoom = 15;
    // With the hex grid gone, the buildings carry the data overlay themselves.
    this.overlay = 'demand_weed';
    this.districts = new Map();
    map.on('zoomend', () => this.applyZoom());
  }

  setDistricts(districts) {
    this.districts = new Map(districts.map((d) => [d.id, d]));
  }

  setOverlay(id, lots) {
    this.overlay = id;
    if (lots) this.refresh(lots);
  }

  build(lots) {
    this.group.clearLayers();
    this.shapes.clear();
    for (const lot of lots) {
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
        poly.bindTooltip(
          `${lot.name} · ${Math.round(lot.areaM2)} m²`,
          { direction: 'top', opacity: 0.9, className: 'lot-tip' }
        );
      }
      poly.addTo(this.group);
      this.shapes.set(lot.id, poly);
    }
    this.applyZoom();
  }

  styleFor(lot) {
    const selected = this.selectedId === lot.id;
    if (lot.buildingId) {
      return { color: '#ff8a3d', weight: selected ? 2.4 : 1.6, opacity: 0.95,
               fillColor: '#ff8a3d', fillOpacity: 0.34 };
    }
    if (lot.owned) {
      return { color: '#e7c56a', weight: selected ? 2.4 : 1.4, opacity: 0.9,
               fillColor: '#e7c56a', fillOpacity: 0.20 };
    }
    // Anything not yours is tinted by whatever the map is currently showing,
    // so demand, price and rival turf still read geographically.
    const district = this.districts.get(lot.districtId);
    const fill = district ? overlayColor(district, this.overlay) : '#9fb8d0';
    return { color: selected ? '#ff8a3d' : fill, weight: selected ? 2.6 : 1.3,
             opacity: selected ? 1 : 0.95, fillColor: fill,
             fillOpacity: selected ? 0.55 : 0.42 };
  }

  refresh(lots) {
    for (const lot of lots) {
      const poly = this.shapes.get(lot.id);
      if (poly) poly.setStyle(this.styleFor(lot));
    }
  }

  setSelected(id, lots) {
    this.selectedId = id;
    if (lots) this.refresh(lots);
  }

  /**
   * Hundreds of footprints are noise when zoomed out to the whole territory.
   * The layer is detached wholesale rather than hidden per-shape, because the
   * canvas renderer gives individual polygons no DOM node to hide.
   */
  applyZoom() {
    const show = this.map.getZoom() >= this.minZoom;
    if (show && !this.map.hasLayer(this.group)) this.group.addTo(this.map);
    else if (!show && this.map.hasLayer(this.group)) this.map.removeLayer(this.group);
    this.visible = show;
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
        `<span>${VEHICLE_GLYPH[c.type] || '▰'}</span></div>`;
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
