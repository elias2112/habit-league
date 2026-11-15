// Spec v4.2 contra la base (007), pasos 2 y 3: dos totales por día (ranking y personal) y fuerza base.
// Mismos resultados que src/game/*.ts (que porta reference/).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from './harness'
import { dayTotals } from '../src/game/ranking'
import { weekChain } from '../src/game/compound'
import { dayRatio, maxTargetFor, rewardFactor } from '../src/game/strength'
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

const n = (x: unknown) => Number(x)
type State = { level: Record<string, number>; rank: { points: number; name: string }; wallet: Record<string, number>; strength: Record<string, number> }
const state = async (u: string) => (await h.admin<{ s: State }>(`select game_state($1) s`, [u]))[0].s
const log = (habit: string, u: string, offset: number, count = 1) =>
  h.admin(`insert into habit_logs (habit_id, log_date, count) values ($1, user_today($2) - $3::int, $4)`, [habit, u, offset, count])
async function group(...members: string[]) {
  const [g] = await h.as<{ id: string; invite_code: string }>(members[0], `select * from create_group('Amigos', 66)`)
  for (const m of members.slice(1)) await h.as(m, `select join_group($1)`, [g.invite_code])
  return g.id
}
const tomorrowPlan = (u: string) => h.admin<{ name: string; scope: string; weight: number }>(
  `select hb.name, ph.scope, ph.weight from plan_habits ph join habits hb on hb.id = ph.habit_id
   where ph.plan_id = plan_for($1, user_today($1) + 1) order by hb.name`, [u])
const status = async (id: string) => (await h.admin<{ status: string }>(`select status from change_requests where id = $1`, [id]))[0].status
const BASE = JSON.stringify([{ name: 'Correr', pillar: 'cuerpo', weight: 1, block: 'deporte' }, { catalog_id: 'caminar_30', weight: 1 }])

