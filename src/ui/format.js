export function money(n) {
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US')}`;
}

export function moneyShort(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

export function units(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(1);
}

export function pct(n, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

export function km(n) {
  if (n == null) return '—';
  return n < 10 ? `${n.toFixed(1)} km` : `${Math.round(n)} km`;
}

export function duration(hours) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function qualityLabel(q) {
  if (q >= 0.85) return 'Boutique';
  if (q >= 0.7) return 'Top shelf';
  if (q >= 0.55) return 'Solid';
  if (q >= 0.4) return 'Mids';
  return 'Bunk';
}

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

/** Clip a label to fit a control, since a <select> is sized by its widest option. */
export function clip(text, max = 34) {
  const t = String(text);
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/** Crime as a word. Nobody wants to read 0.47. */
export function crimeLabel(v) {
  if (v >= 0.72) return 'Lawless';
  if (v >= 0.55) return 'Rough';
  if (v >= 0.38) return 'Patchy';
  if (v >= 0.22) return 'Settled';
  return 'Quiet';
}
