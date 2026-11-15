import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { formatLongDate } from '../lib/date'
import { signed, type JudgmentToday } from '../lib/judgment'
import { ErrorBox } from './ui'

type Answer = boolean | number
interface Result { judgment_total: number }

/** Juicio del día sobre AYER, a pantalla completa. El total lo calcula la base; por ahora no da premio. */
export default function Judgment({ data, onClose }: { data: JudgmentToday; onClose: (done?: boolean) => void }) {
  const qs = data.questions
  const [step, setStep] = useState(-1) // -1 = resumen de hábitos; qs.length = enviar
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [chest, setChest] = useState<string | null>(data.chests[0]?.id ?? null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (id: string, v: Answer) => setAnswers((a) => ({ ...a, [id]: v }))
  const next = () => setStep((s) => s + 1)

  async function submit() {
    setBusy(true); setError(null)
    const { data: r, error } = await supabase.rpc('submit_judgment', { p_answers: answers, p_goal: chest })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setResult(r as Result)
  }

  const q = step >= 0 && step < qs.length ? qs[step] : null
  const progress = Math.round(((step + 1) / (qs.length + 1)) * 100)

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg" role="dialog" aria-label="Juicio del día">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="mb-5 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">⚖️ El Juicio · <span className="capitalize">{formatLongDate(data.day)}</span></p>
          {!result && <button onClick={() => onClose()} className="px-2 text-sm text-muted">Después</button>}
        </div>
        {!result && <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}

        <div className="flex-1">
          {result ? (
            <ResultView r={result} />
          ) : step === -1 ? (
            <div>
              <h1 className="text-2xl font-black">Ayer hiciste {data.points} puntos</h1>
              <p className="mt-2 text-muted">Unas preguntas rápidas sobre ayer: respondé con honestidad, es tu juego.</p>
              <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">El Juicio queda registrado. Por ahora no da premio ni cambia tus puntos.</p>
            </div>
          ) : q ? (
            <QuestionView q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} onNext={next} chests={data.chests} chest={chest} onChest={setChest} />
          ) : (
            <div>
              <h1 className="text-2xl font-black">¿Listo el veredicto?</h1>
              <p className="mt-2 text-muted">Respondiste {Object.keys(answers).length} de {qs.length}. Lo que no respondas cuenta como 0.</p>
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-2">
          {result ? (
            <button className="btn btn-primary w-full" onClick={() => onClose(true)}>Listo</button>
          ) : step === -1 ? (
            <button className="btn btn-primary w-full" onClick={next}>Empezar</button>
          ) : q ? (
            <div className="flex gap-2">
              <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>‹</button>
              <button className="btn btn-primary flex-1" onClick={next} disabled={q.type !== 'yesno' && answers[q.id] === undefined}>
                {answers[q.id] === undefined && q.type === 'yesno' ? 'Saltar' : 'Siguiente'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>‹</button>
              <button className="btn btn-primary flex-1" disabled={busy} onClick={submit}>Ver mi veredicto</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function QuestionView({ q, value, onChange, onNext, chests, chest, onChest }: {
  q: JudgmentToday['questions'][number]
  value: Answer | undefined
  onChange: (v: Answer) => void
  onNext: () => void
  chests: JudgmentToday['chests']
  chest: string | null
  onChest: (id: string | null) => void
}) {
  const [text, setText] = useState(typeof value === 'number' && q.type === 'money' ? String(value) : '')
  return (
    <div>
      {q.kind === 'bonus' && <p className="mb-2 inline-block rounded-lg bg-xp/15 px-2 py-1 text-xs font-bold text-xp">✨ Misión sorpresa</p>}
      <h1 className="text-2xl font-bold leading-snug">{q.text}</h1>
      {q.hint && <p className="mt-1 text-sm text-muted">{q.hint}</p>}

      {q.type === 'yesno' && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              onClick={() => { onChange(v); setTimeout(onNext, 150) }}
              aria-pressed={value === v}
              className={`min-h-20 rounded-2xl border text-xl font-bold transition active:scale-95 ${value === v ? 'border-primary bg-primary/15' : 'border-line bg-surface'}`}
            >
              {v ? 'Sí' : 'No'}
            </button>
          ))}
        </div>
      )}

      {q.type === 'count' && (
        <div className="mt-6">
          <button className={`btn w-full ${value === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { onChange(0); setTimeout(onNext, 150) }}>Ninguno 🙌</button>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-ghost w-14 text-2xl" onClick={() => onChange(Math.max(0, (typeof value === 'number' ? value : 0) - 1))} aria-label="Menos">−</button>
            <p className="flex-1 text-center text-5xl font-black tabular-nums">{typeof value === 'number' ? value : '–'}</p>
            <button className="btn btn-ghost w-14 text-2xl" onClick={() => onChange((typeof value === 'number' ? value : 0) + 1)} aria-label="Más">+</button>
          </div>
          {q.unit && <p className="mt-1 text-center text-sm text-muted">{q.unit}</p>}
        </div>
      )}

      {q.type === 'money' && (
        <div className="mt-6 space-y-3">
          <button className={`btn w-full ${value === 0 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setText(''); onChange(0); setTimeout(onNext, 150) }}>
            {q.id === 'gasto' ? 'Nada 🙌' : 'Nada'}
          </button>
          <div className="flex items-center gap-2">
            <input
              className="input text-center text-2xl font-bold" inputMode="decimal" placeholder="0"
              value={text}
              onChange={(e) => { setText(e.target.value); const n = Number(e.target.value.replace(',', '.')); if (!Number.isNaN(n) && e.target.value !== '') onChange(Math.max(0, n)) }}
              aria-label="Monto en euros"
            />
            <span className="text-xl font-bold text-muted">€</span>
          </div>
          {q.id === 'ahorro' && typeof value === 'number' && value > 0 && chests.length > 0 && (
            <div>
              <label className="label" htmlFor="chest">¿A qué cofre va?</label>
              <select id="chest" className="input" value={chest ?? ''} onChange={(e) => onChest(e.target.value || null)}>
                {chests.map((c) => <option key={c.id} value={c.id}>🪙 {c.title}</option>)}
                <option value="">A ninguno</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultView({ r }: { r: Result }) {
  return (
    <div className="text-center">
      <p className="text-sm font-semibold text-muted">Veredicto del Juicio</p>
      <p className={`mt-2 text-6xl font-black tabular-nums ${r.judgment_total >= 0 ? 'text-alimentacion' : 'text-danger'}`}>{signed(r.judgment_total)}</p>
      <p className="mt-2 text-sm text-muted">Queda registrado. Por ahora no da premio.</p>
    </div>
  )
}
