// @ts-nocheck — copia literal de modifications/reference/ranks.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isActiveDay, rankPoints, rankFor, rankRewardsHeld } from '../../src/game/ranks';
import { walletBalance } from '../../src/game/wallet';
import { totalXp, levelFor } from '../../src/game/levels';
import { dayTotals, countsForRanking, personalHabitNotice } from '../../src/game/ranking';

test('día activo = 75 o más puntos', () => { assert.equal(isActiveDay(74.9), false); assert.equal(isActiveDay(75), true); });
test('puntos de continuidad: +1 por día activo, -2 por día sin actividad, mínimo 0', () => {
  assert.equal(rankPoints([100, 100, 100]), 3);
  assert.equal(rankPoints([100, 100, 0]), 0);
  assert.equal(rankPoints([0, 0, 100]), 1);
  assert.equal(rankPoints([100, 100, 100, 0, 0]), 0);
});
test('rangos con umbrales 10/30/50 y cuánto falta para el siguiente', () => {
  assert.equal(rankFor(9).name, 'Aspirante'); assert.equal(rankFor(10).name, 'Constante'); assert.equal(rankFor(50).name, 'Leyenda');
  assert.equal(rankFor(4).missing, 6); assert.equal(rankFor(50).next, null);
});
test('premios de rango derivados: Constante 10, Veterano 20, Leyenda 40; perder el rango quita el premio y recuperarlo lo devuelve', () => {
  assert.equal(rankRewardsHeld(9), 0); assert.equal(rankRewardsHeld(10), 10); assert.equal(rankRewardsHeld(30), 30); assert.equal(rankRewardsHeld(50), 70);
  const subida = Array(30).fill(100); assert.equal(rankRewardsHeld(rankPoints(subida)), 30);
  const caida = [...subida, 0, 0, 0, 0]; assert.equal(rankPoints(caida), 22); assert.equal(rankRewardsHeld(rankPoints(caida)), 10);
  const vuelta = [...caida, ...Array(8).fill(100)]; assert.equal(rankRewardsHeld(rankPoints(vuelta)), 30);
});
test('simulación ilustrativa a 66 días: perfecto -> Leyenda, 1 de cada 2 días -> Aspirante', () => {
  assert.equal(rankFor(rankPoints(Array(66).fill(100))).name, 'Leyenda');
  assert.equal(rankFor(rankPoints(Array.from({ length: 66 }, (_, i) => (i % 2 ? 0 : 100)))).name, 'Aspirante');
});
test('billetera derivada: puede quedar negativa', () => {
  assert.equal(walletBalance({ daily: 10, pool: 2, strength: 8, rankRewards: 10, penalties: 5, spent: 4 }), 21);
  assert.equal(walletBalance({ daily: 2, penalties: 8 }), -6);
});
test('el nivel puede bajar si una penalización resta experiencia, con piso 0', () => {
  const t = Array(3).fill(100);
  assert.equal(levelFor(totalXp(t)).level, 1);
  assert.equal(levelFor(totalXp(t, { penalty: 40 })).level, 0);
  assert.equal(totalXp([10], { penalty: 500 }), 0);
  assert.equal(totalXp([100], { bonus: 40 }), 140);
});
test('ranking: un hábito «solo yo» da puntos personales pero no cuenta para el ranking', () => {
  const habits = [{ weight: 1, completion: 1, scope: 'plan-inicial' }, { weight: 1, completion: 0, scope: 'solo-yo' }];
  const r = dayTotals({ habits });
  assert.equal(r.ranking.total, 100); assert.equal(r.personal.total, 50);
  assert.equal(countsForRanking({ scope: 'grupo' }), true); assert.equal(countsForRanking({ scope: 'solo-yo' }), false);
  assert.match(personalHabitNotice('Los Pibes'), /Los Pibes/);
});
