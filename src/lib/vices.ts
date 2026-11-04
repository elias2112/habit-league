// Vicios: multiplicador por vicio declarado y tropiezos (content/vices.json, migración 005).
import { useCallback, useEffect, useState } from 'react'
import vicesData from '../../content/vices.json'
import { supabase } from './supabase'

export interface Vice { id: string; name: string; area: string; slip: string; slip_penalty: number }
export const VICES = vicesData.vices as Vice[]
export const VICE_MULTIPLIER = vicesData.multiplier
export const viceById = (id: string | null | undefined) => VICES.find((v) => v.id === id)

export interface DeclaredVice { id: string; vice_id: string | null; name: string; started_on: string; ends_on: string | null }
export interface TodayScore { raw: number; multiplier: number; slips: number; final: number; vices: DeclaredVice[]; slip_ids: string[] }

/** Puntaje de hoy desglosado: hábitos × multiplicador − tropiezos. */
export function useTodayScore() {
  const [score, setScore] = useState<TodayScore | null>(null)
  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('today_score')
    if (data) {
      const d = data as TodayScore
      setScore({ ...d, raw: Number(d.raw), multiplier: Number(d.multiplier), slips: Number(d.slips), final: Number(d.final) })
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { score, reload }
}

export const fmtMult = (m: number) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 3 })}`
