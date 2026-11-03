import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { browserTimezone, formatLongDate } from '../lib/date'
import type { Habit } from '../lib/types'
import { Empty, ErrorBox, Flame, PageHeader, Spinner } from '../components/ui'

export default function Today() {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const [today, setToday] = useState<string | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [streak, setStreak] = useState(0)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // "Hoy" lo decide el servidor con la zona horaria del perfil (igual que las reglas RLS).
      const { data: d, error: e1 } = await supabase.rpc('user_today', { p_user: me })
      if (e1) throw e1
      const day = d as string
      const [h, l, s] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', me).eq('archived', false).order('created_at'),
        supabase.from('habit_logs').select('habit_id').eq('user_id', me).eq('log_date', day),
        supabase.rpc('user_streak', { p_user: me }),
      ])
      if (h.error) throw h.error
      if (l.error) throw l.error
      if (s.error) throw s.error
      setToday(day)
      setHabits(h.data as Habit[])
      setDone(new Set((l.data as { habit_id: string }[]).map((r) => r.habit_id)))
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

  async function toggle(h: Habit) {
    if (pending.has(h.id)) return
    const willBeDone = !done.has(h.id)
    setPending((p) => new Set(p).add(h.id))
    setDone((cur) => {
      const n = new Set(cur)
      if (willBeDone) n.add(h.id)
      else n.delete(h.id)
      return n
    })
    const { error } = await supabase.rpc('set_habit_done', { p_habit: h.id, p_done: willBeDone })
    setPending((p) => { const n = new Set(p); n.delete(h.id); return n })
    if (error) {
      setError(errorMessage(error))
      await load()
      return
    }
    const s = await supabase.rpc('user_streak', { p_user: me })
    if (!s.error) setStreak((s.data as number) ?? 0)
  }

  if (loading) return <div className="grid place-items-center pt-24"><Spinner /></div>

  const xpToday = habits.filter((h) => done.has(h.id)).reduce((a, h) => a + h.xp_value, 0)
  const xpMax = habits.reduce((a, h) => a + h.xp_value, 0)
  const pct = xpMax ? Math.round((xpToday / xpMax) * 100) : 0
  const deviceTz = browserTimezone()
  const tzMismatch = profile && deviceTz && profile.timezone !== deviceTz

  return (
    <>
      <PageHeader
        title="Hoy"
        subtitle={today ? <span className="capitalize">{formatLongDate(today)}</span> : null}
        right={<div className="text-lg"><Flame n={streak} /></div>}
      />

      {tzMismatch && (
        <p className="mb-4 rounded-xl border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Tu perfil usa la zona <b>{profile.timezone}</b> y este dispositivo está en <b>{deviceTz}</b>.{' '}
          <Link to="/perfil" className="underline">Cambiar</Link>
        </p>
      )}

      <section className="card mb-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-400">XP de hoy</span>
          <span className="text-sm text-slate-400">{done.size}/{habits.length} hábitos</span>
        </div>
        <div className="mt-1 text-4xl font-bold tabular-nums text-emerald-400">
          {xpToday}<span className="text-lg text-slate-500"> / {xpMax}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-sm text-slate-400">
          {streak > 0
            ? done.size > 0
              ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. ¡Hoy ya cuenta!`
              : `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. Marca al menos un hábito hoy para no perderla.`
            : 'Marca al menos un hábito para empezar tu racha.'}
        </p>
      </section>

      <ErrorBox>{error}</ErrorBox>

      {habits.length === 0 ? (
        <Empty>
          Aún no tienes hábitos.{' '}
          <Link to="/habitos" className="font-semibold text-emerald-400">Crea el primero</Link>
        </Empty>
      ) : (
        <ul className="space-y-2">
          {habits.map((h) => {
            const isDone = done.has(h.id)
            return (
              <li key={h.id}>
                <button
                  onClick={() => toggle(h)}
                  aria-pressed={isDone}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[.99] ${
                    isDone ? 'border-emerald-700 bg-emerald-950/40' : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-xl">{h.icon || '•'}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-semibold ${isDone ? 'text-emerald-200' : ''}`}>{h.name}</span>
                    <span className="text-sm text-slate-400">+{h.xp_value} XP</span>
                  </span>
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition ${
                      isDone ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-600'
                    }`}
                  >
                    {isDone && (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
