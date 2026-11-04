import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { Chest } from './Goals'
import { ErrorBox } from './ui'

interface ChestRow {
  id: string
  title: string
  target: number
  unit: string
  archived: boolean
  created_by: string
  total: number
  contributions: { user_id: string; username: string; amount: number }[]
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-ES')

/** Cofres compartidos del grupo (ej. un viaje juntos). Es solo registro: la app no mueve plata. */
export default function GroupChests({ groupId, me }: { groupId: string; me: string }) {
  const [rows, setRows] = useState<ChestRow[]>([])
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState(500)
  const [adding, setAdding] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('group_chest_list', { p_group: groupId })
    if (error) setError(errorMessage(error))
    setRows(((data ?? []) as ChestRow[]).map((r) => ({ ...r, target: Number(r.target), total: Number(r.total) })))
  }, [groupId])
  useEffect(() => { void load() }, [load])

  async function create(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('group_chests').insert({ group_id: groupId, title: title.trim(), target, created_by: me })
    if (error) return setError(errorMessage(error))
    setTitle(''); setCreating(false); setError(null); void load()
  }
  async function contribute(e: FormEvent, chestId: string) {
    e.preventDefault()
    const n = Number(amount.replace(',', '.'))
    if (!n) return
    const { error } = await supabase.from('group_chest_entries').insert({ chest_id: chestId, amount: n })
    if (error) return setError(errorMessage(error))
    setAmount(''); setAdding(null); setError(null); void load()
  }

  return (
    <section className="card mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">🧰 Cofres del grupo</h2>
        {!creating && <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => setCreating(true)}>+ Nuevo</button>}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {creating && (
        <form onSubmit={create} className="mb-3 space-y-2">
          <input className="input" required maxLength={60} placeholder="Ej.: Viaje a la costa" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <input className="input" type="number" min={1} required value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Meta en euros" />
            <button className="btn btn-primary" disabled={!title.trim()}>Crear</button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>✕</button>
          </div>
        </form>
      )}
      {rows.length === 0 && !creating && <p className="text-sm text-muted">Un cofre compartido para juntar entre todos (un viaje, un asado…). Cada uno anota lo que pone.</p>}
      <ul className="space-y-4">
        {rows.filter((r) => !r.archived).map((r) => {
          const pct = Math.min(100, (r.total / r.target) * 100)
          return (
            <li key={r.id}>
              <p className="flex items-baseline justify-between gap-2">
                <b>{r.title}</b>
                <span className="text-sm tabular-nums"><b className="text-xp">{fmt(r.total)}</b><span className="text-muted"> / {fmt(r.target)} {r.unit}</span></span>
              </p>
              <Chest pct={pct} />
              {r.contributions.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {r.contributions.map((c) => `${c.user_id === me ? 'vos' : c.username} ${fmt(Number(c.amount))} ${r.unit}`).join(' · ')}
                </p>
              )}
              {adding === r.id ? (
                <form onSubmit={(e) => contribute(e, r.id)} className="mt-2 flex gap-2">
                  <input className="input" inputMode="decimal" placeholder={`¿Cuánto pusiste? (${r.unit})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <button className="btn btn-primary">Aportar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAdding(null)}>✕</button>
                </form>
              ) : (
                <button className="btn btn-ghost mt-2 min-h-9 px-3 py-1 text-sm" onClick={() => setAdding(r.id)}>🪙 Anotar aporte</button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
