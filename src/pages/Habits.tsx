import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import type { Habit } from '../lib/types'
import { Empty, ErrorBox, PageHeader, Spinner } from '../components/ui'

const ICONS = ['📚', '🏃', '💧', '🧘', '💪', '🥗', '😴', '✍️', '🎸', '🚭', '🧹', '💊']

interface Draft { name: string; icon: string; xp: number }

function HabitForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: Draft
  submitLabel: string
  onSubmit: (d: Draft) => Promise<void>
  onCancel?: () => void
}) {
  const [d, setD] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!d.name.trim()) return
    setBusy(true)
    try { await onSubmit({ ...d, name: d.name.trim() }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">Nombre</label>
        <input className="input" maxLength={60} required placeholder="Ej.: Leer 20 minutos" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Icono</label>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((i) => (
            <button
              type="button" key={i} onClick={() => setD({ ...d, icon: d.icon === i ? '' : i })}
              className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${d.icon === i ? 'bg-emerald-600' : 'bg-slate-800'}`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">XP por día: <b className="text-emerald-400">{d.xp}</b></label>
        <input type="range" min={5} max={50} step={5} value={d.xp} onChange={(e) => setD({ ...d, xp: Number(e.target.value) })} className="w-full accent-emerald-500" />
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={busy || !d.name.trim()}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  )
}

export default function Habits() {
  const { session } = useAuth()
  const me = session!.user.id
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('habits').select('*').eq('user_id', me).order('created_at')
    if (error) setError(errorMessage(error))
    else setHabits(data as Habit[])
    setLoading(false)
  }, [me])

  useEffect(() => { void load() }, [load])

  async function run(p: PromiseLike<{ error: unknown }>) {
    const { error } = await p
    if (error) { setError(errorMessage(error)); return false }
    setError(null)
    await load()
    return true
  }

  const create = async (d: Draft) => {
    if (await run(supabase.from('habits').insert({ user_id: me, name: d.name, icon: d.icon || null, xp_value: d.xp }))) setCreating(false)
  }
  const update = async (id: string, d: Draft) => {
    if (await run(supabase.from('habits').update({ name: d.name, icon: d.icon || null, xp_value: d.xp }).eq('id', id))) setEditing(null)
  }
  const setArchived = (id: string, archived: boolean) => run(supabase.from('habits').update({ archived }).eq('id', id))

  if (loading) return <div className="grid place-items-center pt-24"><Spinner /></div>

  const active = habits.filter((h) => !h.archived)
  const archived = habits.filter((h) => h.archived)

  return (
    <>
      <PageHeader
        title="Mis hábitos"
        subtitle="Tu grupo puede ver tus hábitos y lo que marcas."
        right={!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nuevo</button>}
      />
      <ErrorBox>{error}</ErrorBox>

      {creating && (
        <section className="card mb-4">
          <HabitForm initial={{ name: '', icon: '', xp: 10 }} submitLabel="Crear hábito" onSubmit={create} onCancel={() => setCreating(false)} />
        </section>
      )}

      {active.length === 0 && !creating && <Empty>No tienes hábitos activos.</Empty>}

      <ul className="space-y-2">
        {active.map((h) => (
          <li key={h.id} className="card">
            {editing === h.id ? (
              <HabitForm
                initial={{ name: h.name, icon: h.icon ?? '', xp: h.xp_value }}
                submitLabel="Guardar"
                onSubmit={(d) => update(h.id, d)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-800 text-xl">{h.icon || '•'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{h.name}</span>
                  <span className="text-sm text-slate-400">+{h.xp_value} XP</span>
                </span>
                <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(h.id)}>Editar</button>
                <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => setArchived(h.id, true)}>Archivar</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-slate-400">Archivados ({archived.length})</summary>
          <ul className="mt-2 space-y-2">
            {archived.map((h) => (
              <li key={h.id} className="card flex items-center gap-3 opacity-70">
                <span className="text-xl">{h.icon || '•'}</span>
                <span className="flex-1 truncate">{h.name}</span>
                <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => setArchived(h.id, false)}>Restaurar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Cambiar el XP de un hábito solo afecta a los días que marques a partir de ahora. Archivar lo oculta de "Hoy" sin borrar el XP ganado.
      </p>
    </>
  )
}
