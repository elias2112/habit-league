// Algoritmo del quiz (docs/QUIZ_Y_PERFILES.md). Los datos salen de content/*.json.
// Es un juego para elegir un punto de partida, no un test psicológico.
import quizData from '../../content/quiz.json'
import archetypesData from '../../content/archetypes.json'
import habitsData from '../../content/habits.json'

export type AreaId = 'cuerpo' | 'mente' | 'sueno' | 'alimentacion' | 'foco' | 'social'
export type Axis = 'E' | 'M' | 'R'

export interface QuizOption { id: string; text: string; area?: string; value?: number; suggest?: string[]; vice?: string }
export interface QuizQuestion {
  id: string
  section: string
  type: 'single' | 'multi'
  text: string
  area?: string
  min?: number
  max?: number
  options: QuizOption[]
}
export interface Area { id: AreaId; name: string; desc: string }
export interface Archetype {
  id: string; name: string; tagline: string; desc: string
  strengths: string[]; watch: string[]
  start_habits: number; tier_adjust: number; code: string
}
export interface CatalogHabit {
  id: string; area: AreaId; name: string; criterion: string; tier: number
  target?: number; unit?: string
  /** false = no entra en el paquete automático (se ve en el catálogo). */
  auto?: boolean
  private_default?: boolean
}

export type Answers = Record<string, string | string[]>

export const QUESTIONS = quizData.questions as QuizQuestion[]
export const AREAS = quizData.areas as Area[]
export const ARCHETYPES = archetypesData.archetypes as Archetype[]
export const CATALOG = habitsData.habits as CatalogHabit[]
const THRESHOLD = quizData.axis_high_threshold

const AREA_IDS = AREAS.map((a) => a.id)
const SECTION_AXIS: Record<string, Axis> = { estructura: 'E', momentum: 'M', resiliencia: 'R' }

export const archetypeById = (id: string | null | undefined) => ARCHETYPES.find((a) => a.id === id)
export const catalogById = (id: string | null | undefined) => CATALOG.find((h) => h.id === id)
export const areaById = (id: string | null | undefined) => AREAS.find((a) => a.id === id)

export interface QuizResult {
  axes: Record<Axis, number>
  code: string
  archetype: string
  priority: Record<AreaId, number>
  level: Record<AreaId, number>
  areas: AreaId[]
  habits: string[]
}

const zeroAreas = () => Object.fromEntries(AREA_IDS.map((a) => [a, 0])) as Record<AreaId, number>
const asList = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v])

/** Dificultad máxima por nivel: 0–1 → 1, 2 → 2, 3 → 3. */
const levelTier = (level: number) => (level <= 1 ? 1 : level)

export function isAnswered(q: QuizQuestion, a: Answers): boolean {
  const sel = asList(a[q.id])
  if (q.type === 'multi') return sel.length >= (q.min ?? 1) && sel.length <= (q.max ?? q.options.length)
  return sel.length === 1
}

export function computeProfile(answers: Answers): QuizResult {
  const priority = zeroAreas()
  const level = zeroAreas()
  const axes: Record<Axis, number> = { E: 0, M: 0, R: 0 }

  for (const q of QUESTIONS) {
    const chosen = q.options.filter((o) => asList(answers[q.id]).includes(o.id))
    if (q.id === 'q1') for (const o of chosen) priority[o.area as AreaId] += 3
    else if (q.id === 'q2') for (const o of chosen) priority[o.area as AreaId] += 2
    else if (q.section === 'nivel' && q.area) level[q.area as AreaId] = chosen[0]?.value ?? 0
    else if (SECTION_AXIS[q.section]) axes[SECTION_AXIS[q.section]] += chosen[0]?.value ?? 0
  }

  const code = (['E', 'M', 'R'] as Axis[]).map((x) => (axes[x] >= THRESHOLD ? x : x.toLowerCase())).join('')
  const arch = ARCHETYPES.find((a) => a.code === code)!

  // Hasta 3 áreas con prioridad > 0: mayor prioridad primero; empate → menor nivel; luego orden del catálogo.
  const areas = AREA_IDS
    .filter((a) => priority[a] > 0)
    .sort((a, b) => priority[b] - priority[a] || level[a] - level[b] || AREA_IDS.indexOf(a) - AREA_IDS.indexOf(b))
    .slice(0, 3)

  // Por área: primero los hábitos permitidos (tier ≤ máx), de mayor a menor dificultad;
  // si se agotan, los más fáciles de los que superan el máximo.
  const queues = new Map<AreaId, CatalogHabit[]>()
  for (const area of areas) {
    const max = Math.min(3, Math.max(1, levelTier(level[area]) + arch.tier_adjust))
    const inArea = CATALOG.filter((h) => h.area === area && h.auto !== false)
    const allowed = inArea.filter((h) => h.tier <= max).sort((a, b) => b.tier - a.tier)
    const above = inArea.filter((h) => h.tier > max).sort((a, b) => a.tier - b.tier)
    queues.set(area, [...allowed, ...above])
  }

  const habits: string[] = []
  const total = Math.min(arch.start_habits, areas.reduce((n, a) => n + queues.get(a)!.length, 0))
  for (let i = 0; habits.length < total; i++) {
    const next = queues.get(areas[i % areas.length])!.shift()
    if (next) habits.push(next.id)
  }

  return { axes, code, archetype: arch.id, priority, level, areas, habits }
}

/** Hábitos que sugieren las preguntas directas (q21–q24), sin repetir y en orden. */
export function directSuggestions(answers: Answers): string[] {
  const out: string[] = []
  for (const q of QUESTIONS.filter((x) => x.section === 'directas')) {
    const o = q.options.find((x) => asList(answers[q.id]).includes(x.id))
    for (const id of o?.suggest ?? []) if (!out.includes(id) && catalogById(id)) out.push(id)
  }
  return out
}

/** Vicios que sugieren declarar las preguntas directas (ej. fumar todos los días sin querer dejar). */
export function directVices(answers: Answers): string[] {
  const out: string[] = []
  for (const q of QUESTIONS.filter((x) => x.section === 'directas')) {
    const o = q.options.find((x) => asList(answers[q.id]).includes(x.id))
    if (o?.vice && !out.includes(o.vice)) out.push(o.vice)
  }
  return out
}

/** Puntos que vale cada hábito hoy: 100 × tier / suma de tiers activos (misma regla que la base). */
export function pointsFor(tier: number, activeTiers: number[]): number {
  const sum = activeTiers.reduce((a, b) => a + b, 0)
  return sum ? Math.round((10000 * tier) / sum) / 100 : 0
}

export const TIER_LABEL: Record<number, string> = { 1: 'Fácil', 2: 'Media', 3: 'Difícil', 4: 'Muy difícil' }
export const MIN_ACTIVE_HABITS = 3
