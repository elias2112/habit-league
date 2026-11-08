import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { appUrl, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useGroups } from '../lib/groups'
import { errorMessage } from '../lib/errors'
import { timeAgo } from '../lib/date'
import { describeChange, type ChangeKind, type ChangeRequest, type Scope } from '../lib/changes'
import { fmtCoins } from '../lib/day'
import { CONFIG } from '../game/config'
import EvidencePhoto from '../components/EvidencePhoto'
import GroupChests from '../components/GroupChests'
import { ErrorBox, PageHeader, PillarTag, Spinner, Weight } from '../components/ui'
import GroupPicker from '../components/GroupPicker'

interface Activity { at: string; kind: 'log' | 'change' | 'purchase'; user_id: string; username: string; text: string; detail: Record<string, unknown> }

/** Feed del grupo: registros, cambios votados y compras (todo visible; lo privado, enmascarado). */
function Feed({ groupId, me }: { groupId: string; me: string }) {
  const [rows, setRows] = useState<Activity[] | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('group_activity', { p_group: groupId, p_limit: 40 })
    setRows((data as Activity[]) ?? [])
  }, [groupId])

  useEffect(() => {
    void load()
    const ch = supabase
      .channel(`feed-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [groupId, load])

  if (!rows) return <Spinner />
  if (rows.length === 0) return <p className="text-sm text-muted">Todavía no hay actividad.</p>
  return (
    <ul className="divide-y divide-line">
      {rows.map((r, i) => {
        const who = r.user_id === me ? 'Vos' : r.username
        const d = r.detail
        return (
          <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="text-lg" aria-hidden>{r.kind === 'log' ? '✅' : r.kind === 'change' ? '🗳️' : '🛍️'}</span>
            <span className="min-w-0 flex-1">
              <b className={r.user_id === me ? 'text-primary' : ''}>{who}</b>{' '}
              {r.kind === 'log' && <span className="text-ink">· {r.text}{Number(d.count) > 1 && d.unit ? ` (${d.count} ${d.unit})` : ''}</span>}
              {r.kind === 'change' && (
                <span className="text-ink">
                  · {describeChange({ kind: r.text as ChangeKind, payload: (d.payload ?? {}) as Record<string, unknown>, private: Boolean(d.private), scope: d.scope as Scope })}
                  {' '}<span className={d.status === 'approved' ? 'text-alimentacion' : d.status === 'rejected' ? 'text-danger' : 'text-xp'}>
                    ({d.status === 'approved' ? 'aprobado' : d.status === 'rejected' ? 'rechazado' : 'en votación'})
                  </span>
                </span>
              )}
              {r.kind === 'purchase' && <span className="text-ink">· compró «{r.text}» ({fmtCoins(Number(d.price))} monedas)</span>}
            </span>
            {r.kind === 'log' && typeof d.photo_path === 'string' && <EvidencePhoto path={d.photo_path} className="h-10 w-10" />}
            <span className="w-16 text-right text-xs text-muted">{timeAgo(r.at)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Votaciones del grupo: quien propone no vota; aprueba con más de la mitad; vence en el plazo configurado. */
function Reviews({ groupId, me }: { groupId: string; me: string }) {
  const [rows, setRows] = useState<ChangeRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('group_requests', { p_group: groupId })
    if (error) setError(errorMessage(error))
    setRows((data as ChangeRequest[]) ?? [])
  }, [groupId])
  useEffect(() => { void load() }, [load])

  async function vote(r: ChangeRequest, v: 'yes' | 'no') {
    setBusy(r.id); setError(null)
    const { error } = await supabase.rpc('vote_change', { p_request: r.id, p_vote: v })
    setBusy(null)
    if (error) setError(errorMessage(error))
    await load()
  }

  if (!rows) return null
  const pending = rows.filter((r) => r.status === 'pending')
  return (
    <section className="card mb-4">
      <h2 className="mb-1 font-semibold">
        🗳️ Votaciones {pending.length > 0 && <span className="ml-1 rounded-full bg-xp px-2 py-0.5 text-xs font-bold text-bg">{pending.length}</span>}
      </h2>
      <p className="mb-3 text-xs text-muted">
        Se aprueba con más de la mitad a favor y se rechaza con la mitad o más en contra. Si nadie vota en {CONFIG.voteWindowHours} h, se aprueba sola. Lo aprobado rige desde mañana.
      </p>
      <ErrorBox>{error}</ErrorBox>
      {pending.length === 0 && <p className="text-sm text-muted">No hay nada para votar.</p>}
      <ul className="space-y-3">
        {pending.map((r) => {
          const mine = r.proposer_id === me
          const closes = Math.max(0, Math.round((Date.parse(r.closes_at) - Date.now()) / 3600000))
          return (
            <li key={r.id} className="rounded-2xl border border-line bg-surface-2/50 p-3">
              <p className="font-semibold">{describeChange(r)}</p>
              <p className="mt-1 text-xs text-muted">
                de <b className="text-ink">{mine ? 'vos' : r.proposer}</b> · 👍 {r.yes} · 👎 {r.no} de {r.voters} · cierra en {closes} h
              </p>
              {!mine && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className={`btn ${r.my_vote === 'yes' ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === r.id} onClick={() => vote(r, 'yes')}>👍 A favor</button>
                  <button className={`btn ${r.my_vote === 'no' ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === r.id} onClick={() => vote(r, 'no')}>👎 En contra</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Pesos de todos (transparencia contra los pesos inflados). Privados y vicios sin nombre. */
function FriendsPlans({ groupId, me }: { groupId: string; me: string }) {
  const [rows, setRows] = useState<{ user_id: string; username: string; habits: { name: string; pillar: string | null; weight: number; target: number | null; unit: string | null }[]; vices: { name: string; weight: number; severity: string }[] }[]>([])
  useEffect(() => {
    supabase.rpc('group_plans', { p_group: groupId }).then(({ data }) => setRows((data as typeof rows) ?? []))
  }, [groupId])
  if (rows.length === 0) return null
  return (
    <details className="card mb-4">
      <summary className="cursor-pointer font-semibold">⚖️ Pesos de cada uno</summary>
      <div className="mt-3 space-y-4">
        {rows.map((p) => (
          <div key={p.user_id}>
            <p className="mb-1 text-sm font-bold">{p.user_id === me ? 'Vos' : p.username}</p>
            <ul className="space-y-1 text-sm">
              {p.habits.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate"><PillarTag pillar={h.pillar} /> {h.name}{h.target != null ? ` (meta ${h.target} ${h.unit ?? ''})` : ''}</span>
                  <Weight w={h.weight} />
                </li>
              ))}
              {p.vices.map((v, i) => (
                <li key={`v${i}`} className="flex items-center justify-between gap-2 text-muted">
                  <span>🚫 {v.name} ({v.severity})</span><Weight w={v.weight} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}

export default function Groups() {
  const { session } = useAuth()
  const me = session!.user.id
  const { groups, selected, select, reload, loading } = useGroups()
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(66)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [members, setMembers] = useState<number | null>(null)

  useEffect(() => {
    if (!selected) return
    supabase.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', selected.id)
      .then(({ count }) => setMembers(count ?? null))
  }, [selected])

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('create_group', { p_name: name, p_duration: duration })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setName('')
    await reload()
    select((data as { id: string }).id)
  }

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('join_group', { p_code: code })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setCode('')
    await reload()
    select(data as string)
  }

  async function leave() {
    if (!selected || !confirm(`¿Salir de "${selected.name}"? Vas a dejar de ver su ranking.`)) return
    const { error } = await supabase.from('group_members').delete().eq('group_id', selected.id).eq('user_id', me)
    if (error) return setError(errorMessage(error))
    await reload()
  }

  async function share() {
    if (!selected) return
    const text = `Unite a mi grupo "${selected.name}" en Habit League con el código: ${selected.invite_code}\n${appUrl()}`
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(selected.invite_code); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    } catch { /* el usuario canceló */ }
  }

  if (loading) return <div className="grid place-items-center pt-24"><Spinner /></div>

  return (
    <>
      <PageHeader title="Grupo" />
      <ErrorBox>{error}</ErrorBox>

      {selected && (
        <>
          <GroupPicker groups={groups} selected={selected} onSelect={select} />
          <section className="card mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Código de invitación</p>
                <p className="font-mono text-2xl font-bold tracking-widest text-primary">{selected.invite_code}</p>
                <p className="mt-1 text-sm text-muted">
                  {members !== null && `${members} ${members === 1 ? 'miembro' : 'miembros'} · `}
                  Reto de {selected.duration_days} días desde el {new Date(selected.start_date + 'T12:00:00Z').toLocaleDateString('es-ES', { timeZone: 'UTC' })}
                </p>
              </div>
              <button className="btn btn-primary shrink-0" onClick={share}>{copied ? '¡Copiado!' : 'Invitar'}</button>
            </div>
          </section>

          <Reviews groupId={selected.id} me={me} />

          <FriendsPlans groupId={selected.id} me={me} />

          <GroupChests groupId={selected.id} me={me} />

          <section className="card mb-4">
            <h2 className="mb-2 font-semibold">Actividad del grupo</h2>
            <Feed groupId={selected.id} me={me} />
          </section>
        </>
      )}

      <section className="card mb-4">
        <h2 className="mb-3 font-semibold">Unirme con código</h2>
        <form onSubmit={join} className="flex gap-2">
          <input className="input font-mono uppercase tracking-widest" required maxLength={8} placeholder="ab12cd34" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-primary" disabled={busy}>Unirme</button>
        </form>
      </section>

      <section className="card mb-4">
        <h2 className="mb-3 font-semibold">Crear grupo</h2>
        <form onSubmit={create} className="space-y-3">
          <input className="input" required maxLength={40} placeholder="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label className="label">Duración del reto (días)</label>
            <input className="input" type="number" min={1} max={366} required value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>Crear grupo</button>
        </form>
        <p className="mt-2 text-xs text-muted">El reto empieza hoy. Solo cuentan los puntos ganados dentro de esas fechas.</p>
      </section>

      {selected && (
        <button className="btn btn-ghost w-full text-danger" onClick={leave}>Salir de “{selected.name}”</button>
      )}
    </>
  )
}
