// Rangos por continuidad (porta reference/ranks.mjs). +1 por día activo (>= 75), −2 por día sin actividad, mínimo 0.
// Cada rango da un premio único en monedas; si se pierde el rango se quita y al volver se recupera. Nada se guarda.
import { CONFIG, type Rank } from './config'

export const isActiveDay = (total: number) => total >= CONFIG.coinThresholdLow
export const activeDays = (dailyTotals: number[]) => dailyTotals.filter(isActiveDay).length

/** dailyTotals: total personal de cada día CERRADO, en orden. */
export function rankPoints(dailyTotals: number[]) {
  const { activeDay, missedDay, floor } = CONFIG.rankPoints
  return dailyTotals.reduce((p, t) => Math.max(floor, p + (isActiveDay(t) ? activeDay : missedDay)), 0)
}

const sorted = () => [...CONFIG.ranks].sort((a, b) => a.minPoints - b.minPoints)

export function rankFor(points: number): Rank & { next: Rank | null; missing: number } {
  const ranks = sorted()
  let i = 0
  ranks.forEach((r, k) => { if (points >= r.minPoints) i = k })
  const next = ranks[i + 1] ?? null
  return { ...ranks[i], next, missing: next ? next.minPoints - points : 0 }
}

/** Premios que la persona tiene ahora: los de todos los rangos que hoy alcanza. */
export const rankRewardsHeld = (points: number) =>
  sorted().filter((r) => points >= r.minPoints).reduce((s, r) => s + r.reward, 0)
