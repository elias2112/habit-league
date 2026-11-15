// Experiencia y nivel (porta reference/levels.mjs v4.2). Nada se guarda: la experiencia es la suma de los totales
// personales de cada día más la experiencia de la fuerza base, menos la pagada por días fallados; mínimo 0.
// El nivel PUEDE bajar. Valores PROVISIONALES (content/config.json → levels).
import { CONFIG } from './config'
import { r2 } from './scoring'

export const xpOfDay = (total: number) => Math.max(0, total)

/** dailyTotals: total personal de cada día. bonus: exp de fuerza base; penalty: exp perdida por días fallados (positivo). */
export const totalXp = (dailyTotals: number[], { bonus = 0, penalty = 0 }: { bonus?: number; penalty?: number } = {}) =>
  Math.max(0, r2(dailyTotals.reduce((s, t) => s + xpOfDay(t), 0) + bonus - penalty))

/** Nivel 0 al empezar. */
export function levelFor(xp: number) {
  const per = CONFIG.xpPerLevel
  const level = Math.floor(xp / per)
  const xpIntoLevel = r2(xp - level * per)
  return { level, xpIntoLevel, xpForNext: per, progress: r2(xpIntoLevel / per) }
}
