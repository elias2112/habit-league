import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { MyReview } from './types'

/** Estado de aprobación de mis hábitos propios, agrupado por hábito. */
export function useMyReviews() {
  const [byHabit, setByHabit] = useState<Map<string, MyReview[]>>(new Map())
  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('my_habit_reviews')
    const m = new Map<string, MyReview[]>()
    for (const r of (data ?? []) as MyReview[]) m.set(r.habit_id, [...(m.get(r.habit_id) ?? []), r])
    setByHabit(m)
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { byHabit, reload }
}

/** Texto corto para un hábito propio según sus revisiones (null = todo aprobado o no aplica). */
export function reviewBadge(reviews: MyReview[] | undefined): { text: string; tone: 'pending' | 'rejected' } | null {
  if (!reviews?.length) return null
  const pending = reviews.filter((r) => r.status === 'pending')
  const rejected = reviews.filter((r) => r.status === 'rejected')
  const names = (rs: MyReview[]) => (reviews.length > 1 ? ` en ${rs.map((r) => r.group_name).join(', ')}` : '')
  if (pending.length) return { text: `Esperando aprobación${names(pending)}`, tone: 'pending' }
  if (rejected.length) return { text: `No aprobado${names(rejected)}: no suma ahí`, tone: 'rejected' }
  return null
}
