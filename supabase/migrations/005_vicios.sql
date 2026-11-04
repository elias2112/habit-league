-- 005 — Vicios: multiplicador por vicio declarado y tropiezos que restan del día.
-- Ejecutar DESPUÉS de schema.sql, 002, 003 y 004 (SQL Editor de Supabase). Se puede re-ejecutar.
-- Datos desde content/vices.json (`npm run catalog`).
--
--  * Vicio declarado (algo que hacés y no querés dejar, ej. fumar): puntos del día × 0,9 por cada uno.
--  * Tropiezo (pasó hoy, ej. "Hoy tomé"): resta puntos de ese día, una vez por vicio y por día.
--  * Puntos ajustados del día = max(0, puntos de hábitos × multiplicador − tropiezos). Nunca más de 100.
--  * Lo usan el ranking del reto, los PL de hábitos de la liga y la prueba del Camello.
--  * "Lo dejé" corta el multiplicador desde MAÑANA (no se puede esquivar el día de hoy).
--  * Privado: el grupo ve el multiplicador en el ranking, no qué vicios ni qué tropiezos.

create table if not exists public.vice_catalog (
  id text primary key,
  name text not null,
  area text not null check (area in ('cuerpo','mente','sueno','alimentacion','foco','social')),
  slip text not null,
  slip_penalty int not null check (slip_penalty between 0 and 100)
);
alter table public.vice_catalog enable row level security;
drop policy if exists "vice_catalog: lectura" on public.vice_catalog;
create policy "vice_catalog: lectura" on public.vice_catalog for select to authenticated using (true);
grant select on public.vice_catalog to authenticated;

-- BEGIN VICES (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
insert into public.vice_catalog (id, name, area, slip, slip_penalty) values
  ('fumar', 'Fumar o vapear', 'cuerpo', 'Hoy fumé', 10),
  ('alcohol', 'Tomar alcohol', 'alimentacion', 'Hoy tomé', 15),
  ('chatarra', 'Comida chatarra o delivery', 'alimentacion', 'Hoy comí chatarra', 10),
  ('dulces', 'Dulces y gaseosas', 'alimentacion', 'Hoy me pasé con lo dulce', 5),
  ('redes', 'Redes sociales de más', 'mente', 'Hoy me pasé con las redes', 5),
  ('trasnochar', 'Trasnochar', 'sueno', 'Anoche me acosté muy tarde', 10),
  ('apuestas', 'Apuestas', 'foco', 'Hoy aposté', 15)
on conflict (id) do update set name = excluded.name, area = excluded.area, slip = excluded.slip, slip_penalty = excluded.slip_penalty;
insert into public.game_config (key, value) values ('vice_multiplier', '0.9'::jsonb)
on conflict (key) do update set value = excluded.value;
-- END VICES

create table if not exists public.user_vices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vice_id text references public.vice_catalog(id),
  name text not null check (char_length(name) between 1 and 60),
  started_on date not null,
  ended_on date,   -- primer día en que YA no cuenta
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on > started_on)
);
create unique index if not exists user_vices_one_active on public.user_vices (user_id, vice_id)
  where ended_on is null and vice_id is not null;
create index if not exists user_vices_user_idx on public.user_vices (user_id);

create table if not exists public.vice_slips (
  user_id uuid not null references public.profiles(id) on delete cascade,
  vice_id text not null references public.vice_catalog(id),
  day date not null,
  penalty int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, vice_id, day)
);

alter table public.user_vices enable row level security;
alter table public.vice_slips enable row level security;
drop policy if exists "user_vices: propios" on public.user_vices;
drop policy if exists "vice_slips: propios" on public.vice_slips;
create policy "user_vices: propios" on public.user_vices for select to authenticated using (user_id = auth.uid());
create policy "vice_slips: propios" on public.vice_slips for select to authenticated using (user_id = auth.uid());
grant select on public.user_vices, public.vice_slips to authenticated;

-- ───────────── Cálculo ─────────────
create or replace function public.vice_multiplier(p_user uuid, p_day date)
returns numeric
language sql stable security definer set search_path = public as $$
  select power(coalesce((public.cfg('vice_multiplier'))::numeric, 0.9), count(*))
  from user_vices
  where user_id = p_user and started_on <= p_day and (ended_on is null or p_day < ended_on);
