import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Today from './pages/Today'
import Ranking from './pages/Ranking'
import Habits from './pages/Habits'
import Groups from './pages/Groups'
import Profile from './pages/Profile'
import { Spinner } from './components/ui'

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md p-6 pt-16">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="mt-3 space-y-2 text-muted">{children}</div>
    </div>
  )
}

function Routed() {
  const { session, profile, profileError, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  if (!session) return <Login />
  if (profileError) {
    return (
      <Notice title="Falta actualizar la base de datos">
        <p>No se pudo leer tu perfil. Lo más probable es que falte ejecutar <code className="text-primary">supabase/migrations/002_quiz_personas_puntos.sql</code> en el SQL Editor de Supabase.</p>
        <p className="text-xs">Detalle: {profileError}</p>
      </Notice>
    )
  }
  if (!profile) return <div className="grid min-h-screen place-items-center"><Spinner /></div>

  // Primer ingreso: quiz → arquetipo → paquete de hábitos → grupo.
  if (!profile.quiz_completed_at) {
    return (
      <Routes>
        <Route path="grupos" element={<Layout />}><Route index element={<Groups />} /></Route>
        <Route path="*" element={<Onboarding />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="quiz" element={<Onboarding />} />
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="habitos" element={<Habits />} />
        <Route path="grupos" element={<Groups />} />
        <Route path="perfil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) {
    return (
      <Notice title="Falta configurar Supabase">
        <p>
          Copiá <code className="text-primary">.env.example</code> a <code className="text-primary">.env.local</code>, completá{' '}
          <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> y reiniciá <code>npm run dev</code>.
        </p>
      </Notice>
    )
  }
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  )
}
