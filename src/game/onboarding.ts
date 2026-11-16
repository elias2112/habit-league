// Pasos del cuestionario (porta reference/onboarding.mjs). Solo la lógica; los textos están en content/onboarding.json.
import { CONFIG } from './config'

export interface OnboardingState {
  hasClearGoal?: boolean
  area?: string
  friction?: string
  goals: string[]
  personalized: string[]
  /** metas elegidas por ejercicio (y si es variante fácil) o rechazo */
  strength?: { targets: Record<string, number>; easy?: boolean; exercises?: string[] } | 'declined'
}
export type Step =
  | { step: 'clear-goal' } | { step: 'pick-goals' } | { step: 'area' } | { step: 'friction' } | { step: 'suggest' }
  | { step: 'personalize'; goal: string } | { step: 'strength-base' } | { step: 'done' }

export function nextStep(s: OnboardingState): Step {
  if (s.hasClearGoal === undefined) return { step: 'clear-goal' }
  if (s.goals.length === 0) {
    if (s.hasClearGoal) return { step: 'pick-goals' }
    if (!s.area) return { step: 'area' }
    if (!s.friction) return { step: 'friction' }
    return { step: 'suggest' }
  }
  const pending = s.goals.find((g) => !s.personalized.includes(g))
  if (pending) return { step: 'personalize', goal: pending }
  if (s.strength === undefined) return { step: 'strength-base' }
  return { step: 'done' }
}

export function addGoal(goals: string[], goal: string): string[] {
  if (goals.includes(goal)) return goals
  if (goals.length >= CONFIG.maxGoals) throw new Error(`máximo ${CONFIG.maxGoals} objetivos`)
  return [...goals, goal]
}
