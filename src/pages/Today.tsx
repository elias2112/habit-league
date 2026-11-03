import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { browserTimezone, formatLongDate } from '../lib/date'
import { MIN_ACTIVE_HABITS, archetypeById, catalogById, pointsFor } from '../lib/quiz'
import type { Habit } from '../lib/types'
import { AreaIcon, Bar, Empty, ErrorBox, Flame, Loading, PageHeader, Tier } from '../components/ui'

export default function Today() {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const [today, setToday] = useState<string | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<Map<string, number>>(new Map()) // habit_id → puntos
  const [streak, setStreak] = useState(0)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // "Hoy" lo decide el servidor con la zona horaria del perfil (igual que las reglas de la base).
      const { data: d, error: e1 } = await supabase.rpc('user_today', { p_user: me })
      if (e1) throw e1
      const day = d as string
      const [h, l, s] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', me).eq('archived', false).order('created_at'),
        supabase.from('habit_logs').select('habit_id, points').eq('user_id', me).eq('log_date', day),
        supabase.rpc('user_streak', { p_user: me }),
      ])
      if (h.error) throw h.error
      if (l.error) throw l.error
      if (s.error) throw s.error
      setToday(day)
      setHabits(h.data as Habit[])
      setLogs(new Map((l.data as { habit_id: string; points: number }[]).map((r) => [r.habit_id, Number(r.points)])))
      setStreak((s.data as number) ?? 0)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    void load()
    // Al volver a la app (p. ej. al día siguiente) se recarga, por si cambió el día.
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const tiers = habits.map((h) => h.tier)

  async function toggle(h: Habit) {
    if (pending.has(h.id)) return
    const willBeDone = !logs.has(h.id)
    setPending((p) => new Set(p).add(h.id))
    // Optimista; los puntos reales los calcula la base y se recargan después.
    setLogs((cur) => {
      const n = new Map(cur)
      if (willBeDone) n.set(h.id, pointsFor(h.tier, tiers))
      else n.delete(h.id)
      return n
    })
    const { error } = await supabase.rpc('set_habit_done', { p_habit: h.id, p_done: willBeDone })
    setPending((p) => { const n = new Set(p); n.delete(h.id); return n })
    if (error) setError(errorMessage(error))
    await load()
  }

  if (loading) return <Loading />

  const pointsToday = Math.round([...logs.values()].reduce((a, b) => a + b, 0))
  const doneCount = habits.filter((h) => logs.has(h.id)).length
  const deviceTz = browserTimezone()
  const tzMismatch = profile && deviceTz && profile.timezone !== deviceTz
  const arch = archetypeById(profile?.archetype)

  return (
    <>
      <PageHeader
        title="Hoy"
        subtitle={today ? <span className="capitalize">{formatLongDate(today)}</span> : null}
        right={<Flame n={streak} big />}
      />

      {tzMismatch && (
        <p className="mb-4 rounded-xl border border-xp/40 bg-xp/10 px-3 py-2 text-sm text-xp">
          Tu perfil usa la zona <b>{profile.timezone}</b> y este dispositivo está en <b>{deviceTz}</b>.{' '}
          <Link to="/perfil" className="underline">Cambiar</Link>
        </p>
      )}

      <section className="card mb-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-muted">Puntos de hoy</span>
          <span className="text-sm text-muted">{doneCount}/{habits.length} hábitos</span>
        </div>
        <div className="mt-1 text-5xl font-black tabular-nums text-xp">
          {pointsToday}<span className="text-xl font-bold text-muted"> / 100</span>
        </div>
        <div className="mt-3"><Bar value={pointsToday} max={100} /></div>
        <p className="mt-3 text-sm text-muted">
          {streak > 0
            ? doneCount > 0
              ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. ¡Hoy ya cuenta!`
              : `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. Marcá al menos un hábito hoy para no perderla.`
            : 'Marcá al menos un hábito para empezar tu racha.'}
        </p>
        {arch && <p className="mt-2 text-xs text-muted">{arch.name} · {arch.tagline}</p>}
      </section>

      <ErrorBox>{error}</ErrorBox>

      {habits.length > 0 && habits.length < MIN_ACTIVE_HABITS && (
        <p className="mb-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          Necesitás al menos {MIN_ACTIVE_HABITS} hábitos activos. <Link to="/habitos" className="font-semibold text-primary underline">Agregar</Link>
        </p>
      )}

      {habits.length === 0 ? (
        <Empty>
          Aún no tenés hábitos.{' '}
          <Link to="/habitos" className="font-semibold text-primary">Agregá del catálogo</Link>
        </Empty>
      ) : (
        <ul className="space-y-2.5">
          {habits.map((h) => {
            const done = logs.has(h.id)
            const criterion = catalogById(h.catalog_id)?.criterion
            const value = done ? Math.round(logs.get(h.id)!) : Math.round(pointsFor(h.tier, tiers))
            return (
              <li key={h.id}>
                <button
                  onClick={() => toggle(h)}
                  aria-pressed={done}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[.99] ${
                    done ? 'border-primary/70 bg-primary/10' : 'border-line bg-surface'
                  }`}
                >
                  <AreaIcon area={h.area} />
                  <span className="min-w-0 flex-1">
                    <span className={`block font-semibold ${done ? 'text-ink' : ''}`}>{h.name}</span>
                    {criterion && <span className="block text-xs text-muted">{criterion}</span>}
                    <span className="mt-1 flex items-center gap-3">
                      <Tier tier={h.tier} />
                      <span className="text-xs font-bold text-xp">+{value} pts</span>
                    </span>
                  </span>
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 transition ${
                      done ? 'border-primary bg-primary text-bg' : 'border-line text-transparent'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-4 text-center text-xs text-muted">Sistema de honor: tu grupo ve lo que marcás.</p>
    </>
  )
}
