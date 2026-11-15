-- 007a — Respaldo antes de la v4.2 (pedido del dueño, 2026-11-15).
-- Ejecutar ANTES de 007. Copia cada tabla tal como está a un esquema aparte, `respaldo_v4`, que la app no puede
-- leer (no está expuesto a la API y se le quitan los permisos). La 007 borra los datos de juego de TODOS
-- (quedan cuentas y grupos) y exige este respaldo hecho y verificado: cada copia con las mismas filas que el original.
-- Se puede re-ejecutar: mientras la 007 no haya reiniciado, cada corrida vuelve a copiar todo (la 007 compara
-- las copias con las tablas vivas). Después del reinicio NO toca nada: el respaldo bueno no se pisa con tablas vacías.

create schema if not exists respaldo_v4;
revoke all on schema respaldo_v4 from public, anon, authenticated;

create table if not exists respaldo_v4.reinicio (at timestamptz not null default now());  -- la escribe la 007
create table if not exists respaldo_v4.hecho (
  at timestamptz not null default now(),
  filas jsonb not null            -- filas de cada tabla en el momento de copiarla
);

do $$
declare t text; n bigint; filas jsonb := '{}'::jsonb;
begin
  if exists (select 1 from respaldo_v4.reinicio) then
    raise notice 'La 007 ya reinició: el respaldo queda como está.';
    return;
  end if;
  foreach t in array array[
    -- cuentas y grupos (no se borran, se respaldan igual)
    'profiles', 'groups', 'group_members', 'group_config',
    -- juego v4
    'habits', 'habit_logs', 'vices', 'vice_days', 'objectives', 'objective_events',
    'plans', 'plan_habits', 'plan_vices', 'plan_objectives',
    'habit_reviews', 'habit_votes', 'change_requests', 'change_votes', 'store_items', 'store_optins', 'purchases', 'user_notices',
    -- cofres
    'goals', 'goal_entries', 'goal_milestones', 'group_chests', 'group_chest_entries',
    -- liga y Juicio
    'league_state', 'league_events', 'user_settings', 'daily_judgments',
    -- legado v3
    'user_game', 'legacy_days'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop table if exists respaldo_v4.%I', t);
      execute format('create table respaldo_v4.%I as table public.%I', t, t);
      execute format('select count(*) from respaldo_v4.%I', t) into n;
      filas := filas || jsonb_build_object(t, n);
    end if;
  end loop;
  insert into respaldo_v4.hecho (filas) values (filas);
end $$;

-- Para revisar: cuántas filas tiene cada copia.
-- select * from respaldo_v4.hecho order by at;
