import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { QUESTIONS, archetypeById, catalogById, computeProfile, directSuggestions, directVices, isAnswered, type Answers as QuizAnswers } from '../lib/quiz'
import { viceById } from '../lib/vices'
import { todayIn } from '../lib/date'
import { nextStep, addGoal, type OnboardingState } from '../game/onboarding'
import { CONFIG, PILLARS, STRENGTH } from '../game/config'
import { ONB, OBJECTIVES, buildObjective, objectiveDef, suggestGeneral, type Answers, type DraftHabit } from '../lib/onboardingPlan'
import ArchetypeCard from '../components/ArchetypeCard'
import CatalogPicker, { catalogPillar } from '../components/CatalogPicker'
import { ErrorBox, PillarIcon, PillarSelect, WEIGHT_LABEL } from '../components/ui'

type Phase = 'flow' | 'sport' | 'quiz' | 'result' | 'pack' | 'group'
interface Draft {
  s: OnboardingState
  goalAnswers: Record<string, Answers>
  sport: { name: string; unit: string; target: string; weight: number }
  quiz: QuizAnswers
  qIndex: number
  phase: Phase
}
const EMPTY: Draft = { s: { goals: [], personalized: [] }, goalAnswers: {}, sport: { name: '', unit: '', target: '', weight: 2 }, quiz: {}, qIndex: 0, phase: 'flow' }
const KEY = 'hl:onboardingV4'
const QUIZ = QUESTIONS.filter((q) => ['estructura', 'momentum', 'resiliencia', 'directas'].includes(q.section))

function load(): Draft { try { const r = localStorage.getItem(KEY); if (r) return { ...EMPTY, ...JSON.parse(r) } } catch { /* sin almacenamiento */ } return EMPTY }
function save(d: Draft | null) { try { if (d) localStorage.setItem(KEY, JSON.stringify(d)); else localStorage.removeItem(KEY) } catch { /* sin almacenamiento */ } }

