// Tienda: disponibilidad, límite semanal y precio (porta reference/store.mjs).
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
  priceSource?: string
}

export const priceOf = (item: StoreItem, weight?: number) =>
  item.priceByWeight ? item.priceByWeight[String(weight)] : item.price

/** No se ofrece si choca con un objetivo de la persona (ej. cigarro con 'dejar-fumar'). */
export const availableFor = (item: StoreItem, objectives: string[] = []) =>
  !(item.conflictsWith ?? []).some((tag) => objectives.includes(tag))

export type BuyResult = { ok: true } | { ok: false; reason: 'conflicto-objetivo' | 'limite-semanal' | 'monedas-insuficientes' }

export function canBuy({ item, boughtThisWeek, wallet, objectives = [], weight }: {
  item: StoreItem; boughtThisWeek: number; wallet: number; objectives?: string[]; weight?: number
}): BuyResult {
  if (!availableFor(item, objectives)) return { ok: false, reason: 'conflicto-objetivo' }
  if (item.weeklyLimit != null && boughtThisWeek >= item.weeklyLimit) return { ok: false, reason: 'limite-semanal' }
  if (wallet < (priceOf(item, weight) ?? Infinity)) return { ok: false, reason: 'monedas-insuficientes' }
  return { ok: true }
}

/** Solo un permiso cubre una recaída ese día. */
export const coversSlip = (item: Pick<StoreItem, 'kind'>) => item.kind === 'permit'

export const BUY_REASON: Record<string, string> = {
  'conflicto-objetivo': 'Choca con uno de tus objetivos',
  'limite-semanal': 'Llegaste al límite de esta semana',
  'monedas-insuficientes': 'No te alcanzan las monedas',
}
