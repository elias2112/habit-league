import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { browserTimezone, formatLongDate } from '../lib/date'
import { MIN_ACTIVE_HABITS, archetypeById, catalogById } from '../lib/quiz'
import { uploadEvidence } from '../lib/photos'
import { completionOf, fmtCoins, useMyDay, type DayHabit, type DayVice } from '../lib/day'
import { CONFIG } from '../game/config'
import { signed, useLeague, type JudgmentToday } from '../lib/league'
import EvidencePhoto from '../components/EvidencePhoto'
import Judgment from '../components/Judgment'
import LeagueBadge from '../components/LeagueBadge'
import { Bar, Empty, ErrorBox, Flame, Loading, PageHeader, PillarIcon, Weight } from '../components/ui'

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 13l4 4L19 7" />
  </svg>
)
const BLOCKS = [
  { id: 'fuerza', title: '💪 Fuerza base' },
  { id: 'deporte', title: '🏃 Deporte o gimnasio' },
  { id: 'objetivo', title: '🎯 Tus objetivos' },
  { id: 'general', title: '✨ Generales' },
] as const
const fmtMult = (m: number) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`

export default function Today() {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const { day, error: loadError, reload } = useMyDay()
  const [streak, setStreak] = useState(0)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const league = useLeague()
  const [judgment, setJudgment] = useState<JudgmentToday | null>(null)
  const [judging, setJudging] = useState(false)

  useEffect(() => {
    supabase.rpc('user_streak', { p_user: me }).then(({ data }) => setStreak((data as number) ?? 0))
    const onVisible = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [me, reload, day?.score.total])

  // El Juicio de ayer (liga): se abre solo una vez por día; si se cierra, queda la tarjeta.
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

  async function run(key: string, fn: () => PromiseLike<{ error: unknown }>) {
    if (busy.has(key)) return
    setBusy((b) => new Set(b).add(key))
    const { error } = await fn()
    setBusy((b) => { const n = new Set(b); n.delete(key); return n })
    setError(error ? errorMessage(error) : null)
    await reload()
  }
  const toggle = (h: DayHabit) => run(h.id, () => supabase.rpc('set_habit_done', { p_habit: h.id, p_done: completionOf(h) < 1 }))
  const add = (h: DayHabit, delta: number) => run(h.id, () => supabase.rpc('add_habit_progress', { p_habit: h.id, p_delta: delta }))
  const setVice = (v: DayVice, state: DayVice['state']) => run(v.id, () => supabase.rpc('set_vice_state', { p_vice: v.id, p_state: state }))

  async function photo(h: DayHabit, file: File) {
    setBusy((b) => new Set(b).add(h.id))
    try {
      await uploadEvidence(me, h.id, file, h.photo_path)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(h.id); return n })
      await reload()
    }
  }

  if (!day) return loadError ? <ErrorBox>{loadError}</ErrorBox> : <Loading />

  const deviceTz = browserTimezone()
  const tzMismatch = profile && deviceTz && profile.timezone !== deviceTz
  const arch = archetypeById(profile?.archetype)
  const s = day.score
  const doneCount = day.habits.filter((h) => completionOf(h) >= 1).length

  return (
    <>
      <PageHeader title="Hoy" subtitle={<span className="capitalize">{formatLongDate(day.day)}</span>} right={<Flame n={streak} big />} />

      {day.notices.map((n) => (
        <div key={n.id} className="mb-3 flex items-start gap-2 rounded-xl border border-xp/40 bg-xp/10 px-3 py-2 text-sm text-xp">
          <span className="flex-1">{n.text}</span>
          <button className="px-1 text-lg leading-none" aria-label="Cerrar aviso" onClick={() => run(n.id, () => supabase.rpc('dismiss_notice', { p_id: n.id }))}>×</button>
        </div>
      ))}

      {day.has_plan && !day.habits.some((h) => h.block === 'fuerza') && (
        <div className="mb-3 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 text-sm">
          <b>Hay una versión nueva del juego</b> (niveles, fuerza base, objetivos). Para jugarla, empezá de cero desde{' '}
          <Link to="/perfil" className="font-semibold text-primary underline">Perfil → Cuenta</Link>. Tu progreso actual vuelve a cero.
        </div>
      )}

      {tzMismatch && (
        <p className="mb-4 rounded-xl border border-xp/40 bg-xp/10 px-3 py-2 text-sm text-xp">
          Tu perfil usa la zona <b>{profile.timezone}</b> y este dispositivo está en <b>{deviceTz}</b>. <Link to="/perfil" className="underline">Cambiar</Link>
        </p>
      )}

      {league.state && (
        <section className="card mb-3">
          <LeagueBadge s={league.state} />
          {judgment?.available && (judgment.submitted ? (
            <p className="mt-3 text-sm text-muted">⚖️ Juicio de ayer: <b className={(judgment.total ?? 0) >= 0 ? 'text-alimentacion' : 'text-danger'}>{signed(judgment.total ?? 0)} PL</b></p>
          ) : (
            <button className="btn btn-primary mt-3 w-full" onClick={() => setJudging(true)}>⚖️ Responder el Juicio de ayer</button>
          ))}
        </section>
      )}
      {judging && judgment && (
        <Judgment data={judgment} before={league.state} onClose={(st) => {
          setJudging(false)
          if (st) { league.setState(st); void supabase.rpc('judgment_today').then(({ data }) => setJudgment(data as JudgmentToday)) }
        }} />
      )}

      {/* Nivel (experiencia = suma de tus puntos diarios; valores provisionales) */}
      <section className="card mb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-black">Nivel {day.level.level}</span>
          <span className="text-xs tabular-nums text-muted">{Math.round(day.level.xpIntoLevel)} / {day.level.xpForNext} de experiencia</span>
        </div>
        <div className="mt-2"><Bar value={day.level.xpIntoLevel} max={day.level.xpForNext} className="bg-primary" /></div>
        <p className="mt-1 text-xs text-muted">Cada punto del día suma experiencia. El nivel nunca baja.</p>
      </section>

      {/* Puntaje y monedas */}
      <section className="card mb-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-muted">Puntos de hoy</span>
          <span className="text-sm text-muted">{doneCount}/{day.habits.length} completos</span>
        </div>
        <div className="mt-1 text-5xl font-black tabular-nums text-xp">
          {Math.round(s.total)}<span className="text-xl font-bold text-muted"> / 100</span>
        </div>
        {(s.bonus > 0 || s.multiplier < 1 || s.overflow > 0) && (
          <p className="mt-1 text-xs text-muted tabular-nums">
            Hábitos {Math.round(s.base)}
            {s.bonus > 0 && <> + <b className="text-alimentacion">{Math.round(s.bonus)}</b> por lo que no hiciste</>}
            {s.multiplier < 1 && <> <b className="text-danger">{fmtMult(s.multiplier)}</b> por recaídas</>}
            {s.overflow > 0 && <> · <b className="text-xp">+{Math.round(s.overflow)}</b> de excedente al pool</>}
          </p>
        )}
        <div className="mt-3"><Bar value={s.total} max={100} /></div>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span>
            🪙 Hoy: <b className="text-xp">{fmtCoins(day.wallet.today_credit)}</b>
            <span className="text-muted"> ({s.total >= CONFIG.coinThresholdHigh ? 'llegaste a 100' : s.total >= CONFIG.coinThresholdLow ? `${CONFIG.coinThresholdHigh} da más` : `desde ${CONFIG.coinThresholdLow} puntos`}{day.wallet.today_multiplier > 1 ? `, ${fmtMult(day.wallet.today_multiplier)} por racha` : ''})</span>
          </span>
          <Link to="/tienda" className="shrink-0 font-semibold text-primary">Billetera {fmtCoins(day.wallet.balance)} ›</Link>
        </div>
        {arch && <p className="mt-2 text-xs text-muted">{arch.name} · {arch.tagline}</p>}
      </section>

      <ErrorBox>{error}</ErrorBox>

      {!day.has_plan ? (
        <Empty>Todavía no tenés plan. <Link to="/quiz" className="font-semibold text-primary">Hacé el quiz</Link></Empty>
      ) : (
        <>
          {day.habits.length < MIN_ACTIVE_HABITS && (
            <p className="mb-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              Necesitás al menos {MIN_ACTIVE_HABITS} hábitos. <Link to="/habitos" className="font-semibold text-primary underline">Proponé uno</Link>
            </p>
          )}
          {BLOCKS.map((b) => {
            const hs = day.habits.filter((h) => h.block === b.id)
            if (hs.length === 0) return null
            return (
              <section key={b.id} className="mb-5">
                <h2 className="mb-2 font-bold">{b.title}</h2>
                {b.id === 'fuerza' && <p className="mb-2 text-xs text-muted">Para todos, según tu nivel de entrenamiento. Se puede hacer en varias series. No es consejo médico ni de entrenamiento.</p>}
                <ul className="space-y-2.5">
                  {hs.map((h) => <HabitRow key={h.id} h={h} busy={busy.has(h.id)} onToggle={() => toggle(h)} onAdd={(d) => add(h, d)} onPhoto={(f) => photo(h, f)} />)}
                </ul>
              </section>
            )
          })}

          {day.vices.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-bold">Vicios de hoy</h2>
              <p className="mb-3 text-xs text-muted">
                "No lo hice" suma; "Lo hice" multiplica tus puntos por su gravedad (salvo que tengas un permiso); sin marcar no suma ni resta.
              </p>
              <ul className="space-y-2">
                {day.vices.map((v) => <ViceRow key={v.id} v={v} busy={busy.has(v.id)} onSet={(st) => setVice(v, st)} />)}
              </ul>
            </section>
          )}

          {day.tomorrow_changes && <p className="mt-4 text-center text-xs text-muted">Tenés cambios aprobados que rigen desde mañana.</p>}
        </>
      )}
      <p className="mt-4 text-center text-xs text-muted">Sistema de honor: tu grupo ve lo que marcás (los privados, sin nombre ni foto).</p>
    </>
  )
}

function ViceRow({ v, busy, onSet }: { v: DayVice; busy: boolean; onSet: (s: DayVice['state']) => void }) {
  const sev = CONFIG.severity[v.severity]
  return (
    <li className={`rounded-2xl border p-3.5 ${v.state === 'clean' ? 'border-alimentacion/60 bg-alimentacion/10' : v.state === 'slipped' ? 'border-danger/50 bg-danger/10' : 'border-line bg-surface'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold">{v.name}</span>
          <span className="flex items-center gap-3 text-xs text-muted">
            <Weight w={v.weight} /> {v.severity} ({fmtMult(sev)})
            {v.clean_days > 0 && <span className="font-semibold text-alimentacion">{v.clean_days} {v.clean_days === 1 ? 'día' : 'días'} sin</span>}
          </span>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button disabled={busy} onClick={() => onSet('clean')} aria-pressed={v.state === 'clean'}
          className={`btn text-sm ${v.state === 'clean' ? 'btn-primary' : 'btn-ghost'}`}>No lo hice</button>
        <button disabled={busy} onClick={() => onSet('slipped')} aria-pressed={v.state === 'slipped'}
          className={`btn text-sm ${v.state === 'slipped' ? 'border border-danger/60 bg-danger/20 text-danger' : 'btn-ghost'}`}>Lo hice</button>
        <button disabled={busy || v.state === 'none'} onClick={() => onSet('none')} className="btn btn-ghost text-sm">Sin marcar</button>
      </div>
      {v.state === 'slipped' && (
        <p className="mt-2 text-xs">
          {v.covered
            ? <span className="text-alimentacion">Cubierto por un permiso: no multiplica ni baja tu racha de monedas.</span>
            : <span className="text-muted">Multiplica tus puntos de hoy por {fmtMult(sev)}. <Link to="/tienda" className="font-semibold text-primary underline">¿Tenés un permiso?</Link></span>}
        </p>
      )}
    </li>
  )
}

