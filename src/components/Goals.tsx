import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { todayIn } from '../lib/date'
import { GOAL_KINDS, detectKind, goalKind, planGoal, type GoalKind } from '../lib/goals'
import type { Goal } from '../lib/types'
import { AreaIcon, Bar, Empty, ErrorBox, Spinner, Tier } from './ui'

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')

function GoalForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { session, profile } = useAuth()
  const me = session!.user.id
  const today = todayIn(profile?.timezone ?? 'Europe/Madrid')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<GoalKind>('general')
  const [touchedKind, setTouchedKind] = useState(false)
  const [amount, setAmount] = useState(goalKind('general').default_amount)
  const [perItem, setPerItem] = useState(250)
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El tipo se adivina por el título hasta que la persona lo elige a mano.
  useEffect(() => {
    if (touchedKind) return
    const k = detectKind(title)
    if (k !== kind) { setKind(k); setAmount(goalKind(k).default_amount) }
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
      const { error: e2 } = await supabase.from('habits').insert({ user_id: me, ...plan.habit, goal_id: g.id })
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
        <label className="label" htmlFor="gtitle">¿Qué querés lograr?</label>
        <input id="gtitle" className="input" maxLength={80} required placeholder="Ej.: Comprar un celular, leer un libro por semana…" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <span className="label">Tipo</span>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_KINDS.map((k) => (
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
            Es un hábito propio: tu grupo lo tiene que aprobar para que sume en el ranking (la barra del objetivo avanza igual).
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
      <div className="mt-2"><Bar value={pct} max={100} className={done ? 'bg-alimentacion' : 'bg-xp'} /></div>
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
        <button className="btn btn-primary mb-4 w-full" onClick={() => setCreating(true)}>+ Nuevo objetivo</button>
      )}
      {goals.length === 0 && !creating && (
        <Empty>
          Poné algo que quieras lograr (comprar algo, leer, escribir…) y te armamos el hábito diario con una barra de progreso.
        </Empty>
      )}
      <ul className="space-y-2">{goals.map((g) => <GoalCard key={g.id} g={g} onChange={load} />)}</ul>
      <p className="mt-4 text-xs text-muted">
        La barra suma lo que marcás en el hábito del objetivo (cada check de ahorro = la cuota diaria; páginas y palabras, lo que cargues) más lo que agregues a mano.
      </p>
    </>
  )
}
