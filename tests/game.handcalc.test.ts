// Casos calculados A MANO (no con el algoritmo): cada uno trae la cuenta en el comentario.
// Usan los valores por defecto de content/config.json (normal 0,9; grave 0,8; piso 0,70; meta hasta 150 %;
// 75 → 2 monedas, 100 → 4; +0,1 cada 7 días; excedente 0,1 moneda por punto).
import { describe, expect, it } from 'vitest'
import { cleanStreak, dayPoints } from '../src/game/scoring'
import { dayCoins } from '../src/game/coins'
import { canBuy } from '../src/game/store'
import { decide } from '../src/game/approval'

const H = (weight: number, completion: number, measurable = false) => ({ weight, completion, measurable })

describe('puntaje (a mano)', () => {
  it('pesos [2,1], cumplimiento [100 %, 50 %]: 100 × (2 + 0,5) / 3 = 83,33', () => {
    expect(dayPoints({ habits: [H(2, 1), H(1, 0.5)] }).total).toBe(83.33)
  })

  it('meta medible al 150 % en [1,1] con el otro hecho: 100 × (1,5 + 1) / 2 = 125 → total 100, excedente 25', () => {
    expect(dayPoints({ habits: [H(1, 1.5, true), H(1, 1)] })).toMatchObject({ total: 100, overflow: 25 })
  })

  it('lo mismo con una recaída normal: 100 × 0,9 = 90 y excedente 25 × 0,9 = 22,5', () => {
    const r = dayPoints({ habits: [H(1, 1.5, true), H(1, 1)], vices: [{ weight: 1, severity: 'normal', state: 'slipped' }] })
    expect(r).toMatchObject({ total: 90, overflow: 22.5, multiplier: 0.9 })
  })

  it('un hábito sí/no no pasa de 100 % aunque se cargue 2: [1,1] con c = 2 y 0 → 100 × 1 / 2 = 50', () => {
    expect(dayPoints({ habits: [H(1, 2), H(1, 0)] }).total).toBe(50)
  })

  it('vicio limpio de peso 2 con hábitos [1,1] y uno hecho: base 50 + 100 × 2 / (2 + 2) = 50 → 100', () => {
    expect(dayPoints({ habits: [H(1, 1), H(1, 0)], vices: [{ weight: 2, severity: 'normal', state: 'clean' }] }).total).toBe(100)
  })

  it('tres recaídas graves: 0,8³ = 0,512 → piso 0,70; día perfecto = 70', () => {
    const g = { weight: 1, severity: 'grave' as const, state: 'slipped' as const }
    expect(dayPoints({ habits: [H(1, 1)], vices: [g, g, g] }).total).toBe(70)
  })

  it('recaída leve cubierta por permiso no castiga: 100', () => {
    expect(dayPoints({ habits: [H(1, 1)], vices: [{ weight: 1, severity: 'leve', state: 'slipped', penalizing: false }] }).total).toBe(100)
  })

  it('"días sin": clean, clean, none, clean → 2 (el none corta)', () => {
    expect(cleanStreak(['clean', 'clean', 'none', 'clean'])).toBe(2)
    expect(cleanStreak(['slipped', 'clean'])).toBe(0)
  })
})

describe('monedas (a mano)', () => {
  it('racha previa 13, día de 80 puntos: x1,1 (13/7 = 1 escalón) → 2 × 1,1 = 2,2; racha pasa a 14', () => {
    expect(dayCoins({ total: 80, overflow: 0, streakBefore: 13 })).toMatchObject({ multiplier: 1.1, creditNow: 2.2, streakAfter: 14 })
  })

  it('racha previa 14, día de 100 con 10 de excedente: x1,2 → 4 × 1,2 = 4,8; pool 10 × 0,1 × 1,2 = 1,2', () => {
    expect(dayCoins({ total: 100, overflow: 10, streakBefore: 14 })).toMatchObject({ creditNow: 4.8, toPool: 1.2 })
  })

  it('8 días perfectos seguidos: 7 × 4 + 4 × 1,1 = 32,4', () => {
    let streak = 0
    let sum = 0
    for (let i = 0; i < 8; i++) {
      const c = dayCoins({ total: 100, overflow: 0, streakBefore: streak })
      sum += c.creditNow
      streak = c.streakAfter
    }
    expect(Math.round(sum * 100) / 100).toBe(32.4)
  })

  it('recaída sin permiso con racha previa 3 y día de 90: racha 4 − 7 → 0', () => {
    expect(dayCoins({ total: 90, overflow: 0, streakBefore: 3, unpaidSlip: true }).streakAfter).toBe(0)
  })

  it('día de 74,99: 0 monedas y la racha se corta', () => {
    expect(dayCoins({ total: 74.99, overflow: 0, streakBefore: 20 })).toMatchObject({ creditNow: 0, streakAfter: 0 })
  })
})

describe('tienda y votación (a mano)', () => {
  const cerveza = { id: 'cerveza', name: 'Una cerveza', kind: 'permit' as const, price: 5, weeklyLimit: 6 }
  it('cerveza: con 5 monedas y 5 compradas se puede; con 6 compradas no (límite), aunque haya 100 monedas', () => {
    expect(canBuy({ item: cerveza, boughtThisWeek: 5, wallet: 5 })).toEqual({ ok: true })
    expect(canBuy({ item: cerveza, boughtThisWeek: 6, wallet: 100 })).toEqual({ ok: false, reason: 'limite-semanal' })
    expect(canBuy({ item: cerveza, boughtThisWeek: 0, wallet: 4.99 })).toEqual({ ok: false, reason: 'monedas-insuficientes' })
  })

  it('grupo de 5 (4 votantes): 2 sí no alcanza (2 > 2 es falso); 2 no rechaza (2 ≥ 2); 3 sí aprueba', () => {
    const members = ['a', 'b', 'c', 'd', 'e']
    const d = (votes: Record<string, 'yes' | 'no'>) => decide({ proposer: 'a', members, votes, windowElapsed: false })
    expect(d({ b: 'yes', c: 'yes' })).toBe('pending')
    expect(d({ b: 'no', c: 'no' })).toBe('rejected')
    expect(d({ b: 'yes', c: 'yes', d: 'yes' })).toBe('approved')
  })
})
