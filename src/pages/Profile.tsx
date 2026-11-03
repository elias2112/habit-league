import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { allTimezones, browserTimezone } from '../lib/date'
import { Link } from 'react-router-dom'
import { archetypeById } from '../lib/quiz'
import ArchetypeCard from '../components/ArchetypeCard'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'

export default function Profile() {
  const { session, profile, refreshProfile } = useAuth()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState('Europe/Madrid')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const zones = useMemo(allTimezones, [])
  const deviceTz = browserTimezone()
  const arch = archetypeById(profile?.archetype)

  useEffect(() => {
    if (!profile) return
    setUsername(profile.username)
    setDisplayName(profile.display_name ?? '')
    setTimezone(profile.timezone)
  }, [profile])

  if (!profile) return <div className="grid place-items-center pt-24"><Spinner /></div>

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim(), display_name: displayName.trim() || null, timezone })
      .eq('id', profile!.id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    await refreshProfile()
    setSaved(true)
  }

  return (
    <>
      <PageHeader title="Perfil" subtitle={session?.user.email} />
      <form onSubmit={save} className="card space-y-4">
        <div>
          <label className="label" htmlFor="username">Nombre de usuario</label>
          <input
            id="username" className="input" required pattern="[A-Za-z0-9_]{3,24}" maxLength={24}
            title="3–24 caracteres: letras, números o _" value={username} onChange={(e) => setUsername(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">3–24 caracteres: letras, números o _. Es como te ve el grupo.</p>
        </div>
        <div>
          <label className="label" htmlFor="display">Nombre visible (opcional)</label>
          <input id="display" className="input" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="tz">Zona horaria</label>
          <select id="tz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">
            Define cuándo empieza tu día para los checks y la racha.
            {deviceTz !== timezone && (
              <> Tu dispositivo está en <button type="button" className="underline text-primary" onClick={() => setTimezone(deviceTz)}>{deviceTz}</button>.</>
            )}
          </p>
        </div>
        <ErrorBox>{error}</ErrorBox>
        {saved && <p className="text-sm text-primary">Guardado.</p>}
        <button className="btn btn-primary w-full" disabled={busy}>Guardar</button>
      </form>

      {arch && (
        <div className="mt-5">
          <ArchetypeCard a={arch} />
        </div>
      )}
      <Link to="/quiz" className="btn btn-ghost mt-3 w-full">{arch ? 'Repetir el quiz' : 'Hacer el quiz'}</Link>

      <button className="btn btn-ghost mt-3 w-full" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>

      <p className="mt-6 text-xs text-muted">
        Para instalar la app: en iPhone, Safari → Compartir → “Añadir a pantalla de inicio”. En Android, Chrome → menú → “Instalar aplicación”.
      </p>
    </>
  )
}
