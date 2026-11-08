// @ts-nocheck — copia literal de modifications/reference/*.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { dayPoints, slipPenalizes, weeklyPool } from '../../src/game/scoring';

const H = (w, c) => ({ weight: w, completion: c });
const V = (state, o = {}) => ({ weight: 1, severity: 'normal', state, ...o });
const tot = a => dayPoints(a).total;

test('plan [1,1,3] completo = 100', () => assert.equal(tot({ habits: [H(1,1), H(1,1), H(3,1)] }), 100));
test('solo los dos fáciles de [1,1,3] = 40', () => assert.equal(tot({ habits: [H(1,1), H(1,1), H(3,0)] }), 40));
test('pesos invertidos [3,3,1], solo fáciles = 85.71 (trampa conocida)', () =>
  assert.equal(tot({ habits: [H(3,1), H(3,1), H(1,0)] }), 85.71));
test('cumplimiento parcial 60% en [1,1] = 30', () => assert.equal(tot({ habits: [H(1,0.6), H(1,0)] }), 30));
test('completion fuera de rango se acota a [0,1]', () => assert.equal(tot({ habits: [H(1,5), H(1,-2)] }), 50));
test('sin hábitos = 0 (la UI debe exigir mínimo 3)', () => assert.equal(tot({ habits: [] }), 0));

test('vicio sin marcar es neutro', () => {
  const h = [H(1,1), H(1,0)];
  assert.equal(tot({ habits: h, vices: [V('none')] }), tot({ habits: h }));
});
test('recaída multiplica por 0.9', () => assert.equal(tot({ habits: [H(1,1)], vices: [V('slipped')] }), 90));
test('desmarcar la recaída vuelve a x1.0 (el resultado solo depende del estado actual)', () => {
  const h = [H(1,1)];
  const antes = tot({ habits: h, vices: [V('none')] });
  tot({ habits: h, vices: [V('slipped')] });
  assert.equal(tot({ habits: h, vices: [V('none')] }), antes);
  assert.equal(antes, 100);
});
test('dos recaídas apilan 0.9*0.9', () =>
  assert.equal(tot({ habits: [H(1,1)], vices: [V('slipped'), V('slipped')] }), 81));
test('el piso x0.7 limita el castigo', () =>
  assert.equal(tot({ habits: [H(1,1)], vices: [V('slipped',{severity:'grave'}), V('slipped',{severity:'grave'})] }), 70));
test('"no lo hice" rellena huecos: [1,1] con 1 hecho + vicio limpio = 83.33', () =>
  assert.equal(tot({ habits: [H(1,1), H(1,0)], vices: [V('clean')] }), 83.33));
test('"no lo hice" nunca supera 100', () =>
  assert.equal(tot({ habits: [H(1,1), H(1,1)], vices: [V('clean')] }), 100));
test('recaída en un vicio + limpio en otro', () => {
  // base 50, bonus 100*1/(2+2)=25 -> 75, x0.9 = 67.5
  assert.equal(tot({ habits: [H(1,1), H(1,0)], vices: [V('clean'), V('slipped')] }), 67.5);
});
test('recaída dentro del cupo semanal no castiga', () => {
  assert.equal(slipPenalizes(2, 2), false);
  assert.equal(slipPenalizes(3, 2), true);
  assert.equal(slipPenalizes(1, 0), true);
  assert.equal(tot({ habits: [H(1,1)], vices: [V('slipped',{penalizing:false})] }), 100);
});
test('invariante: el total diario siempre está en [0,100]', () => {
  let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 20000; i++) {
    const habits = Array.from({ length: 1 + Math.floor(rnd()*8) }, () => H(1 + Math.floor(rnd()*3), rnd()));
    const vices = Array.from({ length: Math.floor(rnd()*4) }, () => V(['none','clean','slipped'][Math.floor(rnd()*3)],
      { weight: 1 + Math.floor(rnd()*3), severity: ['leve','normal','grave'][Math.floor(rnd()*3)] }));
    const t = tot({ habits, vices });
    assert.ok(t >= 0 && t <= 100, JSON.stringify({ habits, vices, t }));
  }
});

test('excedente: base 100 + vicio limpio => total 100 y el resto va al pool', () => {
  const r = dayPoints({ habits: [H(1,1), H(1,1)], vices: [V('clean')] });
  assert.equal(r.total, 100); assert.equal(r.overflow, 33.33);
});
test('excedente con recaída en otro vicio: base 100, bono 25, x0.9 => total 90, pool 22.5', () => {
  const r = dayPoints({ habits: [H(1,1), H(1,1)], vices: [V('clean'), V('slipped')] });
  assert.equal(r.total, 90); assert.equal(r.overflow, 22.5);
});
test('sin superar 100 no hay excedente', () => {
  assert.equal(dayPoints({ habits: [H(1,1), H(1,0)], vices: [V('clean')] }).overflow, 0);
  assert.equal(dayPoints({ habits: [H(1,1)] }).overflow, 0);
});
test('pool semanal suma el excedente de los días', () => {
  assert.equal(weeklyPool([{ overflow: 33.33 }, { overflow: 0 }, { overflow: 22.5 }]), 55.83);
});
test('invariante: overflow >= 0 y total + overflow/M no se pierde', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 20000; i++) {
    const habits = Array.from({ length: 1 + Math.floor(rnd()*6) }, () => H(1 + Math.floor(rnd()*3), rnd()));
    const vices = Array.from({ length: Math.floor(rnd()*4) }, () => V(['none','clean','slipped'][Math.floor(rnd()*3)],
      { weight: 1 + Math.floor(rnd()*3), severity: ['leve','normal','grave'][Math.floor(rnd()*3)] }));
    const r = dayPoints({ habits, vices });
    assert.ok(r.overflow >= 0 && r.total <= 100 && r.total >= 0, JSON.stringify(r));
  }
});

const HM = (w, c) => ({ weight: w, completion: c, measurable: true });
test('meta medible superada: 650 de 500 palabras (peso 3) + resto cumplido => raw 115, total 100, excedente 15', () => {
  const r = dayPoints({ habits: [HM(3, 1.3), H(2, 1), H(1, 1)] });
  assert.equal(r.total, 100); assert.equal(r.overflow, 15);
});
test('la meta medible se acota al 150 %', () => {
  const r = dayPoints({ habits: [HM(1, 9)] });       // 9 => 1.5
  assert.equal(r.total, 100); assert.equal(r.overflow, 50);
});
test('un hábito de sí o no no puede exceder, aunque llegue completion > 1', () => {
  const r = dayPoints({ habits: [H(1, 1.5)] });
  assert.equal(r.total, 100); assert.equal(r.overflow, 0);
});
test('exceder una meta compensa otro hábito sin cumplir', () => {
  // pesos 1,1: uno al 150 % y otro en 0 => raw 75
  assert.equal(dayPoints({ habits: [HM(1, 1.5), H(1, 0)] }).total, 75);
});
