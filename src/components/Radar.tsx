import { PILLARS } from '../game/config'
import config from '../../content/config.json'

export type RadarValues = Partial<Record<string, number>> // pilar → 0–100

/** Hexágono de los 6 pilares (content/config.json; docs/DESIGN.md): punteado = Día 1, relleno = actual. */
export default function Radar({ day1, actual, size = 300 }: { day1?: RadarValues; actual?: RadarValues; size?: number }) {
  const c = 170, R = 100
  const ids = PILLARS.map((p) => p.id)
  const n = ids.length
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, v: number) => {
    const r = (Math.max(0, Math.min(100, v)) / 100) * R
    return [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))] as const
  }
  const poly = (vals: RadarValues) => ids.map((id, i) => pt(i, vals[id] ?? 0).join(',')).join(' ')
  const ring = (f: number) => ids.map((_, i) => pt(i, f * 100).join(',')).join(' ')
  const summary = PILLARS.map((p) => `${p.name}: ${Math.round(actual?.[p.id] ?? day1?.[p.id] ?? 0)}`).join(', ')

  return (
    <svg viewBox="0 0 340 340" width="100%" style={{ maxWidth: size }} className="mx-auto block" role="img" aria-label={`Radar de pilares. ${summary}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ring(f)} fill="none" stroke="#2B3340" strokeWidth={1} />)}
      {ids.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#2B3340" strokeWidth={1} /> })}
      {day1 && <polygon points={poly(day1)} fill="none" stroke="#9AA4B2" strokeWidth={2} strokeDasharray="5 4" />}
      {actual && <polygon points={poly(actual)} fill="#8B7CFF" fillOpacity={0.25} stroke="#8B7CFF" strokeWidth={3} strokeLinejoin="round" />}
      {PILLARS.map((p, i) => {
        const v = actual?.[p.id] ?? day1?.[p.id]
        if (v == null) return null
        const [x, y] = pt(i, v)
        return <circle key={p.id} cx={x} cy={y} r={4} fill={p.color} />
      })}
      {PILLARS.map((p, i) => {
        const [x, y] = pt(i, 128)
        const anchor = Math.abs(x - c) < 5 ? 'middle' : x > c ? 'start' : 'end'
        return (
          <text key={p.id} x={x} y={y + 4} fill={p.color} fontSize={12} fontWeight={600} textAnchor={anchor} fontFamily="system-ui, sans-serif">
            {p.name}
          </text>
        )
      })}
    </svg>
  )
}

/** Niveles del quiz por área (0–3) → Día 1 por pilar (0–100), promediando las áreas de cada pilar (areaToPillar). */
export function levelsToRadar(level: Partial<Record<string, number>> | null | undefined): RadarValues {
  const map = config.areaToPillar as Record<string, string | null>
  const out: RadarValues = {}
  for (const p of PILLARS) {
    const areas = Object.keys(map).filter((a) => map[a] === p.id && level?.[a] != null)
    out[p.id] = areas.length ? Math.round((areas.reduce((s, a) => s + (level![a] ?? 0), 0) / areas.length) * 100 / 3) : 0
  }
  return out
}
