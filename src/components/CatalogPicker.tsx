import { AREAS, CATALOG, type AreaId } from '../lib/quiz'
import { AreaIcon, Tier } from './ui'
import { areaStyle } from '../lib/areas'

/** Catálogo de hábitos agrupado por área, con selección por toque. */
export default function CatalogPicker({ selected, onToggle, firstAreas = [], disabled = new Set<string>() }: {
  selected: Set<string>
  onToggle: (id: string) => void
  firstAreas?: AreaId[]
  disabled?: Set<string>
}) {
  const order = [...firstAreas, ...AREAS.map((a) => a.id).filter((a) => !firstAreas.includes(a))]
  return (
    <div className="space-y-5">
      {order.map((areaId) => {
        const area = AREAS.find((a) => a.id === areaId)!
        const s = areaStyle(areaId)
        return (
          <section key={areaId}>
            <h3 className={`mb-2 text-sm font-bold ${s.text}`}>{s.icon} {area.name} <span className="font-normal text-muted">· {area.desc}</span></h3>
            <ul className="space-y-2">
              {CATALOG.filter((h) => h.area === areaId).map((h) => {
                const on = selected.has(h.id)
                const off = disabled.has(h.id)
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={off}
                      onClick={() => onToggle(h.id)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                        on ? 'border-primary bg-primary/10' : 'border-line bg-surface'
                      } ${off ? 'opacity-40' : ''}`}
                    >
                      <AreaIcon area={h.area} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{h.name}</span>
                        <span className="block text-xs text-muted">{h.criterion}</span>
                        <span className="mt-1 block"><Tier tier={h.tier} /></span>
                      </span>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-sm font-bold ${on ? 'border-primary bg-primary text-bg' : 'border-line text-muted'}`}>
                        {off ? '✓' : on ? '✓' : '+'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
