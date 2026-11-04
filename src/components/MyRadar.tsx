import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Radar, { type RadarValues } from './Radar'
import { Spinner } from './ui'

/** Radar de una persona (propia o de un compañero de grupo): Día 1 vs últimos 14 días. */
export function MyRadar({ userId, size = 300, caption = true }: { userId: string; size?: number; caption?: boolean }) {
  const [vals, setVals] = useState<{ day1: RadarValues; actual: RadarValues } | null>(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('area_radar', { p_user: userId }).then(({ data }) => {
      if (!alive) return
      const day1: RadarValues = {}, actual: RadarValues = {}
      for (const r of (data ?? []) as { area: keyof RadarValues; day1: number; actual: number }[]) {
        day1[r.area] = Number(r.day1)
        actual[r.area] = Number(r.actual)
      }
      setVals({ day1, actual })
    })
    return () => { alive = false }
  }, [userId])

  if (!vals) return <div className="grid h-40 place-items-center"><Spinner /></div>
  return (
    <>
      <Radar day1={vals.day1} actual={vals.actual} size={size} />
      {caption && (
        <p className="text-center text-xs text-muted">
          Punteado = Día 1 (tu quiz) · relleno = cumplimiento de tus hábitos de cada área en los últimos 14 días.
          Un área sin hábitos queda igual que el Día 1.
        </p>
      )}
    </>
  )
}
