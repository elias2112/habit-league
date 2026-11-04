import type { ReactNode } from 'react'
import type { Archetype } from '../lib/quiz'

export const emblemUrl = (id: string) => `${import.meta.env.BASE_URL}arquetipos/${id}.svg`

const AXES = [
  { key: 'E', name: 'Estructura', hi: 'Te sirven la guía y las reglas claras.', lo: 'Preferís organizarte a tu manera.' },
  { key: 'M', name: 'Momentum', hi: 'Hoy ya sostenés rutinas.', lo: 'Todavía no tenés un ritmo estable.' },
  { key: 'R', name: 'Resiliencia', hi: 'Retomás rápido cuando fallás.', lo: 'Los tropiezos te pesan.' },
] as const

/** Tarjeta de arquetipo: emblema, "Sos <nombre>" (sin artículo, género neutro), frase, descripción y ejes. */
export default function ArchetypeCard({ a, children }: { a: Archetype; children?: ReactNode }) {
  return (
    <section className="card relative overflow-hidden">
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-2xl" aria-hidden />
      <div className="flex items-center gap-4">
        <img src={emblemUrl(a.id)} alt="" className="h-20 w-20 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Tu arquetipo</p>
          <h2 className="text-3xl font-black leading-tight tracking-tight">Sos {a.name}</h2>
        </div>
      </div>
      <p className="mt-3 font-semibold text-xp">{a.tagline}</p>
      <p className="mt-2 text-muted">{a.desc}</p>

      <ul className="mt-4 space-y-1.5 text-sm">
        {AXES.map((x, i) => {
          const high = a.code[i] === x.key
          return (
            <li key={x.key} className="flex items-start gap-2">
              <span className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${high ? 'bg-primary text-bg' : 'bg-surface-2 text-muted'}`}>
                {x.name} {high ? 'alta' : 'baja'}
              </span>
              <span className="text-muted">{high ? x.hi : x.lo}</span>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="mb-1 font-semibold text-ink">Fortalezas</p>
          <ul className="space-y-0.5 text-muted">{a.strengths.map((s) => <li key={s}>✦ {s}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1 font-semibold text-ink">Ojo con</p>
          <ul className="space-y-0.5 text-muted">{a.watch.map((s) => <li key={s}>⚠ {s}</li>)}</ul>
        </div>
      </div>
      {children}
    </section>
  )
}
