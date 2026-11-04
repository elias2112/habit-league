// Arnés común: PGlite con stubs de Supabase (roles, auth.uid(), storage) y todas las migraciones.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

export const MIGRATIONS = [
  '../supabase/schema.sql',
  '../supabase/migrations/002_quiz_personas_puntos.sql',
  '../supabase/migrations/003_grupo_objetivos_fotos.sql',
  '../supabase/migrations/004_liga_juicio_cofre.sql',
  '../supabase/migrations/005_vicios.sql',
]
export const readMigration = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

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

export async function createDb() {
  const db = new PGlite()
  await db.exec(STUB)
  for (const f of MIGRATIONS) await db.exec(readMigration(f))

  const as = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
    try { return (await db.query<T>(sql, params)).rows } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
    }
  }
  const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows
  const one = async <T>(user: string, sql: string, params: unknown[] = []) => (await as<{ r: T }>(user, sql, params))[0].r
  return { db, as, admin, one }
}
