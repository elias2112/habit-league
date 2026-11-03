-- Habit League — esquema para Supabase (Postgres)
-- Ejecutar completo en el SQL Editor de un proyecto NUEVO de Supabase.
-- Probado con tests automáticos (PGlite + stub de auth): ver tests/sql.test.ts.
--
-- Cambios respecto a la v0:
--  * GRANTs explícitos: desde 2026 Supabase ya no expone las tablas nuevas de `public`
--    a la Data API automáticamente (sin esto todo da "permission denied", 42501).
--  * La racha y el "día de hoy" usan profiles.timezone (antes: fecha del servidor).
--  * habit_logs guarda el XP en el momento del check (editar el XP de un hábito
--    ya no reescribe el pasado).
--  * Solo se puede marcar/desmarcar el día de hoy (PRODUCT.md: "por defecto no" a días pasados).
--  * username generado se sanea y respeta 3–24 caracteres; zona horaria validada.
--  * user_streak ya no revela la racha de usuarios que no comparten grupo.
--  * Se revoca EXECUTE de anon/public en funciones security definer.

-- ───────────── Tablas ─────────────

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_by uuid not null references public.profiles(id),
  start_date date not null default current_date,
  duration_days int not null default 66 check (duration_days between 1 and 366),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text check (icon is null or char_length(icon) <= 8),
  xp_value int not null default 10 check (xp_value between 1 and 100),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  xp int not null default 0,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

create index on public.habit_logs (user_id, log_date);
create index on public.group_members (user_id);
create index on public.habits (user_id);

-- ───────────── Helpers ─────────────

-- Fecha local de un instante en una zona horaria (pura, para poder testearla).
create or replace function public.local_date(p_ts timestamptz, p_tz text)
returns date
language sql immutable set search_path = public as $$
  select (p_ts at time zone p_tz)::date;
$$;

-- "Hoy" para un usuario, según su zona horaria.
create or replace function public.user_today(p_user uuid)
returns date
language sql stable security definer set search_path = public as $$
  select public.local_date(now(), coalesce(
    (select timezone from profiles where id = p_user), 'Europe/Madrid'));
$$;

-- ¿El usuario actual comparte algún grupo con otro usuario (o es él mismo)?
create or replace function public.shares_group_with(other uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1
    from group_members a
    join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.is_member(g uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid());
$$;

-- ───────────── Triggers ─────────────

-- Zona horaria válida (falla con error si Postgres no la conoce).
create or replace function public.validate_profile()
returns trigger
language plpgsql set search_path = public as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception when others then
  raise exception 'Zona horaria inválida: %', new.timezone;
end $$;

create trigger profiles_validate
  before insert or update of timezone on public.profiles
  for each row execute function public.validate_profile();

-- Al registrar un check: fija user_id y XP desde el hábito (el cliente no los decide).
create or replace function public.fill_habit_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare h habits;
begin
  select * into h from habits where id = new.habit_id;
  if h.id is null then raise exception 'Hábito inexistente'; end if;
  new.user_id := h.user_id;
  new.xp := h.xp_value;
  return new;
end $$;

create trigger habit_logs_fill
  before insert on public.habit_logs
  for each row execute function public.fill_habit_log();

-- Perfil automático al registrarse (username provisional; el usuario lo cambia luego).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare base text;
begin
  base := left(regexp_replace(coalesce(split_part(new.email, '@', 1), ''), '[^A-Za-z0-9_]', '', 'g'), 16);
  if base = '' then base := 'user'; end if;
  insert into profiles (id, username)
  values (new.id, base || '_' || substr(replace(new.id::text, '-', ''), 1, 6));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── Row Level Security ─────────────

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.habits        enable row level security;
alter table public.habit_logs    enable row level security;

create policy "profiles: ver propio o de compañeros" on public.profiles
  for select to authenticated using (public.shares_group_with(id));
create policy "profiles: editar propio" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "groups: ver si soy miembro" on public.groups
  for select to authenticated using (public.is_member(id));

create policy "members: ver miembros de mis grupos" on public.group_members
  for select to authenticated using (public.is_member(group_id));
create policy "members: salir yo" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

create policy "habits: ver propios o de compañeros" on public.habits
  for select to authenticated using (public.shares_group_with(user_id));
create policy "habits: crear propios" on public.habits
  for insert to authenticated with check (user_id = auth.uid());
create policy "habits: editar propios" on public.habits
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "habits: borrar propios" on public.habits
  for delete to authenticated using (user_id = auth.uid());

create policy "logs: ver propios o de compañeros" on public.habit_logs
  for select to authenticated using (public.shares_group_with(user_id));
-- Solo hoy (zona horaria del usuario). El trigger fija user_id desde el hábito,
-- así que un hábito ajeno termina con user_id ajeno y la política lo rechaza.
create policy "logs: crear propios de hoy" on public.habit_logs
  for insert to authenticated with check (
    user_id = auth.uid() and log_date = public.user_today(auth.uid())
  );
create policy "logs: borrar propios de hoy" on public.habit_logs
  for delete to authenticated using (
    user_id = auth.uid() and log_date = public.user_today(auth.uid())
  );

-- ───────────── Permisos (Data API) ─────────────

grant usage on schema public to authenticated;
grant select on public.profiles, public.groups, public.group_members to authenticated;
grant update (username, display_name, timezone) on public.profiles to authenticated;
grant delete on public.group_members to authenticated;
grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, delete on public.habit_logs to authenticated;

-- ───────────── Funciones de aplicación (RPC) ─────────────

create or replace function public.create_group(p_name text, p_duration int default 66)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  insert into groups (name, created_by, duration_days, start_date)
  values (trim(p_name), auth.uid(), p_duration, public.user_today(auth.uid()))
  returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select id into gid from groups where invite_code = lower(trim(p_code));
  if gid is null then raise exception 'Código de invitación inválido'; end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid())
  on conflict do nothing;
  return gid;
