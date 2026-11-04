import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { appUrl, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useGroups } from '../lib/groups'
import { errorMessage } from '../lib/errors'
import { timeAgo } from '../lib/date'
import { areaStyle } from '../lib/areas'
import type { FeedRow, GroupReview } from '../lib/types'
import { TIER_LABEL } from '../lib/quiz'
import EvidencePhoto from '../components/EvidencePhoto'
import GroupChests from '../components/GroupChests'
import { AreaIcon, ErrorBox, PageHeader, Spinner, Tier } from '../components/ui'
import GroupPicker from '../components/GroupPicker'

function Feed({ groupId, me }: { groupId: string; me: string }) {
  const [rows, setRows] = useState<FeedRow[] | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('group_feed', { p_group: groupId, p_limit: 30 })
    setRows((data as FeedRow[]) ?? [])
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
      {rows.map((r) => {
        const partial = r.target > 1 && r.count < r.target
        return (
          <li key={r.log_id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="text-lg" aria-hidden>{r.is_private && r.user_id !== me ? '🔒' : areaStyle(r.habit_area).icon}</span>
            <span className="min-w-0 flex-1">
              <b className={r.user_id === me ? 'text-primary' : ''}>{r.user_id === me ? 'Vos' : r.username}</b>{' '}
              <span className="text-ink">· {r.habit_name}</span>
              {r.target > 1 && (
                <span className={`block text-xs ${partial ? 'text-muted' : 'text-primary'}`}>
                  {r.count.toLocaleString('es-ES')}/{r.target.toLocaleString('es-ES')} {r.unit}
                </span>
              )}
            </span>
            {r.photo_path && <EvidencePhoto path={r.photo_path} className="h-10 w-10" />}
            <span className="font-bold text-xp">+{Math.round(Number(r.points))}</span>
            <span className="w-16 text-right text-xs text-muted">{timeAgo(r.created_at)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** Hábitos propios de otros que esperan tu voto (≥ 50 % del resto del grupo aprueba). */
function Reviews({ groupId, me }: { groupId: string; me: string }) {
  const [rows, setRows] = useState<GroupReview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('group_reviews', { p_group: groupId })
    if (error) setError(errorMessage(error))
    setRows((data as GroupReview[]) ?? [])
  }, [groupId])
  useEffect(() => { void load() }, [load])

  async function vote(r: GroupReview, approve: boolean) {
    setBusy(r.habit_id); setError(null)
    const { error } = await supabase.rpc('vote_habit', { p_habit: r.habit_id, p_group: groupId, p_approve: approve })
    setBusy(null)
    if (error) setError(errorMessage(error))
    await load()
  }

  if (!rows || rows.length === 0) return null
  const pending = rows.filter((r) => r.status === 'pending')
  const recent = rows.filter((r) => r.status !== 'pending')

  return (
    <section className="card mb-4">
      <h2 className="mb-1 font-semibold">
        Hábitos propuestos {pending.length > 0 && <span className="ml-1 rounded-full bg-xp px-2 py-0.5 text-xs font-bold text-bg">{pending.length}</span>}
      </h2>
      <p className="mb-3 text-xs text-muted">Se aprueban con al menos la mitad del resto del grupo. Si se aprueban, suman también los días ya marcados.</p>
      <ErrorBox>{error}</ErrorBox>
      <ul className="space-y-3">
        {pending.map((r) => {
          const mine = r.owner_id === me
          const need = Math.ceil(r.others / 2)
          return (
            <li key={r.habit_id} className="rounded-2xl border border-line bg-surface-2/50 p-3">
              <div className="flex items-start gap-3">
                <AreaIcon area={r.area} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.habit_name}</p>
                  {r.criterion && <p className="text-xs text-muted">{r.criterion}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    <span>de <b className="text-ink">{mine ? 'vos' : r.owner_username}</b></span>
                    <Tier tier={r.tier} />
                    {r.target > 1 && <span>meta {r.target} {r.unit}</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    👍 {r.yes} · 👎 {r.no} · hacen falta {need} {need === 1 ? 'voto' : 'votos'} a favor de {r.others}
                  </p>
                </div>
              </div>
              {!mine && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className={`btn ${r.my_vote === true ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === r.habit_id} onClick={() => vote(r, true)}>
                    👍 Aprobar
                  </button>
                  <button className={`btn ${r.my_vote === false ? 'btn-primary' : 'btn-ghost'}`} disabled={busy === r.habit_id} onClick={() => vote(r, false)}>
                    👎 Rechazar
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {recent.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Decididos esta semana ({recent.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {recent.map((r) => (
              <li key={r.habit_id} className="flex justify-between gap-2">
                <span className="truncate">{r.habit_name} <span className="text-muted">· {r.owner_id === me ? 'vos' : r.owner_username} · {TIER_LABEL[r.tier]}</span></span>
                <span className={r.status === 'approved' ? 'text-alimentacion' : 'text-danger'}>{r.status === 'approved' ? 'Aprobado' : 'Rechazado'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
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
