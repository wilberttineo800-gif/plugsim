// Inline SVG, not a bitmap — same constraint as art.js and the rest of
// src/ui/: no images, no icon fonts, works offline. A skyline silhouette for
// the retro start screen (start--retro): plain filled shapes, fill=currentColor
// so a single CSS color/opacity rule controls it.

export function skylineSVG() {
  return `<svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor">
      <rect x="0"   y="120" width="40"  height="80"/>
      <rect x="46"  y="90"  width="34"  height="110"/>
      <rect x="86"  y="140" width="26"  height="60"/>
      <rect x="118" y="70"  width="30"  height="130"/>
      <rect x="126" y="46"  width="14"  height="30"/>
      <rect x="154" y="110" width="42"  height="90"/>
      <rect x="202" y="80"  width="24"  height="120"/>
      <rect x="232" y="130" width="36"  height="70"/>
      <rect x="274" y="55"  width="28"  height="145"/>
      <rect x="284" y="20"  width="8"   height="40"/>
      <rect x="308" y="95"  width="46"  height="105"/>
      <rect x="360" y="10"  width="34"  height="190"/>
      <polygon points="360,10 377,-14 394,10"/>
      <rect x="373" y="-30" width="8"   height="20"/>
      <rect x="400" y="120" width="30"  height="80"/>
      <rect x="436" y="75"  width="40"  height="125"/>
      <rect x="482" y="105" width="24"  height="95"/>
      <rect x="512" y="60"  width="32"  height="140"/>
      <rect x="550" y="135" width="44"  height="65"/>
      <rect x="600" y="85"  width="28"  height="115"/>
      <rect x="608" y="55"  width="12"  height="30"/>
      <rect x="634" y="120" width="36"  height="80"/>
      <rect x="676" y="95"  width="26"  height="105"/>
      <rect x="708" y="140" width="38"  height="60"/>
      <rect x="752" y="105" width="30"  height="95"/>
      <rect x="784" y="150" width="16"  height="50"/>
    </g>
  </svg>`;
}
