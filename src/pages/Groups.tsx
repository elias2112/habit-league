import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { appUrl, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useGroups } from '../lib/groups'
import { errorMessage } from '../lib/errors'
import { timeAgo } from '../lib/date'
import type { FeedRow } from '../lib/types'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
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
  if (rows.length === 0) return <p className="text-sm text-slate-500">Aún no hay actividad.</p>
  return (
    <ul className="divide-y divide-slate-800">
      {rows.map((r) => (
        <li key={r.log_id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="text-lg">{r.habit_icon || '✅'}</span>
          <span className="min-w-0 flex-1">
            <b className={r.user_id === me ? 'text-emerald-400' : ''}>{r.user_id === me ? 'Tú' : r.username}</b>{' '}
            <span className="text-slate-300">· {r.habit_name}</span>
          </span>
          <span className="text-emerald-400">+{r.xp}</span>
          <span className="w-20 text-right text-xs text-slate-500">{timeAgo(r.created_at)}</span>
        </li>
      ))}
    </ul>
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
    if (!selected || !confirm(`¿Salir de "${selected.name}"? Dejarás de ver su ranking.`)) return
    const { error } = await supabase.from('group_members').delete().eq('group_id', selected.id).eq('user_id', me)
    if (error) return setError(errorMessage(error))
    await reload()
  }

  async function share() {
    if (!selected) return
    const text = `Únete a mi grupo "${selected.name}" en Habit League con el código: ${selected.invite_code}\n${appUrl()}`
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
                <p className="text-sm text-slate-400">Código de invitación</p>
                <p className="font-mono text-2xl font-bold tracking-widest text-emerald-400">{selected.invite_code}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {members !== null && `${members} ${members === 1 ? 'miembro' : 'miembros'} · `}
                  Reto de {selected.duration_days} días desde el {new Date(selected.start_date + 'T12:00:00Z').toLocaleDateString('es-ES', { timeZone: 'UTC' })}
                </p>
              </div>
              <button className="btn btn-primary shrink-0" onClick={share}>{copied ? '¡Copiado!' : 'Invitar'}</button>
            </div>
          </section>

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
        <p className="mt-2 text-xs text-slate-500">El reto empieza hoy. Solo cuenta el XP ganado dentro de esas fechas.</p>
      </section>

      {selected && (
        <button className="btn btn-ghost w-full text-rose-300" onClick={leave}>Salir de “{selected.name}”</button>
      )}
    </>
  )
}
