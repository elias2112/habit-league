import type { Group } from '../lib/types'

export default function GroupPicker({ groups, selected, onSelect }: { groups: Group[]; selected: Group; onSelect: (id: string) => void }) {
  if (groups.length < 2) return <p className="mb-4 font-semibold text-ink">{selected.name}</p>
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            g.id === selected.id ? 'bg-primary text-bg' : 'bg-surface-2 text-ink'
          }`}
        >
          {g.name}
        </button>
      ))}
    </div>
  )
}