function Shell({ children, footer, onBack, progress }: { children: ReactNode; footer?: ReactNode; onBack?: () => void; progress?: number }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      {onBack && <button onClick={onBack} className="mb-3 -ml-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-muted">‹ Atrás</button>}
      {progress != null && <div className="mb-6 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
      <div className="flex-1 pb-6">{children}</div>
      {footer && <div className="sticky bottom-0 -mx-5 border-t border-line bg-bg/95 px-5 pt-3 backdrop-blur" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
    </div>
  )
}

const Option = ({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) => (
  <button onClick={onClick} aria-pressed={on}
    className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left font-medium transition active:scale-[.99] ${on ? 'border-primary bg-primary/15' : 'border-line bg-surface'}`}>
    {children}
  </button>
)

export default function Onboarding() {
  const { session, profile, refreshProfile } = useAuth()
  const me = session!.user.id
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(load)
  const [history, setHistory] = useState<Draft[]>([])
  const [picking, setPicking] = useState<string[]>([])
  const [form, setForm] = useState<Answers>({})
  const [hasPlan, setHasPlan] = useState<boolean | null>(null)
  const [pack, setPack] = useState<DraftHabit[] | null>(null)
  const [vices, setVices] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayIn(profile?.timezone ?? 'Europe/Madrid')

  useEffect(() => { save(d) }, [d])
  // Repetir el cuestionario con plan: solo actitud y directas (el plan se cambia con propuestas).
  useEffect(() => {
    supabase.rpc('my_day').then(({ data }) => {
      const hp = Boolean((data as { has_plan?: boolean } | null)?.has_plan)
      setHasPlan(hp)
      if (hp) setD((x) => (x.phase === 'flow' || x.phase === 'sport' ? { ...x, phase: 'quiz' } : x))
    })
  }, [])

  const step = nextStep(d.s)
  // Terminado el flujo de objetivos (nextStep = done), sigue el deporte.
  useEffect(() => { if (d.phase === 'flow' && step.step === 'done') setD((x) => ({ ...x, phase: 'sport' })) }, [d.phase, step.step])

  const go = (next: Draft) => { setHistory((h) => [...h, d]); setD(next); setError(null) }
  const back = history.length ? () => { setD(history[history.length - 1]); setHistory((h) => h.slice(0, -1)) } : undefined

  const profileResult = useMemo(() => computeProfile(d.quiz), [d.quiz])
  const arch = archetypeById(profileResult.archetype)

  function buildPack() {
    const objs = d.s.goals.map((g, i) => buildObjective(objectiveDef(g), d.goalAnswers[g] ?? {}, i, today))
    const fromGoals = objs.flatMap((o) => o.habits)
    const used = new Set(fromGoals.map((h) => h.catalog_id).filter(Boolean) as string[])
    const direct = directSuggestions(d.quiz).filter((id) => !used.has(id) && catalogPillar(catalogById(id)!.area)).map((id): DraftHabit => {
      const c = catalogById(id)!
      used.add(id)
      return { key: `d-${id}`, name: c.name, catalog_id: id, pillar: catalogPillar(c.area), weight: Math.min(3, c.tier), block: 'general', private: Boolean(c.private_default) }
    })
    const general = suggestGeneral(arch?.start_habits ?? 3, used)
    setPack([...fromGoals, ...direct, ...general])
    const v = new Set<string>(directVices(d.quiz))
    objs.forEach((o) => { if (o.vice) v.add(o.vice.suggestion_id) })
    setVices(v)
  }

  // Al volver a la app en el paso del paquete, se vuelve a armar.
  useEffect(() => { if (d.phase === 'pack' && !pack) buildPack() })

  async function finish() {
    setBusy(true); setError(null)
    try {
      if (!hasPlan) {
        const objs = d.s.goals.map((g, i) => buildObjective(objectiveDef(g), d.goalAnswers[g] ?? {}, i, today))
        const sport = { name: d.sport.name.trim(), pillar: 'cuerpo', block: 'deporte', weight: d.sport.weight,
          ...(d.sport.unit.trim() && Number(d.sport.target) > 0 ? { unit: d.sport.unit.trim(), target: Number(d.sport.target) } : {}) }
        const habits = [sport, ...(pack ?? []).map((h) => { const { key, ...rest } = h; void key; return rest })]
        const vicePayload = [...vices].map((id) => ({ name: viceById(id)?.name ?? id, suggestion_id: id, severity: 'normal', weight: 1 }))
        const { error: ep } = await supabase.rpc('create_initial_plan', {
          p_habits: habits, p_vices: vicePayload, p_objectives: objs.map((o) => o.objective), p_training_level: d.s.trainingLevel ?? null,
        })
        if (ep) throw ep
      }
      const { error } = await supabase.from('profiles').update({
        archetype: profileResult.archetype,
        quiz_answers: { ...d.quiz, v4: { hasClearGoal: d.s.hasClearGoal, area: d.s.area, friction: d.s.friction, goals: d.s.goals, trainingLevel: d.s.trainingLevel } },
        quiz_completed_at: new Date().toISOString(),
      }).eq('id', me)
      if (error) throw error
      save(null)
      const { count } = await supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', me)
      if (count) { await refreshProfile(); navigate('/', { replace: true }) } else setD({ ...d, phase: 'group' })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (hasPlan === null) return null

  // ───────── Flujo de objetivos (nextStep) ─────────
  if (d.phase === 'flow') {
    if (step.step === 'clear-goal') {
      return (
        <Shell onBack={back}>
          <h1 className="pt-6 text-3xl font-black tracking-tight">{ONB.clearGoal.text}</h1>
          <p className="mt-2 text-muted">Empezás en nivel 0 y subís con lo que hacés cada día.</p>
          <div className="mt-8 space-y-3">
            <Option onClick={() => go({ ...d, s: { ...d.s, hasClearGoal: true } })}>{ONB.clearGoal.yes}</Option>
            <Option onClick={() => go({ ...d, s: { ...d.s, hasClearGoal: false } })}>{ONB.clearGoal.no}</Option>
          </div>
        </Shell>
      )
    }
    if (step.step === 'area') {
      return (
        <Shell onBack={back}>
          <h1 className="text-2xl font-bold">{ONB.area.text}</h1>
          <p className="mt-1 text-sm text-muted">{ONB.area.hint}</p>
          <div className="mt-6 space-y-2.5">
            {PILLARS.map((p) => <Option key={p.id} onClick={() => go({ ...d, s: { ...d.s, area: p.id } })}><PillarIcon pillar={p.id} size="sm" />{p.name}</Option>)}
          </div>
        </Shell>
      )
    }
    if (step.step === 'friction') {
      return (
        <Shell onBack={back}>
          <h1 className="text-2xl font-bold">{ONB.friction.text}</h1>
          <div className="mt-6 space-y-2.5">
            {ONB.friction.options.map((o) => <Option key={o.id} onClick={() => go({ ...d, s: { ...d.s, friction: o.id } })}>{o.text}</Option>)}
          </div>
        </Shell>
      )
    }
    if (step.step === 'pick-goals' || step.step === 'suggest') {
      const list = step.step === 'suggest'
        ? (ONB.areaObjectives as Record<string, string[]>)[d.s.area ?? ''] ?? ['otro']
        : OBJECTIVES.map((o) => o.id)
      const title = step.step === 'suggest' ? ONB.suggest : ONB.pickGoals
      const toggle = (id: string) => {
        if (picking.includes(id)) setPicking(picking.filter((x) => x !== id))
        else { try { setPicking(addGoal(picking, id)) } catch (e) { setError((e as Error).message) } }
      }
      return (
        <Shell onBack={back} footer={
          <button className="btn btn-primary w-full" disabled={picking.length === 0}
            onClick={() => { go({ ...d, s: { ...d.s, goals: picking } }); setPicking([]) }}>Seguir con {picking.length || ''} {picking.length === 1 ? 'objetivo' : 'objetivos'}</button>
        }>
          <h1 className="text-2xl font-bold">{title.text}</h1>
          <p className="mt-1 text-sm text-muted">{title.hint}</p>
          <ErrorBox>{error}</ErrorBox>
          <div className="mt-6 space-y-2.5">
            {list.map((id) => {
              const o = objectiveDef(id)
              return (
                <Option key={id} on={picking.includes(id)} onClick={() => toggle(id)}>
                  <PillarIcon pillar={o.pillar ?? d.s.area} size="sm" />
                  <span className="flex-1"><span className="block">{o.name}</span><span className="text-xs text-muted">Ej.: {o.example}</span></span>
                  {picking.includes(id) && <span className="text-primary">✓</span>}
                </Option>
              )
            })}
          </div>
        </Shell>
      )
    }
    if (step.step === 'personalize') {
      const def = objectiveDef(step.goal)
      const val = (q: { id: string; default?: number }) => form[q.id] ?? (q.default != null ? q.default : '')
      const ready = def.questions.every((q) => q.optional || q.type === 'pillar' || String(val(q)).trim() !== '')
      const preview = ready ? buildObjective(def, { pillar: d.s.area, ...Object.fromEntries(def.questions.map((q) => [q.id, val(q)])) }, 0, today) : null
      return (
        <Shell onBack={back} footer={
          <button className="btn btn-primary w-full" disabled={!ready} onClick={() => {
            const answers = { pillar: d.s.area, ...Object.fromEntries(def.questions.map((q) => [q.id, val(q)])) }
            go({ ...d, goalAnswers: { ...d.goalAnswers, [def.id]: answers }, s: { ...d.s, personalized: [...d.s.personalized, def.id] } })
            setForm({})
          }}>Listo</button>
        }>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Objetivo {d.s.goals.indexOf(def.id) + 1} de {d.s.goals.length}</p>
          <h1 className="mt-1 text-2xl font-bold">{def.name}</h1>
          <p className="mt-1 text-sm text-muted">Con tus números armamos hábitos medibles.</p>
          <div className="mt-5 space-y-3">
            {def.questions.map((q) => (
              <div key={q.id}>
                <label className="label" htmlFor={`q-${q.id}`}>{q.text}{q.unit ? ` (${q.unit})` : ''}</label>
                {q.type === 'pillar'
                  ? <PillarSelect id={`q-${q.id}`} value={String(form[q.id] ?? d.s.area ?? 'habilidades')} onChange={(v) => setForm({ ...form, [q.id]: v })} />
                  : <input id={`q-${q.id}`} className="input" type={q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'}
                      min={q.type === 'date' ? today : q.type === 'number' ? 0 : undefined} placeholder={q.placeholder}
                      value={String(val(q))} onChange={(e) => setForm({ ...form, [q.id]: e.target.value })} />}
              </div>
            ))}
          </div>
          {preview && (
            <div className="mt-5 rounded-2xl border border-primary/50 bg-primary/10 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Te queda así</p>
              {preview.habits.map((h) => <p key={h.key} className="mt-1 font-semibold">{h.name}{h.target ? ` · meta ${h.target} ${h.unit ?? ''}` : ''}</p>)}
              {preview.objective.chest && <p className="mt-1 text-muted">Y un cofre de ahorro de {preview.objective.chest.target} €.</p>}
            </div>
          )}
        </Shell>
      )
    }
    if (step.step === 'training-level') {
      return (
        <Shell onBack={back}>
          <h1 className="text-2xl font-bold">{ONB.training.text}</h1>
          <p className="mt-1 text-sm text-muted">{ONB.training.hint}</p>
          <div className="mt-6 space-y-2.5">
            {ONB.training.options.map((o) => (
              <Option key={o.level} onClick={() => go({ ...d, s: { ...d.s, trainingLevel: o.level }, phase: hasPlan ? 'quiz' : 'sport' })}>
                <span className="flex-1"><span className="block">{o.text}</span>
                  <span className="text-xs text-muted">{STRENGTH.map((e) => `${e.targets[o.level]} ${e.name.toLowerCase()}`).join(' · ')}</span></span>
              </Option>
            ))}
          </div>
        </Shell>
      )
    }
    return null
  }

  // ───────── Deporte ─────────
  if (d.phase === 'sport') {
    const sp = d.sport
    return (
      <Shell onBack={back} footer={<button className="btn btn-primary w-full" disabled={!sp.name.trim()} onClick={() => go({ ...d, phase: 'quiz', qIndex: 0 })}>Seguir</button>}>
        <h1 className="text-2xl font-bold">{ONB.sport.text}</h1>
        <p className="mt-1 text-sm text-muted">{ONB.sport.hint}</p>
        <div className="mt-5 space-y-3">
          <input className="input" maxLength={60} placeholder={ONB.sport.placeholder} value={sp.name} onChange={(e) => setD({ ...d, sport: { ...sp, name: e.target.value } })} aria-label="Deporte o actividad" />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="number" min={1} placeholder="Meta (opcional)" value={sp.target} onChange={(e) => setD({ ...d, sport: { ...sp, target: e.target.value } })} aria-label="Meta diaria" />
            <input className="input" maxLength={20} placeholder="Unidad: minutos, km…" value={sp.unit} onChange={(e) => setD({ ...d, sport: { ...sp, unit: e.target.value } })} aria-label="Unidad" />
          </div>
          <div>
            <span className="label">¿Cuánto te cuesta esto?</span>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((w) => <button key={w} className={`btn px-2 text-sm ${sp.weight === w ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setD({ ...d, sport: { ...sp, weight: w } })}>{WEIGHT_LABEL[w]}</button>)}
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  // ───────── Actitud (12) y directas (4) ─────────
  if (d.phase === 'quiz') {
    const q = QUIZ[d.qIndex]
    const selected = new Set(([] as string[]).concat(d.quiz[q.id] ?? []))
    const advance = (quiz: QuizAnswers) => {
      if (d.qIndex < QUIZ.length - 1) go({ ...d, quiz, qIndex: d.qIndex + 1 })
      else go({ ...d, quiz, phase: 'result' })
    }
    return (
      <Shell onBack={back} progress={Math.round(((d.qIndex + 1) / QUIZ.length) * 100)}
        footer={q.type === 'multi' ? <button className="btn btn-primary w-full" disabled={!isAnswered(q, d.quiz)} onClick={() => advance(d.quiz)}>Siguiente</button> : undefined}>
        <p className="mb-2 text-xs font-semibold text-muted">Pregunta {d.qIndex + 1} de {QUIZ.length}</p>
        <h1 className="text-2xl font-bold leading-snug">{q.text}</h1>
        {q.section === 'directas' && <p className="mt-2 inline-block rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">🔒 Esta respuesta es privada.</p>}
        <div className="mt-6 space-y-2.5">
          {q.options.map((o) => (
            <Option key={o.id} on={selected.has(o.id)} onClick={() => { const quiz = { ...d.quiz, [q.id]: o.id }; setD({ ...d, quiz }); setTimeout(() => advance(quiz), 150) }}>
              <span className="flex-1">{o.text}</span>{selected.has(o.id) && <span className="text-primary">✓</span>}
            </Option>
          ))}
        </div>
      </Shell>
    )
  }

  // ───────── Resultado ─────────
  if (d.phase === 'result' && arch) {
    return (
      <Shell onBack={back} footer={
        <button className="btn btn-primary w-full" disabled={busy} onClick={() => { if (hasPlan) void finish(); else { buildPack(); go({ ...d, phase: 'pack' }) } }}>
          {hasPlan ? 'Guardar' : 'Ver mi plan'}
        </button>
      }>
        <ArchetypeCard a={arch} />
        <p className="mt-3 text-center text-xs text-muted">Es un juego para elegir un punto de partida, no un test psicológico ni un diagnóstico.</p>
        {hasPlan && <p className="mt-2 text-center text-xs text-xp">Ya tenés un plan: esto actualiza tu arquetipo. Tu plan se cambia proponiendo cambios.</p>}
        <ErrorBox>{error}</ErrorBox>
      </Shell>
    )
  }

  // ───────── Paquete ─────────
  if (d.phase === 'pack') {
    if (!pack) return null
    const setW = (key: string, w: number) => setPack(pack.map((h) => (h.key === key ? { ...h, weight: w } : h)))
    const remove = (key: string) => setPack(pack.filter((h) => h.key !== key))
    const inPack = new Set(pack.map((h) => h.catalog_id).filter(Boolean) as string[])
    const lvl = d.s.trainingLevel ?? CONFIG.strengthDefaultLevel
    const row = (h: DraftHabit, removable: boolean) => (
      <li key={h.key} className="rounded-2xl border border-line bg-surface p-3">
        <div className="flex items-center gap-3">
          <PillarIcon pillar={h.pillar} size="sm" />
          <span className="min-w-0 flex-1 font-semibold">{h.name}{h.target ? <span className="text-xs font-normal text-muted"> · meta {h.target} {h.unit}</span> : null}</span>
          {removable && <button onClick={() => remove(h.key)} className="grid h-9 w-9 place-items-center rounded-full text-muted" aria-label={`Quitar ${h.name}`}>✕</button>}
        </div>
        <div className="mt-2 flex gap-1" role="group" aria-label="¿Cuánto te cuesta?">
          {[1, 2, 3].map((w) => <button key={w} onClick={() => setW(h.key, w)} className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${h.weight === w ? 'bg-primary text-bg' : 'bg-surface-2 text-muted'}`}>{WEIGHT_LABEL[w]}</button>)}
        </div>
      </li>
    )
    return (
      <Shell onBack={back} footer={<><ErrorBox>{error}</ErrorBox><button className="btn btn-primary w-full" disabled={busy} onClick={finish}>Empezar en nivel 0</button></>}>
        <h1 className="text-2xl font-bold">Tu plan</h1>
        <p className="mt-1 text-sm text-muted">Rige desde hoy. Después, los cambios se votan en el grupo y rigen desde el día siguiente. Elegí cuánto te cuesta cada hábito: lo que más te cuesta vale más dentro de tus 100 puntos diarios.</p>

        <h2 className="mb-2 mt-6 font-bold">💪 Fuerza base</h2>
        <ul className="space-y-1 text-sm">{STRENGTH.map((e) => <li key={e.id} className="flex justify-between rounded-xl bg-surface px-3 py-2"><span>{e.name}</span><span className="text-muted">{e.targets[lvl]} {e.unit}</span></li>)}</ul>
        <h2 className="mb-2 mt-6 font-bold">🏃 Deporte</h2>
        <p className="rounded-xl bg-surface px-3 py-2 text-sm">{d.sport.name}{d.sport.target ? ` · meta ${d.sport.target} ${d.sport.unit}` : ''} · {WEIGHT_LABEL[d.sport.weight]}</p>
        {pack.some((h) => h.block === 'objetivo') && <h2 className="mb-2 mt-6 font-bold">🎯 De tus objetivos</h2>}
        <ul className="space-y-2">{pack.filter((h) => h.block === 'objetivo').map((h) => row(h, false))}</ul>
        <h2 className="mb-2 mt-6 font-bold">✨ Generales</h2>
        <ul className="space-y-2">{pack.filter((h) => h.block === 'general').map((h) => row(h, true))}</ul>
        {adding
          ? <div className="mt-3"><CatalogPicker selected={new Set()} disabled={inPack} onToggle={(id) => { const c = catalogById(id)!; setPack([...pack, { key: `g-${id}`, name: c.name, catalog_id: id, pillar: catalogPillar(c.area), weight: Math.min(3, c.tier), block: 'general', private: Boolean(c.private_default) }]); setAdding(false) }} /></div>
          : <button className="btn btn-ghost mt-2 w-full" onClick={() => setAdding(true)}>+ Agregar del catálogo</button>}

        {vices.size > 0 && (
          <div className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 p-3">
            <p className="text-sm font-semibold">Vicios para seguir</p>
            <p className="text-xs text-muted">Cada día marcás "no lo hice" (suma) o "lo hice" (multiplica tus puntos, salvo que tengas un permiso). Es privado.</p>
            {[...vices].map((id) => (
              <label key={id} className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked className="h-5 w-5 accent-[var(--color-primary)]" onChange={(e) => { const n = new Set(vices); if (!e.target.checked) n.delete(id); else n.add(id); setVices(n) }} />
                {viceById(id)?.name ?? id}
              </label>
            ))}
          </div>
        )}
      </Shell>
    )
  }

  // ───────── Grupo ─────────
  return (
    <Shell>
      <div className="pt-10 text-center">
        <div className="text-5xl" aria-hidden>🏆</div>
        <h1 className="mt-4 text-3xl font-black tracking-tight">¡Nivel 0!</h1>
        <p className="mt-3 text-muted">Último paso: competí con tus amigos. Creá un grupo o unite con el código que te pasaron.</p>
        <div className="mt-8 space-y-3">
          <button className="btn btn-primary w-full" onClick={async () => { await refreshProfile(); navigate('/grupos', { replace: true }) }}>Crear o unirme a un grupo</button>
          <button className="btn btn-ghost w-full" onClick={async () => { await refreshProfile(); navigate('/', { replace: true }) }}>Más tarde</button>
        </div>
      </div>
    </Shell>
  )
}
