import { describe, expect, it } from 'vitest'
import vectors from '../content/test_vectors.json'
import { ARCHETYPES, CATALOG, QUESTIONS, computeProfile, pointsFor, type Answers } from '../src/lib/quiz'
import { detectKind, planGoal } from '../src/lib/goals'

describe('quiz: vectores de content/test_vectors.json', () => {
  for (const v of vectors) {
    it(v.name, () => {
      expect(computeProfile(v.answers as Answers)).toEqual(v.expected)
    })
  }
})

describe('quiz: consistencia del contenido', () => {
  it('20 preguntas de perfil (las 4 directas pasaron a la pantalla de áreas) y 8 arquetipos que cubren todas las combinaciones', () => {
    expect(QUESTIONS).toHaveLength(20)
    expect(QUESTIONS.filter((q) => q.section === 'directas')).toHaveLength(0)
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

describe('eje estructura: q10 y q12 (v4.2)', () => {
  // El diff de los vectores da vacío porque las letras y los valores no cambiaron; esto cubre el valor de cada opción.
  it('q10 y q12 son del eje estructura y valen a=0, b=1, c=2, d=3', () => {
    for (const id of ['q10', 'q12']) {
      const q = QUESTIONS.find((x) => x.id === id)!
      expect(q.section).toBe('estructura')
      expect(q.options.map((o) => [o.id, o.value])).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 3]])
    }
    expect(QUESTIONS.find((x) => x.id === 'q10')!.options[3].text).toBe('Siempre')
  })

  it('d en q10 suma 3 al eje estructura (E): pasar de a a d cambia la clasificación de e a E', () => {
    const base = { ...(vectors[0].answers as Answers) }                        // todo en el valor más bajo: código emr
    const r0 = computeProfile(base)
    const r1 = computeProfile({ ...base, q10: 'd' })
    expect(r1.axes.E - r0.axes.E).toBe(3)
    expect(r1.axes.M).toBe(r0.axes.M)
    const all = computeProfile({ ...base, q9: 'd', q10: 'd', q11: 'd', q12: 'd' })
    expect(all.code[0]).toBe('E')
    expect(r0.code[0]).toBe('e')
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
