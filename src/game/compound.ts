// Fuerza base como compromiso semanal con recompensa compuesta, Variante A (porta reference/compound.mjs).
// Monedas 1, 2, 4, 8 (tope desde el día 4); experiencia 5, 10, 20, 40. La cadena vuelve a empezar cada semana.
// Cumplido con ratio >= 1; perdonado con forgiveRatio <= ratio < 1 (recompensa proporcional); menos = no hecho.
import { CONFIG } from './config'
import { r2 } from './scoring'

export type DayStatus = 'done' | 'forgiven' | 'missed'
export interface ChainDay { day: number; status: DayStatus; chain: number; coins: number; exp: number; missedCoins?: number; missedExp?: number }

export const compoundDay = (n: number) => {
  const k = Math.min(n, CONFIG.compound.capDay) - 1
  return { n, coins: r2(CONFIG.compound.baseCoins * CONFIG.compound.factor ** k), exp: r2(CONFIG.compound.baseExp * CONFIG.compound.factor ** k) }
}

export function dayStatus(ratio: number | boolean): { status: DayStatus; ratio: number } {
  const r = ratio === true ? 1 : ratio === false ? 0 : ratio
  if (r >= 1) return { status: 'done', ratio: 1 }
  if (r >= CONFIG.forgiveRatio) return { status: 'forgiven', ratio: r }
  return { status: 'missed', ratio: Math.max(0, r) }
}

/** week: ratio de cada día YA CERRADO (índice 0 = primer día de la semana). */
export function weekChain(week: (number | boolean)[], { rewardFactor = 1 }: { rewardFactor?: number } = {}): ChainDay[] {
  let chain = 0
  return week.map((x, day) => {
    const { status, ratio } = dayStatus(x)
    if (status !== 'missed') {
      chain += 1
      const d = compoundDay(chain)
      const f = rewardFactor * (status === 'forgiven' ? ratio : 1)
      return { day, status, chain, coins: r2(d.coins * f), exp: r2(d.exp * f) }
    }
    const lost = compoundDay(chain + 1)
    chain = 0
    return { day, status, chain: 0, coins: 0, exp: 0,
      missedCoins: r2(lost.coins * rewardFactor * CONFIG.compoundMissRate), missedExp: r2(lost.exp * rewardFactor * CONFIG.compoundMissRate) }
  })
}

export const weekTotals = (days: ChainDay[]) => ({
  coins: r2(days.reduce((s, d) => s + d.coins, 0)),
  exp: r2(days.reduce((s, d) => s + d.exp, 0)),
  missedCoins: r2(days.reduce((s, d) => s + (d.missedCoins ?? 0), 0)),
  missedExp: r2(days.reduce((s, d) => s + (d.missedExp ?? 0), 0)),
})
