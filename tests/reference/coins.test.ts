// @ts-nocheck — copia literal de modifications/reference/*.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { dailyThresholdCoins, multiplierFor, dropOneStep, dayCoins, weeklyPoolCoins } from '../../src/game/coins';
import { dayPoints } from '../../src/game/scoring';
import { priceOf, availableFor, canBuy, coversSlip } from '../../src/game/store';
import catalog from '../../content/store.json';

test('umbrales: 74.99 -> 0, 75 -> 2, 99.99 -> 2, 100 -> 4 (4 en total, no 6)', () => {
  assert.deepEqual([74.99, 75, 99.99, 100].map(dailyThresholdCoins), [0, 2, 2, 4]);
});
test('multiplicador: x1 hasta 6 días, x1.1 a los 7, x1.2 a los 14, x1.9 a los 63', () => {
  assert.deepEqual([0, 6, 7, 13, 14, 63].map(multiplierFor), [1, 1, 1.1, 1.1, 1.2, 1.9]);
});
test('el multiplicador rige desde el día siguiente a completar 7 días', () => {
  assert.equal(dayCoins({ total: 100, overflow: 0, streakBefore: 6 }).creditNow, 4);
  assert.equal(dayCoins({ total: 100, overflow: 0, streakBefore: 7 }).creditNow, 4.4);
});
test('un día de menos de 75 corta la racha', () => {
  const r = dayCoins({ total: 74, overflow: 0, streakBefore: 20 });
  assert.equal(r.streakAfter, 0); assert.equal(r.creditNow, 0);
});
test('66 días perfectos: 375.6 monedas y multiplicador final x1.9 (coincide con la simulación)', () => {
  let streak = 0, sum = 0, last = 1;
  for (let d = 0; d < 66; d++) { const r = dayCoins({ total: 100, overflow: 0, streakBefore: streak }); sum += r.creditNow; streak = r.streakAfter; last = r.multiplier; }
  assert.ok(Math.abs(sum - 375.6) < 0.01, String(sum)); assert.equal(last, 1.9);
});
test('recaída sin permiso baja un escalón: racha 15 -> 16 -> 9, multiplicador x1.2 -> x1.1', () => {
  const r = dayCoins({ total: 90, overflow: 0, streakBefore: 15, unpaidSlip: true });
  assert.equal(r.streakAfter, 9); assert.equal(multiplierFor(r.streakAfter), 1.1);
  assert.equal(dropOneStep(3), 0);
});
test('excedente: 15 puntos => 1.5 monedas al pool; con racha de 7 días => 1.65', () => {
  assert.equal(dayCoins({ total: 100, overflow: 15, streakBefore: 0 }).toPool, 1.5);
  assert.equal(dayCoins({ total: 100, overflow: 15, streakBefore: 7 }).toPool, 1.65);
});
test('integración: meta superada (650 de 500, peso 3) da 4 monedas ahora + 1.5 al pool', () => {
  const p = dayPoints({ habits: [{ weight: 3, completion: 1.3, measurable: true }, { weight: 2, completion: 1 }, { weight: 1, completion: 1 }] });
  const c = dayCoins({ total: p.total, overflow: p.overflow, streakBefore: 0 });
  assert.equal(c.creditNow, 4); assert.equal(c.toPool, 1.5);
});
test('pool semanal en monedas suma los días', () => assert.equal(weeklyPoolCoins([{ toPool: 1.5 }, { toPool: 0 }, { toPool: 2 }]), 3.5));

const item = id => catalog.items.find(i => i.id === id);
test('catálogo: cerveza 5 y trago 12 (dueño); cerveza con límite 6', () => {
  assert.equal(item('cerveza').price, 5); assert.equal(item('trago').price, 12); assert.equal(item('cerveza').weeklyLimit, 6);
});
test('límite semanal bloquea aunque sobren monedas', () =>
  assert.deepEqual(canBuy({ item: item('cerveza'), boughtThisWeek: 6, wallet: 100 }), { ok: false, reason: 'limite-semanal' }));
test('monedas insuficientes', () =>
  assert.deepEqual(canBuy({ item: item('trago'), boughtThisWeek: 0, wallet: 11.99 }), { ok: false, reason: 'monedas-insuficientes' }));
test('cigarro no se ofrece si el objetivo es dejar de fumar', () => {
  assert.equal(availableFor(item('cigarro'), ['dejar-fumar']), false);
  assert.deepEqual(canBuy({ item: item('cigarro'), boughtThisWeek: 0, wallet: 50, objectives: ['dejar-fumar'] }), { ok: false, reason: 'conflicto-objetivo' });
});
test('compra válida, y el precio del pase depende del peso', () => {
  assert.deepEqual(canBuy({ item: item('cerveza'), boughtThisWeek: 5, wallet: 5 }), { ok: true });
  assert.deepEqual([1, 2, 3].map(w => priceOf(item('pase-habito'), w)), [2, 4, 6]);
});
test('solo los permisos cubren una recaída', () => {
  assert.equal(coversSlip(item('cerveza')), true); assert.equal(coversSlip(item('cine')), false);
});
