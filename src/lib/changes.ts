// Propuestas de cambio (votación del grupo; rigen desde el día siguiente). Ver migración 006.
import { supabase } from './supabase'
import { WEIGHT_LABEL } from '../components/ui'

export type Scope = 'me' | 'group'
export type ChangeKind =
  | 'habit.add' | 'habit.remove' | 'habit.weight' | 'habit.target'
  | 'vice.add' | 'vice.remove' | 'vice.weight' | 'vice.severity'
  | 'objective.add' | 'objective.remove' | 'store.add' | 'store.update' | 'config.set'

export interface ChangeRequest {
  id: string; proposer_id: string; proposer: string; scope: Scope; kind: ChangeKind
  payload: Record<string, unknown>; private: boolean; status: 'pending' | 'approved' | 'rejected'
  yes: number; no: number; voters: number; my_vote: 'yes' | 'no' | null
  created_at: string; closes_at: string; decided_at: string | null
}

export const propose = (scope: Scope, kind: ChangeKind, payload: Record<string, unknown>) =>
  supabase.rpc('propose_change', { p_scope: scope, p_kind: kind, p_payload: payload })

/** Descripción legible de un cambio. */
export function describeChange(r: Pick<ChangeRequest, 'kind' | 'payload' | 'private' | 'scope'>): string {
  const p = r.payload as Record<string, string | number | boolean | null | undefined>
  const name = (p.name ?? p.title ?? p.habit_name ?? '') as string
  const who = r.scope === 'group' ? ' para todo el grupo' : ''
  if (r.private && !name) return `Cambio privado (peso ${p.weight ?? '—'})${who}`
  switch (r.kind) {
    case 'habit.add': return `Agregar hábito «${name || p.catalog_id}» con peso ${p.weight ?? 2}${who}`
    case 'habit.remove': return `Sacar el hábito «${name}»${who}`
    case 'habit.weight': return `Peso de «${name}» → ${p.weight} (${WEIGHT_LABEL[Number(p.weight)] ?? ''})${who}`
    case 'habit.target': return `Meta de «${name}» → ${p.target ?? 'sin meta'}${who}`
    case 'vice.add': return `Agregar vicio «${name}» (${p.severity}, peso ${p.weight ?? 1})${who}`
    case 'vice.remove': return `Sacar el vicio «${name}»${who}`
    case 'vice.weight': return `Peso del vicio «${name}» → ${p.weight}${who}`
    case 'vice.severity': return `Gravedad del vicio «${name}» → ${p.severity}${who}`
    case 'objective.add': return `Agregar objetivo «${name}»${who}`
    case 'objective.remove': return `Sacar el objetivo «${name}»${who}`
    case 'store.add': return `Tienda: agregar «${name}» a ${p.price} monedas`
    case 'store.update': return `Tienda: cambiar «${name}»${p.price != null ? ` a ${p.price} monedas` : ''}${p.weekly_limit !== undefined ? `, límite semanal ${p.weekly_limit ?? 'sin límite'}` : ''}`
    case 'config.set': return `Parámetro ${p.key} → ${JSON.stringify(p.value)}`
  }
}
