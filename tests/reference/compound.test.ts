// @ts-nocheck — copia literal de modifications/reference/compound.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compoundDay, weekChain, weekTotals, dayStatus } from '../../src/game/compound';
import { settle, rewardsBlocked } from '../../src/game/penalty';

test('Variante A: monedas 1,2,4,8 y desde el día 4 se queda en 8; exp 5,10,20,40 y se queda en 40', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 7].map(n => compoundDay(n).coins), [1, 2, 4, 8, 8, 8]);
  assert.deepEqual([1, 2, 3, 4, 5, 7].map(n => compoundDay(n).exp), [5, 10, 20, 40, 40, 40]);
});
test('semana perfecta: 39 monedas y 195 exp', () => {
  const t = weekTotals(weekChain(Array(7).fill(true)));
  assert.equal(t.coins, 39); assert.equal(t.exp, 195);
});
test('66 días perfectos en semanas de 7: 358 monedas y 1790 exp solo de la fuerza base', () => {
  let coins = 0, exp = 0;
  for (let w = 0; w < 9; w++) { const t = weekTotals(weekChain(Array(7).fill(true))); coins += t.coins; exp += t.exp; }
  const tail = weekTotals(weekChain([true, true, true])); coins += tail.coins; exp += tail.exp;
  assert.equal(coins, 358); assert.equal(exp, 1790);
});
test('día perdido: el equivalente es lo que habría dado y la cadena vuelve a 1', () => {
  const d = weekChain([true, false, true]);
  assert.equal(d[1].missedCoins, 2); assert.equal(d[1].missedExp, 10);
  assert.equal(d[2].chain, 1); assert.equal(d[2].coins, 1);
});
test('fallar después de 5 seguidos pierde el equivalente al tope (8 monedas, 40 exp)', () => {
  const d = weekChain([true, true, true, true, true, false])[5];
  assert.equal(d.missedCoins, 8); assert.equal(d.missedExp, 40);
});
test('dos fallos seguidos: el segundo vale como un día 1', () => {
  const d = weekChain([true, true, false, false]);
  assert.equal(d[2].missedCoins, 4); assert.equal(d[3].missedCoins, 1);
});
test('perdón: con 75 % o más el día se perdona (la cadena sigue) y con menos cuenta como no hecho', () => {
  assert.equal(dayStatus(0.75).status, 'forgiven'); assert.equal(dayStatus(0.749).status, 'missed');
  assert.equal(dayStatus(1).status, 'done'); assert.equal(dayStatus(true).status, 'done'); assert.equal(dayStatus(false).status, 'missed');
});
test('día perdonado: recompensa proporcional al ratio y la cadena no se corta', () => {
  const d = weekChain([true, 0.8, true]);
  assert.equal(d[1].status, 'forgiven'); assert.equal(d[1].chain, 2);
  assert.equal(d[1].coins, 1.6); assert.equal(d[1].exp, 8);
  assert.equal(d[2].chain, 3); assert.equal(d[2].coins, 4);
});
test('ajuste por meta: factor x0,9 (meta 40) da 0,9 monedas y 4,5 exp el día 1 y 7,2 y 36 el día 4', () => {
  const d = weekChain([true, true, true, true], { rewardFactor: 0.9 });
  assert.equal(d[0].coins, 0.9); assert.equal(d[0].exp, 4.5);
  assert.equal(d[3].coins, 7.2); assert.equal(d[3].exp, 36);
});
test('saldar un día fallado: 20 repeticiones extra o pagar monedas y experiencia; sin elegir, no se salda', () => {
  const day = weekChain([true, true, false])[2];
  assert.deepEqual(settle(day, 'extra'), { settled: true, extraReps: 20, coinsDelta: 0, expDelta: 0 });
  assert.deepEqual(settle(day, 'pay'), { settled: true, extraReps: 0, coinsDelta: -4, expDelta: -20 });
  assert.equal(settle(day).settled, false);
  assert.equal(rewardsBlocked(1), true); assert.equal(rewardsBlocked(0), false);
});
