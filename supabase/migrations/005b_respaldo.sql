-- 005b — Respaldo de los datos antes de la v4 (pedido del dueño, 2026-11-14).
-- Ejecutar ANTES de 006. Copia cada tabla del juego tal como está a un esquema aparte, `respaldo_v2`,
-- que la app no puede leer (no está expuesto a la API y se le quitan los permisos).
-- La 006 no migra datos: cada persona reinicia y empieza de cero con el modelo nuevo. Si algo sale mal,
-- los datos viejos quedan acá. Se puede re-ejecutar: si una copia ya existe, no la pisa.

create schema if not exists respaldo_v2;
revoke all on schema respaldo_v2 from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'groups', 'group_members', 'habits', 'habit_logs', 'goals', 'goal_entries',
    'habit_reviews', 'habit_votes', 'daily_judgments', 'league_state', 'league_events', 'goal_milestones',
    'user_settings', 'group_chests', 'group_chest_entries', 'user_vices', 'vice_slips'
  ] loop
    if to_regclass('public.' || t) is not null and to_regclass('respaldo_v2.' || t) is null then
      execute format('create table respaldo_v2.%I as table public.%I', t, t);
    end if;
  end loop;
end $$;

-- Marca de cuándo se hizo (la 006 verifica que exista).
create table if not exists respaldo_v2.hecho (at timestamptz not null default now());
insert into respaldo_v2.hecho default values;

-- Para revisar: cuántas filas se copiaron por tabla.
-- select table_name, (xpath('/row/c/text()', query_to_xml('select count(*) as c from respaldo_v2.' || table_name, false, true, '')))[1]::text::int as filas
-- from information_schema.tables where table_schema = 'respaldo_v2' order by 1;
