// Spec v3 contra la base (migración 006): mismos resultados que src/game/*.ts (que porta reference/),
// plan por día, vicios en tres estados, votación, monedas, tienda, legado y migración de datos.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, MIGRATIONS, readMigration } from './harness'
import { dayPoints } from '../src/game/scoring'
import { dayCoins } from '../src/game/coins'
import { decide } from '../src/game/approval'
import config from '../content/config.json'

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'
let h: Awaited<ReturnType<typeof createDb>>

beforeAll(async () => { h = await createDb() })
beforeEach(async () => {
  await h.db.exec(`truncate auth.users cascade; delete from group_config; update game_config set value = '0'::jsonb where key = 'dayCutoffHour';`)
  await h.db.exec(`insert into auth.users (id, email) values ('${A}', 'ana@x.com'), ('${B}', 'beto@x.com'), ('${C}', 'carla@x.com');`)
})

const today = async (u: string) => (await h.admin<{ d: string }>(`select user_today($1)::text d`, [u]))[0].d
const score = async (u: string, offset = 0) =>
  (await h.admin<{ s: { base: number; bonus: number; multiplier: number; total: number; overflow: number } }>(
    `select day_score($1, user_today($1) - $2::int) s`, [u, offset]))[0].s
const num = (x: unknown) => Number(x)

/** Plan directo (como admin) que rige desde hace `since` días. Devuelve los ids de hábitos. */
async function plan(u: string, habits: { catalog?: string; name?: string; weight: number; target?: number }[], since = 0) {
  const [p] = await h.admin<{ id: string }>(`insert into plans (user_id, effective_from) values ($1, user_today($1) - $2::int) returning id`, [u, since])
  const ids: string[] = []
  for (const x of habits) {
    const [hb] = await h.admin<{ id: string }>(
      `insert into habits (user_id, name, catalog_id, pillar) values ($1, $2, $3, $4) returning id`,
      [u, x.name ?? 'x', x.catalog ?? null, x.catalog ? null : 'mente'])
    await h.admin(`insert into plan_habits (plan_id, habit_id, weight, target) values ($1, $2, $3, $4)`, [p.id, hb.id, x.weight, x.target ?? null])
    ids.push(hb.id)
  }
  return { planId: p.id, ids }
}
async function vice(u: string, planId: string, weight = 1, severity = 'normal') {
  const [v] = await h.admin<{ id: string }>(`insert into vices (user_id, name) values ($1, 'Fumar') returning id`, [u])
  await h.admin(`insert into plan_vices (plan_id, vice_id, weight, severity) values ($1, $2, $3, $4)`, [planId, v.id, weight, severity])
  return v.id
}
async function group(...members: string[]) {
  const [g] = await h.as<{ id: string; invite_code: string }>(members[0], `select * from create_group('Amigos', 66)`)
  for (const m of members.slice(1)) await h.as(m, `select join_group($1)`, [g.invite_code])
  return g.id
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SQL = TypeScript (mismos resultados que reference/)', () => {
  let seed = 7
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]

  it('puntaje: 300 casos al azar dan lo mismo en score_pure y dayPoints', async () => {
    for (let i = 0; i < 300; i++) {
      const habits = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({
        weight: 1 + Math.floor(rnd() * 3), completion: Math.round(rnd() * 200) / 100, measurable: rnd() > 0.5 }))
      const vices = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
        weight: 1 + Math.floor(rnd() * 3), severity: pick(['leve', 'normal', 'grave'] as const),
        state: pick(['none', 'clean', 'slipped'] as const), penalizing: rnd() > 0.3 }))
      const [{ s }] = await h.admin<{ s: Record<string, number> }>(`select score_pure($1::jsonb, $2::jsonb, $3::jsonb, $4, $5) s`,
        [JSON.stringify(habits), JSON.stringify(vices), JSON.stringify(config.scoring.severity), config.scoring.multiplierFloor, config.scoring.maxCompletion])
      const ts = dayPoints({ habits, vices })
      expect(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, num(v)])), JSON.stringify({ habits, vices })).toEqual(ts)
    }
  })

  it('monedas: 200 casos al azar dan lo mismo en coins_pure y dayCoins', async () => {
    for (let i = 0; i < 200; i++) {
      const p = { total: Math.round(rnd() * 10000) / 100, overflow: Math.round(rnd() * 5000) / 100, streakBefore: Math.floor(rnd() * 80), unpaidSlip: rnd() > 0.7 }
      const [{ c }] = await h.admin<{ c: Record<string, number> }>(`select coins_pure($1, $2, $3, $4, $5::jsonb) c`,
        [p.total, p.overflow, p.streakBefore, p.unpaidSlip, JSON.stringify(config.coins)])
      expect(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, num(v)]))).toEqual(dayCoins(p))
    }
  })

  it('votación: decide_pure coincide con decide() en todas las combinaciones hasta 6 votantes', async () => {
    for (let n = 0; n <= 6; n++) for (let yes = 0; yes <= n; yes++) for (let no = 0; no <= n - yes; no++) for (const el of [false, true]) {
      const members = ['p', ...Array.from({ length: n }, (_, i) => `v${i}`)]
      const votes: Record<string, 'yes' | 'no'> = {}
      members.slice(1, 1 + yes).forEach((m) => (votes[m] = 'yes'))
      members.slice(1 + yes, 1 + yes + no).forEach((m) => (votes[m] = 'no'))
      const [{ d }] = await h.admin<{ d: string }>(`select decide_pure($1, $2, $3, $4) d`, [n, yes, no, el])
      expect(d).toBe(decide({ proposer: 'p', members, votes, windowElapsed: el }))
    }
  })
})

