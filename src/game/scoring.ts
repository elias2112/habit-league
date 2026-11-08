// Puntaje diario (porta reference/scoring.mjs). Puro: el resultado depende solo del estado actual.
import { CONFIG, type Severity } from './config'

export type ViceState = 'none' | 'clean' | 'slipped'
export interface HabitInput { weight: number; completion: number; measurable?: boolean }
export interface ViceInput { weight: number; severity: Severity; state: ViceState; penalizing?: boolean }
export interface DayScore { base: number; bonus: number; multiplier: number; total: number; overflow: number }

export const SEVERITY = CONFIG.severity
export const MULTIPLIER_FLOOR = CONFIG.multiplierFloor

const clampTo = (x: number, max: number) => Math.min(max, Math.max(0, x))
export const r2 = (x: number) => Math.round(x * 100) / 100

export function dayPoints({ habits, vices = [] }: { habits: HabitInput[]; vices?: ViceInput[] }): DayScore {
  const W = habits.reduce((s, h) => s + h.weight, 0)
  const Wv = vices.reduce((s, v) => s + v.weight, 0)

  const base = W === 0 ? 0
    : (100 * habits.reduce((s, h) => s + h.weight * clampTo(h.completion, h.measurable ? CONFIG.maxCompletion : 1), 0)) / W

  // Bono: cada vicio "no lo hice" aporta 100*w/(W+Wv).
  const bonus = W + Wv === 0 ? 0
    : vices.filter((v) => v.state === 'clean').reduce((s, v) => s + (100 * v.weight) / (W + Wv), 0)

  // Multiplicador: siempre desde el estado actual; nunca acumulado.
  let multiplier = vices
    .filter((v) => v.state === 'slipped' && v.penalizing !== false)
    .reduce((m, v) => m * SEVERITY[v.severity], 1)
  multiplier = Math.max(MULTIPLIER_FLOOR, multiplier)

  const raw = base + bonus
  const total = Math.min(100, raw) * multiplier
  const overflow = Math.max(0, raw - 100) * multiplier
  return { base: r2(base), bonus: r2(bonus), multiplier: r2(multiplier), total: r2(total), overflow: r2(overflow) }
}

/** Pool semanal: suma del excedente de los días de la semana. */
export const weeklyPool = (days: { overflow: number }[]) => r2(days.reduce((s, d) => s + d.overflow, 0))

/** Con cupo semanal A, una recaída solo castiga si las de la semana superan A (hoy: los permisos reemplazan el cupo). */
export const slipPenalizes = (slipsThisWeekIncludingToday: number, weeklyAllowance = 0) => slipsThisWeekIncludingToday > weeklyAllowance

/** "Días sin" de un vicio: cuenta hacia atrás desde el día indicado solo con 'clean' explícitos. */
export function cleanStreak(statesNewestFirst: ViceState[]): number {
  let n = 0
  for (const s of statesNewestFirst) {
    if (s !== 'clean') break
    n++
  }
  return n
}
