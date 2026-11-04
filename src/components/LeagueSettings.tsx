import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { signed, useLeague } from '../lib/league'
import LeagueBadge from './LeagueBadge'
import { ErrorBox } from './ui'

interface Settings { share_judgment: boolean; judgment_opt: Record<string, boolean> }
interface Event { id: string; day: string; kind: string; pl: number; note: string | null; detail: { habits_pl?: number; judgment?: number } | null }

const OPTS = [
  { key: 'fumar', label: 'Preguntarme si fumé' },
  { key: 'alcohol', label: 'Preguntarme si tomé alcohol' },
]
const KIND: Record<string, string> = { dia: '📅', semana: '🪙', dragon: '🐉', hito: '🏆', ascenso: '⬆️', descenso: '⬇️' }

/** Liga en el perfil: rango, preferencias del Juicio e historial. */
export default function LeagueSettings() {
  const { session } = useAuth()
  const me = session!.user.id
  const league = useLeague()
  const [s, setS] = useState<Settings>({ share_judgment: false, judgment_opt: {} })
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('user_settings').select('share_judgment, judgment_opt').eq('user_id', me).maybeSingle()
      .then(({ data }) => { if (data) setS(data as Settings) })
    supabase.from('league_events').select('id, day, kind, pl, note, detail').eq('user_id', me).order('created_at', { ascending: false }).limit(15)
      .then(({ data }) => setEvents((data as Event[]) ?? []))
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
      <h2 className="font-bold">La Liga</h2>
      {league.state && <LeagueBadge s={league.state} />}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-primary)]" checked={s.share_judgment}
          onChange={(e) => save({ ...s, share_judgment: e.target.checked })} />
        <span>Mostrar el detalle de mi Juicio al grupo (también lo negativo). Si está apagado, solo ven el total.</span>
      </label>

      {OPTS.map((o) => (
        <div key={o.key}>
          <label className="label" htmlFor={`opt-${o.key}`}>{o.label}</label>
          <select id={`opt-${o.key}`} className="input" value={o.key in s.judgment_opt ? (s.judgment_opt[o.key] ? 'si' : 'no') : 'auto'}
            onChange={(e) => setOpt(o.key, e.target.value)}>
            <option value="auto">Según mi quiz</option>
            <option value="si">Siempre</option>
            <option value="no">Nunca</option>
          </select>
        </div>
      ))}
      <ErrorBox>{error}</ErrorBox>

      {events.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-muted">Historial de la liga</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-muted">
                  {KIND[e.kind] ?? '•'} {new Date(e.day + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  {' · '}
                  {e.kind === 'dia'
                    ? `hábitos ${signed(e.detail?.habits_pl ?? 0)}${e.detail?.judgment != null ? `, Juicio ${signed(e.detail.judgment)}` : ', sin Juicio'}`
                    : e.note}
                </span>
                {e.pl !== 0 && <b className={`tabular-nums ${e.pl > 0 ? 'text-alimentacion' : 'text-danger'}`}>{signed(e.pl)}</b>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