describe('puntaje del día con datos reales', () => {
  it('se recalcula desde el estado actual: agregar un hábito después no deja puntos viejos (el orden ya no importa)', async () => {
    const { ids } = await plan(A, [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }, { name: 'c', weight: 2 }])
    await h.as(A, `select set_habit_done($1, true)`, [ids[0]])
    await h.as(A, `select set_habit_done($1, true)`, [ids[1]])
    expect(num((await score(A)).total)).toBe(50) // 100 × (1 + 1) / 4
  })

  it('REGRESIÓN DEL BUG: marcar recaída da ×0,9 y desmarcarla vuelve a ×1,0', async () => {
    const { planId, ids } = await plan(A, [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }])
    for (const id of ids) await h.as(A, `select set_habit_done($1, true)`, [id])
    const v = await vice(A, planId)
    expect(await score(A)).toMatchObject({ total: 100, multiplier: 1 })
    await h.as(A, `select set_vice_state($1, 'slipped')`, [v])
    expect(await score(A)).toMatchObject({ total: 90, multiplier: 0.9 })
    await h.as(A, `select set_vice_state($1, 'none')`, [v])
    expect(await score(A)).toMatchObject({ total: 100, multiplier: 1 })
    await h.as(A, `select set_vice_state($1, 'slipped')`, [v])
    await h.as(A, `select set_vice_state($1, 'slipped')`, [v]) // repetir no acumula
    expect(num((await score(A)).total)).toBe(90)
  })

  it('"no lo hice" rellena hasta 100 y no puede estar limpio y en recaída a la vez', async () => {
    const { planId, ids } = await plan(A, [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }])
    await h.as(A, `select set_habit_done($1, true)`, [ids[0]])
    const v = await vice(A, planId, 1)
    await h.as(A, `select set_vice_state($1, 'clean')`, [v])
    expect(num((await score(A)).total)).toBe(58.33) // 33,33 + 100 × 1 / (3 + 1) = 25
    await h.as(A, `select set_vice_state($1, 'slipped')`, [v])
    expect(await h.admin(`select state from vice_days where vice_id = $1`, [v])).toEqual([{ state: 'slipped' }])
  })

  it('meta medible: pasarse cuenta hasta 150 % y el excedente sobre 100 va aparte', async () => {
    const { ids } = await plan(A, [{ name: 'pal', weight: 1, target: 500 }, { name: 'b', weight: 1 }])
    await h.admin(`insert into habit_logs (habit_id, log_date, count) values ($1, user_today($2), 900)`, [ids[0], A])
    await h.as(A, `select set_habit_done($1, true)`, [ids[1]])
    expect(await score(A)).toMatchObject({ total: 100, overflow: 25 }) // (1,5 + 1) / 2 = 125
  })

  it('"días sin": solo cuentan los "no lo hice" explícitos y seguidos', async () => {
    const { planId } = await plan(A, [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }], 10)
    const v = await vice(A, planId)
    for (const o of [1, 2, 4]) await h.admin(`insert into vice_days (user_id, vice_id, day, state) values ($1, $2, user_today($1) - $3::int, 'clean')`, [A, v, o])
    const [{ n }] = await h.admin<{ n: number }>(`select clean_streak($1, user_today($2) - 1) n`, [v, A])
    expect(n).toBe(2) // el día −3 sin marcar corta
    const day = await h.one<{ vices: { clean_days: number }[] }>(A, `select my_day() r`)
    expect(day.vices[0].clean_days).toBe(2)
  })
})

