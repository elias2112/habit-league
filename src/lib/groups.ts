import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Group } from './types'

const KEY = 'hl:selectedGroup'

function readSelected(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
function writeSelected(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch { /* sin almacenamiento disponible */ }
}

/** Grupos del usuario (RLS solo devuelve aquellos de los que es miembro) y el seleccionado. */
export function useGroups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(readSelected())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('groups').select('*').order('created_at')
    setError(error ? error.message : null)
    const list = (data ?? []) as Group[]
    setGroups(list)
    setSelectedId((cur) => {
      const next = cur && list.some((g) => g.id === cur) ? cur : list[0]?.id ?? null
      writeSelected(next)
      return next
    })
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const select = useCallback((id: string) => { writeSelected(id); setSelectedId(id) }, [])
  const selected = groups.find((g) => g.id === selectedId) ?? null
  return { groups, selected, select, reload, loading, error }
}

/** Día del reto (1..N) según la fecha local de hoy; null si aún no empezó. */
export function challengeDay(g: Group, today: string) {
  const start = Date.parse(g.start_date + 'T00:00:00Z')
  const now = Date.parse(today + 'T00:00:00Z')
  const day = Math.floor((now - start) / 86400000) + 1
  if (day < 1) return null
  return { day: Math.min(day, g.duration_days), total: g.duration_days, finished: day > g.duration_days }
}
