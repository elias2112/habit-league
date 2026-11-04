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
import { MyRadar } from '../components/MyRadar'
import LeagueTable from '../components/LeagueTable'
import { fmtMult } from '../lib/vices'
import { emblemUrl } from '../components/ArchetypeCard'

const medal = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const { groups, selected, select, loading: gLoading } = useGroups()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState<'points' | 'league'>('points')

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

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1" role="tablist">
        {(['points', 'league'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-10 rounded-lg text-sm font-semibold ${tab === t ? 'bg-surface-2 text-ink' : 'text-muted'}`}>
            {t === 'points' ? '🏆 Puntos del reto' : '🐪 Liga'}
          </button>
        ))}
      </div>

      {tab === 'league' ? (
        <LeagueTable groupId={selected.id} me={me} />
      ) : loading ? (
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
                <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === r.user_id ? null : r.user_id)} aria-expanded={open === r.user_id}>
                  <span className="w-7 text-center text-lg font-black tabular-nums text-muted">{medal[i] ?? i + 1}</span>
                  {arch ? <img src={emblemUrl(arch.id)} alt="" className="h-9 w-9 shrink-0" /> : <span className="h-9 w-9 shrink-0 rounded-xl bg-surface-2" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {r.display_name || r.username}
                      {isMe && <span className="ml-1.5 text-xs font-semibold text-primary">(vos)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{arch ? arch.name : `@${r.username}`}</span>
                  </span>
                  {Number(r.multiplier) < 1 && <span className="rounded-md bg-danger/15 px-1.5 py-0.5 text-xs font-bold text-danger" title="Multiplicador por vicios declarados">{fmtMult(Number(r.multiplier))}</span>}
                  <Flame n={r.streak} />
                  <span className="w-20 text-right">
                    <span className="block font-black tabular-nums text-xp">{Math.round(r.total_points)}</span>
                    <span className="block text-xs tabular-nums text-muted">{r.pct == null ? '—' : `${Math.round(r.pct)}%`}</span>
                  </span>
                </button>
                {open === r.user_id && (
                  <div className="mt-3 border-t border-line pt-3">
                    {arch && <p className="mb-1 text-center text-sm"><b>{arch.name}</b> <span className="text-muted">· {arch.tagline}</span></p>}
                    <MyRadar userId={r.user_id} size={260} caption={false} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {tab === 'points' && <p className="mt-4 text-center text-xs text-muted">
        Puntos del reto (máx. 100 por día). El % compara contra el máximo posible desde que cada uno entró. La racha suma días seguidos con al menos un hábito completo. Los hábitos propios suman acá solo si este grupo los aprobó. Los vicios declarados multiplican los puntos (×0,9 cada uno) y los tropiezos restan del día. Tocá a alguien para ver su radar.
      </p>}
    </>
  )
}
