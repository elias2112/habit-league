// Cuestionario v4: textos (content/onboarding.json, BORRADOR) y armado del plan inicial a partir de las respuestas.
// Los cálculos de cada objetivo reutilizan las plantillas de content/goals.json (planGoal), sin fórmulas nuevas.
import content from '../../content/onboarding.json'
import { planGoal, type GoalKind } from './goals'
import { CATALOG, catalogById } from './quiz'
import { catalogPillar } from '../components/CatalogPicker'

export interface ObjectiveQuestion { id: string; type: 'text' | 'number' | 'date' | 'pillar'; text: string; unit?: string; placeholder?: string; default?: number; optional?: boolean }
export interface ObjectiveDef {
  id: string; name: string; example: string; pillar: string | null; tag: string | null; template: string
  questions: ObjectiveQuestion[]; habits?: string[]; vice?: { name: string; suggestion_id: string; severity: string }
}
export const ONB = content
export const OBJECTIVES = content.objectives as ObjectiveDef[]
export const objectiveDef = (id: string) => OBJECTIVES.find((o) => o.id === id)!

export type Answers = Record<string, string | number | undefined>

export interface DraftHabit {
  key: string
  name: string
  criterion?: string | null
  pillar: string | null
  catalog_id?: string
  unit?: string | null
  target?: number | null
  weight: number
  block: 'general' | 'objetivo' | 'deporte'
  objective_index?: number
  goal_step?: number
  private?: boolean
}
export interface DraftObjective {
  title: string; catalog_id: string; tag: string | null; pillar: string | null; unit: string | null
  target_value: number | null; start_value: number | null; deadline: string | null
  chest?: { title: string; target: number; deadline: string | null }
}

const num = (v: unknown) => (v === undefined || v === '' || v === null ? undefined : Number(v))
const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v))

/** Convierte las respuestas de personalización de un objetivo en el objetivo + sus hábitos medibles. */
export function buildObjective(def: ObjectiveDef, a: Answers, index: number, today: string): { objective: DraftObjective; habits: DraftHabit[]; vice?: ObjectiveDef['vice'] } {
  const deadline = str(a.deadline) ?? null
  const start = num(a.start)
  const base = { catalog_id: def.id, tag: def.tag, deadline, start_value: start ?? null }

  if (def.template === 'dejar-fumar') {
    return {
      objective: { ...base, title: def.name, pillar: def.pillar, unit: 'por día', target_value: 0 },
      habits: (def.habits ?? []).map((id) => {
        const c = catalogById(id)!
        return { key: `o${index}-${id}`, name: c.name, catalog_id: id, pillar: catalogPillar(c.area), weight: Math.min(3, c.tier), block: 'objetivo' as const, objective_index: index, private: Boolean(c.private_default) }
      }),
      vice: def.vice,
    }
  }

  if (def.template === 'general') {
    const title = str(a.title) ?? def.example
    const unit = str(a.unit)
    const daily = num(a.daily)
    const pillar = str(a.pillar) ?? 'habilidades'
    const p = planGoal('general', title, 30, today, deadline)
    return {
      objective: { ...base, title, pillar, unit: unit ?? null, target_value: null, start_value: null },
      habits: [{ key: `o${index}`, name: p.habit.name, criterion: p.habit.criterion, pillar, unit: unit && daily ? unit : null,
        target: unit && daily ? daily : null, weight: 2, block: 'objetivo', objective_index: index }],
    }
  }

  // ahorro, lectura, escritura: misma cuenta que la plantilla (meta y fecha → cantidad diaria)
  const kind = def.template as GoalKind
  const title = kind === 'ahorro' ? (str(a.title) ?? def.example) : def.name
  let amount = num(a.amount) ?? num(a.target) ?? 0
  if (kind === 'ahorro') amount = Math.max(1, amount - (start ?? 0)) // lo que falta juntar
  const p = planGoal(kind, title, amount, today, deadline, num(a.perItem))
  const habit: DraftHabit = {
    key: `o${index}`, name: p.habit.name, criterion: p.habit.criterion, pillar: def.pillar, unit: p.habit.unit,
    target: p.habit.target > 1 ? p.habit.target : null, weight: Math.min(3, p.habit.tier), block: 'objetivo',
    objective_index: index, goal_step: p.habit.goal_step,
  }
  return {
    objective: { ...base, title, pillar: def.pillar, unit: p.unit, target_value: p.target,
      ...(kind === 'ahorro' ? { chest: { title, target: amount, deadline } } : {}) },
    habits: [habit],
  }
}

/**
 * Hábitos generales sugeridos (PROPUESTA): fáciles de Cuerpo y Mente del catálogo automático,
 * alternando pilares, hasta `count`. La persona los quita o agrega.
 */
export function suggestGeneral(count: number, exclude: Set<string>): DraftHabit[] {
  const pools = ['cuerpo', 'mente'].map((p) => CATALOG.filter((h) => h.auto !== false && h.tier === 1 && catalogPillar(h.area) === p && !exclude.has(h.id)))
  const out: DraftHabit[] = []
  for (let i = 0; out.length < count && (pools[0].length || pools[1].length); i++) {
    const h = pools[i % 2].shift()
    if (h) out.push({ key: `g-${h.id}`, name: h.name, catalog_id: h.id, pillar: catalogPillar(h.area), weight: 1, block: 'general' })
  }
  return out
}
