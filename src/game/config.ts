// Configuración única del juego (content/config.json). Mismo formato plano que reference/config.mjs.
import raw from '../../content/config.json'

export type Severity = 'leve' | 'normal' | 'grave'

export interface StrengthExercise { id: string; name: string; unit: string; targets: number[] }
export const STRENGTH = raw.strength.exercises as StrengthExercise[]

export const CONFIG = {
  severity: raw.scoring.severity as Record<Severity, number>,
  multiplierFloor: raw.scoring.multiplierFloor,
  maxCompletion: raw.scoring.maxCompletion,
  ...raw.coins,
  ...raw.time,
  ...raw.rules,
  // Niveles y fuerza base: PROVISIONALES (spec v4 §2.10–2.11)
  xpPerLevel: raw.levels.xpPerLevel,
  strengthTargets: Object.fromEntries(STRENGTH.map((e) => [e.id, e.targets])) as Record<string, number[]>,
  strengthWeight: raw.strength.weight,
  strengthDefaultLevel: raw.strength.defaultLevel,
}

export interface Pillar { id: string; name: string; icon: string; color: string; provisional?: boolean }
export const PILLARS = raw.pillars as Pillar[]
export const pillarById = (id: string | null | undefined) => PILLARS.find((p) => p.id === id)
