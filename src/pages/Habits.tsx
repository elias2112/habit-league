import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { AREAS, MIN_ACTIVE_HABITS, TIER_LABEL, catalogById, pointsFor } from '../lib/quiz'
import { reviewBadge, useMyReviews } from '../lib/reviews'
import type { Habit } from '../lib/types'
import CatalogPicker from '../components/CatalogPicker'
import Goals from '../components/Goals'
import Vices from '../components/Vices'
import { AreaIcon, AreaTag, Empty, ErrorBox, Loading, PageHeader, Tier } from '../components/ui'

interface Draft { name: string; criterion: string; area: string; tier: number; partial: boolean; target: number; unit: string }

function CustomHabitForm({ onSubmit, onCancel }: { onSubmit: (d: Draft) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState<Draft>({ name: '', criterion: '', area: 'cuerpo', tier: 2, partial: false, target: 4, unit: '' })
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!d.name.trim()) return
    setBusy(true)
    try { await onSubmit({ ...d, name: d.name.trim(), criterion: d.criterion.trim(), unit: d.unit.trim() }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="hname">Nombre</label>
        <input id="hname" className="input" maxLength={60} required placeholder="Ej.: Practicar guitarra 15 minutos" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="hcrit">¿Cuándo cuenta como hecho? (opcional)</label>
        <input id="hcrit" className="input" maxLength={160} placeholder="Ej.: 15 minutos seguidos con la guitarra" value={d.criterion} onChange={(e) => setD({ ...d, criterion: e.target.value })} />
      </div>
      <div>
        <label className="label" htmlFor="harea">Área</label>
        <select id="harea" className="input" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })}>
          {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <span className="label">Peso para vos (dificultad)</span>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((t) => (
            <button type="button" key={t} onClick={() => setD({ ...d, tier: t })} className={`btn ${d.tier === t ? 'btn-primary' : 'btn-ghost'}`}>
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Más peso = más parte de tus 100 puntos diarios. Agregar hábitos no te da más puntos: se reparten.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--color-primary)]" checked={d.partial} onChange={(e) => setD({ ...d, partial: e.target.checked })} />
        Se marca por partes (ej. vasos, páginas, series)
      </label>
      {d.partial && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="htarget">Meta diaria</label>
            <input id="htarget" className="input" type="number" min={2} max={100000} required value={d.target} onChange={(e) => setD({ ...d, target: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="hunit">Unidad</label>
            <input id="hunit" className="input" maxLength={20} required placeholder="series" value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} />
          </div>
        </div>
      )}
      <p className="rounded-xl border border-xp/40 bg-xp/10 px-3 py-2 text-xs text-xp">
        Tu grupo lo tiene que aprobar (al menos la mitad del resto). Mientras tanto podés marcarlo: si lo aprueban, esos días suman; si no, no.
        Después de crearlo solo vas a poder bajarle la dificultad.
      </p>
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={busy || !d.name.trim()}>Proponer hábito</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

type Mode = null | 'catalog' | 'custom'

export default function Habits() {
  const [tab, setTab] = useState<'habits' | 'goals' | 'vices'>('habits')
  return (
    <>
      <PageHeader title="Mis hábitos" subtitle="Tu grupo ve tus hábitos y lo que marcás (menos los privados)." />
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="tablist">
        {(['habits', 'goals', 'vices'] as const).map((t) => (
          <button
            key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-10 rounded-lg text-sm font-semibold ${tab === t ? 'bg-surface-2 text-ink' : 'text-muted'}`}
          >
            {t === 'habits' ? 'Hábitos' : t === 'goals' ? 'Objetivos' : 'Vicios'}
          </button>
        ))}
      </div>
      {tab === 'habits' ? <HabitsList /> : tab === 'goals' ? <Goals /> : <Vices />}
    </>
  )
}

function HabitsList() {
  const { session } = useAuth()
  const me = session!.user.id
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const { byHabit, reload: reloadReviews } = useMyReviews()

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
    await reloadReviews()
    return true
  }

  const active = habits.filter((h) => !h.archived)
  const archived = habits.filter((h) => h.archived)
  const tiers = active.map((h) => h.tier)
  const activeCatalog = new Set(active.map((h) => h.catalog_id).filter(Boolean) as string[])

  const addCustom = async (d: Draft) => {
    const row = { user_id: me, name: d.name, criterion: d.criterion || null, area: d.area, tier: d.tier, target: d.partial ? d.target : 1, unit: d.partial ? d.unit : null }
    if (await run(supabase.from('habits').insert(row))) setMode(null)
  }
  const addFromCatalog = async () => {
    // Si estaba archivado, se restaura en vez de duplicarlo.
    const restore = archived.filter((h) => h.catalog_id && picked.has(h.catalog_id))
    const restoreIds = new Set(restore.map((h) => h.catalog_id))
    const rows = [...picked].filter((id) => !restoreIds.has(id)).map((id) => {
      const c = catalogById(id)!
      return { user_id: me, name: c.name, catalog_id: c.id, private: Boolean(c.private_default) }
    })
    if (restore.length && !(await run(supabase.from('habits').update({ archived: false }).in('id', restore.map((h) => h.id))))) return
    if (rows.length && !(await run(supabase.from('habits').insert(rows)))) return
    setPicked(new Set())
    setMode(null)
  }
  const archive = (h: Habit) => {
    if (active.length <= MIN_ACTIVE_HABITS) {
      setError(`Necesitás al menos ${MIN_ACTIVE_HABITS} hábitos activos. Agregá otro antes de archivar este.`)
      return
    }
    void run(supabase.from('habits').update({ archived: true }).eq('id', h.id))
  }

  if (loading) return <Loading />

  return (
    <>
      <ErrorBox>{error}</ErrorBox>

      {mode === null && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className="btn btn-primary" onClick={() => setMode('catalog')}>+ Del catálogo</button>
          <button className="btn btn-ghost" onClick={() => setMode('custom')}>+ Hábito propio</button>
        </div>
      )}

      {mode === 'custom' && (
        <section className="card mb-4">
          <CustomHabitForm onSubmit={addCustom} onCancel={() => setMode(null)} />
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
        {active.map((h) => {
          const badge = h.catalog_id ? null : reviewBadge(byHabit.get(h.id))
          const criterion = h.criterion ?? catalogById(h.catalog_id)?.criterion
          return (
            <li key={h.id} className="card">
              <div className="flex items-start gap-3">
                <AreaIcon area={h.area} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{h.name} {h.private && <span className="text-xs text-muted">🔒</span>}</p>
                  {criterion && <p className="text-xs text-muted">{criterion}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <AreaTag area={h.area} />
                    <Tier tier={h.tier} />
                    <span className="text-xs font-bold text-xp">{Math.round(pointsFor(h.tier, tiers))} pts</span>
                    {h.target > 1 && <span className="text-xs text-muted">meta {h.target} {h.unit}</span>}
                    <span className="text-xs text-muted">{h.catalog_id ? 'Catálogo' : h.goal_id ? 'De un objetivo' : 'Propio'}</span>
                  </p>
                  {badge && <p className={`mt-1 text-xs font-semibold ${badge.tone === 'pending' ? 'text-xp' : 'text-danger'}`}>{badge.tone === 'pending' ? '⏳' : '✕'} {badge.text}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {h.catalog_id && (
                      <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => run(supabase.from('habits').update({ private: !h.private }).eq('id', h.id))}>
                        {h.private ? '🔓 Hacer visible' : '🔒 Hacer privado'}
                      </button>
                    )}
                    {!h.catalog_id && h.tier > 1 && (
                      <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => run(supabase.from('habits').update({ tier: h.tier - 1 }).eq('id', h.id))}>
                        Bajar a {TIER_LABEL[h.tier - 1]}
                      </button>
                    )}
                    <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => archive(h)}>Archivar</button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Archivados ({archived.length})</summary>
          <ul className="mt-2 space-y-2">
            {archived.map((h) => (
              <li key={h.id} className="card flex items-center gap-3 opacity-70">
                <AreaIcon area={h.area} size="sm" />
                <span className="flex-1 truncate">{h.name}</span>
                <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => run(supabase.from('habits').update({ archived: false }).eq('id', h.id))}>Restaurar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-6 text-xs text-muted">
        Tus hábitos activos se reparten 100 puntos por día según su peso. Los privados (solo del catálogo) suman igual, pero tu grupo ve "Hábito privado" sin nombre ni foto.
      </p>
    </>
  )
}
