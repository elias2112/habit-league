// Objetivos: plantillas en content/goals.json. Arma un hábito diario a partir de la meta y la fecha.
import goalsData from '../../content/goals.json'
import type { AreaId } from './quiz'

export type GoalKind = 'ahorro' | 'lectura' | 'escritura' | 'general'

export interface GoalTemplate {
  id: GoalKind
  name: string
  example: string
  keywords: string[]
  amount_label: string
  default_amount: number
  per_item?: number
  per_item_label?: string
  unit: string
  area: AreaId
  habit: string
  criterion: string
  counter: boolean
  /** Umbrales de cantidad diaria para pasar a dificultad 2 y 3. */
  tiers?: [number, number]
}

export const GOAL_KINDS = goalsData.kinds as GoalTemplate[]
export const goalKind = (id: string) => GOAL_KINDS.find((k) => k.id === id) ?? GOAL_KINDS[GOAL_KINDS.length - 1]

const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Tipo de objetivo según palabras clave del título. "escribir un libro" gana sobre "libro". */
export function detectKind(title: string): GoalKind {
  const words = new Set(normalize(title).split(/[^a-z0-9ñ]+/).filter(Boolean))
  const score = (k: GoalTemplate) => k.keywords.filter((w) => words.has(normalize(w))).length
  const verbs: Record<string, GoalKind> = { escribir: 'escritura', leer: 'lectura', ahorrar: 'ahorro', comprar: 'ahorro' }
  for (const [v, kind] of Object.entries(verbs)) if (words.has(v)) return kind
  const best = GOAL_KINDS.map((k) => ({ k, s: score(k) })).sort((a, b) => b.s - a.s)[0]
  return best && best.s > 0 ? best.k.id : 'general'
}

export interface GoalPlan {
  target: number          // meta total en la unidad del objetivo
  unit: string
  days: number            // días hasta la fecha (incluye hoy)
  daily: number           // cantidad por día
  habit: { name: string; criterion: string; area: AreaId; tier: number; target: number; unit: string | null; goal_step: number }
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000) + 1
}

/**
 * Plan diario. amount = monto, libros, palabras o sesiones; perItem = páginas por libro (lectura).
 * Sin fecha: ahorro/lectura/escritura usan 30 días; general = 1 sesión por día.
 */
export function planGoal(kind: GoalKind, title: string, amount: number, today: string, deadline?: string | null, perItem?: number): GoalPlan {
  const t = goalKind(kind)
  const target = kind === 'lectura' ? amount * (perItem || t.per_item || 250) : amount
  const days = Math.max(1, deadline ? daysBetween(today, deadline) : kind === 'general' ? Math.ceil(amount) : 30)
  const daily = Math.max(1, Math.ceil(target / days))
  const fill = (s: string) => s.replaceAll('{daily}', daily.toLocaleString('es-ES')).replaceAll('{unit}', t.unit).replaceAll('{title}', title.trim())
  const tier = t.tiers ? (daily <= t.tiers[0] ? 1 : daily <= t.tiers[1] ? 2 : 3) : 2
  return {
    target,
    unit: t.unit,
    days,
    daily,
    habit: {
      name: fill(t.habit).slice(0, 60),
      criterion: fill(t.criterion),
      area: t.area,
      tier,
      target: t.counter ? daily : 1,
      unit: t.counter ? t.unit : null,
      // Cada check suma "daily" (ahorro) o cada unidad suma 1 (páginas, palabras) o 1 sesión.
      goal_step: t.counter ? 1 : kind === 'ahorro' ? daily : 1,
    },
  }
}
