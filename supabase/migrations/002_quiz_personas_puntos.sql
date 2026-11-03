-- 002 — Quiz, arquetipos, hábitos por dificultad (tier) y puntos normalizados (máx. 100 por día).
-- Ejecutar DESPUÉS de supabase/schema.sql (en el SQL Editor de Supabase). Se puede re-ejecutar.
-- Probado con tests automáticos (PGlite + stub de auth): tests/sql.test.ts.
--
-- Cambios respecto al borrador original de 002:
--  * "Hoy" y el ranking usan la zona horaria de cada usuario (user_today), no current_date.
--  * La regla "solo hoy" del trigger aplica a peticiones de usuarios (auth.uid() presente);
--    la sigue reforzando la política RLS. Así se pueden cargar datos históricos como admin.
--  * GRANTs para las columnas nuevas de profiles y EXECUTE solo para authenticated.
--  * El ranking solo responde a miembros (is_member) y la racha usa la fecha local.
--  * group_feed devuelve points.

-- ───────────── Perfiles: resultado del quiz ─────────────
alter table public.profiles
  add column if not exists archetype text,
  add column if not exists area_scores jsonb not null default '{}'::jsonb,
  add column if not exists quiz_answers jsonb,
  add column if not exists quiz_completed_at timestamptz;

-- ───────────── Hábitos: dificultad y origen del catálogo ─────────────
alter table public.habits
  add column if not exists tier int not null default 1 check (tier between 1 and 3),
  add column if not exists catalog_id text,
  add column if not exists area text
    check (area is null or area in ('cuerpo','mente','sueno','alimentacion','foco','social'));

comment on column public.habits.xp_value is
  'DEPRECADO. Los puntos salen de tier -> habit_logs.points. Eliminar cuando se confirme que no se usa.';

-- ───────────── Registros: puntos congelados al marcar ─────────────
alter table public.habit_logs
  add column if not exists points numeric(6,2) not null default 0;

comment on column public.habit_logs.xp is 'DEPRECADO. Usar points.';

-- Puntos de un hábito = 100 * tier / suma de tiers de los hábitos activos del usuario.
-- Tope: el total de un usuario en un día nunca supera 100 (evita agregar hábitos a mitad de día para sumar de más).
-- Se ejecuta después de habit_logs_fill (orden alfabético), que ya fijó user_id desde el hábito.
create or replace function public.set_log_points()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  h_tier int;
  total_tier int;
  used numeric;
  raw numeric;
begin
  if auth.uid() is not null and new.log_date <> public.user_today(new.user_id) then
    raise exception 'Solo se puede registrar el día de hoy (%).', public.user_today(new.user_id);
  end if;

  select tier into h_tier from habits where id = new.habit_id;

  select coalesce(sum(tier), 0) into total_tier
  from habits
  where user_id = new.user_id and (not archived or id = new.habit_id);

  select coalesce(sum(points), 0) into used
  from habit_logs
  where user_id = new.user_id and log_date = new.log_date;

  raw := round(100.0 * h_tier / nullif(total_tier, 0), 2);
  new.points := least(coalesce(raw, 0), greatest(0, 100 - used));
  return new;
end $$;

drop trigger if exists habit_logs_set_points on public.habit_logs;
create trigger habit_logs_set_points
  before insert on public.habit_logs
  for each row execute function public.set_log_points();

-- ───────────── Ranking normalizado ─────────────
-- total_points: suma de puntos del reto (máx. 100 por día).
-- max_points:   100 * días transcurridos (en la fecha local de cada miembro) desde que entró o desde el inicio.
-- pct:          total_points / max_points -> comparable aunque alguien entre tarde.
drop function if exists public.group_leaderboard(uuid);

create function public.group_leaderboard(p_group uuid)
returns table (
  user_id uuid, username text, display_name text, archetype text,
  total_points numeric, max_points numeric, pct numeric, streak int
)
language sql stable security definer set search_path = public as $$
  with base as (
    select m.user_id,
           greatest(g.start_date, public.local_date(m.joined_at, p.timezone)) as from_date,
           g.start_date + g.duration_days - 1                                 as end_date,
           public.user_today(m.user_id)                                       as today
    from groups g
    join group_members m on m.group_id = g.id
    join profiles p on p.id = m.user_id
    where g.id = p_group
      and public.is_member(p_group)
  ),
  scored as (
    select b.user_id, b.today,
           coalesce((select sum(l.points) from habit_logs l
                     where l.user_id = b.user_id and l.log_date between b.from_date and b.end_date), 0) as total_points,
           100.0 * greatest(0, least(b.end_date, b.today) - b.from_date + 1) as max_points
    from base b
  )
  select p.id, p.username, p.display_name, p.archetype,
         s.total_points::numeric,
         s.max_points::numeric,
         round(100.0 * s.total_points / nullif(s.max_points, 0), 1),
         public.streak_as_of(p.id, s.today)
  from scored s
  join profiles p on p.id = s.user_id
  order by s.total_points desc, p.username;
$$;

-- ───────────── Feed con puntos ─────────────
drop function if exists public.group_feed(uuid, int);

create function public.group_feed(p_group uuid, p_limit int default 30)
returns table (log_id uuid, user_id uuid, username text, habit_name text, habit_area text,
               points numeric, log_date date, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, p.id, p.username, h.name, h.area, l.points, l.log_date, l.created_at
  from habit_logs l
  join habits h on h.id = l.habit_id
  join profiles p on p.id = l.user_id
  where public.is_member(p_group)
    and l.user_id in (select m.user_id from group_members m where m.group_id = p_group)
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ───────────── Permisos ─────────────
grant update (archetype, area_scores, quiz_answers, quiz_completed_at) on public.profiles to authenticated;

revoke execute on function public.set_log_points() from public, anon, authenticated;
revoke execute on function public.group_leaderboard(uuid) from public, anon;
revoke execute on function public.group_feed(uuid, int) from public, anon;
grant execute on function public.group_leaderboard(uuid), public.group_feed(uuid, int) to authenticated;
