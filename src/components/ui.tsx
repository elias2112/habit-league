import type { ReactNode } from 'react'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400 ${className}`}
      role="status"
      aria-label="Cargando"
    />
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-xl border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{children}</p>
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card text-center text-slate-400">{children}</div>
}

export function Flame({ n }: { n: number }) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${n > 0 ? 'text-orange-400' : 'text-slate-500'}`} title={`Racha de ${n} días`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M12 2c1 3.5-1.5 5.5-3 7.5C7.3 11.8 6 13.6 6 16a6 6 0 0 0 12 0c0-2.2-1-4-2.2-5.5-.3 1.3-1 2.3-2.3 2.8.6-3.6-.6-8.2-1.5-11.3Z" />
      </svg>
      {n}
    </span>
  )
}
