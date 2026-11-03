import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Today from './pages/Today'
import Ranking from './pages/Ranking'
import Habits from './pages/Habits'
import Groups from './pages/Groups'
import Profile from './pages/Profile'
import { Spinner } from './components/ui'

function SetupNeeded() {
  return (
    <div className="mx-auto max-w-md p-6 pt-16">
      <h1 className="text-2xl font-bold">Falta configurar Supabase</h1>
      <p className="mt-3 text-slate-400">
        Copia <code className="text-emerald-400">.env.example</code> a{' '}
        <code className="text-emerald-400">.env.local</code>, rellena{' '}
        <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> y reinicia{' '}
        <code>npm run dev</code>.
      </p>
    </div>
  )
}

function Routed() {
  const { session, loading } = useAuth()
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  if (!session) return <Login />
  return (
    <Routes>
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
  if (!isConfigured) return <SetupNeeded />
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  )
}
