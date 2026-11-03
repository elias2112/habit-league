import { describe, expect, it } from 'vitest'
import vectors from '../content/test_vectors.json'
import { ARCHETYPES, CATALOG, QUESTIONS, computeProfile, pointsFor, type Answers } from '../src/lib/quiz'

describe('quiz: vectores de content/test_vectors.json', () => {
  for (const v of vectors) {
    it(v.name, () => {
      expect(computeProfile(v.answers as Answers)).toEqual(v.expected)
    })
  }
})

describe('quiz: consistencia del contenido', () => {
  it('20 preguntas y 8 arquetipos con códigos únicos que cubren todas las combinaciones', () => {
    expect(QUESTIONS).toHaveLength(20)
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
