// Spec v4.2 contra la base (migraciones 007a y 007): mismos resultados que src/game/*.ts (que porta reference/).
// Paso 1: experiencia, nivel, rango y billetera derivados; cofres en monedas; Juicio sin liga; respaldo y reinicio.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, MIGRATIONS, readMigration } from './harness'
import { levelFor, totalXp } from '../src/game/levels'
import { rankFor, rankPoints, rankRewardsHeld } from '../src/game/ranks'
import { walletBalance } from '../src/game/wallet'
import { CONFIG } from '../src/game/config'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
let h: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => { h = await createDb() })
beforeEach(async () => {
  await h.db.exec(`truncate auth.users cascade; delete from group_config; update game_config set value = '0'::jsonb where key = 'dayCutoffHour';`)
  await h.db.exec(`insert into auth.users (id, email) values ('${A}', 'ana@x.com'), ('${B}', 'beto@x.com');`)
})

const n = (x: unknown) => Number(x)
type State = { level: Record<string, number>; rank: { points: number; name: string; held: number }; wallet: Record<string, number> }
const state = async (u: string) => (await h.admin<{ s: State }>(`select game_state($1) s`, [u]))[0].s

/** Plan directo (como admin) que rige desde hace `since` días, con hábitos sí/no de peso 1. */
async function plan(u: string, habits: number, since: number) {
  const [p] = await h.admin<{ id: string }>(`insert into plans (user_id, effective_from) values ($1, user_today($1) - $2::int) returning id`, [u, since])
  const ids: string[] = []
  for (let i = 0; i < habits; i++) {
    const [hb] = await h.admin<{ id: string }>(`insert into habits (user_id, name, pillar) values ($1, 'h' || $2, 'mente') returning id`, [u, i])
    await h.admin(`insert into plan_habits (plan_id, habit_id, weight) values ($1, $2, 1)`, [p.id, hb.id])
    ids.push(hb.id)
  }
  return ids
}
const log = (habit: string, u: string, offset: number, count = 1) =>
  h.admin(`insert into habit_logs (habit_id, log_date, count) values ($1, user_today($2) - $3::int, $4)`, [habit, u, offset, count])

describe('SQL = TypeScript (niveles y rangos)', () => {
  let seed = 11
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296

  it('puntos de continuidad: 200 secuencias al azar dan lo mismo en rank_points_pure y rankPoints', async () => {
    for (let i = 0; i < 200; i++) {
      const totals = Array.from({ length: Math.floor(rnd() * 40) }, () => Math.round(rnd() * 15000) / 100)
      const [{ p }] = await h.admin<{ p: number }>(`select rank_points_pure($1::numeric[], $2::jsonb, $3) p`,
        [totals, JSON.stringify(CONFIG.rankPoints), CONFIG.coinThresholdLow])
      expect(p, JSON.stringify(totals)).toBe(rankPoints(totals))
    }
  })

  it('rango y premios para 0..70 puntos: rank_pure = rankFor + rankRewardsHeld', async () => {
    for (let p = 0; p <= 70; p++) {
      const [{ r }] = await h.admin<{ r: Record<string, unknown> }>(`select rank_pure($1, $2::jsonb) r`, [p, JSON.stringify(CONFIG.ranks)])
      const ts = rankFor(p)
      expect(r.name).toBe(ts.name)
      expect(n(r.missing)).toBe(ts.missing)
      expect((r.next as { name: string } | null)?.name ?? null).toBe(ts.next?.name ?? null)
      expect(n(r.held)).toBe(rankRewardsHeld(p))
    }
  })

  it('nivel: 200 experiencias al azar dan lo mismo en level_pure y levelFor', async () => {
    for (let i = 0; i < 200; i++) {
      const xp = Math.round(rnd() * 500000) / 100
      const [{ l }] = await h.admin<{ l: Record<string, number> }>(`select level_pure($1, $2) l`, [xp, CONFIG.xpPerLevel])
      const ts = levelFor(xp)
      expect({ level: n(l.level), xpIntoLevel: n(l.xpIntoLevel), xpForNext: n(l.xpForNext), progress: n(l.progress) }, String(xp)).toEqual(ts)
    }
  })
})

