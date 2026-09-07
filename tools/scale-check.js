import { BUILDINGS } from '../src/game/constants.js';
import { areaScale, areaCapacityScale, sqft } from '../src/game/lots.js';
print('How output scales with floor area, by what the place actually does:');
print('');
print('building            ref     exp    at 0.5x   at 1x   at 2x   at 4x');
for (const b of Object.values(BUILDINGS)) {
  if (!b.referenceAreaM2) continue;
  const f = (m) => areaScale({ areaM2: b.referenceAreaM2 * m }, b.referenceAreaM2, b.areaExponent).toFixed(2).padStart(8);
  print(b.name.padEnd(19) + String(b.referenceAreaM2).padStart(4) + 'm²' +
        String(b.areaExponent).padStart(7) + f(0.5) + f(1) + f(2) + f(4));
}
print('');
const shop = BUILDINGS.autoshop;
const s850 = areaScale({ areaM2: 850 }, shop.referenceAreaM2, shop.areaExponent);
print('Your example — an 850 m² commercial block as an Auto Shop:');
print('  reference bay space ' + shop.referenceAreaM2 + ' m², so 850 m² is ' + (850/shop.referenceAreaM2).toFixed(2) + 'x the floor');
print('  output x' + s850.toFixed(2) + ' (was x1.41 under the old flat square root)');
print('  storage x' + areaCapacityScale({ areaM2: 850 }, shop.referenceAreaM2).toFixed(2));
