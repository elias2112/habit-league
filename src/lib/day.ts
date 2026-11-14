// Estado del día (RPC my_day, migración 006): plan vigente, registros, vicios, puntaje y billetera.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage } from './errors'
import type { ViceState } from '../game/scoring'
import type { Severity } from '../game/config'

export interface DayHabit {
  id: string; name: string; criterion: string | null; pillar: string | null; catalog_id: string | null; unit: string | null
  private: boolean; weight: number; target: number | null; count: number; photo_path: string | null
  block: 'general' | 'objetivo' | 'deporte' | 'fuerza'; strength_id: string | null; objective_id: string | null
}
export interface Level { xp: number; level: number; xpIntoLevel: number; xpForNext: number; progress: number }
export interface DayVice { id: string; name: string; weight: number; severity: Severity; state: ViceState; covered: boolean; clean_days: number }
export interface Wallet { balance: number; pool_this_week: number; today_credit: number; today_multiplier: number; streak: number }
export interface MyDay {
  day: string
  has_plan: boolean
  score: { base: number; bonus: number; multiplier: number; total: number; overflow: number }
  wallet: Wallet
  habits: DayHabit[]
  vices: DayVice[]
  objectives: { id: string; title: string; tag: string | null; goal_id: string | null }[]
  tomorrow_changes: boolean
  training_level: number | null
  level: Level
  notices: { id: string; text: string }[]
}

const n = (x: unknown) => Number(x ?? 0)

export function useMyDay() {
  const [day, setDay] = useState<MyDay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_day')
    if (error) { setError(errorMessage(error)); return }
    const d = data as MyDay
    d.score = Object.fromEntries(Object.entries(d.score).map(([k, v]) => [k, n(v)])) as MyDay['score']
    d.wallet = Object.fromEntries(Object.entries(d.wallet).map(([k, v]) => [k, n(v)])) as unknown as Wallet
    d.level = Object.fromEntries(Object.entries(d.level ?? {}).map(([k, v]) => [k, n(v)])) as unknown as Level
    d.habits = d.habits.map((h) => ({ ...h, target: h.target == null ? null : n(h.target), count: n(h.count) }))
    setDay(d)
    setError(null)
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { day, error, reload }
}

/** Cumplimiento de un hábito (como la base): sí/no = 0 o 1; con meta, cantidad / meta (la base acota a 150 %). */
export const completionOf = (h: Pick<DayHabit, 'target' | 'count'>) =>
  h.target == null ? (h.count >= 1 ? 1 : 0) : h.count / h.target

export const fmtCoins = (x: number) => x.toLocaleString('es-ES', { maximumFractionDigits: 2 })
