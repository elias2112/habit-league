import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { ErrorBox } from './ui'

interface Settings { share_judgment: boolean; judgment_opt: Record<string, boolean> }

const OPTS = [
  { key: 'fumar', label: 'Preguntarme si fumé' },
  { key: 'alcohol', label: 'Preguntarme si tomé alcohol' },
]

/** Preferencias del Juicio de la mañana (la liga quedó sin uso desde la 007). */
export default function JudgmentSettings() {
  const { session } = useAuth()
  const me = session!.user.id
  const [s, setS] = useState<Settings>({ share_judgment: false, judgment_opt: {} })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('user_settings').select('share_judgment, judgment_opt').eq('user_id', me).maybeSingle()
      .then(({ data }) => { if (data) setS(data as Settings) })
  }, [me])

  async function save(next: Settings) {
    setS(next)
    const { error } = await supabase.from('user_settings').upsert({ user_id: me, ...next })
    setError(error ? errorMessage(error) : null)
  }
  const setOpt = (key: string, v: string) => {
    const opt = { ...s.judgment_opt }
    if (v === 'auto') delete opt[key]
    else opt[key] = v === 'si'
    void save({ ...s, judgment_opt: opt })
  }

  return (
    <section className="card mt-5 space-y-4">
      <h2 className="font-bold">⚖️ Juicio de la mañana</h2>
      <p className="text-sm text-muted">Preguntas sobre el día anterior. Queda registrado; por ahora no da premio.</p>
      {OPTS.map((o) => (
        <div key={o.key}>
          <label className="label" htmlFor={`opt-${o.key}`}>{o.label}</label>
          <select id={`opt-${o.key}`} className="input" value={o.key in s.judgment_opt ? (s.judgment_opt[o.key] ? 'si' : 'no') : 'auto'}
            onChange={(e) => setOpt(o.key, e.target.value)}>
            <option value="auto">Según mis respuestas del cuestionario</option>
            <option value="si">Siempre</option>
            <option value="no">Nunca</option>
          </select>
        </div>
      ))}
      <ErrorBox>{error}</ErrorBox>
    </section>
  )
}
