import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { challengeDay, useGroups } from '../lib/groups'
import { errorMessage } from '../lib/errors'
import { todayIn } from '../lib/date'
import type { LeaderboardRow } from '../lib/types'
import { Empty, ErrorBox, Flame, PageHeader, Spinner } from '../components/ui'
import GroupPicker from '../components/GroupPicker'

const medal = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const { groups, selected, select, loading: gLoading } = useGroups()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!selected) return
    const { data, error } = await supabase.rpc('group_leaderboard', { p_group: selected.id })
    if (error) setError(errorMessage(error))
    else { setRows((data as LeaderboardRow[]).map((r) => ({ ...r, total_xp: Number(r.total_xp) }))); setError(null) }
    setLoading(false)
  }, [selected])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    void load()
    // Se refresca solo cuando alguien marca o desmarca un hábito.
    const channel = supabase
      .channel(`ranking-${selected.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [selected, load])

  if (gLoading) return <div className="grid place-items-center pt-24"><Spinner /></div>

  if (!selected) {
    return (
      <>
        <PageHeader title="Ranking" />
        <Empty>
          Todavía no estás en ningún grupo.{' '}
          <Link to="/grupos" className="font-semibold text-emerald-400">Crea uno o únete con un código</Link>
        </Empty>
      </>
    )
  }

  const cd = challengeDay(selected, todayIn(profile?.timezone ?? 'Europe/Madrid'))

  return (
    <>
      <PageHeader
        title="Ranking"
        subtitle={cd ? (cd.finished ? `Reto terminado (${cd.total} días)` : `Día ${cd.day} de ${cd.total}`) : 'El reto aún no empezó'}
      />
      <GroupPicker groups={groups} selected={selected} onSelect={select} />
      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <div className="grid place-items-center pt-10"><Spinner /></div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const isMe = r.user_id === me
            return (
              <li
                key={r.user_id}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 ${isMe ? 'border-emerald-600 bg-emerald-950/40' : 'border-slate-800 bg-slate-900'}`}
              >
                <span className="w-8 text-center text-lg font-bold tabular-nums text-slate-400">{medal[i] ?? i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {r.display_name || r.username}
                    {isMe && <span className="ml-1.5 text-xs font-medium text-emerald-400">(tú)</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">@{r.username}</span>
                </span>
                <Flame n={r.streak} />
                <span className="w-20 text-right font-bold tabular-nums text-emerald-400">{r.total_xp} XP</span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-4 text-center text-xs text-slate-500">
        Cuenta el XP dentro de las fechas del reto. La racha suma días seguidos con al menos un hábito.
      </p>
    </>
  )
}
