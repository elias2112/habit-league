// Configuración única del juego (content/config.json). Mismo formato plano que reference/config.mjs.
import raw from '../../content/config.json'

export type Severity = 'leve' | 'normal' | 'grave'

export const CONFIG = {
  severity: raw.scoring.severity as Record<Severity, number>,
  multiplierFloor: raw.scoring.multiplierFloor,
  maxCompletion: raw.scoring.maxCompletion,
  ...raw.coins,
  ...raw.time,
  ...raw.rules,
}

export interface Pillar { id: string; name: string; icon: string; color: string; provisional?: boolean }
export const PILLARS = raw.pillars as Pillar[]
export const pillarById = (id: string | null | undefined) => PILLARS.find((p) => p.id === id)