end $$;

-- Marca o desmarca un hábito propio para HOY (zona horaria del usuario).
create or replace function public.set_habit_done(p_habit uuid, p_done boolean)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_done then
    insert into habit_logs (habit_id, log_date)
    values (p_habit, public.user_today(auth.uid()))
    on conflict (habit_id, log_date) do nothing;
  else
    delete from habit_logs
    where habit_id = p_habit and log_date = public.user_today(auth.uid());
  end if;
end $$;

-- Racha a una fecha dada: días consecutivos con al menos un hábito, terminando
-- en p_today o en el día anterior (si hoy aún no marcó nada, la racha sigue viva).
-- Regla [ABIERTO en PRODUCT.md]: "al menos un hábito por día".
create or replace function public.streak_as_of(p_user uuid, p_today date)
returns int
language sql stable security definer set search_path = public as $$
  with d as (
    select distinct log_date from habit_logs
    where user_id = p_user and log_date <= p_today
  ),
  g as (select log_date, log_date - (row_number() over (order by log_date))::int as grp from d),
  last_day as (select max(log_date) as ld from d)
  select coalesce((
    select count(*)::int from g
    where grp = (select grp from g where log_date = (select ld from last_day))
      and (select ld from last_day) >= p_today - 1
  ), 0);
$$;

-- Racha actual de un usuario (solo si comparte grupo con quien llama).
create or replace function public.user_streak(p_user uuid)
returns int
language sql stable security definer set search_path = public as $$
  select case when public.shares_group_with(p_user)
    then public.streak_as_of(p_user, public.user_today(p_user))
    else 0 end;
$$;

-- Ranking del grupo. Solo devuelve datos si quien llama es miembro.
create or replace function public.group_leaderboard(p_group uuid)
returns table (user_id uuid, username text, display_name text, total_xp bigint, streak int)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.username,
    p.display_name,
    coalesce(sum(l.xp) filter (
      where l.log_date >= g.start_date and l.log_date < g.start_date + g.duration_days
    ), 0)::bigint as total_xp,
    public.streak_as_of(p.id, public.user_today(p.id))
  from groups g
  join group_members m on m.group_id = g.id
  join profiles p on p.id = m.user_id
  left join habit_logs l on l.user_id = p.id
  where g.id = p_group
    and public.is_member(p_group)
  group by p.id, p.username, p.display_name, g.start_date, g.duration_days
  order by total_xp desc, p.username;
$$;

-- Actividad reciente del grupo (sistema de honor: todos ven lo que marca cada uno).
create or replace function public.group_feed(p_group uuid, p_limit int default 30)
returns table (log_id uuid, user_id uuid, username text, habit_name text, habit_icon text,
               xp int, log_date date, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, p.id, p.username, h.name, h.icon, l.xp, l.log_date, l.created_at
  from habit_logs l
  join habits h on h.id = l.habit_id
  join profiles p on p.id = l.user_id
  where public.is_member(p_group)
    and l.user_id in (select m.user_id from group_members m where m.group_id = p_group)
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- Ejecución de funciones: nada para anon/public; las RPC para authenticated.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_group(text, int),
  public.join_group(text),
  public.set_habit_done(uuid, boolean),
  public.user_today(uuid),
  public.user_streak(uuid),
  public.group_leaderboard(uuid),
  public.group_feed(uuid, int),
  public.shares_group_with(uuid),
  public.is_member(uuid),
  public.local_date(timestamptz, text)
to authenticated;

-- Realtime para que el ranking/feed se refresque solo (si existe la publicación).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.habit_logs;
  end if;
end $$;
