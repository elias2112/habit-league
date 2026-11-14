// Cuestionario v4: de las respuestas de cada objetivo a hábitos medibles (cuentas a mano en los comentarios).
import { describe, expect, it } from 'vitest'
import { OBJECTIVES, buildObjective, objectiveDef, suggestGeneral } from '../src/lib/onboardingPlan'
import { catalogById } from '../src/lib/quiz'
import { PILLARS } from '../src/game/config'

const today = '2026-11-14'

describe('objetivos del cuestionario', () => {
  it('ahorrar: 600 € con 0 ahorrado en 30 días → "Ahorrar 20 €" y un cofre de 600', () => {
    const r = buildObjective(objectiveDef('ahorrar'), { title: 'Celular', target: 600, start: 0, deadline: '2026-12-13' }, 0, today)
    expect(r.habits[0]).toMatchObject({ name: 'Ahorrar 20 €', block: 'objetivo', objective_index: 0, goal_step: 20, pillar: 'dinero' })
    expect(r.objective).toMatchObject({ title: 'Celular', tag: 'ahorrar', chest: { target: 600 } })
  })

  it('ahorrar con punto de partida: faltan 600 − 300 = 300 en 30 días → 10 € por día', () => {
    const r = buildObjective(objectiveDef('ahorrar'), { title: 'Viaje', target: 600, start: 300, deadline: '2026-12-13' }, 1, today)
    expect(r.habits[0]).toMatchObject({ name: 'Ahorrar 10 €', objective_index: 1 })
    expect(r.objective).toMatchObject({ start_value: 300, chest: { target: 300 } })
  })

  it('leer: 4 libros × 250 páginas en 28 días → 1000 / 28 = 35,7 → meta 36 páginas por día', () => {
    const r = buildObjective(objectiveDef('leer'), { amount: 4, perItem: 250, start: 5, deadline: '2026-12-11' }, 0, today)
    expect(r.habits[0]).toMatchObject({ name: 'Leer 36 páginas', target: 36, unit: 'páginas', pillar: 'mente' })
    expect(r.objective).toMatchObject({ target_value: 1000, start_value: 5 })
  })

  it('dejar de fumar: hábitos del catálogo + vicio a seguir, con la etiqueta que bloquea el cigarro en la tienda', () => {
    const r = buildObjective(objectiveDef('dejar-fumar'), { start: 10 }, 2, today)
    expect(r.habits.map((h) => h.catalog_id)).toEqual(['fumar_menos', 'dia_sin_fumar'])
    expect(r.habits.every((h) => h.private && h.objective_index === 2)).toBe(true)
    expect(r.vice).toMatchObject({ suggestion_id: 'fumar' })
    expect(r.objective).toMatchObject({ tag: 'dejar-fumar', start_value: 10, target_value: 0 })
  })

  it('otro objetivo con unidad y cantidad diaria: hábito medible en el pilar elegido', () => {
    const r = buildObjective(objectiveDef('otro'), { title: 'Aprender guitarra', pillar: 'habilidades', unit: 'minutos', daily: 20 }, 0, today)
    expect(r.habits[0]).toMatchObject({ name: 'Avanzar en «Aprender guitarra» 30 minutos', pillar: 'habilidades', target: 20, unit: 'minutos' })
  })

  it('contenido coherente: cada objetivo tiene pilar válido (o lo elige la persona) y sus hábitos existen en el catálogo', () => {
    const ids = PILLARS.map((p) => p.id)
    for (const o of OBJECTIVES) {
      if (o.pillar) expect(ids).toContain(o.pillar)
      for (const h of o.habits ?? []) expect(catalogById(h)).toBeTruthy()
    }
  })

  it('generales por defecto: Hacer la cama y Meditar (sin repetir lo que ya está)', () => {
    expect(suggestGeneral().map((x) => x.name)).toEqual(['Hacer la cama', 'Respirar o meditar 5 minutos'])
    expect(suggestGeneral(new Set(['hacer_cama'])).map((x) => x.catalog_id)).toEqual(['respirar_5'])
  })
})