$$;

create or replace function public.slip_penalty(p_user uuid, p_day date)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(penalty), 0)::int from vice_slips where user_id = p_user and day = p_day;
$$;

create or replace function public.adjusted_points(p_user uuid, p_day date, p_raw numeric)
returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(0, round(coalesce(p_raw, 0) * public.vice_multiplier(p_user, p_day), 2) - public.slip_penalty(p_user, p_day));
$$;

-- Puntos ajustados de un día (todos los hábitos).
create or replace function public.day_points(p_user uuid, p_day date)
returns numeric
language sql stable security definer set search_path = public as $$
  select public.adjusted_points(p_user, p_day, (select sum(points) from habit_logs where user_id = p_user and log_date = p_day));
$$;

-- ───────────── Acciones ─────────────
create or replace function public.declare_vice(p_vice text, p_name text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v vice_catalog; d date;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid());
  if p_vice is not null then
    select * into v from vice_catalog where id = p_vice;
    if v.id is null then raise exception 'Vicio inexistente.'; end if;
    if exists (select 1 from user_vices where user_id = auth.uid() and vice_id = p_vice and ended_on is null) then
      raise exception 'Ya tenés declarado ese vicio.';
    end if;
    insert into user_vices (user_id, vice_id, name, started_on) values (auth.uid(), v.id, v.name, d);
    delete from vice_slips where user_id = auth.uid() and vice_id = p_vice and day = d; -- no se paga dos veces
  else
    if coalesce(trim(p_name), '') = '' then raise exception 'Poné un nombre.'; end if;
    insert into user_vices (user_id, name, started_on) values (auth.uid(), trim(p_name), d);
  end if;
end $$;

-- "Lo dejé": deja de contar desde mañana.
create or replace function public.end_vice(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update user_vices set ended_on = public.user_today(auth.uid()) + 1
  where id = p_id and user_id = auth.uid() and ended_on is null;
  if not found then raise exception 'Vicio inexistente.'; end if;
end $$;

-- Tropiezo de hoy (o deshacerlo). No aplica a vicios declarados.
create or replace function public.log_slip(p_vice text, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v vice_catalog; d date;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid());
  select * into v from vice_catalog where id = p_vice;
  if v.id is null then raise exception 'Vicio inexistente.'; end if;
  if p_on then
    if exists (select 1 from user_vices where user_id = auth.uid() and vice_id = p_vice
               and started_on <= d and (ended_on is null or d < ended_on)) then
      raise exception 'Ese vicio ya lo tenés declarado: ya pagás el multiplicador.';
    end if;
    insert into vice_slips (user_id, vice_id, day, penalty) values (auth.uid(), p_vice, d, v.slip_penalty)
    on conflict do nothing;
  else
    delete from vice_slips where user_id = auth.uid() and vice_id = p_vice and day = d;
  end if;
end $$;

-- Puntaje de hoy desglosado (para la pantalla Hoy).
create or replace function public.today_score()
returns jsonb
language sql stable security definer set search_path = public as $$
  with t as (select public.user_today(auth.uid()) d)
  select jsonb_build_object(
    'raw', coalesce((select round(sum(points), 2) from habit_logs, t where user_id = auth.uid() and log_date = t.d), 0),
    'multiplier', public.vice_multiplier(auth.uid(), t.d),
    'slips', public.slip_penalty(auth.uid(), t.d),
    'final', public.day_points(auth.uid(), t.d),
    'vices', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'vice_id', v.vice_id, 'name', v.name, 'started_on', v.started_on, 'ends_on', v.ended_on) order by v.created_at)
                       from user_vices v where v.user_id = auth.uid() and v.started_on <= t.d and (v.ended_on is null or t.d < v.ended_on)), '[]'::jsonb),
    'slip_ids', coalesce((select jsonb_agg(s.vice_id) from vice_slips s where s.user_id = auth.uid() and s.day = t.d), '[]'::jsonb)
  ) from t;
$$;

