import type { ReactNode } from 'react'
import { areaName, areaStyle } from '../lib/areas'
import { TIER_LABEL } from '../lib/quiz'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary ${className}`}
      role="status"
      aria-label="Cargando"
    />
  )
}

export function Loading() {
  return <div className="grid place-items-center pt-24"><Spinner /></div>
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="mb-3 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger">{children}</p>
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card text-center text-muted">{children}</div>
}

export function Flame({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold tabular-nums ${n > 0 ? 'text-streak' : 'text-muted'} ${big ? 'text-xl' : ''}`}
      title={`Racha de ${n} ${n === 1 ? 'día' : 'días'}`}
      aria-label={`Racha de ${n} ${n === 1 ? 'día' : 'días'}`}
    >
      <svg viewBox="0 0 24 24" className={big ? 'h-6 w-6' : 'h-4 w-4'} fill="currentColor" aria-hidden>
        <path d="M12 2c1 3.5-1.5 5.5-3 7.5C7.3 11.8 6 13.6 6 16a6 6 0 0 0 12 0c0-2.2-1-4-2.2-5.5-.3 1.3-1 2.3-2.3 2.8.6-3.6-.6-8.2-1.5-11.3Z" />
      </svg>
      {n}
    </span>
  )
}

export function AreaIcon({ area, size = 'md' }: { area: string | null | undefined; size?: 'sm' | 'md' }) {
  const s = areaStyle(area)
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl border ${s.bg} ${s.border} ${size === 'md' ? 'h-11 w-11 text-xl' : 'h-8 w-8 text-base'}`}
      aria-hidden
    >
      {s.icon}
    </span>
  )
}

export function AreaTag({ area }: { area: string | null | undefined }) {
  const s = areaStyle(area)
  return <span className={`text-xs font-semibold ${s.text}`}>{s.icon} {areaName(area)}</span>
}

export function Tier({ tier }: { tier: number }) {
  const label = TIER_LABEL[tier] ?? 'Difícil'
  const steps = tier > 3 ? [1, 2, 3, 4] : [1, 2, 3]
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted" title={`Dificultad: ${label}`}>
      {steps.map((i) => (
        <span key={i} className={`h-1.5 w-3 rounded-full ${i <= tier ? 'bg-xp' : 'bg-line'}`} />
      ))}
      <span className="ml-1">{label}</span>
    </span>
  )
}

export function Bar({ value, max, className = 'bg-xp' }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all duration-500 ${className}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ───── Pilares (content/config.json) y peso ─────
import { PILLARS, pillarById } from '../game/config'

export function PillarIcon({ pillar, size = 'md' }: { pillar: string | null | undefined; size?: 'sm' | 'md' }) {
  const p = pillarById(pillar)
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl border ${size === 'md' ? 'h-11 w-11 text-xl' : 'h-8 w-8 text-base'}`}
      style={{ borderColor: (p?.color ?? '#2B3340') + '80', backgroundColor: (p?.color ?? '#2B3340') + '26' }}
      aria-hidden
    >
      {p?.icon ?? '⭐'}
    </span>
  )
}

export function PillarTag({ pillar }: { pillar: string | null | undefined }) {
  const p = pillarById(pillar)
  return <span className="text-xs font-semibold" style={{ color: p?.color ?? 'var(--color-muted)' }}>{p ? `${p.icon} ${p.name}` : 'Sin pilar'}</span>
}

export function PillarSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {PILLARS.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}{p.provisional ? ' (provisional)' : ''}</option>)}
    </select>
  )
}

export const WEIGHT_LABEL: Record<number, string> = { 1: 'Me cuesta poco', 2: 'Me cuesta', 3: 'Me cuesta mucho' }

/** Peso 1–3: dificultad personal ("¿cuánto te cuesta esto?"). */
export function WeightPicker({ value, onChange, label = '¿Cuánto te cuesta esto?' }: { value: number; onChange: (w: number) => void; label?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((w) => (
          <button type="button" key={w} onClick={() => onChange(w)} aria-pressed={value === w}
            className={`btn px-2 text-sm ${value === w ? 'btn-primary' : 'btn-ghost'}`}>
            {w} · {WEIGHT_LABEL[w]}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Weight({ w }: { w: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted" title={`Peso ${w}: ${WEIGHT_LABEL[w]}`}>
      {[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-3 rounded-full ${i <= w ? 'bg-xp' : 'bg-line'}`} />)}
      <span className="ml-1">peso {w}</span>
    </span>
  )
}
