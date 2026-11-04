import { AREAS, type AreaId } from '../lib/quiz'

// Colores de área (mismos tokens que src/index.css; el SVG necesita valores concretos).
const COLOR: Record<AreaId, string> = {
  cuerpo: '#FF6B6B', mente: '#B4A8FF', sueno: '#5AA9FF', alimentacion: '#7BD88F', foco: '#4FD1C5', social: '#FF8FD0',
}

export type RadarValues = Partial<Record<AreaId, number>> // 0–100

/** Hexágono de 6 áreas (docs/DESIGN.md): punteado = Día 1, relleno = actual. */
export default function Radar({ day1, actual, size = 300 }: { day1?: RadarValues; actual?: RadarValues; size?: number }) {
  const c = 170, R = 100
  const ids = AREAS.map((a) => a.id)
  const angle = (i: number) => -Math.PI / 2 + (i * Math.PI) / 3
  const pt = (i: number, v: number) => {
    const r = (Math.max(0, Math.min(100, v)) / 100) * R
    return [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))] as const
  }
  const poly = (vals: RadarValues) => ids.map((id, i) => pt(i, vals[id] ?? 0).join(',')).join(' ')
  const ring = (f: number) => ids.map((_, i) => pt(i, f * 100).join(',')).join(' ')

  const label = ids.map((id, i) => {
    const [x, y] = pt(i, 128)
    const anchor = Math.abs(x - c) < 5 ? 'middle' : x > c ? 'start' : 'end'
    return { id, x, y: y + 4, anchor, name: AREAS[i].name }
  })

  const summary = ids.map((id) => `${AREAS.find((a) => a.id === id)!.name}: ${Math.round(actual?.[id] ?? day1?.[id] ?? 0)}`).join(', ')

  return (
    <svg viewBox="0 0 340 340" width="100%" style={{ maxWidth: size }} className="mx-auto block" role="img" aria-label={`Radar de 6 áreas. ${summary}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} fill="none" stroke="#2B3340" strokeWidth={1} />)}
      {ids.map((_, i) => {
        const [x, y] = pt(i, 100)
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#2B3340" strokeWidth={1} />
      })}
      {day1 && <polygon points={poly(day1)} fill="none" stroke="#9AA4B2" strokeWidth={2} strokeDasharray="5 4" />}
      {actual && <polygon points={poly(actual)} fill="#8B7CFF" fillOpacity={0.25} stroke="#8B7CFF" strokeWidth={3} strokeLinejoin="round" />}
      {ids.map((id, i) => {
        const v = actual?.[id] ?? day1?.[id]
        if (v == null) return null
        const [x, y] = pt(i, v)
        return <circle key={id} cx={x} cy={y} r={4} fill={COLOR[id]} />
      })}
      {label.map((l) => (
        <text key={l.id} x={l.x} y={l.y} fill={COLOR[l.id]} fontSize={13} fontWeight={600} textAnchor={l.anchor as 'start'} fontFamily="system-ui, sans-serif">
          {l.name}
        </text>
      ))}
    </svg>
  )
}

/** Nivel del quiz (0–3) → 0–100, como "Día 1" del radar. */
export function levelsToRadar(level: Partial<Record<string, number>> | null | undefined): RadarValues {
  const out: RadarValues = {}
  for (const a of AREAS) out[a.id] = Math.round(((level?.[a.id] ?? 0) * 100) / 3)
  return out
}
