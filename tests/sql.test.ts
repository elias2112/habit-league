// Tests del esquema SQL sobre PGlite (Postgres en WASM) con un stub mínimo de Supabase:
// roles anon/authenticated, auth.users + auth.uid() leyendo el JWT simulado, y storage.buckets/objects.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import habitsJson from '../content/habits.json'

// Mismo orden que en Supabase: esquema base y luego migraciones.
const FILES = [
  '../supabase/schema.sql',
  '../supabase/migrations/002_quiz_personas_puntos.sql',
  '../supabase/migrations/003_grupo_objetivos_fotos.sql',
  '../supabase/migrations/004_liga_juicio_cofre.sql',
  '../supabase/migrations/005_vicios.sql',
]
const schema = FILES.map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n')

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
grant usage on schema storage to authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
`

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c' // no comparte grupo con A
const D = '00000000-0000-0000-0000-00000000000d'

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
  await db.exec(`truncate auth.users cascade; truncate storage.objects;`)
  await db.exec(`
    insert into auth.users (id, email) values
      ('${A}', 'ana.lopez+test@example.com'),
      ('${B}', 'b@example.com'),
      ('${C}', 'carla@example.com'),
      ('${D}', 'dani@example.com');
  `)
})

async function createGroup(owner: string, ...members: string[]) {
  const [g] = await as<{ id: string; invite_code: string }>(owner, `select * from create_group('Amigos', 66)`)
  for (const m of members) await as(m, `select join_group($1)`, [g.invite_code.toUpperCase()])
  return g
}
const groupAB = () => createGroup(A, B)

/** Hábito propio (necesita aprobación si hay más gente en el grupo). */
async function custom(user: string, name = 'Leer', tier = 1, extra: { target?: number; unit?: string } = {}) {
  const [h] = await as<{ id: string }>(user,
    `insert into habits (user_id, name, area, tier, target, unit) values ($1, $2, 'mente', $3, $4, $5) returning id`,
    [user, name, tier, extra.target ?? 1, extra.unit ?? null])
  return h.id
}
/** Hábito del catálogo (no necesita aprobación). */
async function cat(user: string, catalogId: string, priv = false) {
  const [h] = await as<{ id: string }>(user,
    `insert into habits (user_id, name, catalog_id, private) values ($1, 'x', $2, $3) returning id`, [user, catalogId, priv])
  return h.id
}
const done = (user: string, h: string, v = true) => as(user, `select set_habit_done($1, $2)`, [h, v])
const pts = async (user: string) =>
  Number((await admin<{ s: string }>(`select coalesce(sum(points),0)::text s from habit_logs where user_id = $1 and log_date = user_today($1)`, [user]))[0].s)

// ─────────────────────────────────────────────────────────────────────────────

describe('alta de usuario y perfil', () => {
  it('crea perfil con username saneado y válido', async () => {
    const rows = await admin<{ id: string; username: string }>(`select id, username from profiles order by id`)
    expect(rows).toHaveLength(4)
    expect(rows[0].username).toBe('analopeztest_000000')
    for (const r of rows) expect(r.username).toMatch(/^[A-Za-z0-9_]{3,24}$/)
  })

  it('acepta emails con parte local muy larga o sin caracteres válidos', async () => {
    await admin(`insert into auth.users (id, email) values (gen_random_uuid(), $1), (gen_random_uuid(), '...@x.com'), (gen_random_uuid(), null)`,
      ['a'.repeat(60) + '@example.com'])
    for (const r of await admin<{ username: string }>(`select username from profiles`)) expect(r.username).toMatch(/^[A-Za-z0-9_]{3,24}$/)
  })

  it('cuenta sin perfil (creada antes del esquema): ensure_profile lo crea; re-ejecutar 003 también', async () => {
    await admin(`delete from profiles where id = $1`, [A])
    expect(await as(A, `select id from profiles where id = $1`, [A])).toHaveLength(0)
    await as(A, `select ensure_profile()`)
    await as(A, `select ensure_profile()`) // idempotente
    expect(await as<{ username: string }>(A, `select username from profiles where id = $1`, [A])).toEqual([{ username: 'analopeztest_000000' }])

    await admin(`delete from profiles where id = $1`, [B])
    await db.exec(readFileSync(new URL(FILES[2], import.meta.url), 'utf8'))
    expect(await admin(`select id from profiles where id = $1`, [B])).toHaveLength(1)
  })

  it('rechaza zona horaria inválida y acepta una válida', async () => {
    await expect(as(A, `update profiles set timezone = 'Marte/Olympus' where id = $1`, [A])).rejects.toThrow(/Zona horaria inválida/)
    await as(A, `update profiles set timezone = 'America/Bogota' where id = $1`, [A])
    expect((await admin<{ timezone: string }>(`select timezone from profiles where id = $1`, [A]))[0].timezone).toBe('America/Bogota')
  })

  it('no permite editar el perfil de otro', async () => {
    await as(A, `update profiles set display_name = 'hack', archetype = 'hack' where id = $1`, [B])
    expect((await admin<{ display_name: string | null }>(`select display_name from profiles where id = $1`, [B]))[0].display_name).toBeNull()
  })

  it('las respuestas del quiz son privadas: se pueden escribir pero nadie las lee desde la app', async () => {
    await groupAB()
    await as(A, `update profiles set quiz_answers = '{"q21":"c"}', archetype = 'fenix' where id = $1`, [A])
    await expect(as(B, `select quiz_answers from profiles where id = $1`, [A])).rejects.toThrow(/permission denied/)
    await expect(as(A, `select quiz_answers from profiles where id = $1`, [A])).rejects.toThrow(/permission denied/)
    expect(await as(B, `select archetype from profiles where id = $1`, [A])).toEqual([{ archetype: 'fenix' }])
  })
})

describe('anon (sin sesión)', () => {
  it('no puede llamar RPC ni leer o escribir tablas', async () => {
    await db.exec(`set role anon`)
    try {
      for (const sql of [`select * from create_group('x')`, `select * from profiles`, `select * from habits`,
        `select * from catalog_habits`, `select * from goals`, `insert into goals (title, kind, target, unit) values ('x','general',1,'x')`]) {
        await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      }
    } finally {
      await db.exec(`reset role`)
    }
  })
})

describe('grupos y visibilidad', () => {
  it('create_group + join_group (código sin distinguir mayúsculas); código inválido da error', async () => {
    const g = await groupAB()
    expect(await as(B, `select user_id from group_members where group_id = $1`, [g.id])).toHaveLength(2)
    await expect(as(C, `select join_group('nope1234')`)).rejects.toThrow(/inválido/)
  })

  it('fuera del grupo no se ve nada: perfiles, hábitos, logs, grupo, ranking, feed, radar, objetivos', async () => {
    const g = await groupAB()
    const h = await cat(A, 'caminar_30')
    await done(A, h)
    await as(A, `insert into goals (title, kind, target, unit) values ('Celular', 'ahorro', 800, '€')`)
    expect(await as(C, `select id from profiles`)).toHaveLength(1)
    expect(await as(C, `select * from habits`)).toHaveLength(0)
    expect(await as(C, `select * from habit_logs`)).toHaveLength(0)
    expect(await as(C, `select * from groups`)).toHaveLength(0)
    expect(await as(C, `select * from goals`)).toHaveLength(0)
    expect(await as(C, `select * from group_leaderboard($1)`, [g.id])).toHaveLength(0)
    expect(await as(C, `select * from group_feed($1)`, [g.id])).toHaveLength(0)
    expect(await as(C, `select * from area_radar($1)`, [A])).toHaveLength(0)
    expect(await as(C, `select * from goal_list($1)`, [A])).toHaveLength(0)
    expect((await as<{ s: number }>(C, `select user_streak($1) s`, [A]))[0].s).toBe(0)
  })

  it('compañeros ven perfil, logs y objetivos del otro, pero no su tabla de hábitos (va enmascarada por RPC)', async () => {
    await groupAB()
    const h = await cat(A, 'caminar_30')
    await done(A, h)
    await as(A, `insert into goals (title, kind, target, unit) values ('Celular', 'ahorro', 800, '€')`)
    expect(await as(B, `select id from profiles`)).toHaveLength(2)
    expect(await as(B, `select * from habit_logs`)).toHaveLength(1)
    expect(await as(B, `select * from goal_list($1)`, [A])).toHaveLength(1)
    expect(await as(B, `select * from habits`)).toHaveLength(0)
  })

  it('no se pueden crear hábitos ajenos ni marcar hábitos ajenos', async () => {
    await groupAB()
    await expect(as(B, `insert into habits (user_id, name, area) values ($1, 'x', 'mente')`, [A])).rejects.toThrow(/row-level security/)
    const h = await cat(A, 'caminar_30')
    await expect(done(B, h)).rejects.toThrow(/inexistente/)
    await expect(as(B, `select add_habit_progress($1, 1)`, [h])).rejects.toThrow(/inexistente/)
    await expect(as(B, `insert into habit_logs (habit_id, log_date) values ($1, current_date)`, [h])).rejects.toThrow(/permission denied/)
  })

  it('salir del grupo quita el acceso', async () => {
    const g = await groupAB()
    await as(B, `delete from group_members where group_id = $1 and user_id = $2`, [g.id, B])
    expect(await as(B, `select * from groups`)).toHaveLength(0)
    expect(await as(B, `select id from profiles`)).toHaveLength(1)
  })
})

describe('catálogo en la base', () => {
  it('coincide con content/habits.json', async () => {
    const rows = await admin<{ id: string; tier: number; target: number; area: string; private_default: boolean }>(
      `select id, tier, target, area, private_default from catalog_habits order by id`)
    const expected = habitsJson.habits
      .map((h) => ({ id: h.id, tier: h.tier, target: (h as { target?: number }).target ?? 1, area: h.area,
        private_default: Boolean((h as { private_default?: boolean }).private_default) }))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(rows).toEqual(expected)
  })

  it('un hábito de catálogo toma nombre, área, dificultad y meta del catálogo (no del cliente)', async () => {
    await as(A, `insert into habits (user_id, name, catalog_id, tier, area, target) values ($1, 'trucho', 'agua_2l', 4, 'foco', 1)`, [A])
    const [h] = await as<{ name: string; tier: number; area: string; target: number; unit: string }>(A, `select name, tier, area, target, unit from habits`)
    expect(h).toEqual({ name: 'Tomar 2 litros de agua', tier: 1, area: 'alimentacion', target: 8, unit: 'vasos' })
    await expect(as(A, `insert into habits (user_id, name, catalog_id) values ($1, 'x', 'no_existe')`, [A])).rejects.toThrow(/inexistente/)
  })

  it('los hábitos propios no pueden ser privados, necesitan área y solo se les baja la dificultad', async () => {
    await expect(as(A, `insert into habits (user_id, name) values ($1, 'x')`, [A])).rejects.toThrow(/área/)
    const [{ id, private: p }] = await as<{ id: string; private: boolean }>(A,
      `insert into habits (user_id, name, area, tier, private) values ($1, 'Guitarra', 'mente', 3, true) returning id, private`, [A])
    expect(p).toBe(false)
    await expect(as(A, `update habits set tier = 4 where id = $1`, [id])).rejects.toThrow(/no se puede modificar/)
    await expect(as(A, `update habits set name = 'Otra cosa' where id = $1`, [id])).rejects.toThrow(/no se puede modificar/)
    await as(A, `update habits set tier = 2 where id = $1`, [id])
    await as(A, `update habits set archived = true where id = $1`, [id])
    expect(await as(A, `select tier, archived from habits where id = $1`, [id])).toEqual([{ tier: 2, archived: true }])
  })
})

describe('checks del día', () => {
  it('set_habit_done marca hoy, es idempotente y se puede desmarcar', async () => {
    const h = await cat(A, 'fuerza_30')
    await done(A, h)
    await done(A, h)
    let logs = await as<{ log_date: string; count: number }>(A, `select log_date::text, count from habit_logs`)
    expect(logs).toEqual([{ log_date: today('Europe/Madrid'), count: 1 }])
    await done(A, h, false)
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

  it('local_date: mismo instante, distinto día según la zona; respeta el cambio de hora', async () => {
    const [r] = await admin<Record<string, string>>(`
      select local_date('2026-03-01 23:30+00', 'Europe/Madrid')::text madrid,
             local_date('2026-03-01 23:30+00', 'America/Bogota')::text bogota,
             local_date('2026-10-24 21:59+00', 'Europe/Madrid')::text antes_dst,
             local_date('2026-10-24 22:00+00', 'Europe/Madrid')::text despues_dst`)
    expect(r).toEqual({ madrid: '2026-03-02', bogota: '2026-03-01', antes_dst: '2026-10-24', despues_dst: '2026-10-25' })
  })

  it('el trigger rechaza días pasados si viene de un usuario (aunque sea por RPC)', async () => {
    const h = await cat(A, 'caminar_30')
    await admin(`grant insert on habit_logs to authenticated`)
    try {
      await expect(as(A, `insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - 1)`, [h, A]))
        .rejects.toThrow(/día de hoy|row-level security/)
    } finally {
      await admin(`revoke insert on habit_logs from authenticated`)
    }
  })
})

describe('puntos y por partes', () => {
  it('puntos = 100 * tier / suma de tiers activos; día perfecto ≈ 100', async () => {
    const h1 = await cat(A, 'caminar_30')   // 1
    const h2 = await cat(A, 'ejercicio_20') // 2
    const h3 = await cat(A, 'fuerza_30')    // 3
    await done(A, h1)
    expect(await pts(A)).toBeCloseTo(16.67, 2)
    await done(A, h2)
    await done(A, h3)
    expect(await pts(A)).toBeCloseTo(100, 1)
  })

  it('por partes: cada vaso suma su fracción; completar = meta; restar y borrar', async () => {
    const agua = await cat(A, 'agua_2l') // tier 1, 8 vasos
    await cat(A, 'caminar_30')           // tier 1 → agua vale 50
    expect((await as<{ n: number }>(A, `select add_habit_progress($1, 1) n`, [agua]))[0].n).toBe(1)
    expect(await pts(A)).toBe(6.25)
    await as(A, `select add_habit_progress($1, 3)`, [agua])
    expect(await pts(A)).toBe(25)
    await as(A, `select add_habit_progress($1, 10)`, [agua]) // pasarse no da más
    expect(await pts(A)).toBe(50)
    expect((await as<{ n: number }>(A, `select add_habit_progress($1, -20) n`, [agua]))[0].n).toBe(0)
    expect(await as(A, `select * from habit_logs`)).toHaveLength(0)
    await done(A, agua)
    expect(await as(A, `select count, target from habit_logs`)).toEqual([{ count: 8, target: 8 }])
  })

  it('la racha solo cuenta hábitos completos', async () => {
    const agua = await cat(A, 'agua_2l')
    await as(A, `select add_habit_progress($1, 3)`, [agua])
    expect((await as<{ s: number }>(A, `select user_streak($1) s`, [A]))[0].s).toBe(0)
    await as(A, `select add_habit_progress($1, 5)`, [agua])
    expect((await as<{ s: number }>(A, `select user_streak($1) s`, [A]))[0].s).toBe(1)
  })

  it('tope de 100 por día aunque se agreguen hábitos a mitad de día', async () => {
    const h1 = await cat(A, 'caminar_30')
    await done(A, h1) // único: 100
    const h2 = await cat(A, 'fuerza_30')
    await done(A, h2)
    expect(await pts(A)).toBe(100)
  })

  it('los archivados no cuentan en la suma de tiers', async () => {
    const h1 = await cat(A, 'caminar_30')
    const h2 = await cat(A, 'fuerza_30')
    await as(A, `update habits set archived = true where id = $1`, [h2])
    await done(A, h1)
    expect(await pts(A)).toBe(100)
  })

  it('el XP viejo queda congelado aunque cambie el hábito (compatibilidad)', async () => {
    const h = await custom(A, 'Leer', 2)
    await done(A, h)
    await as(A, `update habits set tier = 1 where id = $1`, [h])
    expect(Number((await as<{ points: string }>(A, `select points from habit_logs`))[0].points)).toBe(100)
  })
})

describe('aprobación de hábitos propios', () => {
  type Review = { status: string; yes: number; no: number; others: number; my_vote: boolean | null; habit_name: string }
  const review = async (user: string, g: string) => (await as<Review>(user, `select * from group_reviews($1)`, [g]))[0]
  const vote = (user: string, h: string, g: string, ok: boolean) =>
    as<{ s: string }>(user, `select vote_habit($1, $2, $3) s`, [h, g, ok]).then((r) => r[0].s)

  it('solo en un grupo propio se aprueba sola; al entrar alguien vuelve a pendiente', async () => {
    const g = await createGroup(A)
    await custom(A, 'Guitarra', 3)
    expect((await review(A, g.id)).status).toBe('approved')
    await as(B, `select join_group($1)`, [g.invite_code])
    expect((await review(A, g.id)).status).toBe('pending')
  })

  it('≥ 50 % del resto aprueba: con 2 compañeros alcanza 1 voto a favor', async () => {
    const g = await createGroup(A, B, C)
    const h = await custom(A, 'Guitarra', 4)
    expect(await review(B, g.id)).toMatchObject({ status: 'pending', others: 2, habit_name: 'Guitarra' })
    expect(await vote(B, h, g.id, true)).toBe('approved')
  })

  it('con 3 compañeros: 1 a favor no alcanza; 2 en contra no rechaza; 2 a favor aprueba', async () => {
    const g = await createGroup(A, B, C, D)
    const h = await custom(A, 'Guitarra', 2)
    expect(await vote(B, h, g.id, true)).toBe('pending')
    expect(await vote(C, h, g.id, false)).toBe('pending')
    expect(await vote(D, h, g.id, true)).toBe('approved')
  })

  it('rechazado (> 50 % en contra) no suma nunca y se archiva si no queda en ningún grupo', async () => {
    const g = await createGroup(A, B)
    const h = await custom(A, 'Mirar series', 4)
    await done(A, h)
    expect(await vote(B, h, g.id, false)).toBe('rejected')
    const [row] = await as<{ total_points: string }>(B, `select * from group_leaderboard($1) where user_id = $2`, [g.id, A])
    expect(Number(row.total_points)).toBe(0)
    expect(await as(A, `select archived from habits where id = $1`, [h])).toEqual([{ archived: true }])
  })

  it('pendiente no suma en el ranking; al aprobarse suman también los checks de antes', async () => {
    const g = await createGroup(A, B)
    const h = await custom(A, 'Guitarra', 2)
    await done(A, h)
    const total = async () => Number((await as<{ total_points: string }>(B, `select * from group_leaderboard($1) where user_id = $2`, [g.id, A]))[0].total_points)
    expect(await total()).toBe(0)
    await vote(B, h, g.id, true)
    expect(await total()).toBe(100)
  })

  it('cada grupo decide por su cuenta', async () => {
    const g1 = await createGroup(A, B)
    const [g2] = await as<{ id: string; invite_code: string }>(A, `select * from create_group('Trabajo', 30)`)
    await as(C, `select join_group($1)`, [g2.invite_code])
    const h = await custom(A, 'Guitarra', 2)
    await vote(B, h, g1.id, true)
    await vote(C, h, g2.id, false)
    const st = await as<{ group_id: string; status: string }>(A, `select group_id, status from my_habit_reviews() order by group_name`)
    expect(Object.fromEntries(st.map((r) => [r.group_id, r.status]))).toEqual({ [g1.id]: 'approved', [g2.id]: 'rejected' })
    expect(await as(A, `select archived from habits where id = $1`, [h])).toEqual([{ archived: false }])
  })

  it('no se vota lo propio, ni dos veces una votación cerrada, ni desde fuera del grupo', async () => {
    const g = await createGroup(A, B)
    const h = await custom(A, 'Guitarra', 2)
    await expect(vote(A, h, g.id, true)).rejects.toThrow(/propio/)
    await expect(vote(C, h, g.id, true)).rejects.toThrow(/miembro/)
    await vote(B, h, g.id, true)
    await expect(vote(B, h, g.id, false)).rejects.toThrow(/terminó/)
  })

  it('si se va alguien, las pendientes se recalculan', async () => {
    const g = await createGroup(A, B, C, D)
    const h = await custom(A, 'Guitarra', 2)
    await vote(B, h, g.id, true) // 1 de 3: pendiente
    await as(C, `delete from group_members where group_id = $1 and user_id = $2`, [g.id, C])
    expect((await review(A, g.id)).status).toBe('approved') // 1 de 2
  })

  it('los hábitos de catálogo cuentan sin aprobación', async () => {
    const g = await createGroup(A, B)
    const h = await cat(A, 'caminar_30')
    await done(A, h)
    expect(await as(B, `select * from group_reviews($1)`, [g.id])).toHaveLength(0)
    const [row] = await as<{ total_points: string }>(B, `select * from group_leaderboard($1) where user_id = $2`, [g.id, A])
    expect(Number(row.total_points)).toBe(100)
  })
})

describe('privados y feed', () => {
  it('el feed enmascara hábitos privados ante otros (nombre y foto) pero no ante su dueño', async () => {
    const g = await groupAB()
    const h = await cat(A, 'dia_sin_fumar', true)
    await done(A, h)
    await as(A, `select set_log_photo($1, $2)`, [h, `${A}/${h}/foto.jpg`])
    const deB = (await as<{ habit_name: string; photo_path: string | null }>(B, `select * from group_feed($1)`, [g.id]))[0]
    const deA = (await as<{ habit_name: string; photo_path: string | null }>(A, `select * from group_feed($1)`, [g.id]))[0]
    expect(deB).toMatchObject({ habit_name: 'Hábito privado', photo_path: null })
    expect(deA).toMatchObject({ habit_name: 'Día sin fumar', photo_path: `${A}/${h}/foto.jpg` })
  })

  it('el feed muestra puntos, área y avance parcial', async () => {
    const g = await groupAB()
    const agua = await cat(B, 'agua_2l')
    await as(B, `select add_habit_progress($1, 3)`, [agua])
    const [f] = await as<{ habit_name: string; habit_area: string; count: number; target: number; unit: string; points: string }>(A, `select * from group_feed($1)`, [g.id])
    expect(f).toMatchObject({ habit_name: 'Tomar 2 litros de agua', habit_area: 'alimentacion', count: 3, target: 8, unit: 'vasos' })
    expect(Number(f.points)).toBe(37.5)
  })
})

describe('fotos (storage)', () => {
  const obj = (name: string) => `insert into storage.objects (bucket_id, name) values ('evidencias', '${name}')`

  it('crea el bucket privado con límite de tamaño y tipos de imagen', async () => {
    expect(await admin(`select public, file_size_limit::int as lim from storage.buckets where id = 'evidencias'`)).toEqual([{ public: false, lim: 2097152 }])
  })

  it('solo se sube a la carpeta propia; ven las fotos el dueño y su grupo, nunca las de hábitos privados', async () => {
    await groupAB()
    const pub = await cat(A, 'fuerza_30')
    const priv = await cat(A, 'dia_sin_alcohol', true)
    await expect(as(B, obj(`${A}/${pub}/x.jpg`))).rejects.toThrow(/row-level security/)
    await as(A, obj(`${A}/${pub}/x.jpg`))
    await as(A, obj(`${A}/${priv}/y.jpg`))
    expect(await as(A, `select name from storage.objects`)).toHaveLength(2)
    expect(await as<{ name: string }>(B, `select name from storage.objects`)).toEqual([{ name: `${A}/${pub}/x.jpg` }])
    expect(await as(C, `select name from storage.objects`)).toHaveLength(0)
  })

  it('set_log_photo exige ruta propia y que el hábito esté marcado hoy', async () => {
    const h = await cat(A, 'fuerza_30')
    await expect(as(A, `select set_log_photo($1, $2)`, [h, `${A}/${h}/a.jpg`])).rejects.toThrow(/Marcá el hábito/)
    await done(A, h)
    await expect(as(A, `select set_log_photo($1, $2)`, [h, `${B}/${h}/a.jpg`])).rejects.toThrow(/inválida/)
    await as(A, `select set_log_photo($1, $2)`, [h, `${A}/${h}/a.jpg`])
    expect(await as(A, `select photo_path from habit_logs`)).toEqual([{ photo_path: `${A}/${h}/a.jpg` }])
  })
})

describe('racha (streak_as_of)', () => {
  async function logDays(habitId: string, dates: string[]) {
    for (const d of dates) await admin(`insert into habit_logs (habit_id, log_date) values ($1, $2)`, [habitId, d])
  }
  const streak = async (user: string, d: string) =>
    (await admin<{ s: number }>(`select streak_as_of($1, $2::date) s`, [user, d]))[0].s

  it('sin registros = 0; consecutivos hasta hoy; si hoy no marcó, sigue viva la de ayer', async () => {
    expect(await streak(A, '2026-05-10')).toBe(0)
    const h = await cat(A, 'caminar_30')
    await logDays(h, ['2026-05-08', '2026-05-09'])
    expect(await streak(A, '2026-05-09')).toBe(2)
    expect(await streak(A, '2026-05-10')).toBe(2)
    expect(await streak(A, '2026-05-11')).toBe(0)
  })

  it('un día saltado parte la racha; varios hábitos el mismo día cuentan una vez', async () => {
    const h1 = await cat(A, 'caminar_30')
    const h2 = await cat(A, 'estirar_10')
    await logDays(h1, ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-05', '2026-05-06'])
    await logDays(h2, ['2026-05-06'])
    expect(await streak(A, '2026-05-06')).toBe(2)
  })

  it('cruza fin de mes y de año (también bisiesto); ignora fechas futuras', async () => {
    const h = await cat(A, 'caminar_30')
    await logDays(h, ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-03'])
    expect(await streak(A, '2027-01-01')).toBe(3)
    const h2 = await cat(B, 'caminar_30')
    await logDays(h2, ['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(await streak(B, '2028-03-01')).toBe(3)
  })
})

describe('ranking (group_leaderboard)', () => {
  type Row = { user_id: string; total_points: string; max_points: string; pct: string | null; streak: number; username: string; archetype: string | null }

  it('suma puntos dentro de la ventana del reto, calcula max y pct', async () => {
    const g = await groupAB()
    await admin(`update groups set start_date = user_today($2) - 2, duration_days = 3 where id = $1`, [g.id, A])
    await admin(`update group_members set joined_at = now() - interval '5 days' where group_id = $1`, [g.id])
    const ha = await cat(A, 'caminar_30')
    const hb = await cat(B, 'caminar_30')
    await admin(`insert into habit_logs (habit_id, log_date) values
      ($1, user_today($3) - 2), ($1, user_today($3) - 1), ($1, user_today($3) - 3), ($2, user_today($3))`, [ha, hb, A])
    const rows = await as<Row>(A, `select * from group_leaderboard($1)`, [g.id])
    expect(rows.map((r) => [r.user_id, Number(r.total_points), Number(r.max_points)])).toEqual([[A, 200, 300], [B, 100, 300]])
    expect(Number(rows[0].pct)).toBeCloseTo(66.7, 1)
  })

  it('quien entra tarde se compara por pct sobre sus propios días', async () => {
    const g = await groupAB()
    await admin(`update groups set start_date = user_today($2) - 9 where id = $1`, [g.id, A])
    await admin(`update group_members set joined_at = now() - interval '20 days' where user_id = $1`, [A])
    await done(B, await cat(B, 'caminar_30'))
    const rows = await as<Row>(A, `select * from group_leaderboard($1)`, [g.id])
    const a = rows.find((r) => r.user_id === A)!
    const b = rows.find((r) => r.user_id === B)!
    expect([Number(b.max_points), Number(b.pct)]).toEqual([100, 100])
    expect([Number(a.max_points), Number(a.pct)]).toEqual([1000, 0])
  })

  it('reto que aún no empezó: max 0 y pct null; sin registros: 0 y racha 0', async () => {
    const g = await groupAB()
    await admin(`update groups set start_date = user_today($2) + 3 where id = $1`, [g.id, A])
    const rows = await as<Row>(A, `select * from group_leaderboard($1)`, [g.id])
    expect(rows.every((r) => Number(r.max_points) === 0 && r.pct === null && r.streak === 0)).toBe(true)
  })

  it('la racha refleja el check de hoy y se ve el arquetipo', async () => {
    const g = await groupAB()
    await admin(`update profiles set archetype = 'nomada' where id = $1`, [A])
    const h = await cat(A, 'caminar_30')
    await admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - 1)`, [h, A])
    await done(A, h)
    const rows = await as<Row>(B, `select * from group_leaderboard($1)`, [g.id])
    expect(rows.find((r) => r.user_id === A)).toMatchObject({ streak: 2, archetype: 'nomada' })
  })
})

