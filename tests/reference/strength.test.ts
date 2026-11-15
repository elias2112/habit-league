// @ts-nocheck — copia literal de modifications/reference/strength.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { strengthPlan, STRENGTH_EXERCISES, targetOptions, maxTargetFor, suggestTarget, needsEasyVariant, rewardFactor, dayRatio, completionOf } from '../../src/game/strength';
import { dayPoints } from '../../src/game/scoring';

test('ejercicios: flexiones, sentadillas y plancha (core)', () => assert.deepEqual(STRENGTH_EXERCISES, ['flexiones', 'sentadillas', 'plancha']));
test('botones de a 10 hasta 100; el tope sube +10 cada 10 niveles', () => {
  assert.deepEqual(targetOptions(0), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual([0, 9, 10, 19, 20, 30].map(maxTargetFor), [100, 100, 110, 110, 120, 130]);
  assert.equal(targetOptions(10).at(-1), 110);
});
test('sugerencia: un escalón por encima de lo que dice poder hacer, sin pasar el tope', () => {
  assert.equal(suggestTarget(25), 30); assert.equal(suggestTarget(30), 40); assert.equal(suggestTarget(100), 100); assert.equal(suggestTarget(100, 10), 110);
  assert.equal(needsEasyVariant(9), true); assert.equal(needsEasyVariant(10), false);
});
test('factor de recompensa 0,5 + meta/100: meta 10 -> 0,6; 40 -> 0,9; 100 -> 1,5 (promedio de los tres)', () => {
  const t = v => ({ flexiones: v, sentadillas: v, plancha: v });
  assert.deepEqual([10, 40, 100].map(v => rewardFactor(t(v))), [0.6, 0.9, 1.5]);
  assert.equal(rewardFactor({ flexiones: 10, sentadillas: 40, plancha: 70 }), 0.9);
});
test('plan con metas elegidas, peso 3; variante fácil usa los equivalentes', () => {
  const p = strengthPlan({ flexiones: 30, sentadillas: 20, plancha: 40 });
  assert.deepEqual(p.map(e => e.target), [30, 20, 40]); assert.ok(p.every(e => e.weight === 3 && e.measurable));
  const e = strengthPlan({}, { easy: true });
  assert.equal(e[0].id, 'flexiones en la pared'); assert.equal(e[0].base, 'flexiones'); assert.equal(e[0].target, 10);
});
test('entra al puntaje como meta medible: 15 de 10 cuenta 150 %', () => {
  const habits = strengthPlan({ flexiones: 10, sentadillas: 10, plancha: 10 }).map((e, i) => ({ weight: e.weight, measurable: true, completion: completionOf(i === 0 ? 15 : 10, e.target) }));
  const r = dayPoints({ habits });
  assert.equal(r.total, 100); assert.ok(Math.abs(r.overflow - 16.67) < 0.01, String(r.overflow));
});
test('ratio del día = el peor ejercicio (supuesto: hay que llegar al 75 % en cada uno)', () => {
  const t = { flexiones: 20, sentadillas: 20, plancha: 20 };
  assert.equal(dayRatio({ flexiones: 20, sentadillas: 30, plancha: 15 }, t), 0.75);
  assert.equal(dayRatio({ flexiones: 20, sentadillas: 20, plancha: 20 }, t), 1);
});
