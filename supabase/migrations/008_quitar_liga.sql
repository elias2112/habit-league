-- 008 — Quitar la Liga de las Tres Transformaciones (confirmado por el dueño, 2026-11-15).
-- Ejecutar DESPUÉS de la 007. Desde la 007 la liga no se usa (el Juicio y los cofres no la mueven).
-- Antes de borrar, respalda otra vez sus tablas en respaldo_v4 (*_008), por si cambiaron desde la 007a.
-- Se queda: el Juicio (judgment_questions, daily_judgments, sus funciones) y user_settings (preferencias del Juicio).
-- Se puede re-ejecutar (si re-ejecutás la 004 a la 007, re-ejecutá esta después).

do $$
declare t text;
begin
  if to_regclass('respaldo_v4.hecho') is null then
    raise exception 'Migración 008 detenida: primero ejecutá 007a_respaldo.sql y 007_v42.sql.';
  end if;
  foreach t in array array['league_state', 'league_events', 'goal_milestones'] loop
    if to_regclass('public.' || t) is not null and to_regclass('respaldo_v4.' || t || '_008') is null then
      execute format('create table respaldo_v4.%I as table public.%I', t || '_008', t);
    end if;
  end loop;
end $$;
revoke all on all tables in schema respaldo_v4 from public, anon, authenticated;

-- Funciones de la liga (por nombre, con cualquier firma).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('group_league', 'league_sync', 'league_sync_user', 'league_process_day', 'league_process_week',
                               'league_process_milestones', 'league_apply', 'stage_next', 'stage_prev', 'stage_rank',
                               'trial_passed', 'habits_pl') loop
    execute 'drop function ' || f;
  end loop;
end $$;

drop table if exists public.league_events;
drop table if exists public.league_state;
drop table if exists public.goal_milestones;   -- hitos de cofre en la liga; desde la 007 los hitos dan monedas y se calculan

delete from public.game_config where key in ('boost_factor', 'shield_days', 'demote_to_pl', 'milestones', 'weekly_chest_bonus', 'stages');

-- Reiniciar y la vista previa, sin la liga.
create or replace function public.wipe_game_data(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  g := public.my_group(p_user);
  delete from change_votes where voter_id = p_user;
  delete from change_requests where proposer_id = p_user;
  delete from purchases where user_id = p_user;
  delete from store_optins where user_id = p_user;
  delete from plans where user_id = p_user;                 -- fotos del plan (cascade plan_habits/vices/objectives)
  delete from vice_days where user_id = p_user;
  delete from strength_settlements where user_id = p_user;   -- fuerza base: días saldados
  delete from area_answers where user_id = p_user;          -- respuestas privadas por área (tienda)
  delete from vices where user_id = p_user;
  delete from habits where user_id = p_user;                -- cascade: registros (feed), revisiones viejas
  delete from objectives where user_id = p_user;            -- cascade: eventos
  delete from goals where user_id = p_user;                 -- cofres personales (cascade: aportes, hitos)
  delete from daily_judgments where user_id = p_user;       -- Juicio
  delete from user_settings where user_id = p_user;
  delete from user_notices where user_id = p_user;
  delete from legacy_days where user_id = p_user;
  delete from user_game where user_id = p_user;
  if to_regclass('public.vice_slips') is not null then
    execute 'delete from public.vice_slips where user_id = $1' using p_user;
    execute 'delete from public.user_vices where user_id = $1' using p_user;
  end if;
  delete from habit_votes where voter_id = p_user;
  update profiles set archetype = null, area_scores = '{}'::jsonb, quiz_answers = null, quiz_completed_at = null where id = p_user;
  if g is not null then perform public.resolve_requests(g); end if;
end $$;


create or replace function public.reset_preview()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'username', (select username from profiles where id = auth.uid()),
    'habitos', (select count(*) from habits where user_id = auth.uid()),
    'registros', (select count(*) from habit_logs where user_id = auth.uid()),
    'fotos', (select count(*) from habit_logs where user_id = auth.uid() and photo_path is not null),
    'vicios', (select count(*) from vices where user_id = auth.uid()),
    'objetivos', (select count(*) from objectives where user_id = auth.uid()),
    'cofres', (select count(*) from goals where user_id = auth.uid()),
    'compras', (select count(*) from purchases where user_id = auth.uid()),
    'propuestas', (select count(*) from change_requests where proposer_id = auth.uid()),
    'votos', (select count(*) from change_votes where voter_id = auth.uid()),
    'juicios', (select count(*) from daily_judgments where user_id = auth.uid()),
    'aportes_compartidos', (select count(*) from group_chest_entries where user_id = auth.uid()),
    'grupo_creado', exists (select 1 from groups where created_by = auth.uid())
  );
$$;