// ───────────────────────────── Paso 2: dos totales por día ─────────────────────────────
describe('paso 2: ranking y personal', () => {
  let seed = 23
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]

  it('SQL = TS: 300 casos al azar con alcance dan lo mismo en totals_pure y dayTotals', async () => {
    const scopes = ['plan-inicial', 'grupo', 'solo-yo'] as const
    for (let i = 0; i < 300; i++) {
      const habits = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({
        weight: 1 + Math.floor(rnd() * 3), completion: Math.round(rnd() * 200) / 100, measurable: rnd() > 0.5, scope: pick(scopes) }))
      const vices = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
        weight: 1 + Math.floor(rnd() * 3), severity: pick(['leve', 'normal', 'grave'] as const),
        state: pick(['none', 'clean', 'slipped'] as const), penalizing: rnd() > 0.3, scope: pick(scopes) }))
      const [{ t }] = await h.admin<{ t: Record<string, Record<string, number>> }>(`select totals_pure($1::jsonb, $2::jsonb, $3::jsonb, $4, $5, false) t`,
        [JSON.stringify(habits), JSON.stringify(vices), JSON.stringify(config.scoring.severity), config.scoring.multiplierFloor, config.scoring.maxCompletion])
      const fix = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, n(v)]))
      expect({ ranking: fix(t.ranking), personal: fix(t.personal) }, JSON.stringify({ habits, vices })).toEqual(dayTotals({ habits, vices }))
    }
  })

  it('agregar un hábito o un vicio «solo yo» es directo y rige mañana; lo de todo el grupo se vota y queda «grupo»', async () => {
    const g = await group(A, B, C)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [BASE])
    const [{ id }] = await h.as<{ id: string }>(A, `select propose_change('me', 'habit.add', '{"catalog_id":"leer_15","weight":3}'::jsonb) id`)
    expect(await status(id)).toBe('approved')
    expect((await h.one<{ habits: unknown[] }>(A, `select my_day() r`)).habits).toHaveLength(2)          // hoy no cambia
    expect((await tomorrowPlan(A)).find((x) => x.name.startsWith('Leer'))).toMatchObject({ scope: 'solo-yo', weight: 3 })
    await h.as(A, `select propose_change('me', 'vice.add', '{"name":"Redes"}'::jsonb)`)
    expect(await h.admin(`select scope from plan_vices where plan_id = plan_for($1, user_today($1) + 1)`, [A])).toEqual([{ scope: 'solo-yo' }])

    const [{ id: gid }] = await h.as<{ id: string }>(B, `select propose_change('group', 'habit.add', '{"catalog_id":"agua_2l","weight":2}'::jsonb) id`)
    expect(await status(gid)).toBe('pending')
    await h.as(A, `select vote_change($1, 'yes')`, [gid])
    await h.as(C, `select vote_change($1, 'yes')`, [gid])
    expect((await tomorrowPlan(A)).find((x) => x.name.startsWith('Tomar'))).toMatchObject({ scope: 'grupo' })
    void g
  })

  it('el peso de un «solo yo» se cambia directo; el de uno que cuenta para el ranking, por votación', async () => {
    await group(A, B, C)
    await h.as(A, `select create_initial_plan($1::jsonb)`, [BASE])
    await h.as(A, `select propose_change('me', 'habit.add', '{"catalog_id":"leer_15","weight":1}'::jsonb)`)
    const [solo] = await h.admin<{ id: string }>(`select id from habits where user_id = $1 and catalog_id = 'leer_15'`, [A])
    const [ini] = await h.admin<{ id: string }>(`select id from habits where user_id = $1 and catalog_id = 'caminar_30'`, [A])
    const weight = async (habit: string) => status((await h.as<{ id: string }>(A,
      `select propose_change('me', 'habit.weight', jsonb_build_object('habit_id', $1::text, 'weight', 3)) id`, [habit]))[0].id)
    expect(await weight(solo.id)).toBe('approved')
    expect(await weight(ini.id)).toBe('pending')
  })

  it('el ranking suma el total de ranking; experiencia y monedas salen del personal', async () => {
    const g = await group(A, B)
    const [p] = await h.admin<{ id: string }>(`insert into plans (user_id, effective_from) values ($1, user_today($1) - 1) returning id`, [A])
    const [ini] = await h.admin<{ id: string }>(`insert into habits (user_id, name, pillar) values ($1, 'inicial', 'mente') returning id`, [A])
    const [solo] = await h.admin<{ id: string }>(`insert into habits (user_id, name, pillar) values ($1, 'solo', 'mente') returning id`, [A])
    await h.admin(`insert into plan_habits (plan_id, habit_id, weight) values ($1, $2, 1)`, [p.id, ini.id])
    await h.admin(`insert into plan_habits (plan_id, habit_id, weight, scope) values ($1, $2, 1, 'solo-yo')`, [p.id, solo.id])
    await log(ini.id, A, 1)                                                // ayer: solo el del plan inicial
    await log(solo.id, A, 0)                                               // hoy: solo el «solo yo»
    const sc = async (o: number) => (await h.admin<{ s: { total: number; ranking: { total: number } } }>(`select day_score($1, user_today($1) - $2::int) s`, [A, o]))[0].s
    const y = await sc(1), t = await sc(0)
    expect([n(y.total), n(y.ranking.total)]).toEqual([50, 100])
    expect([n(t.total), n(t.ranking.total)]).toEqual([50, 0])
    await h.admin(`update groups set start_date = user_today($2) - 1 where id = $1`, [g, A])
    await h.admin(`update group_members set joined_at = now() - interval '2 days'`)
    const row = (await h.as<{ user_id: string; total_points: string; rank: string }>(B, `select * from group_leaderboard($1)`, [g])).find((r) => r.user_id === A)!
    expect(n(row.total_points)).toBe(100)
    expect(row.rank).toBe('Aspirante')
    expect(n((await state(A)).level.xp)).toBe(100)                         // 50 + 50 (personal)
  })
})

