import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { ErrorBox } from './ui'

type Mode = null | 'reset' | 'delete'
interface Preview {
  username: string; habitos: number; registros: number; fotos: number; vicios: number; objetivos: number; cofres: number
  compras: number; propuestas: number; votos: number; juicios: number; liga: number; aportes_compartidos: number; grupo_creado: boolean
}

/** Borra las fotos propias de Storage (la base no las alcanza por cascada). */
async function deleteMyPhotos(userId: string) {
  const bucket = supabase.storage.from('evidencias')
  const { data: folders } = await bucket.list(userId, { limit: 1000 })
  for (const f of folders ?? []) {
    const { data: files } = await bucket.list(`${userId}/${f.name}`, { limit: 1000 })
    const paths = (files ?? []).map((x) => `${userId}/${f.name}/${x.name}`)
    if (paths.length) await bucket.remove(paths)
  }
}

/** Reiniciar mis datos o eliminar la cuenta (spec v4 §7), con confirmación fuerte. */
export default function AccountDanger() {
  const { session, refreshProfile } = useAuth()
  const me = session!.user.id
  const [mode, setMode] = useState<Mode>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open(m: Mode) {
    setMode(m); setTyped(''); setError(null)
    const { data, error } = await supabase.rpc('reset_preview')
    if (error) return setError(errorMessage(error))
    setPreview(data as Preview)
  }

  async function confirm() {
    if (!preview || typed !== preview.username) return
    setBusy(true); setError(null)
    try {
      await deleteMyPhotos(me)
      const { error } = await supabase.rpc(mode === 'reset' ? 'reset_my_data' : 'delete_my_account', { p_confirm: typed })
      if (error) throw error
      try { localStorage.removeItem('hl:onboardingV4') } catch { /* sin almacenamiento */ }
      if (mode === 'delete') {
        await supabase.auth.signOut().catch(() => {})
        try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)) } catch { /* sin almacenamiento */ }
        window.location.assign(import.meta.env.BASE_URL)
      } else {
        await refreshProfile() // sin cuestionario completo → vuelve al cuestionario
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const items = preview ? [
    [preview.habitos, 'hábitos y su historial'], [preview.registros, 'registros diarios (salen del feed)'], [preview.fotos, 'fotos'],
    [preview.vicios, 'vicios'], [preview.objetivos, 'objetivos'], [preview.cofres, 'cofres de ahorro personales'],
    [preview.compras, 'compras (y la billetera)'], [preview.propuestas, 'propuestas'], [preview.votos, 'votos'],
    [preview.juicios, 'Juicios de la liga'], [preview.liga, 'movimientos de la liga'],
  ] as const : []

  return (
    <section className="card mt-5 space-y-3 border-danger/40">
      <h2 className="font-bold">Cuenta</h2>
      {!mode && (
        <div className="grid gap-2">
          <button className="btn btn-ghost" onClick={() => open('reset')}>Empezar de cero (reiniciar mis datos)</button>
          <button className="btn btn-ghost text-danger" onClick={() => open('delete')}>Eliminar mi cuenta</button>
        </div>
      )}
      {mode && preview && (
        <div className="space-y-3">
          <p className="font-semibold">{mode === 'reset' ? 'Reiniciar: se borra esto' : 'Eliminar la cuenta: se borra esto y tu usuario'}</p>
          <ul className="space-y-0.5 text-sm text-muted">
            {items.map(([n, label]) => <li key={label}>• {n} {label}</li>)}
            <li>• tu arquetipo y tus respuestas del cuestionario</li>
            {mode === 'delete' && <li>• tu perfil y tu usuario (no se puede deshacer)</li>}
          </ul>
          <div className="rounded-xl border border-xp/40 bg-xp/10 px-3 py-2 text-xs text-xp">
            Para el grupo: tus puntos salen del ranking y tus registros del feed. Los cambios que ya se aprobaron siguen; tus votos en votaciones abiertas se quitan.
            {preview.aportes_compartidos > 0 && (mode === 'reset'
              ? ` Tus ${preview.aportes_compartidos} aportes a cofres compartidos se quedan (son del grupo).`
              : ` Los cofres compartidos que creaste pasan al dueño del grupo.`)}
            {mode === 'delete' && preview.grupo_creado && ' Como creaste el grupo, pasa al miembro más antiguo (si no queda nadie, el grupo se borra).'}
            {mode === 'reset' && ' Seguís en el grupo y volvés al cuestionario.'}
          </div>
          <div>
            <label className="label" htmlFor="confirm-user">Para confirmar, escribí tu nombre de usuario: <b className="text-ink">{preview.username}</b></label>
            <input id="confirm-user" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <ErrorBox>{error}</ErrorBox>
          <div className="flex gap-2">
            <button className="btn flex-1 border border-danger/60 bg-danger/20 text-danger" disabled={busy || typed !== preview.username} onClick={confirm}>
              {mode === 'reset' ? 'Borrar mis datos y empezar de cero' : 'Eliminar mi cuenta para siempre'}
            </button>
            <button className="btn btn-ghost" onClick={() => setMode(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {mode && !preview && <ErrorBox>{error}</ErrorBox>}
    </section>
  )
}
