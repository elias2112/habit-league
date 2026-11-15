// Textos de la fuerza base (content/onboarding.json → strength) con los números de content/config.json.
// Ningún número del juego está escrito acá: se reemplazan las {marcas}.
import content from '../../content/onboarding.json'
import { CONFIG, STRENGTH } from '../game/config'
import { compoundDay } from '../game/compound'

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
export const fmt = (n: number) => nf.format(n)

const chain = (k: 'coins' | 'exp') =>
  Array.from({ length: CONFIG.compound.capDay }, (_, i) => fmt(compoundDay(i + 1)[k])).join(', ')

export const STRENGTH_VARS: Record<string, string> = {
  coinsChain: chain('coins'),
  expChain: chain('exp'),
  capDay: String(CONFIG.compound.capDay),
  rewardBase: fmt(CONFIG.strengthRewardBase),
  rewardDivisor: String(CONFIG.strengthRewardDivisor),
  forgivePct: String(Math.round(CONFIG.forgiveRatio * 100)),
  extraReps: String(CONFIG.extraReps),
  step: String(CONFIG.strengthTargetStep),
  easyTarget: String(CONFIG.strengthEasyTarget),
  poco: String(CONFIG.areaPriceMultiplier.poco),
  mucho: String(CONFIG.areaPriceMultiplier.mucho),
}

/** Reemplaza {marca} por su valor (STRENGTH_VARS más los extra). */
export const fill = (text: string, extra: Record<string, string | number> = {}) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(extra[k] ?? STRENGTH_VARS[k] ?? `{${k}}`))

export const ST = content.strength
export const STRENGTH_RULES = ST.rules.map((r) => fill(r))

export const exerciseName = (id: string) => STRENGTH.find((e) => e.id === id)?.name ?? id
export const exerciseUnit = (id: string) => STRENGTH.find((e) => e.id === id)?.unit ?? ''
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const easyName = (id: string) => cap(CONFIG.strengthEasyVariants[id] ?? id)

/** Los 5 chistes rotan: cada vez que alguien rechaza, el siguiente (se recuerda en este dispositivo). */
export function nextJoke(): string {
  const jokes = ST.jokes
  let i = 0
  try { i = Number(localStorage.getItem('hl:joke') ?? '0') || 0; localStorage.setItem('hl:joke', String((i + 1) % jokes.length)) } catch { /* sin almacenamiento */ }
  return jokes[i % jokes.length]
}