describe('estado derivado: experiencia, nivel, rango y billetera', () => {
  it('sin plan: nivel 0, Aspirante, billetera 0', async () => {
    const s = await state(A)
    expect(n(s.level.level)).toBe(0)
    expect(n(s.level.xp)).toBe(0)
    expect(s.rank.name).toBe('Aspirante')
    expect(n(s.wallet.balance)).toBe(0)
  })

  it('experiencia = suma de los totales (hoy incluido); rango = días cerrados; billetera = sus partes', async () => {
    const ids = await plan(A, 2, 12)
    // días 12..1: 100 puntos (los dos hábitos); hoy: 50 (uno de dos)
    for (let o = 12; o >= 1; o--) for (const id of ids) await log(id, A, o)
    await log(ids[0], A, 0)
    const s = await state(A)
    const closed = Array(12).fill(100)
    expect(n(s.level.xp)).toBe(totalXp([...closed, 50]))
    expect(n(s.level.level)).toBe(levelFor(totalXp([...closed, 50])).level)
    expect(s.rank.points).toBe(rankPoints(closed))                   // 12
    expect(s.rank.name).toBe('Constante')
    expect(n(s.wallet.rank_rewards)).toBe(rankRewardsHeld(12))      // 10
    const daily = (await h.admin<{ c: string }>(`select sum(credit) c from coin_days($1) where closed`, [A]))[0].c
    expect(n(s.wallet.daily)).toBe(n(daily))
    expect(n(s.wallet.balance)).toBe(walletBalance({ daily: n(daily), pool: n(s.wallet.pool), rankRewards: 10 }))
  })

  it('perder el rango quita su premio: la billetera puede quedar negativa y bloquea compras', async () => {
    const [g] = await h.as<{ id: string }>(A, `select * from create_group('Amigos', 66)`)
    const ids = await plan(A, 1, 11)
    for (let o = 11; o >= 1; o--) await log(ids[0], A, o)            // 11 días activos → Constante (+10)
    let s = await state(A)
    expect(s.rank.name).toBe('Constante')
    const bal = n(s.wallet.balance)
    const [item] = await h.admin<{ id: string }>(`select id from store_items where group_id = $1 and price is not null and kind = 'reward' limit 1`, [g.id])
    await h.admin(`insert into purchases (user_id, item_id, day, price_paid) values ($1, $2, user_today($1), $3)`, [A, item.id, bal])
    expect(n((await state(A)).wallet.balance)).toBe(0)
    // ayer queda sin actividad: 10 − 2 = 8 puntos → vuelve a Aspirante, se quita el premio y las monedas de ayer
    await h.admin(`delete from habit_logs where habit_id = $1 and log_date = user_today($2) - 1`, [ids[0], A])
    const after = await state(A)
    expect(after.rank.points).toBe(rankPoints([...Array(10).fill(100), 0]))
    expect(after.rank.name).toBe('Aspirante')
    s = after
    expect(n(s.wallet.rank_rewards)).toBe(0)
    expect(n(s.wallet.balance)).toBe(walletBalance({ daily: n(after.wallet.daily), pool: n(after.wallet.pool), spent: bal }))
    expect(n(s.wallet.balance)).toBeLessThan(-10)                   // −10 del rango y lo que daba ayer
    expect(await h.one<{ ok: boolean; reason: string }>(A, `select buy_item($1) r`, [item.id])).toEqual({ ok: false, reason: 'monedas-insuficientes' })
  })

  it('my_day y el ranking usan el mismo estado (nivel y billetera)', async () => {
    await h.as(A, `select * from create_group('Amigos', 66)`)
    const ids = await plan(A, 1, 3)
    for (let o = 3; o >= 1; o--) await log(ids[0], A, o)
    const d = await h.one<{ wallet: { balance: number }; level: { xp: number } }>(A, `select my_day() r`)
    const s = await state(A)
    expect(n(d.wallet.balance)).toBe(n(s.wallet.balance))
    expect(n(d.level.xp)).toBe(300)
  })
})

describe('cofres de ahorro en monedas (antes puntos de liga)', () => {
  async function ahorro(u: string, target = 100) {
    const [g] = await h.as<{ id: string }>(u, `insert into goals (title, kind, target, unit) values ('Celular', 'ahorro', $1, '€') returning id`, [target])
    const [hb] = await h.admin<{ id: string }>(
      `insert into habits (user_id, name, pillar, goal_id, goal_step) values ($1, 'Ahorrar 10 €', 'dinero', $2, 10) returning id`, [u, g.id])
    return { goal: g.id, habit: hb.id }
  }
  const lastSunday = async (u: string) =>
    (await h.admin<{ o: number }>(`select (user_today($1) - (week_start(user_today($1)) - 1))::int o`, [u]))[0].o

  it('hitos: al 55 % se cobran los de 25 y 50 % (1 + 2 monedas, provisional)', async () => {
    await plan(A, 1, 0)
    const { goal } = await ahorro(A, 100)
    await h.as(A, `insert into goal_entries (goal_id, amount) values ($1, 55)`, [goal])
    const s = await state(A)
    expect(n(s.wallet.chests)).toBe(CONFIG.chestMilestones['25'] + CONFIG.chestMilestones['50'])
    expect(n(s.wallet.balance)).toBe(3)
  })

  it('«Cofre a salvo»: semana cerrada con ahorro y sin gasto mayor → 1 moneda; si el gasto del Juicio lo supera, nada', async () => {
    const o = await lastSunday(A)
    await plan(A, 1, o + 6)
    const a = await ahorro(A, 1000)
    await log(a.habit, A, o)                                          // ahorró 10 el domingo pasado
    expect(n((await state(A)).wallet.chests)).toBe(CONFIG.chestWeeklySafeBonus)

    await plan(B, 1, o + 6)
    const b = await ahorro(B, 1000)
    await log(b.habit, B, o)
    await h.admin(`insert into daily_judgments (user_id, day, answers, scores, total) values ($1, user_today($1) - $2::int, '{"gasto": 50}', '{}', 0)`, [B, o])
    expect(n((await state(B)).wallet.chests)).toBe(0)
  })
})