describe('radar (area_radar)', () => {
  type R = { area: string; day1: string; actual: string }
  const radar = async (user: string, of: string) =>
    Object.fromEntries((await as<R>(user, `select * from area_radar($1)`, [of])).map((r) => [r.area, [Number(r.day1), Number(r.actual)]]))

  it('día 1 sale del nivel del quiz; sin hábitos en el área, actual = día 1', async () => {
    await admin(`update profiles set area_scores = '{"cuerpo":3,"mente":0,"sueno":2,"alimentacion":1,"foco":0,"social":3}' where id = $1`, [A])
    const r = await radar(A, A)
    expect(r).toEqual({ cuerpo: [100, 100], mente: [0, 0], sueno: [67, 67], alimentacion: [33, 33], foco: [0, 0], social: [100, 100] })
  })

  it('actual = % de cumplimiento en los últimos 14 días completos (por partes cuenta proporcional)', async () => {
    await admin(`update profiles set area_scores = '{"cuerpo":0,"alimentacion":0}' where id = $1`, [A])
    const h = await cat(A, 'caminar_30')
    const agua = await cat(A, 'agua_2l')
    await admin(`update habits set created_at = now() - interval '30 days' where user_id = $1`, [A])
    for (let i = 1; i <= 7; i++) await admin(`insert into habit_logs (habit_id, log_date) values ($1, user_today($2) - $3::int)`, [h, A, i])
    await admin(`insert into habit_logs (habit_id, log_date, count) values ($1, user_today($2) - 1, 4)`, [agua, A]) // 4/8 un día
    await done(A, h) // hoy no cuenta
    const r = await radar(A, A)
    expect(r.cuerpo).toEqual([0, 50])            // 7 de 14
    expect(r.alimentacion).toEqual([0, 4])       // 0,5 de 14 → 3,6 % ≈ 4
  })

  it('un compañero puede ver mi radar', async () => {
    await groupAB()
    expect(await as(B, `select * from area_radar($1)`, [A])).toHaveLength(6)
  })
})

