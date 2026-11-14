// @ts-nocheck — copia literal de modifications/reference/levels.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { totalXp, levelFor } from '../../src/game/levels';
import { strengthPlan, completionOf, STRENGTH_EXERCISES } from '../../src/game/strength';
import { nextStep, addGoal } from '../../src/game/onboarding';
import { dayPoints } from '../../src/game/scoring';

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
test('el nivel no baja: agregar días solo suma', () => {
  const a = levelFor(totalXp([100, 100, 100, 0])).level, b = levelFor(totalXp([100, 100, 100])).level;
  assert.equal(a, b);
});
test('fuerza base: 3 ejercicios, 10 repeticiones en el nivel más bajo, 100 en el más alto', () => {
  assert.deepEqual(STRENGTH_EXERCISES, ['flexiones', 'sentadillas', 'dominadas']);
  assert.deepEqual(strengthPlan(0).map(e => e.target), [10, 10, 10]);
  assert.deepEqual(strengthPlan(3).map(e => e.target), [100, 100, 100]);
});
test('quien no declara nivel (o uno inválido) recibe el nivel por defecto', () => {
  assert.deepEqual(strengthPlan(undefined), strengthPlan(0));
  assert.deepEqual(strengthPlan(9), strengthPlan(0));
});
test('fuerza base entra al puntaje como meta medible: 15 de 10 repeticiones cuenta 150 %', () => {
  const habits = strengthPlan(0).map((e, i) => ({ weight: e.weight, measurable: true, completion: completionOf(i === 0 ? 15 : 10, e.target) }));
  const r = dayPoints({ habits });
  assert.equal(r.total, 100); assert.ok(Math.abs(r.overflow - 16.67) < 0.01, String(r.overflow));
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
  s = { ...s, personalized: ['a', 'b'] }; assert.equal(nextStep(s).step, 'training-level');
  assert.equal(nextStep({ ...s, trainingLevel: 0 }).step, 'done');
});
test('máximo 3 objetivos, sin duplicados', () => {
  assert.deepEqual(addGoal(['a'], 'a'), ['a']);
  assert.throws(() => addGoal(['a', 'b', 'c'], 'd'));
});
