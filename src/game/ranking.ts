// Dos totales por día (porta reference/ranking.mjs): RANKING (sin «solo yo») y PERSONAL (todo; de ahí salen
// monedas, experiencia, nivel y rango). Cada hábito/vicio lleva scope: 'plan-inicial' | 'grupo' | 'solo-yo'.
import { dayPoints, type HabitInput, type ViceInput } from './scoring'
import { CONFIG } from './config'

export type Scope = 'plan-inicial' | 'grupo' | 'solo-yo'

export const countsForRanking = (item: { scope?: Scope }) => CONFIG.rankingCountsPersonalHabits || item.scope !== 'solo-yo'

export function dayTotals({ habits, vices = [] }: { habits: (HabitInput & { scope?: Scope })[]; vices?: (ViceInput & { scope?: Scope })[] }) {
  return {
    ranking: dayPoints({ habits: habits.filter(countsForRanking), vices: vices.filter(countsForRanking) }),
    personal: dayPoints({ habits, vices }),
  }
}

/** Aviso al agregar un hábito o vicio «solo yo» (spec §3). */
export const personalHabitNotice = (groupName: string) =>
  `Este hábito no estaba cuando empezaste en ${groupName}. Si lo aprobás solo para vos, no contará en el ranking, solo en tus monedas y tu experiencia.`