function HabitRow({ h, busy, onToggle, onAdd, onPhoto }: {
  h: DayHabit; busy: boolean; onToggle: () => void; onAdd: (d: number) => void; onPhoto: (f: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState('')
  const measurable = h.target != null
  const c = completionOf(h)
  const complete = c >= 1
  const big = measurable && h.target! > 12
  const criterion = h.criterion ?? catalogById(h.catalog_id)?.criterion
  const maxPct = Math.round(CONFIG.maxCompletion * 100)

  return (
    <li className={`rounded-2xl border p-3.5 transition ${complete ? 'border-primary/70 bg-primary/10' : 'border-line bg-surface'}`}>
      <div className="flex items-start gap-3">
        <PillarIcon pillar={h.pillar} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{h.name} {h.private && <span className="text-xs text-muted" title="Privado: el grupo no ve el nombre ni la foto">🔒</span>}</p>
          {criterion && <p className="text-xs text-muted">{criterion}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Weight w={h.weight} />
            {measurable && (
              <span className="text-xs font-semibold tabular-nums">
                {h.count.toLocaleString('es-ES')}/{h.target!.toLocaleString('es-ES')} {h.unit}
                {c > 1 && <span className="text-xp"> · {Math.round(Math.min(c, CONFIG.maxCompletion) * 100)} %</span>}
              </span>
            )}
          </p>
        </div>
        {!measurable && (
          <button onClick={onToggle} disabled={busy} aria-pressed={complete} aria-label={complete ? `Desmarcar ${h.name}` : `Marcar ${h.name}`}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition active:scale-95 ${complete ? 'border-primary bg-primary text-bg' : 'border-line text-transparent hover:text-muted'}`}>
            <CheckIcon />
          </button>
        )}
      </div>

      {measurable && (
        <div className="mt-3">
          <div className="mb-2"><Bar value={Math.min(h.count, h.target!)} max={h.target!} className="bg-primary" /></div>
          {big ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const k = parseInt(amount, 10); if (k) { onAdd(k); setAmount('') } }}>
              <input className="input min-w-0 flex-1" inputMode="numeric" pattern="-?[0-9]*" placeholder={`¿Cuántas ${h.unit ?? ''}?`}
                value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Cantidad de ${h.unit ?? ''}`} />
              <button className="btn btn-primary" disabled={busy || !parseInt(amount, 10)}>Sumar</button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost w-12 text-xl" disabled={busy || h.count === 0} onClick={() => onAdd(-1)} aria-label="Restar uno">−</button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={() => onAdd(1)}>+1 {h.unit ? h.unit.replace(/s$/, '') : ''}</button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted">Podés pasarte de la meta: cuenta hasta {maxPct} % y lo que pase de 100 puntos va al pool de la semana.</p>
        </div>
      )}

      {h.count > 0 && (
        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
          {h.photo_path && <EvidencePhoto path={h.photo_path} className="h-12 w-12" />}
          <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            📷 {h.photo_path ? 'Cambiar foto' : 'Subir foto'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} />
        </div>
      )}
    </li>
  )
}
