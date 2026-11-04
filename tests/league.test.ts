// Tests de la migración 004 (liga, Juicio, cofres) sobre PGlite con stubs de auth y storage.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const FILES = [
  '../supabase/schema.sql',
  '../supabase/migrations/002_quiz_personas_puntos.sql',
  '../supabase/migrations/003_grupo_objetivos_fotos.sql',
  '../supabase/migrations/004_liga_juicio_cofre.sql',
  '../supabase/migrations/005_vicios.sql',
]
const STUB = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
`
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'

let db: PGlite
async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  try { return (await db.query<T>(sql, params)).rows } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows
const one = async <T>(user: string, sql: string, params: unknown[] = []) => (await as<{ r: T }>(user, sql, params))[0].r

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUB)
  for (const f of FILES) await db.exec(readFileSync(new URL(f, import.meta.url), 'utf8'))
})
beforeEach(async () => {
  await db.exec(`truncate auth.users cascade;`)
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@x.com'), ('${B}', 'b@x.com'), ('${C}', 'c@x.com');`)
})

/** Hábito de catálogo tier 1 para tener puntos (único hábito → 100 puntos al completarlo). */
async function oneHabit(user: string) {
  const [h] = await as<{ id: string }>(user, `insert into habits (user_id, name, catalog_id) values ($1, 'x', 'caminar_30') returning id`, [user])
  return h.id
}
/** Marca el hábito en días pasados (relativos a hoy del usuario), como admin. */
async function logDays(habit: string, user: string, offsets: number[]) {
  for (const o of offsets) await admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - $3::int)`, [habit, user, o])
}
type State = { stage: string; division: number; pl: number; shield_until: string | null; last_day: string }
const state = async (user: string) => (await admin<State>(`select stage, division, pl, shield_until::text, last_day::text from league_state where user_id = $1`, [user]))[0]
const setState = (user: string, s: Partial<{ stage: string; division: number; pl: number; back: number; shield: number | null }>) =>
  admin(`update league_state set stage = coalesce($2, stage), division = coalesce($3, division), pl = coalesce($4, pl),
         last_day = case when $5::int is null then last_day else user_today($1) - $5::int end,
         shield_until = case when $6::int is null then null else user_today($1) + $6::int end where user_id = $1`,
    [user, s.stage ?? null, s.division ?? null, s.pl ?? null, s.back ?? null, s.shield ?? null])
const sync = (user: string) => one<{ stage: string; division: number; pl: number }>(user, `select league_sync() r`)
/** Deja a la persona en la liga desde antes de ayer, para que pueda responder el Juicio. */
const ready = async (user: string) => { await sync(user); await setState(user, { back: 2 }) }

describe('puntaje de respuestas', () => {
  const score = async (type: string, params: object, value: unknown) =>
    (await admin<{ s: number }>(`select score_answer($1, $2::jsonb, $3::jsonb) s`, [type, JSON.stringify(params), JSON.stringify(value)]))[0].s

  it('sí/no, conteo con libres y tope, dinero cada 5 € con tope', async () => {
    expect(await score('yesno', { yes: -5, no: 2 }, true)).toBe(-5)
    expect(await score('yesno', { yes: -5, no: 2 }, false)).toBe(2)
    const fumar = { zero: 3, free: 0, per_unit: -1, min: -10 }
    expect([await score('count', fumar, 0), await score('count', fumar, 4), await score('count', fumar, 30)]).toEqual([3, -4, -10])
    const alcohol = { zero: 2, free: 2, per_unit: -2, min: -10 }
    expect([await score('count', alcohol, 0), await score('count', alcohol, 2), await score('count', alcohol, 4)]).toEqual([2, 0, -4])
    const gasto = { zero: 2, per_5: -1, cap: -10 }
    expect([await score('money', gasto, 0), await score('money', gasto, 7), await score('money', gasto, 500)]).toEqual([2, -2, -10])
    const ahorro = { zero: 0, per_5: 1, cap: 10 }
    expect([await score('money', ahorro, 0), await score('money', ahorro, 20), await score('money', ahorro, 1000)]).toEqual([0, 4, 10])
    expect(await score('money', gasto, null)).toBe(0)
  })
})

describe('preguntas del Juicio', () => {
  const ids = async (user: string) => (await one<{ questions: { id: string; kind: string }[] }>(user, `select judgment_today() r`)).questions

  it('el primer día en la liga no hay Juicio', async () => {
    await sync(A)
    expect(await one<{ available: boolean }>(A, `select judgment_today() r`)).toMatchObject({ available: false })
    await expect(as(A, `select submit_judgment('{}'::jsonb)`)).rejects.toThrow(/arranca mañana/)
    await setState(A, { back: 2 })
    expect(await one<{ available: boolean }>(A, `select judgment_today() r`)).toMatchObject({ available: true })
  })

  it('sin quiz se pregunta todo; con quiz "no fumo" no aparece fumar; la persona puede activarlo', async () => {
    let q = await ids(A)
    expect(q.filter((x) => x.kind === 'core').map((x) => x.id)).toEqual(['comida', 'fumar', 'alcohol', 'gasto', 'ahorro', 'disfrute'])
    await admin(`update profiles set quiz_answers = '{"q21":"a","q22":"c"}' where id = $1`, [A])
    q = await ids(A)
    expect(q.map((x) => x.id)).not.toContain('fumar')
    expect(q.map((x) => x.id)).toContain('alcohol')
    await as(A, `insert into user_settings (judgment_opt) values ('{"fumar": true, "alcohol": false}')`)
    q = await ids(A)
    expect(q.map((x) => x.id)).toContain('fumar')
    expect(q.map((x) => x.id)).not.toContain('alcohol')
  })

  it('2 misiones sorpresa por día, siempre las mismas ese día', async () => {
    const a1 = (await ids(A)).filter((x) => x.kind === 'bonus').map((x) => x.id)
    const a2 = (await ids(A)).filter((x) => x.kind === 'bonus').map((x) => x.id)
    expect(a1).toHaveLength(2)
    expect(a2).toEqual(a1)
    const week = new Set<string>()
    for (let d = 0; d < 7; d++) {
      const r = await admin<{ id: string }>(`select id from judgment_questions_for($1, current_date - $2::int) where kind = 'bonus'`, [A, d])
      r.forEach((x) => week.add(x.id))
    }
    expect(week.size).toBeGreaterThan(2) // rotan durante la semana
  })
})

describe('responder el Juicio', () => {
  it('calcula el total en la base, guarda solo lo preguntado, una sola vez, y deposita el ahorro en el cofre', async () => {
    await admin(`update profiles set quiz_answers = '{"q21":"c","q22":"a"}' where id = $1`, [A])
    await ready(A)
    const [g] = await as<{ id: string }>(A, `insert into goals (title, kind, target, unit) values ('Celular', 'ahorro', 600, '€') returning id`)
    const r = await one<{ judgment_total: number; scores: Record<string, number> }>(A,
      `select submit_judgment($1::jsonb, $2) r`,
      [JSON.stringify({ comida: true, fumar: 5, alcohol: 3, gasto: 12, ahorro: 20, disfrute: true, hackeo: 999 }), g.id])
    // comida -5, fumar -5, gasto -3, ahorro +4, disfrute +3, alcohol no se preguntó; misiones sin responder = 0
    expect(r.scores).toMatchObject({ comida: -5, fumar: -5, gasto: -3, ahorro: 4, disfrute: 3 })
    expect(r.scores).not.toHaveProperty('alcohol')
    expect(r.judgment_total).toBe(-6)
    const [j] = await as<{ answers: Record<string, unknown> }>(A, `select answers from daily_judgments`)
    expect(j.answers).not.toHaveProperty('hackeo')
    expect(Number((await as<{ progress: string }>(A, `select progress from goal_list($1)`, [A]))[0].progress)).toBe(20)
    await expect(as(A, `select submit_judgment('{}'::jsonb)`)).rejects.toThrow(/Ya respondiste/)
  })

  it('el cliente no puede escribir juicios ni la liga directo', async () => {
    await expect(as(A, `insert into daily_judgments (user_id, day, answers, scores, total) values ($1, current_date, '{}', '{}', 100)`, [A])).rejects.toThrow(/permission denied/)
    await sync(A)
    await expect(as(A, `update league_state set pl = 999`)).rejects.toThrow(/permission denied/)
  })
})

describe('liga: procesamiento de días', () => {
  it('arranca en Camello III sin castigar el pasado', async () => {
    expect(await sync(A)).toMatchObject({ stage: 'camello', division: 3, pl: 0 })
    expect(await admin(`select * from league_events where user_id = $1`, [A])).toHaveLength(0)
  })

  it('procesa hasta anteayer; ayer espera al Juicio', async () => {
    await sync(A)
    const h = await oneHabit(A)
    await logDays(h, A, [1, 2, 3])
    await setState(A, { back: 4 })
    // días -3 y -2: 100 puntos → +20, ×1,5 en Camello = +30 cada uno
    expect(await sync(A)).toMatchObject({ division: 3, pl: 60 })
    expect((await state(A)).last_day).toBe((await admin<{ d: string }>(`select (user_today($1) - 2)::text d`, [A]))[0].d)
    // al responder el Juicio de ayer se procesa ayer: +30 hábitos + juicio
    const r = await one<{ division: number; pl: number; judgment_total: number }>(A, `select submit_judgment('{"comida": false}'::jsonb) r`)
    // solo respondió comida (no = +2); lo no respondido vale 0. Ayer: +30 de hábitos + 2
    expect(r.judgment_total).toBe(2)
    expect(r.pl).toBe(92)
  })

  it('sin registros un día resta 20; en Camello III no baja de 0', async () => {
    await sync(A)
    await setState(A, { back: 3, pl: 10 })
    expect(await sync(A)).toMatchObject({ stage: 'camello', division: 3, pl: 0 })
  })
})

describe('liga: ascensos, escudo, prueba y descensos', () => {
  it('pasar 100 sube de división, guarda el resto y da escudo de 3 días', async () => {
    await sync(A)
    const h = await oneHabit(A)
    await logDays(h, A, [2])
    await setState(A, { back: 3, pl: 95 })
    const s = await sync(A)
    expect(s).toMatchObject({ stage: 'camello', division: 2, pl: 25 })
    expect((await state(A)).shield_until).not.toBeNull()
    expect(await admin(`select note from league_events where user_id = $1 and kind = 'ascenso'`, [A])).toEqual([{ note: 'camello 2' }])
  })

  it('en División I sin la prueba queda en 100; con 7 días ≥ 70 puntos pasa a León III', async () => {
    await sync(A)
    const h = await oneHabit(A)
    await logDays(h, A, [2])
    await setState(A, { division: 1, pl: 90, back: 3 })
    expect(await sync(A)).toMatchObject({ stage: 'camello', division: 1, pl: 100 })
    await logDays(h, A, [3, 4, 5, 6, 7, 8, 9])
    await admin(`delete from league_events where user_id = $1`, [A])
    await setState(A, { pl: 90, back: 3 })
    expect(await sync(A)).toMatchObject({ stage: 'leon', division: 3, pl: 20 })
  })

  it('bajar de 0 baja de división (a 75), salvo con escudo', async () => {
    await sync(A)
    await setState(A, { division: 2, pl: 5, back: 3, shield: 5 })
    expect(await sync(A)).toMatchObject({ division: 2, pl: 0 })
    await admin(`delete from league_events where user_id = $1`, [A])
    await setState(A, { pl: 5, back: 3, shield: null })
    expect(await sync(A)).toMatchObject({ division: 3, pl: 75 })
  })

  it('de León III se baja a Camello I', async () => {
    await sync(A)
    await setState(A, { stage: 'leon', division: 3, pl: 5, back: 3 })
    expect(await sync(A)).toMatchObject({ stage: 'camello', division: 1, pl: 75 })
  })

  it('el León potencia los vicios: un día limpio vale más', async () => {
    await sync(A)
    await setState(A, { stage: 'leon', division: 3, pl: 50, back: 2 })
    const h = await oneHabit(A)
    await logDays(h, A, [1])
    // comida no (+2 → ×1,5 = 3), fumar 0 (+3 → 5), alcohol 0 (+2 → 3); hábitos +20 sin potenciar
    const r = await one<{ pl: number }>(A, `select submit_judgment('{"comida": false, "fumar": 0, "alcohol": 0}'::jsonb) r`)
    const [ev] = await admin<{ pl: number }>(`select pl from league_events where user_id = $1 and kind = 'dia'`, [A])
    // hábitos +20 (no se potencia en León) + comida 3 + fumar 5 (3×1,5 redondeado) + alcohol 3
    expect(ev.pl).toBe(20 + 3 + 5 + 3)
    expect(r.pl).toBe(50 + ev.pl)
  })
})

describe('cofre: semana, dragón e hitos', () => {
  async function ahorroGoal(user: string, target = 100) {
    const [g] = await as<{ id: string }>(user, `insert into goals (title, kind, target, unit) values ('Celular', 'ahorro', $1, '€') returning id`, [target])
    const [h] = await as<{ id: string }>(user,
      `insert into habits (user_id, name, area, tier, goal_id, goal_step) values ($1, 'Ahorrar 10 €', 'foco', 2, $2, 10) returning id`, [user, g.id])
    return { goal: g.id, habit: h.id }
  }
  const lastSunday = async (user: string) =>
    (await admin<{ o: number }>(`select (user_today($1) - d)::int o from generate_series(user_today($1) - 8, user_today($1) - 2, interval '1 day') g(d0), lateral (select d0::date d) x where extract(isodow from d) = 7 order by d desc limit 1`, [user]))[0].o

  it('domingo: si ahorraste más de lo que comió el Dragón, +5; si no, el Dragón se come el bonus', async () => {
    await sync(A)
    const { habit } = await ahorroGoal(A)
    const o = await lastSunday(A)
    await logDays(habit, A, [o])
    await setState(A, { back: o + 1 })
    await sync(A)
    expect(await admin(`select kind, pl from league_events where user_id = $1 and kind in ('semana','dragon')`, [A])).toEqual([{ kind: 'semana', pl: 5 }])

    await sync(B)
    const b = await ahorroGoal(B)
    await logDays(b.habit, B, [o])
    await admin(`insert into daily_judgments (user_id, day, answers, scores, total) values ($1, user_today($1) - $2::int, '{"gasto": 50}', '{}', 0)`, [B, o])
    await setState(B, { back: o + 1 })
    await sync(B)
    expect(await admin(`select kind, pl from league_events where user_id = $1 and kind in ('semana','dragon')`, [B])).toEqual([{ kind: 'dragon', pl: 0 }])
  })

  it('hitos del cofre al 25 y 50 % dan PL una sola vez', async () => {
    await sync(A)
    const { goal } = await ahorroGoal(A, 100)
    await as(A, `insert into goal_entries (goal_id, amount) values ($1, 55)`, [goal])
    await sync(A)
    await sync(A)
    expect(await admin(`select pl, detail->>'pct' pct from league_events where user_id = $1 and kind = 'hito' order by pl`, [A]))
      .toEqual([{ pl: 5, pct: '25' }, { pl: 10, pct: '50' }])
    expect((await state(A)).pl).toBe(15)
  })
})

describe('liga del grupo y cofres compartidos', () => {
  async function group() {
    const [g] = await as<{ id: string; invite_code: string }>(A, `select * from create_group('Amigos', 66)`)
    await as(B, `select join_group($1)`, [g.invite_code])
    return g.id
  }

  it('el grupo ve etapa y total del Juicio; el detalle solo si la persona lo comparte', async () => {
    const g = await group()
    await ready(A)
    await as(A, `select submit_judgment('{"comida": true}'::jsonb)`)
    type Row = { user_id: string; stage: string; last_total: number | null; last_detail: unknown }
    let rows = await as<Row>(B, `select * from group_league($1)`, [g])
    const a = rows.find((r) => r.user_id === A)!
    expect(a.stage).toBe('camello')
    expect(a.last_total).not.toBeNull()
    expect(a.last_detail).toBeNull()
    expect((await as<Row>(A, `select * from group_league($1)`, [g])).find((r) => r.user_id === A)!.last_detail).not.toBeNull()
    await as(A, `insert into user_settings (share_judgment) values (true)`)
    rows = await as<Row>(B, `select * from group_league($1)`, [g])
    expect(rows.find((r) => r.user_id === A)!.last_detail).not.toBeNull()
    expect(await as(C, `select * from group_league($1)`, [g])).toHaveLength(0)
  })

  it('cofre compartido: aportan los miembros, se ve el total y quién puso cuánto; afuera no se ve', async () => {
    const g = await group()
    const [c] = await as<{ id: string }>(A, `insert into group_chests (group_id, title, target) values ($1, 'Viaje', 1000) returning id`, [g])
    await as(A, `insert into group_chest_entries (chest_id, amount) values ($1, 100)`, [c.id])
    await as(B, `insert into group_chest_entries (chest_id, amount) values ($1, 250)`, [c.id])
    await expect(as(C, `insert into group_chest_entries (chest_id, amount) values ($1, 5)`, [c.id])).rejects.toThrow(/row-level security/)
    const [row] = await as<{ total: string; contributions: { username: string; amount: number }[] }>(B, `select * from group_chest_list($1)`, [g])
    expect(Number(row.total)).toBe(350)
    expect(row.contributions.map((x) => Number(x.amount))).toEqual([250, 100])
    expect(await as(C, `select * from group_chests`)).toHaveLength(0)
  })
})
