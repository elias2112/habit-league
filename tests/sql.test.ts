// Tests del esquema SQL sobre PGlite (Postgres en WASM) con un stub mínimo de Supabase:
// roles anon/authenticated, esquema auth con auth.users y auth.uid() leyendo el JWT simulado.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Mismo orden que en Supabase: esquema base y luego migraciones.
const schema = ['../supabase/schema.sql', '../supabase/migrations/002_quiz_personas_puntos.sql']
  .map((p) => readFileSync(new URL(p, import.meta.url), 'utf8'))
  .join('\n')

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
`

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c' // no comparte grupo

let db: PGlite

/** Ejecuta como un usuario autenticado (RLS activa). */
async function as<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
/** Ejecuta como superusuario (prepara datos sin RLS). */
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows

const today = (tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

beforeAll(async () => {
  db = new PGlite()
  await db.exec(STUB)
  await db.exec(schema)
})

beforeEach(async () => {
  await db.exec(`truncate auth.users cascade;`)
  await db.exec(`
    insert into auth.users (id, email) values
      ('${A}', 'ana.lopez+test@example.com'),
      ('${B}', 'b@example.com'),
      ('${C}', 'carla@example.com');
  `)
})

async function groupAB() {
  const [g] = await as<{ id: string; invite_code: string }>(A, `select * from create_group('Amigos', 66)`)
  await as(B, `select join_group($1)`, [g.invite_code.toUpperCase()])
  return g
}

async function habit(user: string, name = 'Leer', xp = 10) {
  const [h] = await as<{ id: string }>(user, `insert into habits (user_id, name, xp_value) values ($1, $2, $3) returning id`, [user, name, xp])
  return h.id
}

describe('alta de usuario', () => {
  it('crea perfil con username saneado y válido', async () => {
    const rows = await admin<{ id: string; username: string }>(`select id, username from profiles order by id`)
    expect(rows).toHaveLength(3)
    expect(rows[0].username).toBe('analopeztest_000000')
    for (const r of rows) expect(r.username).toMatch(/^[A-Za-z0-9_]{3,24}$/)
  })

  it('acepta emails con parte local muy larga o vacía de caracteres válidos', async () => {
    await admin(`insert into auth.users (id, email) values (gen_random_uuid(), $1), (gen_random_uuid(), '...@x.com'), (gen_random_uuid(), null)`,
      ['a'.repeat(60) + '@example.com'])
    const rows = await admin<{ username: string }>(`select username from profiles`)
    expect(rows).toHaveLength(6)
    for (const r of rows) expect(r.username).toMatch(/^[A-Za-z0-9_]{3,24}$/)
  })

  it('rechaza zona horaria inválida y acepta una válida', async () => {
    await expect(as(A, `update profiles set timezone = 'Marte/Olympus' where id = $1`, [A])).rejects.toThrow(/Zona horaria inválida/)
    await as(A, `update profiles set timezone = 'America/Bogota' where id = $1`, [A])
    expect((await admin<{ timezone: string }>(`select timezone from profiles where id = $1`, [A]))[0].timezone).toBe('America/Bogota')
  })

  it('no permite editar el perfil de otro', async () => {
    await as(A, `update profiles set display_name = 'hack' where id = $1`, [B])
    expect((await admin<{ display_name: string | null }>(`select display_name from profiles where id = $1`, [B]))[0].display_name).toBeNull()
  })
})

describe('grupos y RLS', () => {
  it('create_group + join_group (código sin distinguir mayúsculas)', async () => {
    const g = await groupAB()
    const members = await as(B, `select user_id from group_members where group_id = $1`, [g.id])
    expect(members).toHaveLength(2)
  })

  it('código inválido da error', async () => {
    await expect(as(C, `select join_group('nope1234')`)).rejects.toThrow(/inválido/)
  })

  it('anon no puede llamar RPC ni leer tablas', async () => {
    await db.exec(`set role anon`)
    try {
      await expect(db.query(`select * from create_group('x')`)).rejects.toThrow(/permission denied/)
      await expect(db.query(`select * from profiles`)).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec(`reset role`)
    }
  })

  it('un usuario fuera del grupo no ve perfiles, hábitos, logs, grupo ni ranking', async () => {
    const g = await groupAB()
    const h = await habit(A)
    await as(A, `select set_habit_done($1, true)`, [h])

    expect(await as(C, `select * from profiles`)).toHaveLength(1) // solo el suyo
    expect(await as(C, `select * from habits`)).toHaveLength(0)
    expect(await as(C, `select * from habit_logs`)).toHaveLength(0)
    expect(await as(C, `select * from groups`)).toHaveLength(0)
    expect(await as(C, `select * from group_members`)).toHaveLength(0)
    expect(await as(C, `select * from group_leaderboard($1)`, [g.id])).toHaveLength(0)
    expect(await as(C, `select * from group_feed($1)`, [g.id])).toHaveLength(0)
    expect((await as<{ s: number }>(C, `select user_streak($1) s`, [A]))[0].s).toBe(0)
  })

  it('compañeros sí ven perfiles, hábitos y logs del otro', async () => {
    await groupAB()
    const h = await habit(A)
    await as(A, `select set_habit_done($1, true)`, [h])
    expect(await as(B, `select * from profiles`)).toHaveLength(2)
    expect(await as(B, `select * from habits`)).toHaveLength(1)
    expect(await as(B, `select * from habit_logs`)).toHaveLength(1)
  })

  it('no se pueden crear ni marcar hábitos ajenos', async () => {
    await groupAB()
    await expect(as(B, `insert into habits (user_id, name) values ($1, 'x')`, [A])).rejects.toThrow(/row-level security/)
    const h = await habit(A)
    await expect(as(B, `select set_habit_done($1, true)`, [h])).rejects.toThrow(/row-level security/)
    await expect(as(B, `insert into habit_logs (habit_id, user_id, log_date) values ($1, $2, current_date)`, [h, B])).rejects.toThrow(/row-level security|día de hoy/)
  })

  it('salir del grupo quita el acceso', async () => {
    const g = await groupAB()
    await as(B, `delete from group_members where group_id = $1 and user_id = $2`, [g.id, B])
    expect(await as(B, `select * from groups`)).toHaveLength(0)
    expect(await as(B, `select * from profiles`)).toHaveLength(1)
  })
})

describe('checks del día', () => {
  it('set_habit_done marca hoy, es idempotente y se puede desmarcar', async () => {
    const h = await habit(A, 'Correr', 25)
    await as(A, `select set_habit_done($1, true)`, [h])
    await as(A, `select set_habit_done($1, true)`, [h])
    let logs = await as<{ log_date: string; xp: number }>(A, `select log_date::text, xp from habit_logs`)
    expect(logs).toEqual([{ log_date: today('Europe/Madrid'), xp: 25 }])
    await as(A, `select set_habit_done($1, false)`, [h])
    logs = await as(A, `select * from habit_logs`)
    expect(logs).toHaveLength(0)
  })

  it('"hoy" sigue la zona horaria del perfil', async () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Madrid']) {
      await admin(`update profiles set timezone = $1 where id = $2`, [tz, A])
      const [r] = await as<{ d: string }>(A, `select user_today($1)::text d`, [A])
      expect(r.d).toBe(today(tz))
    }
  })

  it('local_date: el mismo instante cae en días distintos según la zona', async () => {
    const [r] = await admin<{ madrid: string; bogota: string; tokyo: string }>(`
      select local_date('2026-03-01 23:30+00', 'Europe/Madrid')::text madrid,
             local_date('2026-03-01 23:30+00', 'America/Bogota')::text bogota,
             local_date('2026-03-01 14:59+00', 'Asia/Tokyo')::text tokyo`)
    expect(r).toEqual({ madrid: '2026-03-02', bogota: '2026-03-01', tokyo: '2026-03-01' })
  })

  it('local_date respeta el cambio de hora (DST) en Madrid', async () => {
    // 29-mar-2026 a las 01:00 UTC pasa de UTC+1 a UTC+2; 25-oct-2026 a las 01:00 UTC vuelve.
    const [r] = await admin<{ a: string; b: string; c: string }>(`
      select local_date('2026-03-28 22:30+00', 'Europe/Madrid')::text a,
             local_date('2026-10-24 21:59+00', 'Europe/Madrid')::text b,
             local_date('2026-10-24 22:00+00', 'Europe/Madrid')::text c`)
    expect(r).toEqual({ a: '2026-03-28', b: '2026-10-24', c: '2026-10-25' })
  })

  it('no se puede insertar ni borrar un check de un día pasado', async () => {
    const h = await habit(A)
    await expect(as(A, `insert into habit_logs (habit_id, user_id, log_date) values ($1, $2, user_today($2) - 1)`, [h, A])).rejects.toThrow(/row-level security|día de hoy/)
    await admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - 1)`, [h, A])
    await as(A, `delete from habit_logs where habit_id = $1`, [h])
    expect(await admin(`select * from habit_logs`)).toHaveLength(1)
  })

  it('el XP queda fijado al marcar (editar el hábito no cambia el pasado)', async () => {
    const h = await habit(A, 'Leer', 10)
    await as(A, `select set_habit_done($1, true)`, [h])
    await as(A, `update habits set xp_value = 100 where id = $1`, [h])
    expect((await as<{ xp: number }>(A, `select xp from habit_logs`))[0].xp).toBe(10)
  })
})

