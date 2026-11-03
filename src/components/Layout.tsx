import { NavLink, Outlet } from 'react-router-dom'
import InstallHint from './InstallHint'

const tabs = [
  { to: '/', label: 'Hoy', icon: 'M5 13l4 4L19 7' },
  { to: '/ranking', label: 'Ranking', icon: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3' },
  { to: '/habitos', label: 'Hábitos', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/grupos', label: 'Grupo', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8' },
  { to: '/perfil', label: 'Perfil', icon: 'M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
]

export default function Layout() {
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <main className="px-4 pb-28" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
        <InstallHint />
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-emerald-400' : 'text-slate-500'}`
                }
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
