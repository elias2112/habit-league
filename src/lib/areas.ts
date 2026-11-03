import type { AreaId } from './quiz'
import { AREAS } from './quiz'

// Ícono + color por área. El color nunca va solo: siempre con ícono y nombre (DESIGN.md).
export const AREA_STYLE: Record<AreaId, { icon: string; text: string; bg: string; border: string; bar: string }> = {
  cuerpo:       { icon: '💪', text: 'text-cuerpo',       bg: 'bg-cuerpo/15',       border: 'border-cuerpo/50',       bar: 'bg-cuerpo' },
  mente:        { icon: '🧠', text: 'text-mente',        bg: 'bg-mente/15',        border: 'border-mente/50',        bar: 'bg-mente' },
  sueno:        { icon: '🌙', text: 'text-sueno',        bg: 'bg-sueno/15',        border: 'border-sueno/50',        bar: 'bg-sueno' },
  alimentacion: { icon: '🥗', text: 'text-alimentacion', bg: 'bg-alimentacion/15', border: 'border-alimentacion/50', bar: 'bg-alimentacion' },
  foco:         { icon: '🎯', text: 'text-foco',         bg: 'bg-foco/15',         border: 'border-foco/50',         bar: 'bg-foco' },
  social:       { icon: '🤝', text: 'text-social',       bg: 'bg-social/15',       border: 'border-social/50',       bar: 'bg-social' },
}

const NEUTRAL = { icon: '⭐', text: 'text-muted', bg: 'bg-surface-2', border: 'border-line', bar: 'bg-primary' }

export function areaStyle(id: string | null | undefined) {
  return (id && AREA_STYLE[id as AreaId]) || NEUTRAL
}
export function areaName(id: string | null | undefined) {
  return AREAS.find((a) => a.id === id)?.name ?? 'General'
}