describe('racha (streak_as_of)', () => {
  async function logDays(user: string, habitId: string, dates: string[]) {
    for (const d of dates) await admin(`insert into habit_logs (habit_id, log_date) values ($1, $2)`, [habitId, d])
    void user
  }
  const streak = async (user: string, d: string) =>
    (await admin<{ s: number }>(`select streak_as_of($1, $2::date) s`, [user, d]))[0].s

  it('sin registros = 0', async () => {
    expect(await streak(A, '2026-05-10')).toBe(0)
  })

  it('cuenta días consecutivos terminando hoy', async () => {
    const h = await habit(A)
    await logDays(A, h, ['2026-05-08', '2026-05-09', '2026-05-10'])
    expect(await streak(A, '2026-05-10')).toBe(3)
  })

  it('si hoy aún no marcó, la racha de ayer sigue viva', async () => {
    const h = await habit(A)
    await logDays(A, h, ['2026-05-08', '2026-05-09'])
    expect(await streak(A, '2026-05-10')).toBe(2)
  })

  it('un día completo sin hábitos rompe la racha', async () => {
    const h = await habit(A)
    await logDays(A, h, ['2026-05-07', '2026-05-08'])
    expect(await streak(A, '2026-05-10')).toBe(0)
  })

  it('un día saltado parte la racha en dos y solo cuenta el último tramo', async () => {
    const h = await habit(A)
    await logDays(A, h, ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-05', '2026-05-06'])
    expect(await streak(A, '2026-05-06')).toBe(2)
  })

  it('varios hábitos el mismo día cuentan como un solo día', async () => {
    const h1 = await habit(A, 'Leer')
    const h2 = await habit(A, 'Correr')
    await logDays(A, h1, ['2026-05-09', '2026-05-10'])
    await logDays(A, h2, ['2026-05-10'])
    expect(await streak(A, '2026-05-10')).toBe(2)
  })

  it('cruza fin de mes y de año', async () => {
    const h = await habit(A)
    await logDays(A, h, ['2026-12-30', '2026-12-31', '2027-01-01'])
    expect(await streak(A, '2027-01-01')).toBe(3)
    const h2 = await habit(B)
    await logDays(B, h2, ['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(await streak(B, '2028-03-01')).toBe(3)
  })

  it('ignora registros con fecha posterior a "hoy"', async () => {
    const h = await habit(A)
    await logDays(A, h, ['2026-05-09', '2026-05-10', '2026-05-12'])
    expect(await streak(A, '2026-05-10')).toBe(2)
  })

  it('los registros de otro usuario no cuentan', async () => {
    const h = await habit(B)
    await logDays(B, h, ['2026-05-10'])
    expect(await streak(A, '2026-05-10')).toBe(0)
  })
})

async function habitT(user: string, name: string, tier: number) {
  const [h] = await as<{ id: string }>(user, `insert into habits (user_id, name, tier) values ($1, $2, $3) returning id`, [user, name, tier])
  return h.id
}
const pts = async (user: string) =>
  Number((await admin<{ s: string }>(`select coalesce(sum(points),0)::text s from habit_logs where user_id = $1 and log_date = user_today($1)`, [user]))[0].s)

describe('puntos normalizados (002)', () => {
  it('puntos = 100 * tier / suma de tiers activos; día perfecto ≈ 100', async () => {
    const h1 = await habitT(A, 'Caminar', 1)
    const h2 = await habitT(A, 'Leer', 2)
    const h3 = await habitT(A, 'Fuerza', 3)
    await as(A, `select set_habit_done($1, true)`, [h1])
    expect(await pts(A)).toBeCloseTo(16.67, 2)
    await as(A, `select set_habit_done($1, true)`, [h2])
    await as(A, `select set_habit_done($1, true)`, [h3])
    expect(await pts(A)).toBeCloseTo(100, 1)
  })

  it('el cliente no puede fijar sus propios puntos', async () => {
    const h = await habitT(A, 'Caminar', 1)
    await habitT(A, 'Leer', 1)
    await as(A, `insert into habit_logs (habit_id, user_id, log_date, points) values ($1, $2, user_today($2), 999)`, [h, A])
    expect(await pts(A)).toBe(50)
  })

  it('tope de 100 por día aunque se agreguen hábitos a mitad de día', async () => {
    const h1 = await habitT(A, 'Uno', 1)
    await as(A, `select set_habit_done($1, true)`, [h1]) // único hábito: 100
    const h2 = await habitT(A, 'Dos', 3)
    await as(A, `select set_habit_done($1, true)`, [h2]) // valdría 75, el tope deja 0
    expect(await pts(A)).toBe(100)
  })

  it('desmarcar y volver a marcar recalcula sin pasar de 100', async () => {
    const h1 = await habitT(A, 'Uno', 1)
    const h2 = await habitT(A, 'Dos', 1)
    await as(A, `select set_habit_done($1, true)`, [h1])
    await as(A, `select set_habit_done($1, false)`, [h1])
    await as(A, `select set_habit_done($1, true)`, [h1])
    await as(A, `select set_habit_done($1, true)`, [h2])
    expect(await pts(A)).toBe(100)
  })

  it('los hábitos archivados no cuentan en la suma de tiers', async () => {
    const h1 = await habitT(A, 'Activo', 1)
    const h2 = await habitT(A, 'Archivado', 3)
    await as(A, `update habits set archived = true where id = $1`, [h2])
    await as(A, `select set_habit_done($1, true)`, [h1])
    expect(await pts(A)).toBe(100)
  })

  it('el trigger rechaza días pasados en peticiones de usuario', async () => {
    const h = await habitT(A, 'Uno', 1)
    await expect(as(A, `insert into habit_logs (habit_id, user_id, log_date) values ($1, $2, user_today($2) - 1)`, [h, A]))
      .rejects.toThrow(/día de hoy|row-level security/)
  })

  it('cada uno guarda su resultado del quiz y no puede tocar el de otro', async () => {
    await as(A, `update profiles set archetype = 'arquitecto', area_scores = '{"cuerpo":2}', quiz_completed_at = now() where id = $1`, [A])
    await as(A, `update profiles set archetype = 'hack' where id = $1`, [B])
    const rows = await admin<{ archetype: string | null }>(`select archetype from profiles where id in ($1, $2) order by id`, [A, B])
    expect(rows.map((r) => r.archetype)).toEqual(['arquitecto', null])
  })
})

describe('ranking (group_leaderboard)', () => {
  type Row = { user_id: string; total_points: string; max_points: string; pct: string | null; streak: number; username: string; archetype: string | null }

  it('suma puntos dentro de la ventana del reto, calcula max y pct', async () => {
    const g = await groupAB()
    await admin(`update groups set start_date = user_today($2) - 2, duration_days = 3 where id = $1`, [g.id, A])
    await admin(`update group_members set joined_at = now() - interval '5 days' where group_id = $1`, [g.id])
    const ha = await habitT(A, 'Leer', 1)
    const hb = await habitT(B, 'Correr', 1)
    await admin(`insert into habit_logs (habit_id, log_date) values
      ($1, user_today($3) - 2), ($1, user_today($3) - 1),
      ($1, user_today($3) - 3),
      ($2, user_today($3))`, [ha, hb, A]) // el de hace 3 días es antes del reto: no cuenta
    const rows = await as<Row>(A, `select * from group_leaderboard($1)`, [g.id])
    expect(rows.map((r) => [r.user_id, Number(r.total_points), Number(r.max_points)])).toEqual([[A, 200, 300], [B, 100, 300]])
    expect(Number(rows[0].pct)).toBeCloseTo(66.7, 1)
  })

  it('quien entra tarde se compara por pct sobre sus propios días', async () => {
    const g = await groupAB()
    await admin(`update groups set start_date = user_today($2) - 9 where id = $1`, [g.id, A])
    await admin(`update group_members set joined_at = now() - interval '20 days' where user_id = $1`, [A])
    const hb = await habitT(B, 'Correr', 1) // B entró hoy
    await as(B, `select set_habit_done($1, true)`, [hb])
    const rows = await as<Row>(A, `select * from group_leaderboard($1)`, [g.id])
    const a = rows.find((r) => r.user_id === A)!
    const b = rows.find((r) => r.user_id === B)!
    expect([Number(b.max_points), Number(b.pct)]).toEqual([100, 100])
    expect([Number(a.max_points), Number(a.pct)]).toEqual([1000, 0])
  })

  it('reto que aún no empezó: max 0 y pct null', async () => {
    const g = await groupAB()
    await admin(`update groups set start_date = user_today($2) + 3 where id = $1`, [g.id, A])
    const rows = await as<Row>(A, `select * from group_leaderboard($1)`, [g.id])
    expect(rows.every((r) => Number(r.max_points) === 0 && r.pct === null)).toBe(true)
  })

  it('miembros sin registros aparecen con 0 y racha 0; empate ordena por username', async () => {
    const g = await groupAB()
    const rows = await as<Row>(B, `select * from group_leaderboard($1)`, [g.id])
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => Number(r.total_points) === 0 && r.streak === 0)).toBe(true)
    expect(rows.map((r) => r.username)).toEqual([...rows.map((r) => r.username)].sort())
  })

  it('la racha refleja el check de hoy y se ve el arquetipo', async () => {
    const g = await groupAB()
    await admin(`update profiles set archetype = 'nomada' where id = $1`, [A])
    const h = await habit(A)
    await admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - 1)`, [h, A])
    await as(A, `select set_habit_done($1, true)`, [h])
    const rows = await as<Row>(B, `select * from group_leaderboard($1)`, [g.id])
    expect(rows.find((r) => r.user_id === A)).toMatchObject({ streak: 2, archetype: 'nomada' })
  })

  it('el feed muestra lo marcado por los miembros, con puntos y área', async () => {
    const g = await groupAB()
    const [{ id }] = await as<{ id: string }>(B, `insert into habits (user_id, name, tier, area) values ($1, 'Meditar', 2, 'mente') returning id`, [B])
    await as(B, `select set_habit_done($1, true)`, [id])
    const feed = await as<{ habit_name: string; points: string; habit_area: string }>(A, `select * from group_feed($1)`, [g.id])
    expect(feed).toHaveLength(1)
    expect(feed[0]).toMatchObject({ habit_name: 'Meditar', habit_area: 'mente' })
    expect(Number(feed[0].points)).toBe(100)
  })
})
