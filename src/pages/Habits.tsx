import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { catalogById } from '../lib/quiz'
import { useMyDay, type DayHabit, type DayVice } from '../lib/day'
import { describeChange, propose, type ChangeKind, type ChangeRequest, type Scope } from '../lib/changes'
import { useGroups } from '../lib/groups'
import { CONFIG, STRENGTH, type Severity } from '../game/config'
import { ONB } from '../lib/onboardingPlan'

const TRAINING = ONB.training.options
import { VICES } from '../lib/vices'
import CatalogPicker from '../components/CatalogPicker'
import Goals from '../components/Goals'
import { ErrorBox, Loading, PageHeader, PillarIcon, PillarSelect, PillarTag, Weight, WeightPicker } from '../components/ui'

export default function Habits() {
  const [tab, setTab] = useState<'plan' | 'chests'>('plan')
  return (
    <>
      <PageHeader title="Mi plan" subtitle="Los cambios se votan en el grupo y rigen desde mañana." />
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1" role="tablist">
        {(['plan', 'chests'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`min-h-10 rounded-lg text-sm font-semibold ${tab === t ? 'bg-surface-2 text-ink' : 'text-muted'}`}>
            {t === 'plan' ? 'Hábitos, vicios y objetivos' : 'Cofres de ahorro'}
          </button>
        ))}
      </div>
      {tab === 'plan' ? <Plan /> : <Goals />}
    </>
  )
}

function ScopePicker({ value, onChange, allowGroup = true }: { value: Scope; onChange: (s: Scope) => void; allowGroup?: boolean }) {
  return (
    <div>
      <span className="label">¿Para quién?</span>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`btn text-sm ${value === 'me' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange('me')}>Solo yo</button>
        <button type="button" disabled={!allowGroup} className={`btn text-sm ${value === 'group' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onChange('group')}>Todo el grupo</button>
      </div>
      {value === 'group' && <p className="mt-1 text-xs text-muted">Se agrega al plan de cada miembro (peso inicial {CONFIG.groupScopeDefaultWeight} para los demás; cada uno lo cambia después).</p>}
    </div>
  )
}

type Panel = null | { kind: 'catalog' } | { kind: 'custom' } | { kind: 'vice' } | { kind: 'objective' } | { kind: 'habit'; h: DayHabit } | { kind: 'viceEdit'; v: DayVice }
type Send = (scope: Scope, kind: ChangeKind, payload: Record<string, unknown>) => Promise<boolean>

