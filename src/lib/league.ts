// Liga de las Tres Transformaciones (docs/JUEGO.md). Datos de content/judgment.json.
import { useCallback, useEffect, useState } from 'react'
import judgmentData from '../../content/judgment.json'
import { supabase } from './supabase'

export type StageId = 'camello' | 'leon' | 'nino' | 'zaratustra'
export interface Stage { id: StageId; name: string; emoji: string; boost: string[]; theme: string }
export interface LeagueState { stage: StageId; division: number; pl: number; shield_until: string | null; trial_ready: boolean }

export const STAGES = judgmentData.league.stages as Stage[]
export const TRIALS = judgmentData.league.trials as Record<string, string>
export const stageById = (id: string | null | undefined) => STAGES.find((s) => s.id === id) ?? STAGES[0]

const ROMAN = ['', 'I', 'II', 'III']
export function rankLabel(stage: string, division: number) {
  const s = stageById(stage)
  return s.id === 'zaratustra' ? s.name : `${s.name} ${ROMAN[division] ?? division}`
}

/** Orden total para comparar rangos (mayor = mejor). */
export const rankValue = (stage: string, division: number, pl: number) =>
  STAGES.findIndex((s) => s.id === stage) * 1000 + (3 - division) * 200 + pl

/** Pone al día la liga (procesa días pendientes) y devuelve el estado. */
export function useLeague() {
  const [state, setState] = useState<LeagueState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc('league_sync')
    if (error) setError(error.message)
    else { setState(data as LeagueState); setError(null) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { state, error, reload, setState }
}

export interface JudgmentQuestion {
  id: string
  kind: 'core' | 'bonus'
  text: string
  hint: string | null
  type: 'yesno' | 'count' | 'money'
  unit: string | null
  category: string
}
export interface JudgmentToday {
  day: string
  available: boolean
  submitted: boolean
  total: number | null
  points: number
  habits_done: number
  habits_total: number
  habits_pl: number
  questions: JudgmentQuestion[]
  chests: { id: string; title: string }[]
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
