// Juicio de la mañana y cofres del grupo (004, con los cambios de la 007/008: sin liga) sobre PGlite con stubs.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { MIGRATIONS } from './harness'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const FILES = MIGRATIONS
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
/** Deja a la persona con plan desde antes de ayer (el Juicio lo exige desde la 007). */
const ready = (user: string) => admin(`insert into plans (user_id, effective_from) values ($1, '2000-01-01') on conflict do nothing`, [user])

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

  it('sin responder se pregunta todo; con tabaco «no» no aparece fumar; la persona puede activarlo', async () => {
    let q = await ids(A)
    expect(q.filter((x) => x.kind === 'core').map((x) => x.id)).toEqual(['comida', 'fumar', 'alcohol', 'gasto', 'ahorro', 'disfrute'])
    await as(A, `select set_area_answers('{"tabaco":"no","alcohol":"poco"}'::jsonb)`)
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
    await as(A, `select set_area_answers('{"tabaco":"mucho","alcohol":"no"}'::jsonb)`)
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

  it('el cliente no puede escribir juicios directo; la liga ya no existe (008)', async () => {
    await expect(as(A, `insert into daily_judgments (user_id, day, answers, scores, total) values ($1, current_date, '{}', '{}', 100)`, [A])).rejects.toThrow(/permission denied/)
    expect(await admin(`select to_regclass('public.league_state') t, to_regclass('public.league_events') e`)).toEqual([{ t: null, e: null }])
    expect(await admin(`select proname from pg_proc where proname in ('league_sync', 'group_league')`)).toEqual([])
  })
})

describe('cofres compartidos', () => {
  async function group() {
    const [g] = await as<{ id: string; invite_code: string }>(A, `select * from create_group('Amigos', 66)`)
    await as(B, `select join_group($1)`, [g.invite_code])
    return g.id
  }

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
