import { useState, type FormEvent } from 'react'
import { appUrl, supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { ErrorBox } from '../components/ui'
import { ADMIN_NAME } from '../lib/config'

type Mode = 'login' | 'signup' | 'magic'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [forgot, setForgot] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: appUrl() },
        })
        if (error) throw error
        if (!data.session) setInfo('Cuenta creada. Revisá tu correo para confirmarla y después iniciá sesión.')
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email, options: { emailRedirectTo: appUrl() },
        })
        if (error) throw error
        setInfo('Te enviamos un enlace de acceso. Abrilo desde este mismo dispositivo.')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => { setMode(m); setError(null); setInfo(null) }}
      className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === m ? 'bg-line text-ink' : 'text-muted'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="mx-auto h-16 w-16" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Habit League</h1>
        <p className="mt-1 text-muted">Hábitos, puntos, rachas y ranking con tus amigos.</p>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1">
        {tab('login', 'Entrar')}
        {tab('signup', 'Crear cuenta')}
        {tab('magic', 'Enlace')}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'magic' && (
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <div className="relative">
              <input
                id="password" className="input pr-12" type={showPassword ? 'text' : 'password'} required minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="M3 3l18 18" />}
                </svg>
              </button>
            </div>
          </div>
        )}
        <ErrorBox>{error}</ErrorBox>
        {info && <p className="rounded-xl border border-primary/50 bg-primary/10 px-3 py-2 text-sm text-ink">{info}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviarme el enlace'}
        </button>
      </form>

      {mode === 'login' && (
        <div className="mt-4 text-center text-sm">
          {forgot ? (
            <p className="rounded-xl border border-line bg-surface px-3 py-2 text-muted">
              Hablá con <b className="text-ink">{ADMIN_NAME}</b>: no puede ver tu contraseña (nadie puede, se guarda cifrada),
              pero te pone una nueva para que entres y después la cambiás desde tu perfil.
            </p>
          ) : (
            <button type="button" className="font-semibold text-primary" onClick={() => setForgot(true)}>¿Te olvidaste la contraseña?</button>
          )}
        </div>
      )}
    </div>
  )
}