describe('objetivos', () => {
  it('progreso = avance de sus hábitos × paso + ajustes manuales; solo el dueño los gestiona', async () => {
    await groupAB()
    const [g] = await as<{ id: string }>(A, `insert into goals (title, kind, target, unit, deadline) values ('Comprar un celular', 'ahorro', 600, '€', current_date + 60) returning id`)
    const [h] = await as<{ id: string }>(A,
      `insert into habits (user_id, name, area, tier, goal_id, goal_step) values ($1, 'Ahorrar 10 €', 'foco', 2, $2, 10) returning id`, [A, g.id])
    const [lect] = await as<{ id: string }>(A, `insert into goals (title, kind, target, unit) values ('Leer 2 libros', 'lectura', 500, 'páginas') returning id`)
    const [hl] = await as<{ id: string }>(A,
      `insert into habits (user_id, name, area, tier, target, unit, goal_id) values ($1, 'Leer 20 páginas', 'mente', 2, 20, 'páginas', $2) returning id`, [A, lect.id])
    await done(A, h.id)
    await as(A, `select add_habit_progress($1, 12)`, [hl.id])
    await as(A, `insert into goal_entries (goal_id, amount, note) values ($1, 50, 'Regalo')`, [g.id])
    const list = await as<{ title: string; progress: string }>(B, `select title, progress from goal_list($1) order by title`, [A])
    expect(list.map((x) => [x.title, Number(x.progress)])).toEqual([['Comprar un celular', 60], ['Leer 2 libros', 12]])
    await expect(as(B, `insert into goal_entries (goal_id, amount) values ($1, 999)`, [g.id])).rejects.toThrow(/row-level security/)
    await as(B, `update goals set target = 1 where id = $1`, [g.id])
    expect(Number((await admin<{ target: string }>(`select target from goals where id = $1`, [g.id]))[0].target)).toBe(600)
  })

  it('no se puede colgar un hábito de un objetivo ajeno', async () => {
    const [g] = await as<{ id: string }>(B, `insert into goals (title, kind, target, unit) values ('X', 'general', 10, 'sesiones') returning id`)
    await expect(as(A, `insert into habits (user_id, name, area, goal_id) values ($1, 'x', 'foco', $2)`, [A, g.id])).rejects.toThrow(/Objetivo inexistente/)
  })
})

describe('migraciones', () => {
  it('se pueden volver a ejecutar sin errores (002 a 005, en orden)', async () => {
    await db.exec(readFileSync(new URL(FILES[1], import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL(FILES[2], import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL(FILES[3], import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL(FILES[4], import.meta.url), 'utf8'))
  })
})
