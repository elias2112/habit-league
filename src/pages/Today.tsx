import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { browserTimezone, formatLongDate } from '../lib/date'
import { MIN_ACTIVE_HABITS, archetypeById, catalogById, pointsFor } from '../lib/quiz'
import { uploadEvidence } from '../lib/photos'
import { reviewBadge, useMyReviews } from '../lib/reviews'
import type { Habit } from '../lib/types'
import EvidencePhoto from '../components/EvidencePhoto'
import Judgment from '../components/Judgment'
import { VICES, fmtMult, useTodayScore } from '../lib/vices'
import LeagueBadge from '../components/LeagueBadge'
import { signed, useLeague, type JudgmentToday } from '../lib/league'
import { AreaIcon, Bar, Empty, ErrorBox, Flame, Loading, PageHeader, Tier } from '../components/ui'

interface Log { habit_id: string; points: number; count: number; target: number; photo_path: string | null }

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 13l4 4L19 7" />
  </svg>
)

export default function Today() {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const [today, setToday] = useState<string | null>(null)
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<Map<string, Log>>(new Map())
  const [streak, setStreak] = useState(0)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { byHabit, reload: reloadReviews } = useMyReviews()
  const league = useLeague()
  const todayScore = useTodayScore()
  const [judgment, setJudgment] = useState<JudgmentToday | null>(null)
  const [judging, setJudging] = useState(false)

  // El Juicio de ayer: se abre solo una vez por día; si se cierra con "Después", queda la tarjeta.
  useEffect(() => {
    if (!league.state) return
    supabase.rpc('judgment_today').then(({ data }) => {
      const j = data as JudgmentToday | null
      if (!j) return
      setJudgment(j)
      const key = 'hl:judgmentPrompted:' + j.day
      let prompted = false
      try { prompted = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1') } catch { /* sin almacenamiento */ }
      if (j.available && !j.submitted && !prompted) setJudging(true)
    })
  }, [league.state])


  const load = useCallback(async () => {
    try {
      // "Hoy" lo decide el servidor con la zona horaria del perfil (igual que las reglas de la base).
      const { data: d, error: e1 } = await supabase.rpc('user_today', { p_user: me })
      if (e1) throw e1
      const day = d as string
      const [h, l, s] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', me).eq('archived', false).order('created_at'),
        supabase.from('habit_logs').select('habit_id, points, count, target, photo_path').eq('user_id', me).eq('log_date', day),
        supabase.rpc('user_streak', { p_user: me }),
      ])
      if (h.error) throw h.error
      if (l.error) throw l.error
      if (s.error) throw s.error
      setToday(day)
      setHabits(h.data as Habit[])
      setLogs(new Map((l.data as Log[]).map((r) => [r.habit_id, { ...r, points: Number(r.points) }])))
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
    const onVisible = () => { if (document.visibilityState === 'visible') { void load(); void reloadReviews() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load, reloadReviews])

  async function run(habitId: string, fn: () => PromiseLike<{ error: unknown }>) {
    if (busy.has(habitId)) return
    setBusy((b) => new Set(b).add(habitId))
    const { error } = await fn()
    setBusy((b) => { const n = new Set(b); n.delete(habitId); return n })
    if (error) setError(errorMessage(error))
    await load()
    await todayScore.reload()
  }

  async function slip(viceId: string, on: boolean) {
    const { error } = await supabase.rpc('log_slip', { p_vice: viceId, p_on: on })
    setError(error ? errorMessage(error) : null)
    await todayScore.reload()
  }

  const toggle = (h: Habit) => {
    const log = logs.get(h.id)
    const complete = !!log && log.count >= log.target
    // Optimista: el check se ve al instante; los puntos reales los calcula la base.
    setLogs((cur) => {
      const n = new Map(cur)
      if (complete) n.delete(h.id)
      else n.set(h.id, { habit_id: h.id, points: 0, count: h.target, target: h.target, photo_path: log?.photo_path ?? null })
      return n
    })
    return run(h.id, () => supabase.rpc('set_habit_done', { p_habit: h.id, p_done: !complete }))
  }
  const add = (h: Habit, delta: number) => run(h.id, () => supabase.rpc('add_habit_progress', { p_habit: h.id, p_delta: delta }))

  async function photo(h: Habit, file: File) {
    setBusy((b) => new Set(b).add(h.id))
    try {
      await uploadEvidence(me, h.id, file, logs.get(h.id)?.photo_path)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(h.id); return n })
      await load()
    }
  }

  if (loading) return <Loading />

  const tiers = habits.map((h) => h.tier)
  const rawToday = [...logs.values()].reduce((a, b) => a + b.points, 0)
  const sc = todayScore.score
  // Puntos ajustados (× vicios − tropiezos) calculados por la base; mientras carga, los crudos.
  const pointsToday = Math.round(sc ? sc.final : rawToday)
  const adjusted = sc && (sc.multiplier < 1 || sc.slips > 0)
  const declared = new Set((sc?.vices ?? []).map((v) => v.vice_id))
  const slipped = new Set(sc?.slip_ids ?? [])
  const doneCount = habits.filter((h) => { const l = logs.get(h.id); return l && l.count >= l.target }).length
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

      {league.state && (
        <section className="card mb-3">
          <LeagueBadge s={league.state} />
          {judgment?.available && (
            judgment.submitted ? (
              <p className="mt-3 text-sm text-muted">⚖️ Juicio de ayer: <b className={(judgment.total ?? 0) >= 0 ? 'text-alimentacion' : 'text-danger'}>{signed(judgment.total ?? 0)} PL</b></p>
            ) : (
              <button className="btn btn-primary mt-3 w-full" onClick={() => setJudging(true)}>⚖️ Responder el Juicio de ayer</button>
            )
          )}
        </section>
      )}

      {judging && judgment && (
        <Judgment
          data={judgment}
          before={league.state}
          onClose={(s) => {
            setJudging(false)
            if (s) { league.setState(s); void supabase.rpc('judgment_today').then(({ data }) => setJudgment(data as JudgmentToday)) }
          }}
        />
      )}

      <section className="card mb-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-muted">Puntos de hoy</span>
          <span className="text-sm text-muted">{doneCount}/{habits.length} completos</span>
        </div>
        <div className="mt-1 text-5xl font-black tabular-nums text-xp">
          {pointsToday}<span className="text-xl font-bold text-muted"> / 100</span>
        </div>
        {adjusted && sc && (
          <p className="mt-1 text-xs text-muted tabular-nums">
            Hábitos {Math.round(sc.raw)}
            {sc.multiplier < 1 && <> <b className="text-danger">{fmtMult(sc.multiplier)}</b> por {sc.vices.length === 1 ? 'tu vicio' : `tus ${sc.vices.length} vicios`}</>}
            {sc.slips > 0 && <> <b className="text-danger">−{sc.slips}</b> de tropiezos</>}
          </p>
        )}
        <div className="mt-3"><Bar value={pointsToday} max={100} /></div>
        <p className="mt-3 text-sm text-muted">
          {streak > 0
            ? doneCount > 0
              ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. ¡Hoy ya cuenta!`
              : `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. Completá al menos un hábito hoy para no perderla.`
            : 'Completá al menos un hábito para empezar tu racha.'}
        </p>
        {arch && (
          <Link to="/perfil" className="mt-3 flex items-center gap-2 text-xs text-muted">
            <img src={`${import.meta.env.BASE_URL}arquetipos/${arch.id}.svg`} alt="" className="h-6 w-6" />
            {arch.name} · {arch.tagline}
          </Link>
        )}
      </section>

      <ErrorBox>{error}</ErrorBox>

      {habits.length > 0 && habits.length < MIN_ACTIVE_HABITS && (
        <p className="mb-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          Necesitás al menos {MIN_ACTIVE_HABITS} hábitos activos. <Link to="/habitos" className="font-semibold text-primary underline">Agregar</Link>
        </p>
      )}

      {habits.length === 0 ? (
        <Empty>
          Todavía no tenés hábitos.{' '}
          <Link to="/habitos" className="font-semibold text-primary">Agregá del catálogo</Link>
        </Empty>
      ) : (
        <ul className="space-y-2.5">
          {habits.map((h) => (
            <HabitRow
              key={h.id}
              h={h}
              log={logs.get(h.id)}
              value={Math.round(pointsFor(h.tier, tiers))}
              busy={busy.has(h.id)}
              badge={h.catalog_id ? null : reviewBadge(byHabit.get(h.id))}
              onToggle={() => toggle(h)}
              onAdd={(d) => add(h, d)}
              onPhoto={(f) => photo(h, f)}
            />
          ))}
        </ul>
      )}
      <details className="card mt-5" open={slipped.size > 0}>
        <summary className="cursor-pointer font-semibold">
          🫣 ¿Tropezaste hoy? {sc && sc.slips > 0 && <span className="ml-1 text-sm text-danger">−{sc.slips}</span>}
        </summary>
        <p className="mt-2 text-xs text-muted">Resta solo de hoy. Los vicios que declaraste ya te cuestan {sc ? fmtMult(sc.multiplier) : ''} y no aparecen acá. Es privado.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {VICES.filter((v) => !declared.has(v.id)).map((v) => {
            const on = slipped.has(v.id)
            return (
              <button key={v.id} onClick={() => slip(v.id, !on)} aria-pressed={on}
                className={`btn justify-between text-left text-sm ${on ? 'border border-danger/60 bg-danger/15 text-danger' : 'btn-ghost'}`}>
                <span>{v.slip}</span><span className="tabular-nums">−{v.slip_penalty}</span>
              </button>
            )
          })}
        </div>
      </details>

      <p className="mt-4 text-center text-xs text-muted">Sistema de honor: tu grupo ve lo que marcás (los privados, sin nombre ni foto).</p>
    </>
  )
}

function HabitRow({ h, log, value, busy, badge, onToggle, onAdd, onPhoto }: {
  h: Habit
  log?: Log
  value: number
  busy: boolean
  badge: ReturnType<typeof reviewBadge>
  onToggle: () => void
  onAdd: (delta: number) => void
  onPhoto: (f: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState('')
  const count = log?.count ?? 0
  const complete = count >= h.target
  const partial = h.target > 1
  const big = h.target > 12
  const criterion = h.criterion ?? catalogById(h.catalog_id)?.criterion
  const earned = log ? Math.round(log.points) : 0

  return (
    <li className={`rounded-2xl border p-3.5 transition ${complete ? 'border-primary/70 bg-primary/10' : 'border-line bg-surface'}`}>
      <div className="flex items-start gap-3">
        <AreaIcon area={h.area} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {h.name} {h.private && <span className="text-xs text-muted" title="Privado: el grupo no ve el nombre ni la foto">🔒</span>}
          </p>
          {criterion && <p className="text-xs text-muted">{criterion}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Tier tier={h.tier} />
            <span className="text-xs font-bold text-xp">{log ? `+${earned}` : `+${value}`} pts</span>
            {partial && <span className="text-xs font-semibold text-ink tabular-nums">{count.toLocaleString('es-ES')}/{h.target.toLocaleString('es-ES')} {h.unit}</span>}
          </p>
          {badge && (
            <p className={`mt-1 text-xs font-semibold ${badge.tone === 'pending' ? 'text-xp' : 'text-danger'}`}>
              {badge.tone === 'pending' ? '⏳' : '✕'} {badge.text}
            </p>
          )}
        </div>
        {!partial && (
          <button
            onClick={onToggle}
            disabled={busy}
            aria-pressed={complete}
            aria-label={complete ? `Desmarcar ${h.name}` : `Marcar ${h.name}`}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition active:scale-95 ${
              complete ? 'border-primary bg-primary text-bg' : 'border-line text-transparent hover:text-muted'
            }`}
          >
            <CheckIcon />
          </button>
        )}
      </div>

      {partial && (
        <div className="mt-3">
          <div className="mb-2"><Bar value={Math.min(count, h.target)} max={h.target} className="bg-primary" /></div>
          {big ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); const n = parseInt(amount, 10); if (n) { onAdd(n); setAmount('') } }}
            >
              <input
                className="input min-w-0 flex-1" inputMode="numeric" pattern="-?[0-9]*" placeholder={`¿Cuántas ${h.unit ?? ''}?`}
                value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Cantidad de ${h.unit ?? ''}`}
              />
              <button className="btn btn-primary" disabled={busy || !parseInt(amount, 10)}>Sumar</button>
              {!complete && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onToggle}>Listo</button>}
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost w-12 text-xl" disabled={busy || count === 0} onClick={() => onAdd(-1)} aria-label="Restar uno">−</button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={() => onAdd(1)}>
                +1 {h.unit ? h.unit.replace(/s$/, '') : ''}
              </button>
              {complete && <button className="btn btn-ghost" disabled={busy} onClick={onToggle}>Reiniciar</button>}
            </div>
          )}
        </div>
      )}

      {log && (
        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
          {log.photo_path && <EvidencePhoto path={log.photo_path} className="h-12 w-12" />}
          <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            📷 {log.photo_path ? 'Cambiar foto' : 'Subir foto'}
          </button>
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }}
          />
        </div>
      )}
    </li>
  )
}