describe('Juicio de la mañana sin liga', () => {
  it('sin plan ayer no hay Juicio; con plan se guarda el total, sin dar premio', async () => {
    await plan(A, 1, 0)
    expect((await h.one<{ available: boolean }>(A, `select judgment_today() r`)).available).toBe(false)
    await expect(h.as(A, `select submit_judgment('{}'::jsonb)`)).rejects.toThrow(/ayer todavía no tenías plan/)

    await plan(B, 1, 1)
    const before = await state(B)
    const r = await h.one<{ judgment_total: number }>(B, `select submit_judgment('{"comida": false, "disfrute": true}'::jsonb) r`)
    expect(r.judgment_total).toBeGreaterThan(0)
    expect(await h.admin(`select total from daily_judgments where user_id = $1`, [B])).toEqual([{ total: r.judgment_total }])
    expect((await state(B)).wallet).toEqual(before.wallet)
  })
})

describe('respaldo 007a y reinicio de la 007', () => {
  const M7A = MIGRATIONS.indexOf('../supabase/migrations/007a_respaldo.sql')
  const M7 = MIGRATIONS.indexOf('../supabase/migrations/007_v42.sql')

  it('la 007 no corre sin respaldo, ni con un respaldo desactualizado; reinicia una sola vez', async () => {
    const db = await createDb()
    const run = (i: number) => db.db.exec(readMigration(MIGRATIONS[i]))
    // Base "vieja": se simula que la 007 nunca corrió.
    await db.db.exec(`drop schema respaldo_v4 cascade;`)
    await expect(run(M7)).rejects.toThrow(/primero ejecutá 007a_respaldo/)

    await db.db.exec(`insert into auth.users (id, email) values ('${A}', 'ana@x.com');`)
    await db.admin(`insert into habits (user_id, name, pillar) values ($1, 'viejo', 'mente')`, [A])
    await run(M7A)
    await db.admin(`insert into habits (user_id, name, pillar) values ($1, 'después del respaldo', 'mente')`, [A])
    await expect(run(M7)).rejects.toThrow(/respaldo de habits no coincide/)

    await run(M7A)                                                    // respaldo al día
    await run(M7)
    expect(await db.admin(`select count(*)::int c from habits`)).toEqual([{ c: 0 }])
    expect(await db.admin(`select count(*)::int c from respaldo_v4.habits`)).toEqual([{ c: 2 }])
    expect(await db.admin(`select count(*)::int c from profiles`)).toEqual([{ c: 1 }])

    // Datos nuevos: re-ejecutar 007a y 007 no los borra ni pisa el respaldo.
    await db.admin(`insert into habits (user_id, name, pillar) values ($1, 'nuevo', 'mente')`, [A])
    await run(M7A)
    await run(M7)
    expect(await db.admin(`select name from habits`)).toEqual([{ name: 'nuevo' }])
    expect(await db.admin(`select count(*)::int c from respaldo_v4.habits`)).toEqual([{ c: 2 }])
  })

  it('el reinicio conserva cuentas, grupos, cofres de grupo y el Juicio', async () => {
    const db = await createDb()
    const run = (i: number) => db.db.exec(readMigration(MIGRATIONS[i]))
    await db.db.exec(`drop schema respaldo_v4 cascade;`)
    await db.db.exec(`insert into auth.users (id, email) values ('${A}', 'ana@x.com');`)
    const [g] = await db.as<{ id: string }>(A, `select * from create_group('Amigos', 66)`)
    await db.admin(`insert into daily_judgments (user_id, day, answers, scores, total) values ($1, current_date - 1, '{}', '{}', 3)`, [A])
    await db.admin(`insert into group_chests (group_id, title, target, created_by) values ($1, 'Viaje', 100, $2)`, [g.id, A])
    await db.admin(`insert into goals (user_id, title, kind, target, unit) values ($1, 'Mío', 'ahorro', 10, '€')`, [A])
    await db.admin(`update profiles set archetype = 'fenix' where id = $1`, [A])
    await run(M7A)
    await run(M7)
    for (const [t, c] of [['groups', 1], ['group_members', 1], ['daily_judgments', 1], ['group_chests', 1], ['goals', 0]] as const)
      expect(await db.admin(`select count(*)::int c from ${t}`), t).toEqual([{ c }])
    expect(await db.admin(`select archetype from profiles`)).toEqual([{ archetype: null }])
  })
})
