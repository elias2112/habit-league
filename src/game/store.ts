// Tienda: disponibilidad, límite semanal, nivel mínimo y precio (porta reference/store.mjs v4.2).
// El precio de los artículos de un área de mal hábito depende de la respuesta privada de la persona (no / poco / mucho).
import { CONFIG, type AreaAnswer } from './config'

export interface StoreItem {
  id: string
  name: string
  kind: 'permit' | 'reward'
  price: number | null
  priceByWeight?: Record<string, number>
  weeklyLimit: number | null
  optIn?: boolean
  conflictsWith?: string[]
  perObjective?: boolean
  area?: string
  unlockLevel?: number
  groupOnly?: boolean
  registryOnly?: boolean
  priceSource?: string
}

/** answer: cuánto le pasa con esa área. Sin área o sin respuesta: precio base. «no» oculta o deja el precio base según el área. */
export function priceOf(item: Pick<StoreItem, 'price' | 'priceByWeight' | 'area'>, weight?: number, answer?: AreaAnswer | null): number | null | undefined {
  const base = item.priceByWeight ? item.priceByWeight[String(weight)] : item.price
  if (base == null || !item.area || !answer) return base
  if (answer === 'no') return CONFIG.areas[item.area]?.noProblem === 'base' ? base : null
  return base * CONFIG.areaPriceMultiplier[answer]
}

/** No se ofrece si choca con un objetivo (cigarro con 'dejar-fumar') o si el área no es un problema y está configurada para ocultarse. */
export const availableFor = (item: Pick<StoreItem, 'conflictsWith' | 'area'>, objectives: string[] = [], areaAnswers: Record<string, AreaAnswer> = {}) => {
  if ((item.conflictsWith ?? []).some((tag) => objectives.includes(tag))) return false
  if (item.area && areaAnswers[item.area] === 'no' && CONFIG.areas[item.area]?.noProblem === 'hide') return false
  return true
}

export type BuyReason = 'conflicto-objetivo' | 'nivel-insuficiente' | 'limite-semanal' | 'monedas-insuficientes'
export type BuyResult = { ok: true } | { ok: false; reason: BuyReason }

export function canBuy({ item, boughtThisWeek, wallet, objectives = [], weight, level = 0, areaAnswers = {} }: {
  item: StoreItem; boughtThisWeek: number; wallet: number; objectives?: string[]; weight?: number; level?: number; areaAnswers?: Record<string, AreaAnswer>
}): BuyResult {
  if (!availableFor(item, objectives, areaAnswers)) return { ok: false, reason: 'conflicto-objetivo' }
  if ((item.unlockLevel ?? 0) > level) return { ok: false, reason: 'nivel-insuficiente' }
  if (item.weeklyLimit != null && boughtThisWeek >= item.weeklyLimit) return { ok: false, reason: 'limite-semanal' }
  const price = priceOf(item, weight, item.area ? areaAnswers[item.area] : undefined)
  if (price == null || wallet < price) return { ok: false, reason: 'monedas-insuficientes' }   // billetera negativa también cae acá
  return { ok: true }
}

/** Solo un permiso cubre una recaída ese día. */
export const coversSlip = (item: Pick<StoreItem, 'kind'>) => item.kind === 'permit'

export const BUY_REASON: Record<string, string> = {
  'conflicto-objetivo': 'Choca con uno de tus objetivos',
  'nivel-insuficiente': 'Todavía no llegaste al nivel',
  'limite-semanal': 'Llegaste al límite de esta semana',
  'monedas-insuficientes': 'No te alcanzan las monedas',
}
