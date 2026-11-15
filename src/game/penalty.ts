// Día de fuerza base fallado (porta reference/penalty.mjs): la persona elige cómo saldarlo.
// 'extra': 20 repeticiones más del ejercicio fallado (sistema de honor). 'pay': pierde las monedas y la experiencia de ese día.
import { CONFIG } from './config'

export type SettleChoice = 'extra' | 'pay'

export function settle(day: { missedCoins: number; missedExp: number }, choice?: SettleChoice | null) {
  if (choice === 'extra') return { settled: true, extraReps: CONFIG.extraReps, coinsDelta: 0, expDelta: 0 }
  if (choice === 'pay') return { settled: true, extraReps: 0, coinsDelta: -day.missedCoins, expDelta: -day.missedExp }
  return { settled: false, extraReps: 0, coinsDelta: 0, expDelta: 0 }
}

/** Mientras haya días fallados sin saldar, no se otorgan recompensas de fuerza base. */
export const rewardsBlocked = (pendingMissedDays: number) => pendingMissedDays > 0