-- ───────────── Ranking, liga y Juicio con puntos ajustados ─────────────
drop function if exists public.group_leaderboard(uuid);
create function public.group_leaderboard(p_group uuid)
returns table (
  user_id uuid, username text, display_name text, archetype text,
  total_points numeric, max_points numeric, pct numeric, streak int, multiplier numeric
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
           coalesce((
             select sum(public.adjusted_points(b.user_id, x.day, x.raw))
             from (
               select gs::date as day,
                      (select sum(l.points) from habit_logs l
                       where l.user_id = b.user_id and l.log_date = gs::date
                         and public.habit_counts_in_group(l.habit_id, p_group)) as raw
               from generate_series(b.from_date, least(b.end_date, b.today), interval '1 day') gs
             ) x
           ), 0) as total_points,
           100.0 * greatest(0, least(b.end_date, b.today) - b.from_date + 1) as max_points
    from base b
  )
  select p.id, p.username, p.display_name, p.archetype,
         s.total_points::numeric,
         s.max_points::numeric,
         round(100.0 * s.total_points / nullif(s.max_points, 0), 1),
         public.streak_as_of(p.id, s.today),
         round(public.vice_multiplier(p.id, s.today), 3)
  from scored s
  join profiles p on p.id = s.user_id
  order by s.total_points desc, p.username;
$$;

create or replace function public.habits_pl(p_user uuid, p_day date)
returns int
language sql stable security definer set search_path = public as $$
  select case when not exists (select 1 from habit_logs where user_id = p_user and log_date = p_day) then -20
              else greatest(-20, least(20, round((public.day_points(p_user, p_day) - 50) / 2.5)))::int end;
$$;

create or replace function public.trial_passed(p_user uuid, p_stage text, p_day date)
returns boolean
language sql stable security definer set search_path = public as $$
  select case p_stage
    when 'camello' then (
      select count(*) = 7 from generate_series(p_day - 6, p_day, interval '1 day') d
      where public.day_points(p_user, d::date) >= 70)
    when 'leon' then (
      select count(*) >= 10 from daily_judgments j
      where j.user_id = p_user and j.day between p_day - 13 and p_day
        and not exists (select 1 from jsonb_each_text(j.scores) s
                        join judgment_questions q on q.id = s.key
                        where q.category = 'vicio' and s.value::int < 0))
    when 'nino' then (
      public.streak_as_of(p_user, p_day) >= 21 and exists (
        select 1 from public.goal_list(p_user) g where g.progress >= g.target))
    else false end;
$$;

-- Juicio: mostrar los puntos ajustados de ayer.
create or replace function public.judgment_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date; j daily_judgments; done int; total int; last date;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid()) - 1;
  select last_day into last from league_state where user_id = auth.uid();
  select * into j from daily_judgments where user_id = auth.uid() and day = d;
  select count(*) filter (where count >= target) into done from habit_logs where user_id = auth.uid() and log_date = d;
  select count(*) into total from habits where user_id = auth.uid() and not archived;
  return jsonb_build_object(
    'day', d,
    'available', last is not null and d > last,
    'submitted', j.user_id is not null,
    'total', j.total,
    'points', round(public.day_points(auth.uid(), d)),
    'multiplier', public.vice_multiplier(auth.uid(), d),
    'slips', public.slip_penalty(auth.uid(), d),
    'habits_done', done,
    'habits_total', total,
    'habits_pl', public.habits_pl(auth.uid(), d),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'text', q.text, 'hint', q.hint,
                                   'type', q.type, 'unit', q.unit, 'category', q.category))
                           from public.judgment_questions_for(auth.uid(), d) q), '[]'::jsonb),
    'chests', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title) order by g.created_at desc)
                        from goals g where g.user_id = auth.uid() and g.kind = 'ahorro' and not g.archived), '[]'::jsonb)
  );
end $$;

-- ───────────── Permisos ─────────────
revoke execute on function
  public.vice_multiplier(uuid, date), public.slip_penalty(uuid, date), public.adjusted_points(uuid, date, numeric),
  public.day_points(uuid, date), public.habits_pl(uuid, date), public.trial_passed(uuid, text, date)
from public, anon, authenticated;
revoke execute on function
  public.declare_vice(text, text), public.end_vice(uuid), public.log_slip(text, boolean), public.today_score(),
  public.group_leaderboard(uuid), public.judgment_today()
from public, anon;
grant execute on function
  public.declare_vice(text, text), public.end_vice(uuid), public.log_slip(text, boolean), public.today_score(),
  public.group_leaderboard(uuid), public.judgment_today()
to authenticated;
