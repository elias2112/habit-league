import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import {
  MIN_ACTIVE_HABITS, QUESTIONS, archetypeById, catalogById, computeProfile, directSuggestions, directVices, isAnswered,
  type Answers, type QuizResult,
} from '../lib/quiz'
import ArchetypeCard from '../components/ArchetypeCard'
import { viceById } from '../lib/vices'
import { catalogPillar } from '../components/CatalogPicker'
import { PillarIcon, WEIGHT_LABEL } from '../components/ui'
import Radar, { levelsToRadar } from '../components/Radar'
import CatalogPicker from '../components/CatalogPicker'
import { AreaIcon, ErrorBox } from '../components/ui'

type Step = 'welcome' | 'quiz' | 'result' | 'pack' | 'group'
const KEY = 'hl:quizDraft'

function loadDraft(): { answers: Answers; index: number } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* sin almacenamiento */ }
  return { answers: {}, index: 0 }
}
function saveDraft(d: { answers: Answers; index: number } | null) {
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d))
    else localStorage.removeItem(KEY)
  } catch { /* sin almacenamiento */ }
}

function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="flex-1 pb-6">{children}</div>
      {footer && (
        <div className="sticky bottom-0 -mx-5 border-t border-line bg-bg/95 px-5 pt-3 backdrop-blur" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

export default function Onboarding() {
  const { session, refreshProfile } = useAuth()
  const me = session!.user.id
  const navigate = useNavigate()
  const draft = useMemo(loadDraft, [])
  const [step, setStep] = useState<Step>('welcome')
  const [answers, setAnswers] = useState<Answers>(draft.answers)
  const [index, setIndex] = useState(draft.index)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [pack, setPack] = useState<Set<string>>(new Set())
  const [vices, setVices] = useState<Set<string>>(new Set())
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [hasPlan, setHasPlan] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { saveDraft({ answers, index }) }, [answers, index])

  // ¿Ya tiene plan? (repetir el quiz actualiza el perfil; el plan se cambia con propuestas)
  useEffect(() => {
    supabase.rpc('my_day').then(({ data }) => setHasPlan(Boolean((data as { has_plan?: boolean } | null)?.has_plan)))
  }, [me])


  const q = QUESTIONS[index]

  function choose(optionId: string) {
    if (q.type === 'multi') {
      const cur = (answers[q.id] as string[] | undefined) ?? []
      const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : cur.length < (q.max ?? 99) ? [...cur, optionId] : cur
      setAnswers({ ...answers, [q.id]: next })
      return
    }
    const next = { ...answers, [q.id]: optionId }
    setAnswers(next)
    setTimeout(() => advance(next), 180) // respuesta única: avanza sola
  }

  function advance(a: Answers = answers) {
    if (index < QUESTIONS.length - 1) { setIndex(index + 1); return }
    const r = computeProfile(a)
    setResult(r)
    setPack(new Set([...r.habits, ...directSuggestions(a)].filter((id) => catalogPillar(catalogById(id)!.area))))
    setVices(new Set(directVices(a)))
    setStep('result')
  }

  function back() {
    if (step === 'quiz' && index > 0) setIndex(index - 1)
    else if (step === 'quiz') setStep('welcome')
    else if (step === 'result') setStep('quiz')
    else if (step === 'pack') setStep('result')
  }

  const totalSelected = pack.size

  async function finish() {
    if (!result) return
    setBusy(true); setError(null)
    try {
      if (!hasPlan) {
        // Plan inicial: rige desde hoy y sin votación (los cambios posteriores se votan y rigen desde mañana).
        const habits = [...pack].map((id) => {
          const c = catalogById(id)!
          return { catalog_id: c.id, weight: weights[id] ?? Math.min(3, c.tier), private: Boolean(c.private_default) }
        })
        const vicesPayload = [...vices].map((id) => ({ name: viceById(id)?.name ?? id, suggestion_id: id, severity: 'normal', weight: 1 }))
        const { error: ep } = await supabase.rpc('create_initial_plan', { p_habits: habits, p_vices: vicesPayload, p_objectives: [] })
        if (ep) throw ep
      }
      const { error } = await supabase.from('profiles').update({
        archetype: result.archetype,
        area_scores: result.level,
        quiz_answers: answers,
        quiz_completed_at: new Date().toISOString(),
      }).eq('id', me)
      if (error) throw error
      saveDraft(null)
      const { count } = await supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('user_id', me)
      if (count) { await refreshProfile(); navigate('/', { replace: true }) }
      else setStep('group')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function goTo(path: string) {
    await refreshProfile()
    navigate(path, { replace: true })
  }

  const BackBtn = (
    <button onClick={back} className="mb-4 -ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-muted" aria-label="Atrás">
      ‹ Atrás
    </button>
  )

  // ───── Bienvenida
  if (step === 'welcome') {
    return (
      <Shell footer={<button className="btn btn-primary w-full" onClick={() => setStep('quiz')}>{index > 0 ? 'Seguir con el quiz' : 'Empezar'}</button>}>
        <div className="pt-10 text-center">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mx-auto h-20 w-20" />
          <h1 className="mt-6 text-3xl font-black tracking-tight">Armemos tu plan</h1>
          <p className="mt-3 text-muted">
            Son {QUESTIONS.length} preguntas cortas. Con tus respuestas te asignamos un arquetipo y un paquete de hábitos para arrancar, que después podés cambiar. Las últimas 4 son más directas (fumar, alcohol, redes, delivery) y sus respuestas son privadas.
          </p>
          <p className="mt-6 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">
            Es un juego para elegir un punto de partida, no un test psicológico ni un diagnóstico.
          </p>
        </div>
      </Shell>
    )
  }

  // ───── Preguntas
  if (step === 'quiz') {
    const selected = new Set(([] as string[]).concat(answers[q.id] ?? []))
    return (
      <Shell
        footer={q.type === 'multi' ? (
          <button className="btn btn-primary w-full" disabled={!isAnswered(q, answers)} onClick={() => advance()}>
            Siguiente
          </button>
        ) : undefined}
      >
        {BackBtn}
        <div className="mb-6">
          <div className="mb-2 flex justify-between text-xs font-semibold text-muted">
            <span>Pregunta {index + 1} de {QUESTIONS.length}</span>
            <span>{Math.round(((index) / QUESTIONS.length) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${((index + 1) / QUESTIONS.length) * 100}%` }} />
          </div>
        </div>
        <h1 className="text-2xl font-bold leading-snug">{q.text}</h1>
        {q.type === 'multi' && <p className="mt-1 text-sm text-muted">Elegí entre {q.min ?? 1} y {q.max}.</p>}
        {q.section === 'directas' && <p className="mt-2 inline-block rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">🔒 Esta respuesta es privada: nadie del grupo la ve.</p>}
        <ul className="mt-6 space-y-2.5">
          {q.options.map((o) => {
            const on = selected.has(o.id)
            return (
              <li key={o.id}>
                <button
                  onClick={() => choose(o.id)}
                  aria-pressed={on}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left font-medium transition active:scale-[.99] ${
                    on ? 'border-primary bg-primary/15 text-ink' : 'border-line bg-surface'
                  }`}
                >
                  {o.area && <AreaIcon area={o.area} size="sm" />}
                  <span className="flex-1">{o.text}</span>
                  {on && <span className="text-primary">✓</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </Shell>
    )
  }

  // ───── Resultado
  if (step === 'result' && result) {
    const arch = archetypeById(result.archetype)!
    return (
      <Shell footer={<button className="btn btn-primary w-full" onClick={() => setStep('pack')}>Ver mis hábitos sugeridos</button>}>
        {BackBtn}
        <ArchetypeCard a={arch}>
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-1 text-sm font-semibold">Tus 6 áreas hoy (Día 1)</p>
            <Radar day1={levelsToRadar(result.level)} size={280} />
            <p className="text-center text-xs text-muted">Sale de tus respuestas sobre cada área. En tu perfil vas a ver cómo cambia con tus hábitos.</p>
          </div>
        </ArchetypeCard>
        <p className="mt-3 text-center text-xs text-muted">Es un juego para elegir un punto de partida, no un diagnóstico.</p>
      </Shell>
    )
  }

  // ───── Paquete de hábitos
  if (step === 'pack' && result) {
    const chosen = [...pack].map((id) => catalogById(id)!).filter(Boolean)
    const missing = Math.max(0, MIN_ACTIVE_HABITS - totalSelected)
    return (
      <Shell
        footer={
          <>
            <ErrorBox>{error}</ErrorBox>
            <button className="btn btn-primary w-full" disabled={busy || missing > 0} onClick={finish}>
              {missing > 0 ? `Elegí ${missing} más (mínimo ${MIN_ACTIVE_HABITS})` : `Empezar con ${totalSelected} hábitos`}
            </button>
          </>
        }
      >
        {BackBtn}
        <h1 className="text-2xl font-bold">Tu paquete inicial</h1>
        <p className="mt-1 text-sm text-muted">
          Cada día podés sumar hasta 100 puntos. Elegí cuánto te cuesta cada hábito: lo que más te cuesta vale más. Este plan rige desde hoy; después, los cambios se votan en el grupo y rigen desde el día siguiente.
        </p>

        {chosen.length > 0 && (
          <ul className="mt-4 space-y-2">
            {chosen.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-2xl border border-primary/60 bg-primary/10 p-3">
                <PillarIcon pillar={catalogPillar(h.area)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{h.name}</span>
                  <span className="mt-1 flex gap-1" role="group" aria-label="¿Cuánto te cuesta?">
                    {[1, 2, 3].map((w) => (
                      <button key={w} type="button" onClick={() => setWeights({ ...weights, [h.id]: w })}
                        className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${(weights[h.id] ?? Math.min(3, h.tier)) === w ? 'bg-primary text-bg' : 'bg-surface-2 text-muted'}`}>
                        {WEIGHT_LABEL[w]}
                      </button>
                    ))}
                  </span>
                </span>
                <button onClick={() => { const n = new Set(pack); n.delete(h.id); setPack(n) }} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label={`Quitar ${h.name}`}>✕</button>
              </li>
            ))}
          </ul>
        )}
        {hasPlan && <p className="mt-2 rounded-xl border border-xp/40 bg-xp/10 px-3 py-2 text-xs text-xp">Ya tenés un plan: al terminar se actualiza tu arquetipo, pero tu plan no cambia. Para cambiarlo, proponé cambios en Mi plan.</p>}
        {[...directVices(answers)].length > 0 && (
          <div className="mt-4 rounded-2xl border border-danger/40 bg-danger/10 p-3">
            <p className="text-sm font-semibold">Vicios para seguir</p>
            <p className="text-xs text-muted">No son hábitos para cumplir: cada día marcás "no lo hice" (suma) o "lo hice" (multiplica tus puntos por su gravedad, salvo que tengas un permiso). Es privado.</p>
            {directVices(answers).map((id) => (
              <label key={id} className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[var(--color-primary)]" checked={vices.has(id)}
                  onChange={(e) => { const n = new Set(vices); if (e.target.checked) n.add(id); else n.delete(id); setVices(n) }} />
                Seguir «{viceById(id)?.name ?? id}»
              </label>
            ))}
          </div>
        )}

        <h2 className="mb-3 mt-8 text-lg font-bold">Agregar del catálogo</h2>
        <CatalogPicker
          selected={pack}
          onToggle={(id) => { const n = new Set(pack); if (n.has(id)) n.delete(id); else n.add(id); setPack(n) }}
        />
      </Shell>
    )
  }

  // ───── Grupo
  return (
    <Shell>
      <div className="pt-10 text-center">
        <div className="text-5xl" aria-hidden>🏆</div>
        <h1 className="mt-4 text-3xl font-black tracking-tight">¡Listo!</h1>
        <p className="mt-3 text-muted">Último paso: competí con tus amigos. Creá un grupo o unite con el código que te pasaron.</p>
        <div className="mt-8 space-y-3">
          <button className="btn btn-primary w-full" onClick={() => goTo('/grupos')}>Crear o unirme a un grupo</button>
          <button className="btn btn-ghost w-full" onClick={() => goTo('/')}>Más tarde</button>
        </div>
      </div>
    </Shell>
  )
}
