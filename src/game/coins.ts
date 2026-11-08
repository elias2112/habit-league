// "Jodita coin": monedas, multiplicador por racha y pool semanal (porta reference/coins.mjs).
import { CONFIG } from './config'
import { r2 } from './scoring'

/** Monedas por umbral del día (total ≤ 100). 100 da coinsAt100 en total, no se suma a las de 75. */
export const dailyThresholdCoins = (total: number) =>
  total >= CONFIG.coinThresholdHigh ? CONFIG.coinsAt100 : total >= CONFIG.coinThresholdLow ? CONFIG.coinsAt75 : 0

/** +streakStepBonus por cada streakStepDays de racha (rige desde el día siguiente). */
export const multiplierFor = (streakDays: number) =>
  r2(1 + CONFIG.streakStepBonus * Math.floor(streakDays / CONFIG.streakStepDays))

/** Una recaída sin permiso baja unpaidSlipStepsLost escalones de racha. */
export const dropOneStep = (streak: number) => Math.max(0, streak - CONFIG.streakStepDays * CONFIG.unpaidSlipStepsLost)

export interface DayCoins { multiplier: number; creditNow: number; toPool: number; streakAfter: number }

export function dayCoins({ total, overflow, streakBefore, unpaidSlip = false }: {
  total: number; overflow: number; streakBefore: number; unpaidSlip?: boolean
}): DayCoins {
  const m = multiplierFor(streakBefore)
  let streakAfter = total >= CONFIG.coinThresholdLow ? streakBefore + 1 : 0
  if (unpaidSlip) streakAfter = dropOneStep(streakAfter)
  return {
    multiplier: m,
    creditNow: r2(dailyThresholdCoins(total) * m),
    toPool: r2(overflow * CONFIG.overflowRate * m),
    streakAfter,
  }
}

export const weeklyPoolCoins = (days: { toPool: number }[]) => r2(days.reduce((s, d) => s + d.toPool, 0))
