import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { todayIn } from '../lib/date'
import { GOAL_KINDS, detectKind, goalKind, planGoal, type GoalKind } from '../lib/goals'
import type { Goal } from '../lib/types'
import { CONFIG } from '../game/config'
import { AreaIcon, Bar, Empty, ErrorBox, Spinner, Tier } from './ui'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')

function GoalForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { profile } = useAuth()
  const today = todayIn(profile?.timezone ?? 'Europe/Madrid')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<GoalKind>('ahorro')
  const [touchedKind, setTouchedKind] = useState(false)
  const [amount, setAmount] = useState(goalKind('ahorro').default_amount)
  const [perItem, setPerItem] = useState(250)
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El tipo se adivina por el título hasta que la persona lo elige a mano.
  useEffect(() => {
    if (touchedKind) return
    const k = detectKind(title)
    void k // los cofres son siempre de ahorro
  }, [title, touchedKind, kind])

  const t = goalKind(kind)
  const plan = useMemo(
    () => (amount > 0 ? planGoal(kind, title || t.example, amount, today, deadline || null, perItem) : null),
    [kind, title, t.example, amount, today, deadline, perItem],
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!plan || !title.trim()) return
    setBusy(true); setError(null)
    try {
      const { data: g, error: e1 } = await supabase.from('goals').insert({
        title: title.trim(), kind, target: plan.target, unit: plan.unit, deadline: deadline || null,
      }).select('id').single()
      if (e1) throw e1
      // El hábito del cofre entra al plan como cualquier cambio: se propone y rige desde mañana.
      const { error: e2 } = await supabase.rpc('propose_change', { p_scope: 'me', p_kind: 'habit.add', p_payload: {
        name: plan.habit.name, criterion: plan.habit.criterion, pillar: 'dinero', weight: Math.min(3, plan.habit.tier),
        goal_id: g.id, goal_step: plan.habit.goal_step } })
      if (e2) throw e2
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="gtitle">¿Para qué querés ahorrar?</label>
        <input id="gtitle" className="input" maxLength={80} required placeholder="Ej.: Comprar un celular, leer un libro por semana…" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <span className="label">Tipo</span>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_KINDS.filter((k) => k.id === 'ahorro').map((k) => (
            <button
              type="button" key={k.id}
              onClick={() => { setTouchedKind(true); setKind(k.id); setAmount(k.default_amount) }}
              className={`btn text-sm ${kind === k.id ? 'btn-primary' : 'btn-ghost'}`}
            >
              {k.name}
            </button>
          ))}
        </div>
      </div>
      <div className={kind === 'lectura' ? 'grid grid-cols-2 gap-2' : ''}>
        <div>
          <label className="label" htmlFor="gamount">{t.amount_label}</label>
          <input id="gamount" className="input" type="number" min={1} required value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>
        {kind === 'lectura' && (
          <div>
            <label className="label" htmlFor="gper">{t.per_item_label}</label>
            <input id="gper" className="input" type="number" min={10} value={perItem} onChange={(e) => setPerItem(Number(e.target.value))} />
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor="gdead">¿Para cuándo? {kind === 'general' && '(opcional)'}</label>
        <input id="gdead" className="input" type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        {!deadline && kind !== 'general' && <p className="mt-1 text-xs text-muted">Sin fecha, se calcula para 30 días.</p>}
      </div>

      {plan && (
        <div className="rounded-2xl border border-primary/50 bg-primary/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Hábito que se arma</p>
          <div className="mt-2 flex items-start gap-3">
            <AreaIcon area={plan.habit.area} size="sm" />
            <div>
              <p className="font-semibold">{plan.habit.name}</p>
              <p className="text-xs text-muted">{plan.habit.criterion}</p>
              <p className="mt-1"><Tier tier={plan.habit.tier} /></p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Meta: {fmt(plan.target)} {plan.unit} en {plan.days} {plan.days === 1 ? 'día' : 'días'} → {fmt(plan.daily)} {plan.unit} por día.
            Se propone a tu grupo y, si se aprueba, entra a tu plan desde mañana. La barra del cofre avanza con lo que marques. El cofre no se mezcla con las monedas del juego.
          </p>
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={busy || !plan || !title.trim()}>Crear objetivo</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

function GoalCard({ g, onChange }: { g: Goal; onChange: () => void }) {
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pct = Math.min(100, (g.progress / g.target) * 100)
  const done = g.progress >= g.target
  const t = goalKind(g.kind)

  async function addManual(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount.replace(',', '.'))
    if (!n) return
    const { error } = await supabase.from('goal_entries').insert({ goal_id: g.id, amount: n })
    if (error) return setError(errorMessage(error))
    setAmount(''); setAdding(false); onChange()
  }

  return (
    <li className={`card ${g.archived ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-bold">{done ? '🏆 ' : ''}{g.title}</p>
        <span className="shrink-0 text-xs text-muted">{t.name}</span>
      </div>
      <p className="mt-1 text-sm tabular-nums">
        <span className="font-black text-xp">{fmt(g.progress)}</span>
        <span className="text-muted"> / {fmt(g.target)} {g.unit}</span>
      </p>
      {g.kind === 'ahorro' ? <Chest pct={pct} /> : <div className="mt-2"><Bar value={pct} max={100} className={done ? 'bg-alimentacion' : 'bg-xp'} /></div>}
      {g.deadline && <p className="mt-1 text-xs text-muted">Hasta el {new Date(g.deadline + 'T12:00:00Z').toLocaleDateString('es-ES', { timeZone: 'UTC' })}</p>}
      <ErrorBox>{error}</ErrorBox>
      {adding ? (
        <form onSubmit={addManual} className="mt-3 flex gap-2">
          <input className="input min-w-0 flex-1" inputMode="decimal" placeholder={`Cantidad en ${g.unit} (negativa para restar)`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn btn-primary">Sumar</button>
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>✕</button>
        </form>
      ) : (
        <div className="mt-3 flex gap-2">
          <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => setAdding(true)}>+ Sumar avance a mano</button>
          <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={async () => { await supabase.from('goals').update({ archived: !g.archived }).eq('id', g.id); onChange() }}>
            {g.archived ? 'Reactivar' : 'Archivar'}
          </button>
        </div>
      )}
    </li>
  )
}

/** Objetivos con barra de progreso; cada uno arma un hábito diario que lo alimenta. */
export default function Goals() {
  const { session } = useAuth()
  const me = session!.user.id
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('goal_list', { p_user: me })
    if (error) setError(errorMessage(error))
    setGoals(((data ?? []) as Goal[]).map((g) => ({ ...g, target: Number(g.target), progress: Number(g.progress) })))
  }, [me])
  useEffect(() => { void load() }, [load])

  if (!goals) return <div className="grid place-items-center pt-10"><Spinner /></div>

  return (
    <>
      <ErrorBox>{error}</ErrorBox>
      {creating ? (
        <section className="card mb-4"><GoalForm onDone={() => { setCreating(false); void load() }} onCancel={() => setCreating(false)} /></section>
      ) : (
        <button className="btn btn-primary mb-4 w-full" onClick={() => setCreating(true)}>+ Nuevo cofre de ahorro</button>
      )}
      {goals.filter((g) => g.kind === 'ahorro').length === 0 && !creating && (
        <Empty>
          Todavía no tenés cofres. Un cofre aparece cuando tenés un objetivo de ahorro: plata real que juntás para algo (un celular, un viaje).
        </Empty>
      )}
      <ul className="space-y-2">{goals.filter((g) => g.kind === 'ahorro').map((g) => <GoalCard key={g.id} g={g} onChange={load} />)}</ul>
      <section className="card mt-5 space-y-2 text-sm">
        <h2 className="font-bold">¿Cómo funcionan los cofres?</h2>
        <p className="text-muted">Tu cofre es un <b className="text-ink">objetivo de ahorro</b>: la plata real la guardás vos; la app solo lleva la cuenta. No se mezcla con las monedas del juego.</p>
        <p className="text-muted">La barra suma cada check del hábito «Ahorrar…» (la cuota diaria), lo que agregues a mano y lo que contestes que ahorraste en el Juicio de la mañana.</p>
        <p className="text-muted">Premios en monedas del juego: al llegar al {MILESTONES.join(', ')} % ganás {MILESTONES.map((m) => MILESTONE_COINS[m]).join(', ')} monedas. Y cada semana cerrada en la que ahorraste algo y no gastaste de más (según el Juicio) suma {CONFIG.chestWeeklySafeBonus} {CONFIG.chestWeeklySafeBonus === 1 ? 'moneda' : 'monedas'}: «Cofre a salvo».</p>
        <p className="text-muted">El cofre del grupo está en la pestaña Grupo: ahí cada miembro anota cuánto puso; no mueve monedas del juego.</p>
      </section>
    </>
  )
}

const MILESTONE_COINS = Object.fromEntries(Object.entries(CONFIG.chestMilestones).map(([k, v]) => [Number(k), v])) as Record<number, number>
const MILESTONES = Object.keys(MILESTONE_COINS).map(Number).sort((a, b) => a - b)

/** Cofre de ahorro: barra de lo juntado; cada hito (25/50/75/100 %) da monedas del juego (content/config.json → chests). */
export function Chest({ pct, rewards = true }: { pct: number; rewards?: boolean }) {
  const coins = Math.round(pct / 10)
  return (
    <div className="mt-3">
      <div className="flex items-end gap-3">
        <span className="text-4xl" aria-hidden>{pct >= 100 ? '👑' : pct >= 50 ? '💰' : '🧰'}</span>
        <span className="flex-1 truncate text-lg leading-none" aria-label={`${Math.round(pct)} % del cofre`}>
          {'🪙'.repeat(coins)}<span className="opacity-20">{'🪙'.repeat(10 - coins)}</span>
        </span>
      </div>
      <div className="relative mt-2">
        <Bar value={pct} max={100} className="bg-xp" />
        {MILESTONES.slice(0, 3).map((m) => (
          <span key={m} className="absolute top-0 h-2.5 w-0.5 bg-bg" style={{ left: `${m}%` }} aria-hidden />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-4 text-center text-[11px]">
        {MILESTONES.map((m) => (
          <span key={m} className={pct >= m ? 'font-bold text-xp' : 'text-muted'}>{pct >= m ? '✓ ' : ''}{m}%{rewards ? ` · +${MILESTONE_COINS[m]} 🪙` : ''}</span>
        ))}
      </div>
    </div>
  )
}
