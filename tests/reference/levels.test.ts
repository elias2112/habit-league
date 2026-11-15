// @ts-nocheck — copia literal de modifications/reference/levels.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { totalXp, levelFor } from '../../src/game/levels';
import { nextStep, addGoal } from '../../src/game/onboarding';

test('se empieza en nivel 0 con 0 de experiencia', () => {
  assert.deepEqual(levelFor(totalXp([])), { level: 0, xpIntoLevel: 0, xpForNext: 300, progress: 0 });
});
test('3 días de 100 puntos suben al nivel 1 (con xpPerLevel 300)', () => {
  assert.equal(levelFor(totalXp([100, 100, 100])).level, 1);
  assert.equal(levelFor(totalXp([100, 100, 99])).level, 0);
});
test('66 días perfectos: nivel 22 (valor provisional)', () => {
  assert.equal(levelFor(totalXp(Array(66).fill(100))).level, 22);
});
test('agregar días solo suma: el nivel no baja por días en cero', () => {
  const a = levelFor(totalXp([100, 100, 100, 0])).level, b = levelFor(totalXp([100, 100, 100])).level;
  assert.equal(a, b);
});
test('cuestionario: con objetivo claro va directo a elegir', () => {
  assert.deepEqual(nextStep({ hasClearGoal: true, goals: [], personalized: [] }), { step: 'pick-goals' });
});
test('cuestionario: sin objetivo claro hace preguntas dirigidas hasta tener uno', () => {
  const s = { hasClearGoal: false, goals: [], personalized: [] };
  assert.equal(nextStep(s).step, 'area');
  assert.equal(nextStep({ ...s, area: 'cuerpo' }).step, 'friction');
  assert.equal(nextStep({ ...s, area: 'cuerpo', friction: 'x' }).step, 'suggest');
});
test('cuestionario: personaliza cada objetivo, luego nivel de entrenamiento, luego listo', () => {
  let s = { hasClearGoal: true, goals: ['a', 'b'], personalized: [] };
  assert.deepEqual(nextStep(s), { step: 'personalize', goal: 'a' });
  s = { ...s, personalized: ['a'] }; assert.deepEqual(nextStep(s), { step: 'personalize', goal: 'b' });
  s = { ...s, personalized: ['a', 'b'] }; assert.equal(nextStep(s).step, 'strength-base');
  assert.equal(nextStep({ ...s, strength: 'declined' }).step, 'done');
});
test('máximo 3 objetivos, sin duplicados', () => {
  assert.deepEqual(addGoal(['a'], 'a'), ['a']);
  assert.throws(() => addGoal(['a', 'b', 'c'], 'd'));
});