// ───────────────────────────── Paso 3: fuerza base ─────────────────────────────
describe('paso 3: fuerza base', () => {
  let seed = 31
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
  const fuerza = (u: string, off = 0) => h.admin<{ name: string; target: string; unit: string; weight: number; strength_easy: boolean }>(
    `select hb.name, ph.target, hb.unit, ph.weight, hb.strength_easy from plan_habits ph join habits hb on hb.id = ph.habit_id
     where ph.plan_id = plan_for($1, user_today($1) + $2::int) and hb.block = 'fuerza' order by hb.strength_id`, [u, off])
  const T = (f: number, s: number, p: number) => JSON.stringify({ targets: { flexiones: f, sentadillas: s, plancha: p } })
  type Pending = { date: string; missedCoins: number; missedExp: number }
  const myStrength = async (u: string) => (await h.one<{ strength: Record<string, unknown> }>(u, `select my_day() r`)).strength

  it('SQL = TS: 300 semanas al azar dan la misma cadena en strength_week_pure y weekChain', async () => {
    const cfg = { compound: config.strength.compound, forgiveRatio: config.strength.forgiveRatio, compoundMissRate: config.strength.compoundMissRate }
    for (let i = 0; i < 300; i++) {
      const week = Array.from({ length: Math.floor(rnd() * 8) }, () => (rnd() < 0.4 ? 1 : Math.round(rnd() * 100) / 100))
      const t = () => 10 * (1 + Math.floor(rnd() * 10))
      const factor = rewardFactor({ flexiones: t(), sentadillas: t(), plancha: t() })
      const [{ c }] = await h.admin<{ c: Record<string, unknown>[] }>(`select strength_week_pure($1::float8[], $2::float8[], $3::jsonb) c`,
        [week, week.map(() => factor), JSON.stringify(cfg)])
      const sql = c.map((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v : n(v)])))
      expect(sql, JSON.stringify({ week, factor })).toEqual(weekChain(week, { rewardFactor: factor }))
    }
  })

  it('plan inicial: meta elegida por ejercicio (de a 10 hasta 100), peso 3, plancha en segundos', async () => {
    await h.as(A, `select create_initial_plan($1::jsonb, '[]', '[]', $2::jsonb)`, [BASE, T(30, 20, 40)])
    expect((await fuerza(A)).map((x) => [x.name, n(x.target), x.unit, x.weight])).toEqual([
      ['Flexiones', 30, 'repeticiones', 3], ['Plancha', 40, 'segundos', 3], ['Sentadillas', 20, 'repeticiones', 3]])
    for (const bad of [T(15, 20, 40), T(110, 20, 40), T(0, 20, 40)])
      await expect(h.as(B, `select create_initial_plan($1::jsonb, '[]', '[]', $2::jsonb)`, [BASE, bad])).rejects.toThrow(/va de 10 a 100 de a 10/)
  })

  it('variante fácil: los equivalentes con meta 10; quien la rechaza no tiene fuerza base', async () => {
    await h.as(A, `select create_initial_plan($1::jsonb, '[]', '[]', '{"easy":true}'::jsonb)`, [BASE])
    expect((await fuerza(A)).map((x) => [x.name, n(x.target), x.strength_easy])).toEqual([
      ['Flexiones en la pared', 10, true], ['Plancha apoyando las rodillas', 10, true], ['Sentarse y pararse de una silla', 10, true]])
    await h.as(B, `select create_initial_plan($1::jsonb, '[]', '[]', '"declined"'::jsonb)`, [BASE])
    expect(await fuerza(B)).toEqual([])
    expect((await myStrength(B)).today).toBeNull()
  })

  it('el día usa el peor ejercicio y el factor de las metas (dayRatio, rewardFactor)', async () => {
    await h.as(A, `select create_initial_plan($1::jsonb, '[]', '[]', $2::jsonb)`, [BASE, T(30, 20, 40)])
    const ids = await h.admin<{ id: string; strength_id: string }>(`select id, strength_id from habits where user_id = $1 and block = 'fuerza'`, [A])
    const reps: Record<string, number> = { flexiones: 30, sentadillas: 18, plancha: 50 }
    for (const x of ids) await log(x.id, A, 0, reps[x.strength_id])
    const [{ d }] = await h.admin<{ d: { ratio: number; worst: string; factor: number } }>(`select strength_day($1, user_today($1)) d`, [A])
    const targets = { flexiones: 30, sentadillas: 20, plancha: 40 }
    expect(n(d.ratio)).toBeCloseTo(dayRatio(reps, targets), 10)
    expect(d.worst).toBe('sentadillas')
    expect(n(d.factor)).toBe(rewardFactor(targets))
  })

  /** Plan con fuerza base (meta `target` en los tres) que rige desde hace `since` días; ratios[o] = cumplimiento hace o días. */
  async function strengthHistory(u: string, since: number, ratios: Record<number, number>, target = 40) {
    await h.as(u, `select create_initial_plan($1::jsonb, '[]', '[]', $2::jsonb)`, [BASE, T(target, target, target)])
    await h.admin(`update plans set effective_from = user_today($1) - $2::int where user_id = $1`, [u, since])
    const ids = await h.admin<{ id: string }>(`select id from habits where user_id = $1 and block = 'fuerza'`, [u])
    for (const [o, r] of Object.entries(ratios)) for (const x of ids) if (r > 0) await log(x.id, u, Number(o), Math.round(r * target))
  }

  it('recompensa compuesta: coincide con weekChain semana por semana y entra en billetera y experiencia', async () => {
    const ratios: Record<number, number> = { 9: 1, 8: 1, 7: 0.8, 6: 1, 5: 1, 4: 1, 3: 1, 2: 1, 1: 1 }
    await strengthHistory(A, 9, ratios)
    const days = await h.admin<{ o: number; ws: string }>(`select o, week_start(user_today($1) - o)::text ws from generate_series(1, 9) o order by o desc`, [A])
    const weeks = new Map<string, number[]>()
    for (const { o, ws } of days) weeks.set(ws, [...(weeks.get(ws) ?? []), ratios[o]])
    const f = rewardFactor({ flexiones: 40, sentadillas: 40, plancha: 40 })
    let coins = 0, exp = 0
    for (const w of weeks.values()) for (const d of weekChain(w, { rewardFactor: f })) { coins += d.coins; exp += d.exp }
    const s = await state(A)
    expect(n(s.strength.coins)).toBeCloseTo(coins, 2)
    expect(n(s.strength.exp)).toBeCloseTo(exp, 2)
    expect(n(s.wallet.strength)).toBeCloseTo(coins, 2)
  })

  it('día fallado: retiene las recompensas hasta saldarlo; «20 extra» se ve en el feed; «pagar» resta monedas y experiencia', async () => {
    const g = await group(A, B)
    await strengthHistory(A, 3, { 3: 1, 2: 0.5, 1: 1 })                      // anteayer fallado (50 % < 75 %)
    let st = await myStrength(A)
    expect(st.blocked).toBe(true)
    expect(n(st.coins)).toBe(0)
    expect(n(st.held_coins)).toBeGreaterThan(0)
    const [missed] = st.pending_days as Pending[]
    await expect(h.as(A, `select settle_strength_day(user_today(auth.uid()) - 1, 'extra')`)).rejects.toThrow(/nada que saldar/)
    await h.as(A, `select settle_strength_day($1::date, 'extra')`, [missed.date])
    await expect(h.as(A, `select settle_strength_day($1::date, 'pay')`, [missed.date])).rejects.toThrow(/nada que saldar/)
    st = await myStrength(A)
    expect(st.blocked).toBe(false)
    expect(n(st.coins)).toBe(n(st.held_coins))
    expect(n(st.penalty_coins)).toBe(0)
    const feed = await h.as<{ kind: string; text: string; detail: { reps: number } }>(B, `select * from group_activity($1) where kind = 'strength_extra'`, [g])
    expect(feed).toHaveLength(1)
    expect(feed[0].detail.reps).toBe(20)

    await strengthHistory(B, 2, { 2: 0.2, 1: 1 })
    const before = await state(B)
    const [mb] = (await myStrength(B)).pending_days as Pending[]
    await h.as(B, `select settle_strength_day($1::date, 'pay')`, [mb.date])
    const after = await state(B)
    expect(n(after.strength.penalty_coins)).toBe(n(mb.missedCoins))
    expect(n(after.strength.penalty_exp)).toBe(n(mb.missedExp))
    expect(n(after.wallet.balance)).toBeCloseTo(n(before.wallet.balance) + n(after.strength.coins) - n(mb.missedCoins), 2)
    expect(await h.as(A, `select * from group_activity($1) where kind = 'strength_extra' and user_id = $2`, [g, B])).toHaveLength(0) // pagar no se publica
  })

  it('perdonado (≥ 75 %): la cadena sigue y no queda nada por saldar', async () => {
    await strengthHistory(A, 1, { 1: 0.8 })
    const st = await myStrength(A)
    const all = (st.week as { status: string }[])
    if (all.length) expect(all.at(-1)!.status).toBe('forgiven')
    expect(n(st.pending)).toBe(0)
  })

  it('cambiar la meta va por votación (alcance «solo yo» o «todo el grupo»), de a 10 y hasta el tope del nivel', async () => {
    const g = await group(A, B, C)
    for (const u of [A, B, C]) await h.as(u, `select create_initial_plan($1::jsonb, '[]', '[]', $2::jsonb)`, [BASE, T(30, 30, 30)])
    const [fx] = await h.admin<{ id: string }>(`select id from habits where user_id = $1 and strength_id = 'flexiones'`, [A])
    for (const bad of [15, 110, 0])
      await expect(h.as(A, `select propose_change('me', 'habit.target', jsonb_build_object('habit_id', $1::text, 'target', $2::int))`, [fx.id, bad])).rejects.toThrow(/va de 10 a 100/)
    await expect(h.as(A, `select propose_change('me', 'habit.remove', jsonb_build_object('habit_id', $1::text))`, [fx.id])).rejects.toThrow(/fuerza base/)
    const [{ id }] = await h.as<{ id: string }>(A, `select propose_change('group', 'habit.target', jsonb_build_object('habit_id', $1::text, 'target', 50)) id`, [fx.id])
    expect(await status(id)).toBe('pending')
    await h.as(B, `select vote_change($1, 'yes')`, [id])
    await h.as(C, `select vote_change($1, 'yes')`, [id])
    for (const u of [A, B, C]) {
      expect((await fuerza(u, 0)).map((x) => n(x.target))).toEqual([30, 30, 30])             // hoy no cambia
      expect((await fuerza(u, 1)).map((x) => n(x.target))).toEqual([50, 30, 30])             // flexiones desde mañana
    }
    expect(await h.one<number>(A, `select (my_day() ->> 'strength_cap')::int r`)).toBe(100)
    void g
  })

  it('el tope sube +10 cada 10 niveles (strength_cap = maxTargetFor)', async () => {
    for (const lvl of [0, 9, 10, 19, 20, 35])
      expect(await h.admin<{ c: number }>(`select strength_cap($1, $2, current_date) c`, [A, lvl])).toEqual([{ c: maxTargetFor(lvl) }])
  })

  it('15 de 10 flexiones cuenta 150 %: la fuerza base pesa 3 por ejercicio', async () => {
    await h.as(A, `select create_initial_plan('[{"name":"Correr","pillar":"cuerpo","block":"deporte","weight":1}]'::jsonb, '[]', '[]', $1::jsonb)`, [T(10, 10, 10)])
    const ids = await h.admin<{ id: string; strength_id: string | null }>(`select id, strength_id from habits where user_id = $1`, [A])
    for (const x of ids) await log(x.id, A, 0, x.strength_id === 'flexiones' ? 15 : x.strength_id ? 10 : 1)
    // (3 × 1,5 + 3 + 3 + 1) / 10 = 1,15 → 100 y 15 de excedente
    const [{ s }] = await h.admin<{ s: { total: number; overflow: number } }>(`select day_score($1, user_today($1)) s`, [A])
    expect([n(s.total), n(s.overflow)]).toEqual([100, 15])
  })
})

