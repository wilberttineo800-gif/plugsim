import { DRIVERS } from '../src/game/constants.js';
print('driver   hire fee     their wage');
for (let i = 0; i < 10; i++) {
  print(String(i + 1).padStart(4) +
    ('$' + Math.round(DRIVERS.baseHireFee * Math.pow(DRIVERS.hireGrowth, i)).toLocaleString('en-US')).padStart(12) +
    ('$' + Math.round(DRIVERS.baseWagePerDay * Math.pow(DRIVERS.wageGrowth, i)) + '/day').padStart(14));
}
