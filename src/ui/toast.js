import { esc } from './format.js';

let host = null;

function ensureHost() {
  if (!host) {
    host = document.getElementById('toasts');
  }
  return host;
}

export function toast(message, tone = 'info', ms = 3600) {
  const node = ensureHost();
  if (!node) return;
  const item = document.createElement('div');
  item.className = `toast toast--${tone}`;
  item.innerHTML = `<span>${esc(message)}</span>`;
  node.appendChild(item);

  requestAnimationFrame(() => item.classList.add('is-in'));
  setTimeout(() => {
    item.classList.remove('is-in');
    setTimeout(() => item.remove(), 260);
  }, ms);
}
