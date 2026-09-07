// How the fleet actually behaves on a real route, so pricing and pacing can be
// judged against each other rather than guessed at.
import { COURIERS, COURIER_CLASSES } from '../src/game/constants.js';
import { vehicleStats, VEHICLE_UPGRADES } from '../src/game/upgrades.js';

const DRIVE_MIN = 9.4;   // OSRM's estimate for a 3.1 km city route
const KM = 3.1;

print('A real 3.1 km city route — OSRM says ' + DRIVE_MIN + ' min by car.');
print('');
print('vehicle              cost    cap   one-way  turnaround  round trip  loads/day   $/day');
for (const cls of Object.keys(COURIER_CLASSES)) {
  print('  ' + COURIER_CLASSES[cls].name.toUpperCase());
  for (const id of Object.keys(COURIERS)) {
    const d = COURIERS[id];
    if (d.class !== cls) continue;
    const oneWay = d.direct ? (KM / d.airKph) * 60 : DRIVE_MIN * d.paceFactor;
    const turn = d.loadMinutes + d.unloadMinutes;
    const round = oneWay * 2 + turn;
    const trips = (24 * 60) / round;
    const moved = trips * d.capacity;
    print('  ' + d.name.padEnd(20) +
      ('$' + (d.cost / 1000).toFixed(1) + 'k').padStart(7) +
      String(d.capacity).padStart(6) +
      (oneWay.toFixed(1) + 'm').padStart(9) +
      (turn + 'm').padStart(11) +
      (round.toFixed(0) + 'm').padStart(11) +
      Math.round(moved).toLocaleString('en-US').padStart(10) +
      ('$' + d.wagePerDay).padStart(8));
  }
}
print('');
print('Upgrade tiers available per class:');
for (const [cls, list] of Object.entries(VEHICLE_UPGRADES)) {
  print('  ' + cls.padEnd(10) + list.length + '  ' + list.map((u) => u.name).join(', '));
}
print('');
const semi = COURIERS.semi, sports = COURIERS.sportscar;
print('Sanity: a semi moves ' +
  Math.round(((24*60)/(DRIVE_MIN*semi.paceFactor*2 + semi.loadMinutes + semi.unloadMinutes)) * semi.capacity).toLocaleString('en-US') +
  ' units/day, a sports car ' +
  Math.round(((24*60)/(DRIVE_MIN*sports.paceFactor*2 + sports.loadMinutes + sports.unloadMinutes)) * sports.capacity).toLocaleString('en-US') + '.');
