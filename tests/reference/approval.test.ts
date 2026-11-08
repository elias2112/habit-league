// @ts-nocheck — copia literal de modifications/reference/*.test.mjs (fuente de verdad del dueño); solo cambian los imports.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { decide } from '../../src/game/approval';
import { snapshotFor, planForDay, nextDay } from '../../src/game/approval';

const M = ['ana', 'beto', 'carla', 'dani'];
const d = (votes, windowElapsed = false, members = M) => decide({ proposer: 'ana', members, votes, windowElapsed });

test('mayoría a favor aprueba (2 de 3 votantes)', () => assert.equal(d({ beto: 'yes', carla: 'yes' }), 'approved'));
test('1 a favor de 3 votantes sigue pendiente', () => assert.equal(d({ beto: 'yes' }), 'pending'));
test('mayoría en contra rechaza', () => assert.equal(d({ beto: 'no', carla: 'no' }), 'rejected'));
test('el proponente no vota su propio cambio', () => assert.equal(d({ ana: 'yes' }), 'pending'));
test('1 a favor y 1 en contra de 3 votantes: todavía no hay mayoría, sigue pendiente', () =>
  assert.equal(d({ beto: 'yes', carla: 'no' }), 'pending'));
test('grupo de 2: decide la otra persona', () => {
  assert.equal(decide({ proposer: 'ana', members: ['ana','beto'], votes: { beto: 'yes' }, windowElapsed: false }), 'approved');
  assert.equal(decide({ proposer: 'ana', members: ['ana','beto'], votes: { beto: 'no' }, windowElapsed: false }), 'rejected');
});
test('sin votos y ventana vencida: se aprueba solo', () => assert.equal(d({}, true), 'approved'));
test('sin votos y ventana abierta: pendiente', () => assert.equal(d({}, false), 'pending'));
test('ventana vencida con votos parciales: gana la mayoría de los emitidos', () => {
  assert.equal(d({ beto: 'yes' }, true), 'approved');
  assert.equal(d({ beto: 'yes', carla: 'no' }, true), 'rejected');   // empate de emitidos rechaza
});
test('grupo de una persona aprueba', () =>
  assert.equal(decide({ proposer: 'ana', members: ['ana'], votes: {}, windowElapsed: false }), 'approved'));

test('un cambio aprobado el día D rige desde D+1 y no reescribe días pasados', () => {
  const v1 = { effectiveFrom: '2026-11-01', plan: { pesos: [1, 1, 3] } };
  const v2 = snapshotFor('2026-11-10', { pesos: [3, 3, 1] });
  assert.equal(v2.effectiveFrom, '2026-11-11');
  const snaps = [v1, v2];
  assert.deepEqual(planForDay(snaps, '2026-11-10'), { pesos: [1, 1, 3] });
  assert.deepEqual(planForDay(snaps, '2026-11-11'), { pesos: [3, 3, 1] });
  assert.deepEqual(planForDay(snaps, '2026-11-05'), { pesos: [1, 1, 3] });
  assert.equal(planForDay(snaps, '2026-10-31'), undefined);
});
test('nextDay cruza fin de mes y de año', () => {
  assert.equal(nextDay('2026-11-30'), '2026-12-01');
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
});