// ───────────────────────────── Paso 4: tienda y precios por área ─────────────────────────────
describe('paso 4: tienda', () => {
  type Item = { id: string; slug: string; price: number | null; locked: boolean; unlock_level: number; group_only: boolean; registry_only: boolean }
  const myStore = async (u: string) => (await h.one<Item[]>(u, `select my_store() r`))
  /** Días perfectos cerrados para tener monedas. */
  async function coins(u: string, days: number) {
    const [p] = await h.admin<{ id: string }>(`insert into plans (user_id, effective_from) values ($1, user_today($1) - $2::int) returning id`, [u, days])
    const [hb] = await h.admin<{ id: string }>(`insert into habits (user_id, name, pillar) values ($1, 'h', 'mente') returning id`, [u])
    await h.admin(`insert into plan_habits (plan_id, habit_id, weight) values ($1, $2, 1)`, [p.id, hb.id])
    for (let o = days; o >= 1; o--) await log(hb.id, u, o)
  }

  it('SQL = TS: price_pure = priceOf para todo el catálogo, cada respuesta y cada peso', async () => {
    const { priceOf } = await import('../src/game/store')
    const store = (await import('../content/store.json')).default
    const cfg = { areas: config.storeAreas.areas, areaPriceMultiplier: config.storeAreas.areaPriceMultiplier }
    for (const it of store.items) for (const answer of [null, 'no', 'poco', 'mucho'] as const) for (const w of [1, 2, 3]) {
      const [{ p }] = await h.admin<{ p: string | null }>(`select price_pure($1, $2::jsonb, $3, $4, $5, $6::jsonb) p`,
        [it.price ?? null, 'priceByWeight' in it ? JSON.stringify(it.priceByWeight) : null, w, 'area' in it ? it.area : null, answer, JSON.stringify(cfg)])
      const ts = priceOf(it as never, w, answer)
      expect(p == null ? null : n(p), `${it.id} ${answer} ${w}`).toBe(ts ?? null)
    }
  })

  it('respuestas por área: privadas, una sola vez, y cambian precio y oferta de MI tienda', async () => {
    await group(A, B)
    expect((await myStore(A)).find((x) => x.slug === 'cerveza')!.price).toBe(5)                       // sin responder: precio base
    await expect(h.as(A, `select set_area_answers('{"casino":"mucho"}'::jsonb)`)).rejects.toThrow(/Área inválida/)
    await h.as(A, `select set_area_answers('{"tabaco":"no","alcohol":"poco","comida":"no","dulce":"mucho","redes":"no","juegos":"no"}'::jsonb)`)
    await expect(h.as(A, `select set_area_answers('{"tabaco":"mucho"}'::jsonb)`)).rejects.toThrow(/Ya contestaste/)
    expect(await h.as(B, `select * from area_answers`)).toHaveLength(0)                              // el grupo no las ve
    expect(await h.as(A, `select * from area_answers`)).toHaveLength(6)
    const a = await myStore(A)
    const price = (slug: string) => a.find((x) => x.slug === slug)?.price
    expect([price('cerveza'), price('trago'), price('comer-mal'), price('antojo-dulce')]).toEqual([10, 24, 10, 12])
    expect(a.map((x) => x.slug)).not.toContain('cigarro')                                            // tabaco «no»: oculto
    expect(a.map((x) => x.slug)).not.toContain('sesion-juego')
    expect((await myStore(B)).find((x) => x.slug === 'cerveza')!.price).toBe(5)                       // B sigue con el base
  })

  it('vales de grupo: bloqueados hasta el nivel 10/20/30 y solo registro', async () => {
    await group(A, B)
    const vales = (await myStore(A)).filter((x) => x.slug.startsWith('vale-'))
    expect(vales.map((x) => [x.slug, x.unlock_level, x.locked, x.group_only, x.registry_only]).sort()).toEqual([
      ['vale-10-off', 10, true, true, true], ['vale-cena', 30, true, true, true], ['vale-no-pagas', 20, true, true, true]])
    await coins(A, 6)
    const id = vales.find((x) => x.slug === 'vale-10-off')!.id
    expect(await h.one(A, `select buy_item($1) r`, [id])).toEqual({ ok: false, reason: 'nivel-insuficiente' })
  })

  it('compra con el precio por área: la cerveza «poco» cuesta 10', async () => {
    await group(A, B)
    await coins(A, 6)
    await h.as(A, `select set_area_answers('{"alcohol":"poco"}'::jsonb)`)
    const [v] = await h.admin<{ id: string }>(`insert into vices (user_id, name) values ($1, 'Tomar') returning id`, [A])
    const cerveza = (await myStore(A)).find((x) => x.slug === 'cerveza')!
    await h.as(A, `select set_optin($1, true)`, [cerveza.id])
    expect(await h.one(A, `select buy_item($1, $2) r`, [cerveza.id, v.id])).toEqual({ ok: true, price: 10 })
  })

  it('reiniciar borra las respuestas por área y los días saldados', async () => {
    await h.as(A, `select set_area_answers('{"alcohol":"poco"}'::jsonb)`)
    await h.admin(`insert into strength_settlements (user_id, day, choice) values ($1, current_date - 3, 'extra')`, [A])
    const [{ username }] = await h.admin<{ username: string }>(`select username from profiles where id = $1`, [A])
    await h.as(A, `select reset_my_data($1)`, [username])
    expect(await h.admin(`select * from area_answers where user_id = $1`, [A])).toHaveLength(0)
    expect(await h.admin(`select * from strength_settlements where user_id = $1`, [A])).toHaveLength(0)
  })
})