function Plan() {
  const { session } = useAuth()
  const me = session!.user.id
  const { day, reload } = useMyDay()
  const { selected: group, loading: gLoading } = useGroups()
  const [panel, setPanel] = useState<Panel>(null)
  const [mine, setMine] = useState<ChangeRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const loadMine = useCallback(async () => {
    if (!group) return
    const { data } = await supabase.rpc('group_requests', { p_group: group.id })
    setMine(((data ?? []) as ChangeRequest[]).filter((r) => r.proposer_id === me))
  }, [group, me])
  useEffect(() => { void loadMine() }, [loadMine])

  const send: Send = async (scope, kind, payload) => {
    setError(null); setOk(null)
    const { error } = await propose(scope, kind, payload)
    if (error) { setError(errorMessage(error)); return false }
    setOk('Propuesta enviada. Si se aprueba, rige desde mañana.')
    setPanel(null)
    await Promise.all([reload(), loadMine()])
    return true
  }

  if (!day || gLoading) return <Loading />
  if (!group) return <p className="card text-sm text-muted">Para cambiar tu plan, primero <Link to="/grupos" className="font-semibold text-primary">uníte a un grupo o creá uno</Link>: los cambios se votan ahí.</p>

  const inPlan = new Set(day.habits.map((h) => h.catalog_id).filter(Boolean) as string[])
  const pending = mine.filter((r) => r.status === 'pending')
  const decided = mine.filter((r) => r.status !== 'pending')

  return (
    <>
      <ErrorBox>{error}</ErrorBox>
      {ok && <p className="mb-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">{ok}</p>}

      {pending.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 font-semibold">Tus propuestas en votación</h2>
          <ul className="space-y-1 text-sm">
            {pending.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span>{describeChange(r)}</span>
                <span className="shrink-0 text-xs text-muted">👍 {r.yes} · 👎 {r.no} de {r.voters}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TrainingLevel current={day.training_level} onSend={send} />

      <h2 className="mb-2 font-bold">Hábitos ({day.habits.length})</h2>
      <ul className="space-y-2">
        {day.habits.map((h) => (
          <li key={h.id} className="card">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{BLOCK_LABEL[h.block]}</p>
            <button className="flex w-full items-start gap-3 text-left" onClick={() => setPanel(panel?.kind === 'habit' && panel.h.id === h.id ? null : { kind: 'habit', h })}>
              <PillarIcon pillar={h.pillar} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{h.name} {h.private && <span className="text-xs text-muted">🔒</span>}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <PillarTag pillar={h.pillar} /><Weight w={h.weight} />
                  {h.target != null && <span className="text-xs text-muted">meta {h.target} {h.unit}</span>}
                </span>
              </span>
              <span className="text-sm text-muted">Cambiar ›</span>
            </button>
            {panel?.kind === 'habit' && panel.h.id === h.id && <HabitChange h={h} canRemove={day.habits.length > CONFIG.minActiveHabits} onSend={send} />}
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => setPanel({ kind: 'catalog' })}>+ Del catálogo</button>
        <button className="btn btn-ghost" onClick={() => setPanel({ kind: 'custom' })}>+ Hábito propio</button>
      </div>
      {panel?.kind === 'catalog' && <CatalogAdd inPlan={inPlan} onSend={send} onCancel={() => setPanel(null)} />}
      {panel?.kind === 'custom' && <CustomAdd onSend={send} onCancel={() => setPanel(null)} />}

      <h2 className="mb-2 mt-8 font-bold">Vicios ({day.vices.length})</h2>
      <p className="mb-2 text-xs text-muted">Cosas que querés evitar o reducir. Se marcan cada día en Hoy. Son privados: el grupo ve "Vicio" y su peso.</p>
      <ul className="space-y-2">
        {day.vices.map((v) => (
          <li key={v.id} className="card">
            <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setPanel(panel?.kind === 'viceEdit' && panel.v.id === v.id ? null : { kind: 'viceEdit', v })}>
              <span><span className="block font-semibold">{v.name}</span><span className="flex gap-3 text-xs text-muted"><Weight w={v.weight} /> {v.severity}</span></span>
              <span className="text-sm text-muted">Cambiar ›</span>
            </button>
            {panel?.kind === 'viceEdit' && panel.v.id === v.id && <ViceChange v={v} onSend={send} />}
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost mt-2 w-full" onClick={() => setPanel({ kind: 'vice' })}>+ Vicio</button>
      {panel?.kind === 'vice' && <ViceAdd onSend={send} onCancel={() => setPanel(null)} />}

      <h2 className="mb-2 mt-8 font-bold">Objetivos ({day.objectives.length}/{CONFIG.maxObjectives})</h2>
      <ul className="space-y-2">
        {day.objectives.map((o) => (
          <li key={o.id} className="card flex items-center justify-between gap-3">
            <span className="font-semibold">🎯 {o.title}</span>
            <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" onClick={() => send('me', 'objective.remove', { objective_id: o.id, title: o.title })}>Proponer sacarlo</button>
          </li>
        ))}
      </ul>
      {day.objectives.length < CONFIG.maxObjectives && (
        panel?.kind === 'objective'
          ? <ObjectiveAdd onSend={send} onCancel={() => setPanel(null)} />
          : <button className="btn btn-ghost mt-2 w-full" onClick={() => setPanel({ kind: 'objective' })}>+ Objetivo</button>
      )}

      {decided.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Decididas esta semana ({decided.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {decided.map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="text-muted">{describeChange(r)}</span>
                <span className={r.status === 'approved' ? 'text-alimentacion' : 'text-danger'}>{r.status === 'approved' ? 'Aprobada' : 'Rechazada'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-6 text-xs text-muted">
        Ojo con los pesos: marcar como difícil algo que ya te sale fácil sube tu puntaje. Por eso el grupo ve los pesos de todos, los cambios se votan y rigen desde mañana, y hay un mínimo de {CONFIG.minActiveHabits} hábitos.
      </p>
    </>
  )
}

const BLOCK_LABEL: Record<string, string> = { fuerza: '💪 Fuerza base', deporte: '🏃 Deporte o gimnasio', objetivo: '🎯 De un objetivo', general: '✨ General' }

function TrainingLevel({ current, onSend }: { current: number | null; onSend: Send }) {
  const [open, setOpen] = useState(false)
  const lvl = current ?? CONFIG.strengthDefaultLevel
  return (
    <section className="card mb-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Nivel de entrenamiento: {TRAINING[lvl]?.text ?? lvl}</p>
          <p className="text-xs text-muted">{STRENGTH.map((e) => `${e.targets[lvl]} ${e.name.toLowerCase()}`).join(' · ')} por día</p>
        </div>
        <button className="btn btn-ghost min-h-9 shrink-0 px-3 py-1 text-sm" onClick={() => setOpen(!open)}>Cambiar</button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <p className="text-xs text-muted">Se vota como cualquier cambio y rige desde mañana: hoy no se puede bajar la meta para llegar a 100.</p>
          {TRAINING.map((o) => (
            <button key={o.level} disabled={o.level === lvl} className="btn btn-ghost w-full justify-between text-left text-sm"
              onClick={() => onSend('me', 'training.level', { level: o.level, name: o.text })}>
              <span>{o.text}</span><span className="text-xs text-muted">{STRENGTH.map((e) => e.targets[o.level]).join(' / ')}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function HabitChange({ h, canRemove, onSend }: { h: DayHabit; canRemove: boolean; onSend: Send }) {
  if (h.block === 'fuerza') {
    return <p className="mt-3 border-t border-line pt-3 text-sm text-muted">La fuerza base es para todos: su meta cambia con tu nivel de entrenamiento (arriba).</p>
  }
  return <HabitChangeForm h={h} canRemove={canRemove} onSend={onSend} />
}

function HabitChangeForm({ h, canRemove, onSend }: { h: DayHabit; canRemove: boolean; onSend: Send }) {
  const [w, setW] = useState(h.weight)
  const [target, setTarget] = useState(h.target != null ? String(h.target) : '')
  const [scope, setScope] = useState<Scope>('me')
  const base = { habit_id: h.id, name: h.name }
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {!h.private && <ScopePicker value={scope} onChange={setScope} />}
      <WeightPicker value={w} onChange={setW} />
      <button className="btn btn-primary w-full" disabled={w === h.weight} onClick={() => onSend(scope, 'habit.weight', { ...base, weight: w })}>Proponer peso {w}</button>
      {(h.target != null || h.unit) && (
        <div className="flex gap-2">
          <input className="input" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Nueva meta" />
          <button className="btn btn-ghost" disabled={!target || Number(target) === h.target} onClick={() => onSend(scope, 'habit.target', { ...base, target: Number(target) })}>Proponer meta</button>
        </div>
      )}
      <button className="btn btn-ghost w-full text-danger" disabled={!canRemove} onClick={() => onSend(scope, 'habit.remove', base)}>
        {canRemove ? 'Proponer sacarlo' : `Mínimo ${CONFIG.minActiveHabits} hábitos: agregá otro antes`}
      </button>
    </div>
  )
}

function CatalogAdd({ inPlan, onSend, onCancel }: { inPlan: Set<string>; onSend: Send; onCancel: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const [w, setW] = useState(2)
  const [scope, setScope] = useState<Scope>('me')
  const [priv, setPriv] = useState(false)
  const c = catalogById(pick)
  return (
    <section className="mt-3 space-y-3">
      <CatalogPicker selected={new Set(pick ? [pick] : [])} disabled={inPlan}
        onToggle={(id) => { setPick(id === pick ? null : id); const ci = catalogById(id); setW(Math.min(3, ci?.tier ?? 2)); setPriv(Boolean(ci?.private_default)) }} />
      {c && (
        <div className="card sticky bottom-24 space-y-3">
          <p className="font-semibold">{c.name}</p>
          <WeightPicker value={w} onChange={setW} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--color-primary)]" checked={priv} onChange={(e) => { setPriv(e.target.checked); if (e.target.checked) setScope('me') }} />
            Privado (el grupo ve "Hábito privado" y su peso; no se vota)
          </label>
          {!priv && <ScopePicker value={scope} onChange={setScope} />}
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => onSend(priv ? 'me' : scope, 'habit.add', { catalog_id: c.id, name: c.name, weight: w, private: priv })}>Proponer</button>
            <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

function CustomAdd({ onSend, onCancel }: { onSend: Send; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [criterion, setCriterion] = useState('')
  const [pillar, setPillar] = useState('cuerpo')
  const [w, setW] = useState(2)
  const [measurable, setMeasurable] = useState(false)
  const [target, setTarget] = useState(500)
  const [unit, setUnit] = useState('')
  const [scope, setScope] = useState<Scope>('me')
  const [block, setBlock] = useState<'general' | 'deporte'>('general')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void onSend(scope, 'habit.add', { name: name.trim(), criterion: criterion.trim() || null, pillar, weight: w, block, ...(measurable ? { target, unit: unit.trim() } : {}) })
  }
  return (
    <form onSubmit={submit} className="card mt-3 space-y-3">
      <div><label className="label" htmlFor="cn">Nombre</label><input id="cn" className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className="label" htmlFor="cc">¿Cuándo cuenta como hecho? (opcional)</label><input id="cc" className="input" maxLength={160} value={criterion} onChange={(e) => setCriterion(e.target.value)} /></div>
      <div>
        <span className="label">Tipo</span>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`btn text-sm ${block === 'general' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBlock('general')}>✨ General</button>
          <button type="button" className={`btn text-sm ${block === 'deporte' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setBlock('deporte'); setPillar('cuerpo') }}>🏃 Deporte o gimnasio</button>
        </div>
      </div>
      <div><label className="label" htmlFor="cp">Pilar</label><PillarSelect id="cp" value={pillar} onChange={setPillar} /></div>
      <WeightPicker value={w} onChange={setW} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--color-primary)]" checked={measurable} onChange={(e) => setMeasurable(e.target.checked)} />
        Tiene una meta medible (ej. 500 palabras)
      </label>
      {measurable && (
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" min={2} required value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Meta diaria" />
          <input className="input" required maxLength={20} placeholder="palabras" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unidad" />
        </div>
      )}
      <ScopePicker value={scope} onChange={setScope} />
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={!name.trim()}>Proponer</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

const SEVERITIES: Severity[] = ['leve', 'normal', 'grave']

function ViceAdd({ onSend, onCancel }: { onSend: Send; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [severity, setSeverity] = useState<Severity>('normal')
  const [w, setW] = useState(1)
  return (
    <form onSubmit={(e) => { e.preventDefault(); void onSend('me', 'vice.add', { name: name.trim(), suggestion_id: suggestion, severity, weight: w }) }} className="card mt-3 space-y-3">
      <div>
        <label className="label" htmlFor="vn">¿Qué querés evitar o reducir?</label>
        <input id="vn" className="input" required maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setSuggestion(null) }} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {VICES.map((v) => (
            <button type="button" key={v.id} className={`rounded-full px-3 py-1 text-xs ${suggestion === v.id ? 'bg-primary text-bg' : 'bg-surface-2 text-ink'}`}
              onClick={() => { setName(v.name); setSuggestion(v.id) }}>{v.name}</button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">Gravedad (multiplica el día si lo hacés sin permiso)</span>
        <div className="grid grid-cols-3 gap-2">
          {SEVERITIES.map((s) => (
            <button type="button" key={s} onClick={() => setSeverity(s)} className={`btn text-sm ${severity === s ? 'btn-primary' : 'btn-ghost'}`}>
              {s} ×{CONFIG.severity[s].toLocaleString('es-ES')}
            </button>
          ))}
        </div>
      </div>
      <WeightPicker value={w} onChange={setW} label="¿Cuánto te cuesta evitarlo?" />
      <p className="text-xs text-muted">Es privado: se aprueba sin votación y rige desde mañana.</p>
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={!name.trim()}>Agregar</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

function ViceChange({ v, onSend }: { v: DayVice; onSend: Send }) {
  const [w, setW] = useState(v.weight)
  const [severity, setSeverity] = useState<Severity>(v.severity)
  const base = { vice_id: v.id, name: v.name }
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      <WeightPicker value={w} onChange={setW} label="¿Cuánto te cuesta evitarlo?" />
      <button className="btn btn-primary w-full" disabled={w === v.weight} onClick={() => onSend('me', 'vice.weight', { ...base, weight: w })}>Cambiar peso</button>
      <div className="grid grid-cols-3 gap-2">
        {SEVERITIES.map((s) => <button key={s} className={`btn text-sm ${severity === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSeverity(s)}>{s}</button>)}
      </div>
      <button className="btn btn-ghost w-full" disabled={severity === v.severity} onClick={() => onSend('me', 'vice.severity', { ...base, severity })}>Cambiar gravedad</button>
      <button className="btn btn-ghost w-full text-danger" onClick={() => onSend('me', 'vice.remove', base)}>Sacarlo</button>
    </div>
  )
}

function ObjectiveAdd({ onSend, onCancel }: { onSend: Send; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState<Scope>('me')
  return (
    <form onSubmit={(e) => { e.preventDefault(); void onSend(scope, 'objective.add', { title: title.trim() }) }} className="card mt-3 space-y-3">
      <div><label className="label" htmlFor="ot">¿Qué querés lograr?</label><input id="ot" className="input" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <ScopePicker value={scope} onChange={setScope} />
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={!title.trim()}>Proponer</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}
