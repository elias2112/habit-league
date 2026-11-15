// Juicio de la mañana (content/judgment.json): preguntas sobre ayer. Desde la 007 está desacoplado de la liga:
// se guarda y se muestra, sin premio (decisión del dueño, 2026-11-15).
export interface JudgmentQuestion {
  id: string
  kind: 'core' | 'bonus'
  text: string
  hint: string | null
  type: 'yesno' | 'count' | 'money'
  unit: string | null
  category: string
}
export interface JudgmentToday {
  day: string
  available: boolean
  submitted: boolean
  total: number | null
  points: number
  multiplier: number
  questions: JudgmentQuestion[]
  chests: { id: string; title: string }[]
}

export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
