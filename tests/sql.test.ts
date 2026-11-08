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
  '../supabase/migrations/006_v3_plan_monedas.sql',
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

/** Hábito del catálogo (no necesita aprobación). */
async function cat(user: string, catalogId: string, priv = false) {
  const [h] = await as<{ id: string }>(user,
    `insert into habits (user_id, name, catalog_id, private) values ($1, 'x', $2, $3) returning id`, [user, catalogId, priv])
  return h.id
}
const done = (user: string, h: string, v = true) => as(user, `select set_habit_done($1, $2)`, [h, v])

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
    for (const file of FILES.slice(2)) await db.exec(readFileSync(new URL(file, import.meta.url), 'utf8'))
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
  it('se pueden volver a ejecutar sin errores (002 a 006, en orden)', async () => {
    await db.exec(readFileSync(new URL(FILES[1], import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL(FILES[2], import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL(FILES[3], import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL(FILES[4], import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL(FILES[5], import.meta.url), 'utf8'))
  })
})
