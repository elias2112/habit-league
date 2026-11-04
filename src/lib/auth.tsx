import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** Error al leer el perfil (p. ej. falta ejecutar la migración 002). */
  profileError: string | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null, profile: null, profileError: null, loading: true, refreshProfile: async () => {},
})

const COLUMNS = 'id, username, display_name, timezone, archetype, area_scores, quiz_completed_at'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setProfileError(null); return }
    const read = () => supabase.from('profiles').select(COLUMNS).eq('id', s.user.id).maybeSingle()
    try {
      let { data, error } = await read()
      // Cuenta sin perfil (creada antes de que existiera la base): se crea ahora.
      if (!error && !data) {
        const fix = await supabase.rpc('ensure_profile')
        if (fix.error) throw fix.error
        ;({ data, error } = await read())
      }
      if (error) throw error
      if (!data) throw new Error('No se encontró tu perfil.')
      setProfileError(null)
      setProfile(data as Profile)
    } catch (e) {
      setProfile(null)
      setProfileError((e as { message?: string }).message ?? String(e))
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // No hacer await dentro del callback (puede bloquear supabase-js).
      setTimeout(() => { void loadProfile(s) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session])

  return (
    <AuthContext.Provider value={{ session, profile, profileError, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
