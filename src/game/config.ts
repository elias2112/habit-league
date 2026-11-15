// Configuración única del juego (content/config.json). Mismo formato plano que reference/config.mjs (v4.2).
import raw from '../../content/config.json'

export type Severity = 'leve' | 'normal' | 'grave'

export interface StrengthExercise { id: string; name: string; unit: string }
export const STRENGTH = raw.strength.exercises as StrengthExercise[]

export type AreaAnswer = 'no' | 'poco' | 'mucho'
export interface Rank { name: string; minPoints: number; reward: number }

export const CONFIG = {
  severity: raw.scoring.severity as Record<Severity, number>,
  multiplierFloor: raw.scoring.multiplierFloor,
  maxCompletion: raw.scoring.maxCompletion,
  ...raw.coins,
  ...raw.time,
  ...raw.rules,
  // Niveles: PROVISIONAL
  xpPerLevel: raw.levels.xpPerLevel,
  // Fuerza base (v4.2)
  strengthExercises: STRENGTH.map((e) => e.id),
  strengthWeight: raw.strength.weight,
  strengthTargetStep: raw.strength.targetStep,
  strengthTargetMax: raw.strength.targetMax,
  strengthLevelCapStep: raw.strength.levelCapStep,
  strengthLevelCapBonus: raw.strength.levelCapBonus,
  strengthRewardBase: raw.strength.rewardBase,
  strengthRewardDivisor: raw.strength.rewardDivisor,
  strengthEasyTarget: raw.strength.easyTarget,
  strengthEasyVariants: raw.strength.easyVariants as Record<string, string>,
  compound: raw.strength.compound,
  compoundMissRate: raw.strength.compoundMissRate,
  forgiveRatio: raw.strength.forgiveRatio,
  extraReps: raw.strength.extraReps,
  // Rangos por continuidad: PROVISIONAL
  rankPoints: raw.ranks.rankPoints,
  ranks: raw.ranks.list as Rank[],
  // Precios por área
  areaPriceMultiplier: raw.storeAreas.areaPriceMultiplier as Record<'poco' | 'mucho', number>,
  areas: raw.storeAreas.areas as Record<string, { noProblem: 'base' | 'hide' }>,
  // Ranking
  rankingCountsPersonalHabits: raw.ranking.rankingCountsPersonalHabits,
  personalHabitsGiveExp: raw.ranking.personalHabitsGiveExp,
  // Cofres de ahorro: PROVISIONAL
  chestMilestones: raw.chests.milestones as Record<string, number>,
  chestWeeklySafeBonus: raw.chests.weeklySafeBonus,
}

export interface Pillar { id: string; name: string; icon: string; color: string; provisional?: boolean }
export const PILLARS = raw.pillars as Pillar[]
export const pillarById = (id: string | null | undefined) => PILLARS.find((p) => p.id === id)