describe('plan inicial y cambios que rigen desde mañana', () => {
  const habits = JSON.stringify([{ catalog_id: 'caminar_30', weight: 1 }, { catalog_id: 'agua_2l', weight: 2 }, { name: 'Guitarra', pillar: 'habilidades', weight: 3 }])

  it('el plan del quiz rige desde hoy, sin votación, una sola vez, con mínimo 3 hábitos', async () => {
    await expect(h.as(A, `select create_initial_plan('[{"catalog_id":"caminar_30"}]'::jsonb)`)).rejects.toThrow(/al menos 3/)
    await h.as(A, `select create_initial_plan($1::jsonb, '[{"name":"Fumar","weight":2,"severity":"grave"}]'::jsonb, '[{"title":"Leer más","tag":null}]'::jsonb)`, [habits])
    const d = await h.one<{ has_plan: boolean; habits: { weight: number; target: number | null }[]; vices: unknown[]; objectives: unknown[] }>(A, `select my_day() r`)
    expect(d.has_plan).toBe(true)
    expect(d.habits.map((x) => [x.weight, x.target])).toEqual([[1, null], [2, 8], [3, null]])
    expect(d.vices).toHaveLength(1)
    expect(d.objectives).toHaveLength(1)
    await expect(h.as(A, `select create_initial_plan($1::jsonb)`, [habits])).rejects.toThrow(/Ya tenés un plan/)
  })

  it('pilar inválido o hábito de Conexión: no se puede', async () => {
    await expect(h.as(A, `select create_initial_plan('[{"name":"x","pillar":"conexion"},{"catalog_id":"caminar_30"},{"catalog_id":"estirar_10"}]'::jsonb)`)).rejects.toThrow(/pilar/)
    await expect(h.as(A, `select create_initial_plan('[{"catalog_id":"llamada_10"},{"catalog_id":"caminar_30"},{"catalog_id":"estirar_10"}]'::jsonb)`)).rejects.toThrow(/ya no está/)
  })

  it('grupo de 3: el cambio queda pendiente; con 2 de 2 votos se aprueba y rige mañana, sin tocar hoy', async () => {
    const g = await group(A, B, C)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [habits])
    const [{ id }] = await h.as<{ id: string }>(A, `select propose_change('me', 'habit.add', '{"catalog_id":"leer_15","weight":3}'::jsonb) id`)
    const reqs = await h.as<{ status: string }>(B, `select * from group_requests($1)`, [g])
    expect(reqs[0].status).toBe('pending')
    expect(await h.as<{ s: string }>(B, `select vote_change($1, 'yes') s`, [id])).toEqual([{ s: 'pending' }]) // 1 de 2: no es mayoría
    expect(await h.as<{ s: string }>(C, `select vote_change($1, 'yes') s`, [id])).toEqual([{ s: 'approved' }])
    expect((await h.one<{ habits: unknown[] }>(A, `select my_day() r`)).habits).toHaveLength(3) // hoy no cambia
    const tomorrow = await h.admin<{ n: number }>(`select count(*)::int n from plan_habits where plan_id = plan_for($1, user_today($1) + 1)`, [A])
    expect(tomorrow[0].n).toBe(4)
  })

  it('ventana vencida sin votos: se aprueba sola; el proponente no vota; sacar por debajo del mínimo no se puede', async () => {
    const g = await group(A, B)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [habits])
    // Con 3 hábitos (el mínimo) no se puede proponer sacar uno.
    const [hb] = await h.as<{ id: string }>(A, `select habit_id id from plan_habits ph join plans p on p.id = ph.plan_id where p.user_id = auth.uid() and p.effective_from = user_today(auth.uid()) limit 1`)
    await expect(h.as(A, `select propose_change('me', 'habit.remove', jsonb_build_object('habit_id', $1::text))`, [hb.id])).rejects.toThrow(/al menos 3/)
    const [{ id }] = await h.as<{ id: string }>(A, `select propose_change('me', 'habit.add', '{"catalog_id":"leer_15","weight":1}'::jsonb) id`)
    await expect(h.as(A, `select vote_change($1, 'yes')`, [id])).rejects.toThrow(/propio/)
    await h.admin(`update change_requests set closes_at = now() - interval '1 minute' where id = $1`, [id])
    expect((await h.as<{ status: string }>(B, `select * from group_requests($1)`, [g]))[0].status).toBe('approved')
  })

  it('en grupo de 2 decide la otra persona: un "no" rechaza', async () => {
    await group(A, B)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [habits])
    const [{ id }] = await h.as<{ id: string }>(A, `select propose_change('me', 'habit.add', '{"catalog_id":"leer_15","weight":3}'::jsonb) id`)
    expect(await h.as<{ s: string }>(B, `select vote_change($1, 'no') s`, [id])).toEqual([{ s: 'rejected' }])
  })

  it('privado con alcance "solo yo": se aprueba sin votación y el grupo ve solo el peso', async () => {
    const g = await group(A, B)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [habits])
    await h.as(A, `select propose_change('me', 'habit.add', '{"catalog_id":"dia_sin_fumar","weight":3,"private":true}'::jsonb)`)
    const seen = await h.as<{ status: string; payload: Record<string, unknown>; private: boolean }>(B, `select * from group_requests($1)`, [g])
    expect(seen[0]).toMatchObject({ status: 'approved', private: true, payload: { weight: 3 } })
    expect(seen[0].payload).not.toHaveProperty('catalog_id')
  })

  it('"todo el grupo": se agrega al plan de cada miembro (peso inicial 2 para los demás), desde el día siguiente de cada uno', async () => {
    await group(A, B)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [habits])
    await h.as(B, `select create_initial_plan($1::jsonb)`, [habits])
    await h.admin(`update profiles set timezone = 'Pacific/Kiritimati' where id = $1`, [B])
    const [{ id }] = await h.as<{ id: string }>(A, `select propose_change('group', 'habit.add', '{"catalog_id":"leer_15","weight":3}'::jsonb) id`)
    await h.as(B, `select vote_change($1, 'yes')`, [id])
    const rows = await h.admin<{ user_id: string; eff: string; weight: number }>(
      `select p.user_id, p.effective_from::text eff, ph.weight from plans p join plan_habits ph on ph.plan_id = p.id join habits hb on hb.id = ph.habit_id
       where hb.catalog_id = 'leer_15' order by p.user_id`)
    expect(rows.map((r) => [r.user_id, r.weight])).toEqual([[A, 3], [B, 2]])
    expect(rows.find((r) => r.user_id === B)!.eff).toBe((await h.admin<{ d: string }>(`select (user_today($1) + 1)::text d`, [B]))[0].d)
  })

  it('un hábito propuesto ligado a un cofre suma al cofre de quien lo propuso', async () => {
    await group(A)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [habits])
    const [g] = await h.as<{ id: string }>(A, `insert into goals (title, kind, target, unit) values ('Celular', 'ahorro', 600, '€') returning id`)
    await h.as(A, `select propose_change('me', 'habit.add', jsonb_build_object('name', 'Ahorrar 20 €', 'pillar', 'dinero', 'weight', 2, 'goal_id', $1::text, 'goal_step', 20))`, [g.id])
    const [hb] = await h.admin<{ id: string; goal_step: string }>(`select id, goal_step from habits where goal_id = $1`, [g.id])
    expect(Number(hb.goal_step)).toBe(20)
    await h.admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2))`, [hb.id, A])
    expect(Number((await h.as<{ progress: string }>(A, `select progress from goal_list($1)`, [A]))[0].progress)).toBe(20)
  })

  it('un grupo por persona', async () => {
    await group(A)
    const [g2] = await h.as<{ invite_code: string }>(B, `select * from create_group('Otro', 30)`)
    await expect(h.as(A, `select join_group($1)`, [g2.invite_code])).rejects.toThrow(/otro grupo/)
    await expect(h.as(A, `select create_group('Tercero', 30)`)).rejects.toThrow(/Ya estás en un grupo/)
  })
})

describe('monedas, billetera y tienda', () => {
  /** Plan de 3 hábitos desde hace `days` días, todos hechos cada día hasta ayer (100 puntos). */
  async function perfectDays(u: string, days: number, extraTarget?: number) {
    const { planId, ids } = await plan(u, [{ name: 'a', weight: 1, target: extraTarget }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }], days)
    for (let o = 1; o <= days; o++) for (const id of ids)
      await h.admin(`insert into habit_logs (habit_id, log_date, count) values ($1, user_today($2) - $3::int, $4)`,
        [id, u, o, extraTarget && id === ids[0] ? extraTarget * 1.5 : 1])
    return { planId, ids }
  }
  const wallet = (u: string) => h.one<{ balance: number; pool_this_week: number; streak: number; today_multiplier: number }>(u, `select my_day() -> 'wallet' r`)

  it('8 días perfectos cerrados: 7 × 4 + 4 × 1,1 = 32,4 monedas; hoy (abierto) todavía no cobra', async () => {
    await perfectDays(A, 8)
    const w = await wallet(A)
    expect(num(w.balance)).toBe(32.4)
    expect(w.streak).toBe(8)
    expect(num(w.today_multiplier)).toBe(1.1)
  })

  it('el pool de excedente se ve en la semana y se cobra al cerrarla', async () => {
    // Un día de la semana pasada y uno de esta, con excedente (meta al 150 %).
    await group(A)
    const [{ ws }] = await h.admin<{ ws: number }>(`select (user_today($1) - week_start(user_today($1)))::int ws`, [A])
    const days = ws + 2 // cubre hasta el sábado de la semana pasada
    await perfectDays(A, days, 10)
    const cd = await h.admin<{ day: string; to_pool: string; closed: boolean }>(`select day::text, to_pool, closed from coin_days($1)`, [A])
    const lastWeek = cd.filter((d) => d.day < (cd.find((x) => x.day === cd.at(-1)!.day)!.day)).slice(0, days - ws)
    expect(lastWeek.length).toBeGreaterThan(0)
    const w = await wallet(A)
    expect(num(w.pool_this_week)).toBeGreaterThan(0)
    // El saldo incluye el pool de la semana pasada pero no el de esta.
    const [{ closedPool }] = await h.admin<{ closedPool: string }>(
      `select coalesce(sum(to_pool), 0) "closedPool" from coin_days($1) where week_start(day) < week_start(user_today($1))`, [A])
    const [{ credits }] = await h.admin<{ credits: string }>(`select coalesce(sum(credit), 0) credits from coin_days($1) where closed`, [A])
    expect(num(w.balance)).toBeCloseTo(num(credits) + num(closedPool), 2)
  })

  it('tienda: el permiso cubre la recaída (sin ×0,9), límite semanal de 6 cervezas, opt-in y conflicto con objetivo', async () => {
    await group(A)
    const { planId, ids } = await perfectDays(A, 40)
    for (const id of ids) await h.as(A, `select set_habit_done($1, true)`, [id])
    const v = await vice(A, planId)
    await h.as(A, `select set_vice_state($1, 'slipped')`, [v])
    expect(num((await score(A)).total)).toBe(90)
    const [cerveza] = await h.as<{ id: string }>(A, `select id from store_items where slug = 'cerveza'`)
    await expect(h.as(A, `select buy_item($1, $2)`, [cerveza.id, v])).rejects.toThrow(/Activá/)
    await h.as(A, `select set_optin($1, true)`, [cerveza.id])
    expect((await h.as<{ r: { ok: boolean } }>(A, `select buy_item($1, $2) r`, [cerveza.id, v]))[0].r.ok).toBe(true)
    expect(num((await score(A)).total)).toBe(100)
    for (let i = 0; i < 5; i++) await h.as(A, `select buy_item($1, $2)`, [cerveza.id, v])
    expect((await h.as<{ r: { reason: string } }>(A, `select buy_item($1, $2) r`, [cerveza.id, v]))[0].r.reason).toBe('limite-semanal')
    const [cig] = await h.as<{ id: string }>(A, `select id from store_items where slug = 'cigarro'`)
    await h.as(A, `select set_optin($1, true)`, [cig.id])
    const [o] = await h.admin<{ id: string }>(`insert into objectives (user_id, title, tag) values ($1, 'Dejar de fumar', 'dejar-fumar') returning id`, [A])
    await h.admin(`insert into plan_objectives (plan_id, objective_id) values ($1, $2)`, [planId, o.id])
    expect((await h.as<{ r: { reason: string } }>(A, `select buy_item($1, $2) r`, [cig.id, v]))[0].r.reason).toBe('conflicto-objetivo')
  })

  it('sin monedas no se compra; el pase cuesta según el peso del hábito', async () => {
    await group(A)
    const { ids } = await plan(A, [{ name: 'a', weight: 3 }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }])
    const [pase] = await h.as<{ id: string }>(A, `select id from store_items where slug = 'pase-habito'`)
    expect((await h.as<{ r: { reason: string } }>(A, `select buy_item($1, null, $2) r`, [pase.id, ids[0]]))[0].r.reason).toBe('monedas-insuficientes')
    await perfectDays(A, 2)
    expect((await h.as<{ r: { price: number } }>(A, `select buy_item($1, null, $2) r`, [pase.id, ids[0]]))[0].r).toMatchObject({ ok: true, price: 6 })
  })
})

describe('legado, ranking y configuración', () => {
  it('días anteriores a la migración quedan congelados; el ranking los suma y los muestra aparte', async () => {
    const g = await group(A, B)
    await h.admin(`update groups set start_date = user_today($2) - 3 where id = $1`, [g, A])
    await h.admin(`update group_members set joined_at = now() - interval '5 days'`)
    await h.admin(`insert into user_game (user_id, v3_since) values ($1, user_today($1) - 1)`, [A])
    await h.admin(`insert into legacy_days (user_id, day, points) values ($1, user_today($1) - 3, 75), ($1, user_today($1) - 2, 60)`, [A])
    const { ids } = await plan(A, [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }], 1)
    for (const id of ids) await h.admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - 1)`, [id, A])
    const rows = await h.as<{ user_id: string; total_points: string; legacy_points: string }>(B, `select * from group_leaderboard($1)`, [g])
    const a = rows.find((r) => r.user_id === A)!
    expect([num(a.total_points), num(a.legacy_points)]).toEqual([235, 135])
  })

  it('hora de corte: con dayCutoffHour = 24, "hoy" es ayer', async () => {
    const t = await today(A)
    await h.admin(`update game_config set value = '24'::jsonb where key = 'dayCutoffHour'`)
    const y = await today(A)
    expect(Date.parse(t) - Date.parse(y)).toBe(86400000)
  })

  it('semana de lunes a domingo, cruzando fin de año', async () => {
    const r = await h.admin<{ a: string; b: string; c: string }>(
      `select week_start('2026-12-31')::text a, week_start('2027-01-03')::text b, week_start('2027-01-04')::text c`)
    expect(r[0]).toEqual({ a: '2026-12-28', b: '2026-12-28', c: '2027-01-04' })
  })

  it('un parámetro votado por el grupo rige desde mañana (ej. umbral de 75 → 60)', async () => {
    const g = await group(A, B)
    const [{ id }] = await h.as<{ id: string }>(A, `select propose_change('group', 'config.set', '{"key":"coinThresholdLow","value":60}'::jsonb) id`)
    await h.as(B, `select vote_change($1, 'yes')`, [id])
    const r = await h.admin<{ hoy: string; man: string }>(
      `select cfg_num($1, 'coinThresholdLow', user_today($1))::text hoy, cfg_num($1, 'coinThresholdLow', user_today($1) + 1)::text man`, [A])
    expect(r[0]).toEqual({ hoy: '75', man: '60' })
    await expect(h.as(A, `select propose_change('me', 'config.set', '{"key":"x","value":1}'::jsonb)`)).rejects.toThrow(/siempre para todo el grupo/)
    void g
  })

  it('pesos de los amigos: el grupo ve pesos; privados y vicios sin nombre', async () => {
    const g = await group(A, B)
    await h.as(A, `select create_initial_plan('[{"catalog_id":"caminar_30","weight":1},{"catalog_id":"dia_sin_fumar","weight":3,"private":true},{"name":"Guitarra","pillar":"habilidades","weight":2}]'::jsonb, '[{"name":"Fumar"}]'::jsonb)`)
    const [a] = await h.as<{ habits: { name: string; weight: number }[]; vices: { name: string }[] }>(B, `select * from group_plans($1) where user_id = $2`, [g, A])
    expect(a.habits.map((x) => [x.name, x.weight])).toEqual([['Hábito privado', 3], ['Guitarra', 2], ['Caminar 30 minutos', 1]])
    expect(a.vices[0].name).toBe('Vicio')
  })
})

