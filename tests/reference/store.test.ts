// @ts-nocheck — copia literal de modifications/reference/store.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { priceOf, availableFor, canBuy } from '../../src/game/store';
import catalog from '../../content/store.json';
const it = id => catalog.items.find(i => i.id === id);

test('precio por área: poco x2, mucho x4 (cigarro 3 -> 6/12, cerveza 5 -> 10/20, trago 12 -> 24/48, comer mal 10 -> 20/40)', () => {
  assert.deepEqual(['poco', 'mucho'].map(a => priceOf(it('cigarro'), 1, a)), [6, 12]);
  assert.deepEqual(['poco', 'mucho'].map(a => priceOf(it('cerveza'), 1, a)), [10, 20]);
  assert.deepEqual(['poco', 'mucho'].map(a => priceOf(it('trago'), 1, a)), [24, 48]);
  assert.deepEqual(['poco', 'mucho'].map(a => priceOf(it('comer-mal'), 1, a)), [20, 40]);
  assert.equal(priceOf(it('sesion-juego'), 1, 'poco'), 8);
});
test('«no» al área: comida y dulce pagan el precio base; alcohol, tabaco, redes y juegos no se ofrecen', () => {
  assert.equal(priceOf(it('comer-mal'), 1, 'no'), 10); assert.equal(priceOf(it('antojo-dulce'), 1, 'no'), 3);
  assert.equal(availableFor(it('cerveza'), [], { alcohol: 'no' }), false);
  assert.equal(availableFor(it('sesion-juego'), [], { juegos: 'no' }), false);
  assert.equal(availableFor(it('comer-mal'), [], { comida: 'no' }), true);
});
test('cigarro no se ofrece con el objetivo «dejar de fumar»', () => assert.equal(availableFor(it('cigarro'), ['dejar-fumar']), false));
test('vales de grupo bloqueados por nivel: 10, 20 y 30', () => {
  const v = id => canBuy({ item: it(id), boughtThisWeek: 0, wallet: 500, level: 9 });
  assert.equal(v('vale-10-off').reason, 'nivel-insuficiente');
  assert.equal(canBuy({ item: it('vale-10-off'), boughtThisWeek: 0, wallet: 500, level: 10 }).ok, true);
  assert.equal(canBuy({ item: it('vale-no-pagas'), boughtThisWeek: 0, wallet: 500, level: 19 }).reason, 'nivel-insuficiente');
  assert.equal(canBuy({ item: it('vale-cena'), boughtThisWeek: 0, wallet: 500, level: 30 }).ok, true);
  assert.ok(['vale-10-off', 'vale-no-pagas', 'vale-cena'].every(id => it(id).groupOnly && it(id).registryOnly));
});
test('límite semanal bloquea aunque sobren monedas; billetera negativa bloquea compras', () => {
  assert.equal(canBuy({ item: it('cerveza'), boughtThisWeek: 6, wallet: 999, areaAnswers: { alcohol: 'poco' } }).reason, 'limite-semanal');
  assert.equal(canBuy({ item: it('cafe-afuera'), boughtThisWeek: 0, wallet: -2 }).reason, 'monedas-insuficientes');
});
