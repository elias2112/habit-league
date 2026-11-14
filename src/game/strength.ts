// Fuerza base (porta reference/strength.mjs): flexiones, sentadillas y dominadas para todos, según el nivel de
// entrenamiento declarado (0..3). Cada ejercicio es un hábito medible (hasta 150 %). Cifras: SUPUESTO en config.
import { CONFIG } from './config'

export const STRENGTH_EXERCISES = Object.keys(CONFIG.strengthTargets)

export function strengthPlan(trainingLevel?: number) {
  const max = CONFIG.strengthTargets[STRENGTH_EXERCISES[0]].length - 1
  const lvl = Number.isInteger(trainingLevel) && trainingLevel! >= 0 && trainingLevel! <= max ? trainingLevel! : CONFIG.strengthDefaultLevel
  return STRENGTH_EXERCISES.map((id) => ({ id, measurable: true, weight: CONFIG.strengthWeight, target: CONFIG.strengthTargets[id][lvl] }))
}

/** Cumplimiento del día: repeticiones / meta (el tope de 150 % lo aplica dayPoints). */
export const completionOf = (reps: number, target: number) => (target > 0 ? Math.max(0, reps) / target : 0)
