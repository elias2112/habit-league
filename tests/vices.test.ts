// Tests de la migración 005 (vicios: multiplicador y tropiezos).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './harness'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
let h: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => { h = await createDb() })
beforeEach(async () => {
  await h.db.exec(`truncate auth.users cascade;`)
  await h.db.exec(`insert into auth.users (id, email) values ('${A}', 'a@x.com'), ('${B}', 'b@x.com');`)
})

const score = (u: string) => h.one<{ raw: number; multiplier: number; slips: number; final: number }>(u, `select today_score() r`)
async function fullDay(user: string) {
  const [x] = await h.as<{ id: string }>(user, `insert into habits (user_id, name, catalog_id) values ($1, 'x', 'caminar_30') returning id`, [user])
  await h.as(user, `select set_habit_done($1, true)`, [x.id])
  return x.id
}

describe('vicios declarados', () => {
  it('cada vicio declarado multiplica los puntos del día por 0,9', async () => {
    await fullDay(A)
    expect(await score(A)).toMatchObject({ raw: 100, multiplier: 1, final: 100 })
    await h.as(A, `select declare_vice('fumar')`)
    expect(Number((await score(A)).final)).toBe(90)
    await h.as(A, `select declare_vice(null, 'Morderme las uñas')`)
    const s = await score(A)
    expect(Number(s.multiplier)).toBeCloseTo(0.81, 5)
    expect(Number(s.final)).toBe(81)
  })

  it('no se declara dos veces el mismo; "lo dejé" corta desde mañana, no hoy', async () => {
    await fullDay(A)
    await h.as(A, `select declare_vice('fumar')`)
    await expect(h.as(A, `select declare_vice('fumar')`)).rejects.toThrow(/Ya tenés declarado/)
    const [{ id }] = await h.as<{ id: string }>(A, `select id from user_vices`)
    await h.as(A, `select end_vice($1)`, [id])
    expect(Number((await score(A)).final)).toBe(90) // hoy sigue contando
    const [{ m }] = await h.admin<{ m: string }>(`select vice_multiplier($1, user_today($1) + 1) m`, [A])
    expect(Number(m)).toBe(1)
  })

  it('declarar un vicio borra el tropiezo de hoy de ese vicio (no se paga dos veces)', async () => {
    await fullDay(A)
    await h.as(A, `select log_slip('fumar', true)`)
    expect(Number((await score(A)).final)).toBe(90)
    await h.as(A, `select declare_vice('fumar')`)
    expect(await score(A)).toMatchObject({ slips: 0 })
    expect(Number((await score(A)).final)).toBe(90)
  })
})

describe('tropiezos', () => {
  it('"Hoy tomé" resta 15 de ese día, una sola vez; se puede deshacer', async () => {
    await fullDay(A)
    await h.as(A, `select log_slip('alcohol', true)`)
    await h.as(A, `select log_slip('alcohol', true)`)
    expect(await score(A)).toMatchObject({ slips: 15 })
    expect(Number((await score(A)).final)).toBe(85)
    await h.as(A, `select log_slip('alcohol', false)`)
    expect(Number((await score(A)).final)).toBe(100)
  })

  it('nunca baja de 0 y no se tropieza con un vicio ya declarado', async () => {
    await h.as(A, `select log_slip('alcohol', true)`)
    await h.as(A, `select log_slip('apuestas', true)`)
    expect(Number((await score(A)).final)).toBe(0)
    await h.as(A, `select declare_vice('fumar')`)
    await expect(h.as(A, `select log_slip('fumar', true)`)).rejects.toThrow(/ya pagás/)
  })

  it('vicios y tropiezos son privados; el cliente no los escribe directo', async () => {
    await h.as(A, `select declare_vice('fumar')`)
    await h.as(A, `select log_slip('alcohol', true)`)
    expect(await h.as(B, `select * from user_vices`)).toHaveLength(0)
    expect(await h.as(B, `select * from vice_slips`)).toHaveLength(0)
    await expect(h.as(A, `insert into vice_slips (user_id, vice_id, day, penalty) values ($1, 'alcohol', current_date, -100)`, [A])).rejects.toThrow(/permission denied/)
    await expect(h.as(A, `delete from user_vices`)).rejects.toThrow(/permission denied/)
  })
})

describe('impacto en ranking y liga', () => {
  it('el ranking del reto usa los puntos ajustados y muestra el multiplicador', async () => {
    const [g] = await h.as<{ id: string; invite_code: string }>(A, `select * from create_group('Amigos', 66)`)
    await h.as(B, `select join_group($1)`, [g.invite_code])
    await fullDay(A)
    await fullDay(B)
    await h.as(A, `select declare_vice('fumar')`)
    await h.as(B, `select log_slip('alcohol', true)`)
    const rows = await h.as<{ user_id: string; total_points: string; multiplier: string }>(B, `select * from group_leaderboard($1)`, [g.id])
    const a = rows.find((r) => r.user_id === A)!
    const b = rows.find((r) => r.user_id === B)!
    expect([Number(a.total_points), Number(a.multiplier)]).toEqual([90, 0.9])
    expect([Number(b.total_points), Number(b.multiplier)]).toEqual([85, 1])
  })

  it('los PL de hábitos de la liga usan los puntos ajustados', async () => {
    const x = await fullDay(A)
    await h.admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - 1)`, [x, A])
    await h.admin(`insert into user_vices (user_id, vice_id, name, started_on) values ($1, 'fumar', 'Fumar', user_today($1) - 5),
                                                                                  ($1, null, 'Otro', user_today($1) - 5)`, [A])
    // 100 × 0,81 = 81 → (81 − 50) / 2,5 = 12,4 → 12
    const [{ pl }] = await h.admin<{ pl: number }>(`select habits_pl($1, user_today($1) - 1) pl`, [A])
    expect(pl).toBe(12)
  })
})