describe('migración de datos existentes (re-ejecutar 006 sobre datos viejos)', () => {
  it('hábito de Conexión: se archiva con aviso; hábitos activos → plan desde hoy; vicios declarados → vicios nuevos', async () => {
    await h.db.exec(`alter table habits disable trigger habits_validate`)
    try {
      await h.admin(`insert into habits (user_id, name, area, tier) values ($1, 'Llamar a mamá', 'social', 2), ($1, 'Leer', 'mente', 4),
                       ($1, 'Agua', 'alimentacion', 1), ($1, 'Correr', 'cuerpo', 3)`, [A])
    } finally {
      await h.db.exec(`alter table habits enable trigger habits_validate`)
    }
    await h.admin(`insert into user_vices (user_id, vice_id, name, started_on) values ($1, 'fumar', 'Fumar o vapear', current_date - 3)`, [A])
    await h.db.exec(readMigration(MIGRATIONS[5]))
    const hs = await h.admin<{ name: string; pillar: string | null; archived: boolean }>(`select name, pillar, archived from habits where user_id = $1 order by name`, [A])
    expect(hs).toEqual([
      { name: 'Agua', pillar: 'cuerpo', archived: false },
      { name: 'Correr', pillar: 'cuerpo', archived: false },
      { name: 'Leer', pillar: 'mente', archived: false },
      { name: 'Llamar a mamá', pillar: null, archived: true },
    ])
    expect((await h.admin<{ text: string }>(`select text from user_notices where user_id = $1`, [A]))[0].text).toMatch(/Llamar a mamá.*Conexión/)
    const d = await h.one<{ habits: { name: string; weight: number }[]; vices: { name: string; severity: string; weight: number }[] }>(A, `select my_day() r`)
    expect(d.habits.map((x) => [x.name, x.weight]).sort()).toEqual([['Agua', 1], ['Correr', 3], ['Leer', 3]]) // tier 4 → 3
    expect(d.vices).toEqual([expect.objectContaining({ name: 'Fumar o vapear', severity: 'normal', weight: 1, state: 'none' })])
  })
})
