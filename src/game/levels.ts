// Experiencia y nivel (porta reference/levels.mjs). Nada se guarda: la experiencia es la suma de los puntos
// diarios ya recalculados y el nivel se deriva. Valores PROVISIONALES (content/config.json → levels).
import { CONFIG } from './config'
import { r2 } from './scoring'

export const xpOfDay = (total: number) => Math.max(0, total)

/** dailyTotals: total de cada día (salida de dayPoints().total). */
export const totalXp = (dailyTotals: number[]) => r2(dailyTotals.reduce((s, t) => s + xpOfDay(t), 0))

/** Nivel 0 al empezar. Como la experiencia solo suma, el nivel no baja. */
export function levelFor(xp: number) {
  const per = CONFIG.xpPerLevel
  const level = Math.floor(xp / per)
  const xpIntoLevel = r2(xp - level * per)
  return { level, xpIntoLevel, xpForNext: per, progress: r2(xpIntoLevel / per) }
}
