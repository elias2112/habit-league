// Estado del día (RPC my_day, migración 007): plan vigente, registros, vicios, puntajes (personal y ranking),
// nivel, rango, billetera y fuerza base. Todo lo calcula la base.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { errorMessage } from './errors'
import type { ViceState } from '../game/scoring'
import type { Severity } from '../game/config'
import type { Scope } from '../game/ranking'

export interface DayHabit {
  id: string; name: string; criterion: string | null; pillar: string | null; catalog_id: string | null; unit: string | null
  private: boolean; weight: number; target: number | null; count: number; photo_path: string | null; scope: Scope
  block: 'general' | 'objetivo' | 'deporte' | 'fuerza'; strength_id: string | null; objective_id: string | null
}
export interface Level { xp: number; level: number; xpIntoLevel: number; xpForNext: number; progress: number }
export interface Rank { points: number; name: string; minPoints: number; reward: number; next: { name: string; minPoints: number; reward: number } | null; missing: number; held: number }
export interface DayVice { id: string; name: string; weight: number; severity: Severity; scope: Scope; state: ViceState; covered: boolean; clean_days: number }
export interface Wallet {
  balance: number; daily: number; pool: number; strength: number; rank_rewards: number; chests: number; penalties: number; spent: number
  pool_this_week: number; today_credit: number; today_multiplier: number; streak: number
}
export interface StrengthDay {
  day: number; date: string; status: 'done' | 'forgiven' | 'missed'; chain: number; coins: number; exp: number
  missedCoins?: number; missedExp?: number; ratio: number; worst: string; settled?: 'extra' | 'pay' | null
}
export interface Strength {
  coins: number; exp: number; held_coins: number; held_exp: number; penalty_coins: number; penalty_exp: number
  pending: number; blocked: boolean; week: StrengthDay[]; pending_days: StrengthDay[]
  today: { ratio: number; worst: string; factor: number } | null; extra_reps: number
}
type Score = { base: number; bonus: number; multiplier: number; total: number; overflow: number }
export interface MyDay {
  day: string
  has_plan: boolean
  group_name: string | null
  score: Score & { ranking: Score }
  wallet: Wallet
  level: Level
  rank: Rank
  strength: Strength
  strength_cap: number
  habits: DayHabit[]
  vices: DayVice[]
  objectives: { id: string; title: string; tag: string | null; goal_id: string | null }[]
  tomorrow_changes: boolean
  notices: { id: string; text: string }[]
}

const n = (x: unknown) => Number(x ?? 0)
const nums = <T,>(o: unknown) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>)
  .map(([k, v]) => [k, typeof v === 'object' && v !== null ? v : n(v)])) as T

export function useMyDay() {
  const [day, setDay] = useState<MyDay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_day')
    if (error) { setError(errorMessage(error)); return }
    const d = data as MyDay
    d.score = { ...nums<Score>(d.score), ranking: nums<Score>(d.score.ranking) }
    d.wallet = nums<Wallet>(d.wallet)
    d.level = nums<Level>(d.level)
    d.rank = { ...d.rank, points: n(d.rank.points), missing: n(d.rank.missing), held: n(d.rank.held), reward: n(d.rank.reward) }
    d.strength = { ...d.strength, coins: n(d.strength.coins), exp: n(d.strength.exp), held_coins: n(d.strength.held_coins),
      held_exp: n(d.strength.held_exp), penalty_coins: n(d.strength.penalty_coins), penalty_exp: n(d.strength.penalty_exp),
      pending: n(d.strength.pending), extra_reps: n(d.strength.extra_reps) }
    d.strength_cap = n(d.strength_cap)
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
