import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { challengeDay, useGroups } from '../lib/groups'
import { errorMessage } from '../lib/errors'
import { todayIn } from '../lib/date'
import { archetypeById } from '../lib/quiz'
import type { LeaderboardRow } from '../lib/types'
import { Bar, Empty, ErrorBox, Flame, Loading, PageHeader, Spinner } from '../components/ui'
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
    else {
      setRows((data as LeaderboardRow[]).map((r) => ({
        ...r,
        total_points: Number(r.total_points),
        max_points: Number(r.max_points),
        pct: r.pct == null ? null : Number(r.pct),
      })))
      setError(null)
    }
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

  if (gLoading) return <Loading />

  if (!selected) {
    return (
      <>
        <PageHeader title="Ranking" />
        <Empty>
          Todavía no estás en ningún grupo.{' '}
          <Link to="/grupos" className="font-semibold text-primary">Creá uno o unite con un código</Link>
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
      {cd && !cd.finished && <div className="mb-4"><Bar value={cd.day} max={cd.total} className="bg-primary" /></div>}
      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <div className="grid place-items-center pt-10"><Spinner /></div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const isMe = r.user_id === me
            const arch = archetypeById(r.archetype)
            return (
              <li
                key={r.user_id}
                className={`rounded-2xl border p-3.5 ${isMe ? 'border-primary bg-primary/10' : 'border-line bg-surface'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 text-center text-lg font-black tabular-nums text-muted">{medal[i] ?? i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {r.display_name || r.username}
                      {isMe && <span className="ml-1.5 text-xs font-semibold text-primary">(vos)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{arch ? arch.name : `@${r.username}`}</span>
                  </span>
                  <Flame n={r.streak} />
                  <span className="w-20 text-right">
                    <span className="block font-black tabular-nums text-xp">{Math.round(r.total_points)}</span>
                    <span className="block text-xs tabular-nums text-muted">{r.pct == null ? '—' : `${Math.round(r.pct)}%`}</span>
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-4 text-center text-xs text-muted">
        Puntos del reto (máx. 100 por día). El % compara contra el máximo posible desde que cada uno entró. La racha suma días seguidos con al menos un hábito.
      </p>
    </>
  )
}
