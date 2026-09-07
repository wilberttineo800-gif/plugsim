import { GAME_MINUTES_PER_REAL_SECOND as G, SPEEDS } from '../src/game/constants.js';
import { COURIERS } from '../src/game/constants.js';
const DRIVE = 9.4; // OSRM minutes for a 3.1 km city route
print('Current: 1x = ' + G + ' game-minutes per real second');
print('');
print('speed   game day takes   a 3.1km sedan drive takes on screen');
for (const m of SPEEDS) {
  if (!m) continue;
  const perSec = G * m;
  print((m + 'x').padEnd(8) +
    (1440 / perSec / 60).toFixed(1).padStart(8) + ' real min' +
    ((DRIVE / perSec)).toFixed(1).padStart(14) + ' real sec');
}
print('');
print('For a drive to LOOK like driving at 1x it wants ~15-25 real seconds.');
for (const base of [0.4, 0.5, 0.6, 0.8, 1.0]) {
  print('  base ' + base + ':  1x drive = ' + (DRIVE / base).toFixed(0) + 's,  ' +
        'game day = ' + (1440 / base / 60).toFixed(0) + ' real min,  ' +
        '15x drive = ' + (DRIVE / (base * 15)).toFixed(1) + 's');
}
