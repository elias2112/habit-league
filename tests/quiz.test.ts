import { describe, expect, it } from 'vitest'
import vectors from '../content/test_vectors.json'
import vicesJson from '../content/vices.json'
import { ARCHETYPES, CATALOG, QUESTIONS, computeProfile, directSuggestions, directVices, pointsFor, type Answers } from '../src/lib/quiz'
import { detectKind, planGoal } from '../src/lib/goals'

describe('quiz: vectores de content/test_vectors.json', () => {
  for (const v of vectors) {
    it(v.name, () => {
      expect(computeProfile(v.answers as Answers)).toEqual(v.expected)
    })
  }
})

describe('quiz: consistencia del contenido', () => {
  it('24 preguntas (20 de perfil + 4 directas) y 8 arquetipos que cubren todas las combinaciones', () => {
    expect(QUESTIONS).toHaveLength(24)
    expect(QUESTIONS.filter((q) => q.section === 'directas')).toHaveLength(4)
    const codes = ARCHETYPES.map((a) => a.code).sort()
    expect(codes).toEqual(['EMR', 'EMr', 'EmR', 'Emr', 'eMR', 'eMr', 'emR', 'emr'].sort())
  })

  it('todo hábito del catálogo tiene área y tier válidos', () => {
    for (const h of CATALOG) {
      expect(['cuerpo', 'mente', 'sueno', 'alimentacion', 'foco', 'social']).toContain(h.area)
      expect([1, 2, 3]).toContain(h.tier)
    }
  })

  it('cualquier combinación devuelve entre 1 y start_habits hábitos sin repetir', () => {
    const answers: Answers = { q1: ['f'], q2: 'f' }
    for (const q of QUESTIONS.slice(2)) answers[q.id] = 'b'
    const r = computeProfile(answers)
    expect(new Set(r.habits).size).toBe(r.habits.length)
    expect(r.areas).toEqual(['social'])
    expect(r.habits.length).toBeLessThanOrEqual(ARCHETYPES.find((a) => a.id === r.archetype)!.start_habits)
  })
})

describe('pointsFor', () => {
  it('reparte 100 según tier', () => {
    expect(pointsFor(1, [1, 2, 3])).toBe(16.67)
    expect(pointsFor(3, [1, 2, 3])).toBe(50)
    expect(pointsFor(1, [])).toBe(0)
  })
})

describe('preguntas directas', () => {
  it('no cambian arquetipo ni paquete; solo agregan sugerencias', () => {
    const base = { ...(vectors[0].answers as Answers) }
    const withDirect: Answers = { ...base, q21: 'c', q22: 'd', q23: 'd', q24: 'a' }
    expect(computeProfile(withDirect)).toEqual(computeProfile(base))
    expect(directSuggestions(withDirect)).toEqual(['max_2_tragos', 'redes_2h', 'celular_manana'])
    expect(directVices(withDirect)).toEqual(['fumar'])
    expect(directSuggestions({ ...base, q21: 'd' })).toEqual(['fumar_menos'])
    expect(directVices({ ...base, q21: 'd' })).toEqual([])
    expect(directSuggestions(base)).toEqual([])
  })

  it('los vicios sugeridos existen en content/vices.json', () => {
    const ids = vicesJson.vices.map((v) => v.id)
    for (const q of QUESTIONS) for (const o of q.options) if (o.vice) expect(ids).toContain(o.vice)
  })

  it('los hábitos sugeridos existen y los de vicios no entran solos al paquete', () => {
    for (const q of QUESTIONS.filter((x) => x.section === 'directas'))
      for (const o of q.options) for (const id of o.suggest ?? []) expect(CATALOG.find((h) => h.id === id)?.auto).toBe(false)
  })
})

describe('objetivos', () => {
  it('detecta el tipo por palabras clave', () => {
    expect(detectKind('Comprar un celular')).toBe('ahorro')
    expect(detectKind('Leer un libro por semana')).toBe('lectura')
    expect(detectKind('Escribir un libro')).toBe('escritura')
    expect(detectKind('Aprender guitarra')).toBe('general')
    expect(detectKind('Viaje a Japón')).toBe('ahorro')
  })

  it('arma el hábito diario según meta y fecha', () => {
    const a = planGoal('ahorro', 'Comprar un celular', 600, '2026-11-04', '2026-12-03') // 30 días
    expect(a).toMatchObject({ target: 600, days: 30, daily: 20 })
    expect(a.habit).toMatchObject({ name: 'Ahorrar 20 €', tier: 2, target: 1, goal_step: 20, area: 'foco' })

    const l = planGoal('lectura', 'Leer 4 libros', 4, '2026-11-04', '2026-12-01', 250) // 1000 págs / 28 días
    expect(l).toMatchObject({ target: 1000, days: 28, daily: 36 })
    expect(l.habit).toMatchObject({ name: 'Leer 36 páginas', tier: 3, target: 36, unit: 'páginas', goal_step: 1 })

    const e = planGoal('escritura', 'Escribir un libro', 50000, '2026-11-04', '2027-11-03')
    expect(e.habit).toMatchObject({ target: 137, tier: 1, unit: 'palabras' })

    const g = planGoal('general', 'Aprender guitarra', 20, '2026-11-04')
    expect(g).toMatchObject({ target: 20, days: 20, daily: 1 })
    expect(g.habit.name).toBe('Avanzar en «Aprender guitarra» 30 minutos')
  })
})
