import type { Archetype } from '../lib/quiz'

export default function ArchetypeCard({ a, compact = false }: { a: Archetype; compact?: boolean }) {
  return (
    <section className="card relative overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-2xl" aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">Tu arquetipo</p>
      <h2 className="mt-1 text-3xl font-black tracking-tight">{a.name}</h2>
      <p className="mt-1 font-semibold text-xp">{a.tagline}</p>
      {!compact && <p className="mt-3 text-muted">{a.desc}</p>}
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
    </section>
  )
}
