import { CATALOG } from '../lib/quiz'
import { PILLARS } from '../game/config'
import config from '../../content/config.json'
import { PillarIcon, Weight } from './ui'

const areaToPillar = config.areaToPillar as Record<string, string | null>
/** Pilar de un hábito del catálogo (los de áreas sin pilar, como Conexión, quedan fuera). */
export const catalogPillar = (area: string) => areaToPillar[area] ?? null

/** Catálogo agrupado por pilar, con selección por toque. */
export default function CatalogPicker({ selected, onToggle, disabled = new Set<string>() }: {
  selected: Set<string>
  onToggle: (id: string) => void
  disabled?: Set<string>
  firstAreas?: string[]
}) {
  return (
    <div className="space-y-5">
      {PILLARS.map((p) => {
        const items = CATALOG.filter((h) => catalogPillar(h.area) === p.id)
        if (items.length === 0) return null
        return (
          <section key={p.id}>
            <h3 className="mb-2 text-sm font-bold" style={{ color: p.color }}>{p.icon} {p.name}</h3>
            <ul className="space-y-2">
              {items.map((h) => {
                const on = selected.has(h.id)
                const off = disabled.has(h.id)
                return (
                  <li key={h.id}>
                    <button type="button" disabled={off} onClick={() => onToggle(h.id)} aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${on ? 'border-primary bg-primary/10' : 'border-line bg-surface'} ${off ? 'opacity-40' : ''}`}>
                      <PillarIcon pillar={p.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{h.name}</span>
                        <span className="block text-xs text-muted">{h.criterion}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3">
                          <Weight w={Math.min(3, h.tier)} />
                          {(h.target ?? 1) > 1 && <span className="text-xs text-muted">meta: {h.target} {h.unit}</span>}
                          {h.private_default && <span className="text-xs text-muted">🔒 privado</span>}
                        </span>
                      </span>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold ${on ? 'border-primary bg-primary text-bg' : 'border-line text-muted'}`}>
                        {off || on ? '✓' : '+'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <p className="text-xs text-muted">Dinero, Habilidades, Creatividad y Carrera todavía no tienen hábitos de catálogo: podés proponer los tuyos.</p>
    </div>
  )
}
