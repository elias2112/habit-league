// Fuerza base (porta reference/strength.mjs v4.2): flexiones, sentadillas y plancha (segundos). La persona elige su meta
// con botones de a 10 hasta el tope (100, +10 cada 10 niveles). Para quien no llega a 10, variante fácil.
// Cada ejercicio es un hábito medible (tope 150 %) con peso CONFIG.strengthWeight.
import { CONFIG } from './config'

export const STRENGTH_EXERCISES = CONFIG.strengthExercises

/** Tope de la meta según el nivel: 100 hasta el nivel 9, 110 desde el 10, 120 desde el 20... */
export const maxTargetFor = (level: number) =>
  CONFIG.strengthTargetMax + CONFIG.strengthLevelCapBonus * Math.floor(Math.max(0, level) / CONFIG.strengthLevelCapStep)

/** Botones disponibles: 10, 20, ..., tope */
export function targetOptions(level = 0) {
  const out: number[] = []
  for (let t = CONFIG.strengthTargetStep; t <= maxTargetFor(level); t += CONFIG.strengthTargetStep) out.push(t)
  return out
}

/** Sugerencia: un escalón por encima de lo que la persona dice que puede hacer por día (sin pasar el tope). */
export function suggestTarget(canDo: number, level = 0) {
  const step = CONFIG.strengthTargetStep, max = maxTargetFor(level)
  const down = Math.floor(Math.max(0, canDo) / step) * step
  return Math.min(max, Math.max(step, down + step))
}

/** ¿Llega a la meta mínima? Si no, se ofrece la variante fácil. */
export const needsEasyVariant = (canDo: number) => canDo < CONFIG.strengthTargetStep

/** Factor de recompensa: 0,5 + meta/100, con la meta promediada entre los ejercicios. */
export function rewardFactor(targets: Record<string, number>) {
  const vals = Object.values(targets)
  const mean = vals.reduce((s, t) => s + t, 0) / vals.length
  return Math.round((CONFIG.strengthRewardBase + mean / CONFIG.strengthRewardDivisor) * 1000) / 1000
}

export function strengthPlan(targets: Record<string, number>, { easy = false }: { easy?: boolean } = {}) {
  return STRENGTH_EXERCISES.map((id) => ({
    id: easy ? CONFIG.strengthEasyVariants[id] : id, base: id, easy, measurable: true, weight: CONFIG.strengthWeight,
    target: easy ? CONFIG.strengthEasyTarget : (targets[id] ?? CONFIG.strengthTargetStep),
  }))
}

/** Cumplimiento del día: repeticiones / meta (el tope de 150 % lo aplica dayPoints). */
export const completionOf = (reps: number, target: number) => (target > 0 ? Math.max(0, reps) / target : 0)

/** Ratio del día para la cadena: el PEOR de los ejercicios (cada uno con tope 1). */
export const dayRatio = (repsByExercise: Record<string, number>, targets: Record<string, number>) =>
  Math.min(...Object.keys(targets).map((id) => Math.min(1, completionOf(repsByExercise[id] ?? 0, targets[id]))))
