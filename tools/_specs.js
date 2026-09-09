import { assembledArt } from '../src/ui/gunsmith.js';
// Real dimensions where they exist; the rest proportioned to match.
const SPECS = {
  warden:    { label: 'Warden .45',    oal: 8.5,  barrel: 5.0,  receiver: 5.6, pistol: true,  barrelStyle: 'plain',   furniture: 'none',   feed: 'box',      stock: 'grip',       sights: 'irons' },
  kestrel:   { label: 'Kestrel 9',     oal: 7.95, barrel: 4.49, receiver: 5.2, pistol: true,  barrelStyle: 'plain',   furniture: 'none',   feed: 'box',      stock: 'grip',       sights: 'irons' },
  vulcan:    { label: 'Vulcan 10',     oal: 9.6,  barrel: 6.0,  receiver: 6.0, pistol: true,  barrelStyle: 'ported',  furniture: 'none',   feed: 'box',      stock: 'grip',       sights: 'rail'  },
  drover:    { label: 'Drover .357',   oal: 9.8,  barrel: 4.0,  receiver: 4.2, pistol: true,  barrelStyle: 'heavy',   furniture: 'none',   feed: 'cylinder', stock: 'plough',     sights: 'irons' },
  wasp:      { label: 'Wasp 9',        oal: 26.8, barrel: 8.86, receiver: 8.0,                barrelStyle: 'plain',   furniture: 'ribbed', feed: 'box',      stock: 'collapsing', sights: 'irons' },
  grease:    { label: 'Grease .45',    oal: 22.8, barrel: 8.0,  receiver: 7.0,                barrelStyle: 'plain',   furniture: 'none',   feed: 'box',      stock: 'wire',       sights: 'irons' },
  kite:      { label: 'Kite 15',       oal: 33.0, barrel: 16.0, receiver: 8.0,                barrelStyle: 'plain',   furniture: 'rail',   feed: 'box',      stock: 'collapsing', sights: 'rail'  },
  longmarch: { label: 'Longmarch 47',  oal: 34.3, barrel: 16.0, receiver: 8.4,                barrelStyle: 'plain',   furniture: 'gastube',feed: 'curved',   stock: 'sloped',     sights: 'irons' },
  praetor:   { label: 'Praetor .308',  oal: 40.0, barrel: 20.0, receiver: 9.0,                barrelStyle: 'heavy',   furniture: 'rail',   feed: 'box',      stock: 'fixed',      sights: 'rail'  },
  ridgeback: { label: 'Ridgeback 12',  oal: 43.0, barrel: 18.5, receiver: 9.0,                barrelStyle: 'plain',   furniture: 'pump',   feed: 'tube',     stock: 'comb',       sights: 'irons' },
  coachman:  { label: 'Coachman',      oal: 40.0, barrel: 26.0, receiver: 6.0,                barrelStyle: 'double',  furniture: 'none',   feed: 'none',     stock: 'comb',       sights: 'irons' },
  vigil:     { label: 'Vigil .308',    oal: 44.0, barrel: 24.0, receiver: 9.0,                barrelStyle: 'heavy',   furniture: 'none',   feed: 'box',      stock: 'thumbhole',  sights: 'scope' },
  longshot:  { label: 'Longshot .50',  oal: 57.0, barrel: 29.0, receiver: 12.0,               barrelStyle: 'ported',  furniture: 'none',   feed: 'box',      stock: 'fixed',      sights: 'scope' },
  whisper:   { label: 'Whisper .300',  oal: 42.0, barrel: 20.0, receiver: 9.0,                barrelStyle: 'shrouded',furniture: 'none',   feed: 'box',      stock: 'thumbhole',  sights: 'scope' },
  hammerfall:{ label: 'Hammerfall',    oal: 48.0, barrel: 21.0, receiver: 12.0,               barrelStyle: 'shrouded',furniture: 'none',   feed: 'belt',     stock: 'fixed',      sights: 'irons' },
  reaper:    { label: 'Reaper LMG',    oal: 40.0, barrel: 18.0, receiver: 10.0,               barrelStyle: 'heavy',   furniture: 'rail',   feed: 'drum',     stock: 'fixed',      sights: 'rail'  },
};
const COL = 3, CW = 330, CH = 170;
let out = [], y = 50, i = 0;
for (const [id, sp] of Object.entries(SPECS)) {
  const cx = 20 + (i % COL) * CW, cy = y + Math.floor(i / COL) * CH;
  out.push(`<rect x="${cx}" y="${cy}" width="${CW-14}" height="${CH-14}" rx="9" fill="#141d29" stroke="#253243"/>`);
  const svg = assembledArt(sp, { size: 290, color: '#ccd8e5' });
  out.push(`<g transform="translate(${cx + (CW-14)/2}, ${cy + 62})">${svg.replace('<svg','<svg x="-145" y="-72"')}</g>`);
  out.push(`<text x="${cx + (CW-14)/2}" y="${cy + CH - 34}" fill="#ccd8e5" font-family="Helvetica" font-size="13" text-anchor="middle">${sp.label}</text>`);
  out.push(`<text x="${cx + (CW-14)/2}" y="${cy + CH - 19}" fill="#5d6d7e" font-family="Courier" font-size="9.5" text-anchor="middle">${sp.oal}" oal · ${sp.barrel}" barrel</text>`);
  i++;
}
const H2 = y + Math.ceil(i / COL) * CH + 16, W2 = 20 + COL * CW + 10;
print(`<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">
<rect width="100%" height="100%" fill="#080b10"/>
<text x="20" y="32" fill="#ff8a3d" font-family="Helvetica" font-size="16" letter-spacing="2">ASSEMBLED FROM PARTS — REAL PROPORTIONS</text>
${out.join('\n')}</svg>`);
