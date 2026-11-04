import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { VICES, VICE_MULTIPLIER, fmtMult, useTodayScore } from '../lib/vices'
import { AreaIcon, ErrorBox, Spinner } from './ui'

/** Vicios declarados: lo que hacés y no querés dejar. Cada uno multiplica tus puntos diarios. */
export default function Vices() {
  const { score, reload } = useTodayScore()
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    setError(error ? errorMessage(error) : null)
    await reload()
  }
  const declare = (id: string | null, name?: string) => run(() => supabase.rpc('declare_vice', { p_vice: id, p_name: name ?? null }))
  const end = (id: string) => {
    if (!confirm('¿Lo dejaste? Deja de restarte desde mañana.')) return
    void run(() => supabase.rpc('end_vice', { p_id: id }))
  }
  const addCustom = (e: FormEvent) => { e.preventDefault(); if (custom.trim()) { void declare(null, custom.trim()); setCustom('') } }

  if (!score) return <div className="grid place-items-center pt-10"><Spinner /></div>
  const active = score.vices.filter((v) => !v.ends_on)
  const leaving = score.vices.filter((v) => v.ends_on)
  const declaredIds = new Set(score.vices.map((v) => v.vice_id))

  return (
    <>
      <section className="card mb-4">
        <p className="text-sm text-muted">
          Si tenés algo que hacés y <b className="text-ink">no lo querés dejar</b> (por ejemplo, fumar), no hace falta un hábito para dejarlo:
          lo declarás y tus puntos de cada día se multiplican por <b className="text-xp">{fmtMult(VICE_MULTIPLIER)}</b> por cada vicio. Cuesta más sumar.
          Si algo pasa un día suelto (por ejemplo, tomar), anotalo como tropiezo en <b className="text-ink">Hoy</b>: resta solo de ese día.
        </p>
        <p className="mt-3 text-lg font-black">
          Tu multiplicador hoy: <span className={score.multiplier < 1 ? 'text-danger' : 'text-alimentacion'}>{fmtMult(score.multiplier)}</span>
        </p>
        <p className="text-xs text-muted">El grupo ve el multiplicador en el ranking, pero no cuáles son tus vicios.</p>
      </section>
      <ErrorBox>{error}</ErrorBox>

      {active.length > 0 && (
        <ul className="mb-4 space-y-2">
          {active.map((v) => (
            <li key={v.id} className="card flex items-center gap-3">
              <AreaIcon area={VICES.find((x) => x.id === v.vice_id)?.area} size="sm" />
              <span className="flex-1">
                <span className="block font-semibold">{v.name}</span>
                <span className="text-xs text-danger">{fmtMult(VICE_MULTIPLIER)} en tus puntos diarios</span>
              </span>
              <button className="btn btn-ghost min-h-9 px-3 py-1 text-sm" disabled={busy} onClick={() => end(v.id)}>Lo dejé</button>
            </li>
          ))}
        </ul>
      )}
      {leaving.length > 0 && (
        <p className="mb-4 text-xs text-muted">Desde mañana ya no te restan: {leaving.map((v) => v.name).join(', ')}.</p>
      )}

      <h3 className="mb-2 text-sm font-bold text-muted">Declarar un vicio</h3>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {VICES.filter((v) => !declaredIds.has(v.id)).map((v) => (
          <button key={v.id} className="btn btn-ghost justify-start text-left text-sm" disabled={busy} onClick={() => declare(v.id)}>
            + {v.name}
          </button>
        ))}
      </div>
      <form onSubmit={addCustom} className="flex gap-2">
        <input className="input" maxLength={60} placeholder="Otro (ej.: morderme las uñas)" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !custom.trim()}>Declarar</button>
      </form>
    </>
  )
}
