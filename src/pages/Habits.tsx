import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { AREAS, MIN_ACTIVE_HABITS, TIER_LABEL, catalogById, pointsFor } from '../lib/quiz'
import type { Habit } from '../lib/types'
import CatalogPicker from '../components/CatalogPicker'
import { AreaIcon, AreaTag, Empty, ErrorBox, Loading, PageHeader, Tier } from '../components/ui'

interface Draft { name: string; area: string; tier: number }

function HabitForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: Draft
  submitLabel: string
  onSubmit: (d: Draft) => Promise<void>
  onCancel: () => void
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
        <input className="input" maxLength={60} required placeholder="Ej.: Practicar guitarra 15 minutos" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div>
        <label className="label">Área</label>
        <select className="input" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })}>
          {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Dificultad</label>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((t) => (
            <button
              type="button" key={t} onClick={() => setD({ ...d, tier: t })}
              className={`btn ${d.tier === t ? 'btn-primary' : 'btn-ghost'}`}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Los más difíciles valen más puntos dentro de tus 100 diarios.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={busy || !d.name.trim()}>{submitLabel}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

type Mode = null | 'catalog' | 'custom'

export default function Habits() {
  const { session } = useAuth()
  const me = session!.user.id
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

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

  const active = habits.filter((h) => !h.archived)
  const archived = habits.filter((h) => h.archived)
  const tiers = active.map((h) => h.tier)
  const activeCatalog = new Set(active.map((h) => h.catalog_id).filter(Boolean) as string[])

  const addCustom = async (d: Draft) => {
    if (await run(supabase.from('habits').insert({ user_id: me, name: d.name, area: d.area, tier: d.tier }))) setMode(null)
  }
  const addFromCatalog = async () => {
    // Si estaba archivado, se restaura en vez de duplicarlo.
    const restore = archived.filter((h) => h.catalog_id && picked.has(h.catalog_id))
    const restoreIds = new Set(restore.map((h) => h.catalog_id))
    const rows = [...picked].filter((id) => !restoreIds.has(id)).map((id) => {
      const c = catalogById(id)!
      return { user_id: me, name: c.name, tier: c.tier, area: c.area, catalog_id: c.id }
    })
    if (restore.length && !(await run(supabase.from('habits').update({ archived: false }).in('id', restore.map((h) => h.id))))) return
    if (rows.length && !(await run(supabase.from('habits').insert(rows)))) return
    setPicked(new Set())
    setMode(null)
    await load()
  }
  const update = async (id: string, d: Draft) => {
    if (await run(supabase.from('habits').update({ name: d.name, area: d.area, tier: d.tier }).eq('id', id))) setEditing(null)
  }
  const archive = (h: Habit) => {
    if (active.length <= MIN_ACTIVE_HABITS) {
      setError(`Necesitás al menos ${MIN_ACTIVE_HABITS} hábitos activos. Agregá otro antes de archivar este.`)
      return
    }
    void run(supabase.from('habits').update({ archived: true }).eq('id', h.id))
  }
  const restore = (h: Habit) => run(supabase.from('habits').update({ archived: false }).eq('id', h.id))

  if (loading) return <Loading />

  return (
    <>
      <PageHeader title="Mis hábitos" subtitle="Tu grupo puede ver tus hábitos y lo que marcás." />
      <ErrorBox>{error}</ErrorBox>

      {mode === null && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className="btn btn-primary" onClick={() => setMode('catalog')}>+ Del catálogo</button>
          <button className="btn btn-ghost" onClick={() => setMode('custom')}>+ Hábito propio</button>
        </div>
      )}

      {mode === 'custom' && (
        <section className="card mb-4">
          <HabitForm initial={{ name: '', area: 'cuerpo', tier: 1 }} submitLabel="Crear hábito" onSubmit={addCustom} onCancel={() => setMode(null)} />
        </section>
      )}

      {mode === 'catalog' && (
        <section className="mb-6">
          <div className="sticky top-0 z-10 -mx-4 mb-3 flex gap-2 bg-bg/95 px-4 py-2 backdrop-blur">
            <button className="btn btn-primary flex-1" disabled={picked.size === 0} onClick={addFromCatalog}>
              Agregar {picked.size || ''}
            </button>
            <button className="btn btn-ghost" onClick={() => { setPicked(new Set()); setMode(null) }}>Cancelar</button>
          </div>
          <CatalogPicker
            selected={picked}
            disabled={activeCatalog}
            onToggle={(id) => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n) }}
          />
        </section>
      )}

      {active.length > 0 && active.length < MIN_ACTIVE_HABITS && (
        <p className="mb-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          Tenés {active.length}. El mínimo son {MIN_ACTIVE_HABITS} hábitos activos.
        </p>
      )}

      {active.length === 0 && mode === null && <Empty>No tenés hábitos activos.</Empty>}

      <ul className="space-y-2">
        {active.map((h) => (
          <li key={h.id} className="card">
            {editing === h.id ? (
              <HabitForm
                initial={{ name: h.name, area: h.area ?? 'cuerpo', tier: h.tier }}
                submitLabel="Guardar"
                onSubmit={(d) => update(h.id, d)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-start gap-3">
                <AreaIcon area={h.area} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{h.name}</span>
                  {catalogById(h.catalog_id)?.criterion && <span className="block text-xs text-muted">{catalogById(h.catalog_id)!.criterion}</span>}
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <AreaTag area={h.area} />
                    <Tier tier={h.tier} />
                    <span className="text-xs font-bold text-xp">{Math.round(pointsFor(h.tier, tiers))} pts</span>
                  </span>
                  <span className="mt-2 flex gap-2">
                    <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => setEditing(h.id)}>Editar</button>
                    <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => archive(h)}>Archivar</button>
                  </span>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Archivados ({archived.length})</summary>
          <ul className="mt-2 space-y-2">
            {archived.map((h) => (
              <li key={h.id} className="card flex items-center gap-3 opacity-70">
                <AreaIcon area={h.area} size="sm" />
                <span className="flex-1 truncate">{h.name}</span>
                <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => restore(h)}>Restaurar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-6 text-xs text-muted">
        Tus hábitos activos se reparten 100 puntos por día según su dificultad. Cambiar hábitos solo afecta a lo que marques desde ahora; agregar uno a mitad del día no te deja pasar de 100.
      </p>
    </>
  )
}
