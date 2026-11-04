-- 003 — Privacidad, catálogo en la base, hábitos propios con aprobación del grupo,
--        hábitos por partes, fotos, objetivos y radar de 6 áreas.
-- Ejecutar DESPUÉS de schema.sql y 002 (SQL Editor de Supabase). Se puede re-ejecutar.
-- Probado con tests automáticos (PGlite + stub de auth y storage): tests/sql.test.ts.
-- El bloque del catálogo se genera desde content/habits.json con `npm run catalog`.

-- ───────────── 0. Arquetipos renombrados (content/archetypes.json v0.2) ─────────────
update public.profiles set archetype = case archetype
    when 'arquitecto' then 'estratega'
    when 'reiniciado' then 'fenix'
    when 'explorador' then 'autodidacta'
  end
where archetype in ('arquitecto', 'reiniciado', 'explorador');

-- ───────────── 1. Privacidad ─────────────
-- Las respuestas del quiz (q21–q24 son sensibles) no las lee nadie desde la app.
revoke select on public.profiles from authenticated;
grant select (id, username, display_name, timezone, archetype, area_scores, quiz_completed_at, created_at)
  on public.profiles to authenticated;

-- Sin sesión no hay acceso a nada (antes lo frenaba solo RLS).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ───────────── 2. Catálogo en la base (fuente: content/habits.json) ─────────────
create table if not exists public.catalog_habits (
  id text primary key,
  area text not null check (area in ('cuerpo','mente','sueno','alimentacion','foco','social')),
  name text not null,
  criterion text not null,
  tier int not null check (tier between 1 and 3),
  target int not null default 1 check (target >= 1),
  unit text,
  private_default boolean not null default false
);
alter table public.catalog_habits enable row level security;
drop policy if exists "catalog: lectura" on public.catalog_habits;
create policy "catalog: lectura" on public.catalog_habits for select to authenticated using (true);
grant select on public.catalog_habits to authenticated;

-- BEGIN CATALOG (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
insert into public.catalog_habits (id, area, name, criterion, tier, target, unit, private_default) values
  ('caminar_30', 'cuerpo', 'Caminar 30 minutos', 'Al menos 30 minutos caminando, sumados en el día.', 1, 1, null, false),
  ('estirar_10', 'cuerpo', 'Estirar 10 minutos', '10 minutos de estiramientos o movilidad.', 1, 1, null, false),
  ('ejercicio_20', 'cuerpo', 'Hacer ejercicio 20 minutos', '20 minutos de actividad que te suba el pulso.', 2, 1, null, false),
  ('fuerza_30', 'cuerpo', 'Entrenamiento de fuerza', 'Una sesión de fuerza de al menos 30 minutos.', 3, 1, null, false),
  ('respirar_5', 'mente', 'Respirar o meditar 5 minutos', '5 minutos de respiración o meditación.', 1, 1, null, false),
  ('diario_5', 'mente', 'Escribir en un diario', 'Al menos 5 minutos escribiendo sobre tu día.', 1, 1, null, false),
  ('leer_15', 'mente', 'Leer 15 minutos', '15 minutos de lectura (libro, no redes).', 2, 1, null, false),
  ('meditar_15', 'mente', 'Meditar 15 minutos', '15 minutos de meditación sin interrupciones.', 3, 1, null, false),
  ('pantallas_off_30', 'sueno', 'Pantallas apagadas 30 min antes de dormir', 'Sin pantallas los últimos 30 minutos antes de dormir.', 1, 1, null, false),
  ('sin_cafeina_tarde', 'sueno', 'Sin cafeína después de las 16:00', 'Ninguna bebida con cafeína pasadas las 16:00.', 1, 1, null, false),
  ('despertar_fijo', 'sueno', 'Despertar a la misma hora', 'Despertar dentro de ±30 minutos de tu hora objetivo.', 2, 1, null, false),
  ('dormir_7h', 'sueno', 'Dormir 7 horas o más', 'Dormir al menos 7 horas (lo declarás vos).', 3, 1, null, false),
  ('agua_2l', 'alimentacion', 'Tomar 2 litros de agua', 'Unos 2 litros en el día: 8 vasos de 250 ml.', 1, 8, 'vasos', false),
  ('verdura_2', 'alimentacion', 'Verdura en 2 comidas', 'Verdura en al menos 2 comidas del día.', 1, 2, 'comidas', false),
  ('cocinar_casa', 'alimentacion', 'Cocinar una comida en casa', 'Preparar con tus manos al menos una comida del día.', 2, 1, null, false),
  ('sin_ultraprocesados', 'alimentacion', 'Un día sin ultraprocesados', 'Ninguna comida ultraprocesada en todo el día.', 3, 1, null, false),
  ('planificar_5', 'foco', 'Planificar el día 5 minutos', 'Escribir tus prioridades antes de empezar.', 1, 1, null, false),
  ('cerrar_dia', 'foco', 'Anotar 3 prioridades para mañana', 'Dejar escritas 3 prioridades para el día siguiente.', 1, 1, null, false),
  ('tarea_dificil', 'foco', 'Hacer primero la tarea más difícil', 'Empezar el día con la tarea que más te cuesta.', 2, 1, null, false),
  ('bloque_profundo_45', 'foco', 'Un bloque de trabajo profundo de 45 min', '45 minutos seguidos en una sola tarea, sin distracciones.', 3, 1, null, false),
  ('mensaje_alguien', 'social', 'Escribirle a alguien que querés', 'Enviar un mensaje a un amigo o familiar.', 1, 1, null, false),
  ('agradecer', 'social', 'Agradecer a alguien', 'Agradecerle a alguien por algo concreto.', 1, 1, null, false),
  ('llamada_10', 'social', 'Llamar a alguien 10 minutos', 'Una llamada o videollamada de al menos 10 minutos.', 2, 1, null, false),
  ('plan_persona', 'social', 'Pasar tiempo en persona con alguien', 'Compartir un rato en persona con alguien que te importa.', 3, 1, null, false),
  ('pasos_10k', 'cuerpo', '10.000 pasos', 'Llegar a 10.000 pasos en el día (podés mirar el contador del teléfono).', 2, 1, null, false),
  ('correr_5k', 'cuerpo', 'Correr 5 km', 'Correr al menos 5 km, de una o en tramos.', 3, 1, null, false),
  ('fumar_menos', 'cuerpo', 'Fumar menos que ayer', 'Fumar menos cigarrillos que el día anterior.', 2, 1, null, true),
  ('dia_sin_fumar', 'cuerpo', 'Día sin fumar', 'Ningún cigarrillo ni vapeo en todo el día.', 3, 1, null, true),
  ('redes_2h', 'mente', 'Menos de 2 h de redes', 'Menos de 2 horas en redes sociales (mirá el tiempo de uso del teléfono).', 2, 1, null, false),
  ('aire_libre_20', 'mente', '20 minutos al aire libre', 'Al menos 20 minutos afuera, sin auriculares.', 1, 1, null, false),
  ('acostarse_fijo', 'sueno', 'Acostarte a la misma hora', 'Ir a la cama dentro de ±30 minutos de tu hora objetivo.', 2, 1, null, false),
  ('cama_sin_celular', 'sueno', 'Celular fuera de la cama', 'Dejar el celular lejos de la cama al acostarte.', 1, 1, null, false),
  ('max_2_tragos', 'alimentacion', 'Máximo 2 tragos', 'Si tomás alcohol, no más de 2 tragos en el día.', 2, 1, null, true),
  ('dia_sin_alcohol', 'alimentacion', 'Día sin alcohol', 'Nada de alcohol en todo el día.', 3, 1, null, true),
  ('sin_delivery', 'alimentacion', 'Día sin delivery', 'Ni delivery ni comida rápida en todo el día.', 2, 1, null, false),
  ('fruta_2', 'alimentacion', '2 frutas', 'Comer al menos 2 frutas en el día.', 1, 2, 'frutas', false),
  ('celular_manana', 'foco', 'Sin celular la primera hora', 'No mirar el celular durante la primera hora después de despertarte.', 1, 1, null, false),
  ('pomodoros_4', 'foco', '4 bloques de 25 minutos', '4 bloques de 25 minutos de trabajo concentrado, con pausas.', 2, 4, 'bloques', false),
  ('ayudar_alguien', 'social', 'Ayudar a alguien', 'Hacer algo concreto por otra persona sin que te lo pida.', 1, 1, null, false),
  ('comida_compartida', 'social', 'Comer con alguien sin pantallas', 'Una comida compartida, con los teléfonos guardados.', 2, 1, null, false)
on conflict (id) do update set area = excluded.area, name = excluded.name, criterion = excluded.criterion,
  tier = excluded.tier, target = excluded.target, unit = excluded.unit, private_default = excluded.private_default;
-- END CATALOG

-- ───────────── 3. Objetivos ─────────────
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  kind text not null check (kind in ('ahorro','lectura','escritura','general')),
  target numeric(14,2) not null check (target > 0),
  unit text not null check (char_length(unit) between 1 and 20),
  deadline date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

create table if not exists public.goal_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount <> 0),
  note text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now()
);

alter table public.goals enable row level security;
alter table public.goal_entries enable row level security;

drop policy if exists "goals: ver propios o de compañeros" on public.goals;
drop policy if exists "goals: gestionar propios" on public.goals;
create policy "goals: ver propios o de compañeros" on public.goals
  for select to authenticated using (public.shares_group_with(user_id));
create policy "goals: gestionar propios" on public.goals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "goal_entries: ver" on public.goal_entries;
drop policy if exists "goal_entries: crear propias" on public.goal_entries;
drop policy if exists "goal_entries: borrar propias" on public.goal_entries;
create policy "goal_entries: ver" on public.goal_entries
  for select to authenticated using (public.shares_group_with(user_id));
create policy "goal_entries: crear propias" on public.goal_entries
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())
  );
create policy "goal_entries: borrar propias" on public.goal_entries
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, delete on public.goal_entries to authenticated;

-- ───────────── 4. Hábitos: dificultad 4, por partes, privados, objetivo ─────────────
alter table public.habits drop constraint if exists habits_tier_check;
alter table public.habits add constraint habits_tier_check check (tier between 1 and 4);
alter table public.habits
  add column if not exists target int not null default 1 check (target between 1 and 100000),
  add column if not exists unit text check (unit is null or char_length(unit) <= 20),
  add column if not exists private boolean not null default false,
  add column if not exists goal_id uuid references public.goals(id) on delete set null,
  add column if not exists goal_step numeric(12,2) not null default 1 check (goal_step > 0),
  add column if not exists criterion text check (criterion is null or char_length(criterion) <= 160);

-- Los compañeros ya no leen la tabla directamente (los privados se enmascaran vía RPC).
drop policy if exists "habits: ver propios o de compañeros" on public.habits;
drop policy if exists "habits: ver propios" on public.habits;
create policy "habits: ver propios" on public.habits
  for select to authenticated using (user_id = auth.uid());

-- Reglas de integridad:
--  * Catálogo: nombre, área, dificultad y meta salen siempre de catalog_habits.
--  * Propios: no pueden ser privados (el grupo tiene que poder aprobarlos) y, una vez creados,
--    solo se les puede BAJAR la dificultad. Para otra cosa: archivar y proponer uno nuevo.
create or replace function public.validate_habit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare c catalog_habits;
begin
  if tg_op = 'UPDATE' and new.catalog_id is distinct from old.catalog_id then
    raise exception 'No se puede cambiar el origen de un hábito.';
  end if;
  if new.catalog_id is not null then
    select * into c from catalog_habits where id = new.catalog_id;
    if c.id is null then raise exception 'Hábito de catálogo inexistente: %', new.catalog_id; end if;
    new.name := c.name; new.area := c.area; new.tier := c.tier; new.criterion := c.criterion;
    new.target := c.target; new.unit := c.unit;
    new.goal_id := null; new.goal_step := 1;
  else
    new.private := false;
    if new.area is null then raise exception 'Elegí un área para el hábito.'; end if;
    if tg_op = 'UPDATE' and (
         new.name <> old.name or new.area is distinct from old.area or new.tier > old.tier
      or new.target <> old.target or new.unit is distinct from old.unit
      or new.goal_id is distinct from old.goal_id or new.goal_step <> old.goal_step
      or new.criterion is distinct from old.criterion) then
      raise exception 'Un hábito propio no se puede modificar (solo bajarle la dificultad). Archivalo y proponé uno nuevo.';
    end if;
    if new.goal_id is not null and not exists (select 1 from goals where id = new.goal_id and user_id = new.user_id) then
      raise exception 'Objetivo inexistente.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists habits_validate on public.habits;
create trigger habits_validate
  before insert or update on public.habits
  for each row execute function public.validate_habit();

-- ───────────── 5. Aprobación de hábitos propios por grupo ─────────────
create table if not exists public.habit_reviews (
  habit_id uuid not null references public.habits(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (habit_id, group_id)
);
create table if not exists public.habit_votes (
  habit_id uuid not null,
  group_id uuid not null,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  approve boolean not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, group_id, voter_id),
  foreign key (habit_id, group_id) references public.habit_reviews(habit_id, group_id) on delete cascade
);
create index if not exists habit_reviews_group_idx on public.habit_reviews (group_id, status);

alter table public.habit_reviews enable row level security;
alter table public.habit_votes enable row level security;
drop policy if exists "reviews: ver de mis grupos" on public.habit_reviews;
drop policy if exists "votes: ver de mis grupos" on public.habit_votes;
create policy "reviews: ver de mis grupos" on public.habit_reviews
  for select to authenticated using (public.is_member(group_id));
create policy "votes: ver de mis grupos" on public.habit_votes
  for select to authenticated using (public.is_member(group_id));
grant select on public.habit_reviews, public.habit_votes to authenticated;

-- Hábitos propios creados antes de 003: se consideran aprobados en los grupos actuales.
insert into public.habit_reviews (habit_id, group_id, status, decided_at)
select h.id, m.group_id, 'approved', now()
from public.habits h join public.group_members m on m.user_id = h.user_id
where h.catalog_id is null
on conflict do nothing;

-- Regla: aprobado si votan a favor ≥ 50 % del resto del grupo; rechazado si votan en contra > 50 %.
-- La decisión es definitiva. Si un hábito queda rechazado en todos sus grupos, se archiva.
create or replace function public.resolve_review(p_habit uuid, p_group uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  owner uuid; others int; yes int; no int; st text;
begin
  select h.user_id, r.status into owner, st
  from habit_reviews r join habits h on h.id = r.habit_id
  where r.habit_id = p_habit and r.group_id = p_group;
  if st is distinct from 'pending' then return st; end if;

  select count(*) into others from group_members where group_id = p_group and user_id <> owner;
  select count(*) filter (where v.approve), count(*) filter (where not v.approve) into yes, no
  from habit_votes v join group_members m on m.group_id = v.group_id and m.user_id = v.voter_id
  where v.habit_id = p_habit and v.group_id = p_group;

  if yes * 2 >= others then st := 'approved';
  elsif no * 2 > others then st := 'rejected';
  else return 'pending';
  end if;

  update habit_reviews set status = st, decided_at = now() where habit_id = p_habit and group_id = p_group;
  if st = 'rejected' and not exists (
       select 1 from habit_reviews where habit_id = p_habit and status <> 'rejected') then
    update habits set archived = true where id = p_habit;
  end if;
  return st;
end $$;

-- Al crear un hábito propio: una revisión por cada grupo del dueño.
create or replace function public.open_reviews_for_habit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if new.catalog_id is null then
    for g in select group_id from group_members where user_id = new.user_id loop
      insert into habit_reviews (habit_id, group_id) values (new.id, g) on conflict do nothing;
      perform public.resolve_review(new.id, g);
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists habits_open_reviews on public.habits;
create trigger habits_open_reviews
  after insert on public.habits
  for each row execute function public.open_reviews_for_habit();

-- Al entrar alguien a un grupo:
--  * sus hábitos propios activos quedan pendientes en ese grupo;
--  * lo que se había aprobado solo porque no había nadie más para votar vuelve a pendiente.
create or replace function public.on_member_joined()
returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  update habit_reviews r set status = 'pending', decided_at = null
  where r.group_id = new.group_id and r.status = 'approved'
    and not exists (select 1 from habit_votes v where v.habit_id = r.habit_id and v.group_id = r.group_id);

  for h in select id from habits where user_id = new.user_id and catalog_id is null and not archived loop
    insert into habit_reviews (habit_id, group_id) values (h, new.group_id) on conflict do nothing;
    perform public.resolve_review(h, new.group_id);
  end loop;
  return new;
end $$;

drop trigger if exists group_members_joined on public.group_members;
create trigger group_members_joined
  after insert on public.group_members
  for each row execute function public.on_member_joined();

-- Al salir alguien: se borran sus votos en ese grupo y se recalculan las pendientes.
create or replace function public.on_member_left()
returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  delete from habit_votes where group_id = old.group_id and voter_id = old.user_id;
  delete from habit_reviews where group_id = old.group_id
    and habit_id in (select id from habits where user_id = old.user_id);
  for r in select habit_id from habit_reviews where group_id = old.group_id and status = 'pending' loop
    perform public.resolve_review(r.habit_id, old.group_id);
  end loop;
  return old;
end $$;

drop trigger if exists group_members_left on public.group_members;
create trigger group_members_left
  after delete on public.group_members
  for each row execute function public.on_member_left();

create or replace function public.vote_habit(p_habit uuid, p_group uuid, p_approve boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare owner uuid; st text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_member(p_group) then raise exception 'No sos miembro de ese grupo.'; end if;
  select h.user_id, r.status into owner, st
  from habit_reviews r join habits h on h.id = r.habit_id
  where r.habit_id = p_habit and r.group_id = p_group;
  if owner is null then raise exception 'No hay nada para votar.'; end if;
  if owner = auth.uid() then raise exception 'No podés votar tu propio hábito.'; end if;
  if st <> 'pending' then raise exception 'Esa votación ya terminó.'; end if;
  insert into habit_votes (habit_id, group_id, voter_id, approve)
  values (p_habit, p_group, auth.uid(), p_approve)
  on conflict (habit_id, group_id, voter_id) do update set approve = excluded.approve, created_at = now();
  return public.resolve_review(p_habit, p_group);
end $$;

-- Lista de revisiones del grupo (incluye nombre del hábito, que la tabla habits ya no expone).
drop function if exists public.group_reviews(uuid);
create function public.group_reviews(p_group uuid)
returns table (habit_id uuid, owner_id uuid, owner_username text, habit_name text, criterion text, area text,
               tier int, target int, unit text, status text, yes int, no int, others int,
               my_vote boolean, created_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, p.id, p.username, h.name, h.criterion, h.area, h.tier, h.target, h.unit, r.status,
         (select count(*)::int from habit_votes v where v.habit_id = r.habit_id and v.group_id = r.group_id and v.approve),
         (select count(*)::int from habit_votes v where v.habit_id = r.habit_id and v.group_id = r.group_id and not v.approve),
         (select count(*)::int from group_members m where m.group_id = r.group_id and m.user_id <> h.user_id),
         (select v.approve from habit_votes v where v.habit_id = r.habit_id and v.group_id = r.group_id and v.voter_id = auth.uid()),
         r.created_at, r.decided_at
  from habit_reviews r
  join habits h on h.id = r.habit_id
  join profiles p on p.id = h.user_id
  where r.group_id = p_group and public.is_member(p_group)
    and (r.status = 'pending' or r.decided_at > now() - interval '7 days')
  order by (r.status = 'pending') desc, r.created_at desc;
$$;

-- Estado de MIS hábitos propios en cada grupo (para mostrar "pendiente" en Hoy y Hábitos).
create or replace function public.my_habit_reviews()
returns table (habit_id uuid, group_id uuid, group_name text, status text)
language sql stable security definer set search_path = public as $$
  select r.habit_id, r.group_id, g.name, r.status
  from habit_reviews r
  join habits h on h.id = r.habit_id
  join groups g on g.id = r.group_id
  where h.user_id = auth.uid();
$$;

-- ───────────── 6. Registros: por partes y con foto ─────────────
alter table public.habit_logs
  add column if not exists count int not null default 1 check (count >= 1),
  add column if not exists target int not null default 1 check (target >= 1),
  add column if not exists photo_path text check (photo_path is null or char_length(photo_path) <= 200);

-- Puntos = parte del hábito (100 × tier / suma de tiers activos) × avance (count / target, máx. 1).
-- Tope: el total del día nunca supera 100. Los hábitos propios pendientes cuentan en la suma de
-- tiers (así, si se aprueban, sus puntos ya están calculados); los rechazados se archivan.
create or replace function public.set_log_points()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  h habits;
  total_tier int;
  used numeric;
  raw numeric;
begin
  if tg_op = 'INSERT' and auth.uid() is not null and new.log_date <> public.user_today(new.user_id) then
    raise exception 'Solo se puede registrar el día de hoy (%).', public.user_today(new.user_id);
  end if;

  select * into h from habits where id = new.habit_id;
  new.target := h.target;

  select coalesce(sum(tier), 0) into total_tier
  from habits
  where user_id = new.user_id and (not archived or id = new.habit_id);

  select coalesce(sum(points), 0) into used
  from habit_logs
  where user_id = new.user_id and log_date = new.log_date and id <> new.id;

  raw := round(100.0 * h.tier / nullif(total_tier, 0) * least(new.count, h.target) / h.target, 2);
  new.points := least(coalesce(raw, 0), greatest(0, 100 - used));
  return new;
end $$;

drop trigger if exists habit_logs_set_points on public.habit_logs;
create trigger habit_logs_set_points
  before insert or update of count on public.habit_logs
  for each row execute function public.set_log_points();

-- Marcar completo / desmarcar (hoy).
create or replace function public.set_habit_done(p_habit uuid, p_done boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare h habits; d date;
begin
  select * into h from habits where id = p_habit and user_id = auth.uid();
  if h.id is null then raise exception 'Hábito inexistente.'; end if;
  d := public.user_today(auth.uid());
  if p_done then
    if h.archived then raise exception 'El hábito está archivado.'; end if;
    insert into habit_logs (habit_id, log_date, count) values (p_habit, d, h.target)
    on conflict (habit_id, log_date) do update set count = excluded.count;
  else
    delete from habit_logs where habit_id = p_habit and log_date = d;
  end if;
end $$;

-- Sumar o restar partes (ej. +1 vaso, +20 páginas). Devuelve el avance de hoy.
create or replace function public.add_habit_progress(p_habit uuid, p_delta int)
returns int
language plpgsql security definer set search_path = public as $$
declare h habits; d date; cur int;
begin
  select * into h from habits where id = p_habit and user_id = auth.uid() and not archived;
  if h.id is null then raise exception 'Hábito inexistente.'; end if;
  if p_delta = 0 or abs(p_delta) > 100000 then raise exception 'Cantidad inválida.'; end if;
  d := public.user_today(auth.uid());
  select count into cur from habit_logs where habit_id = p_habit and log_date = d;
  if cur is null then
    if p_delta < 0 then return 0; end if;
    insert into habit_logs (habit_id, log_date, count) values (p_habit, d, p_delta);
    return p_delta;
  elsif cur + p_delta <= 0 then
    delete from habit_logs where habit_id = p_habit and log_date = d;
    return 0;
  else
    update habit_logs set count = cur + p_delta where habit_id = p_habit and log_date = d;
    return cur + p_delta;
  end if;
end $$;

-- Asociar una foto (ya subida a Storage en <mi_id>/<habit_id>/...) al registro de hoy.
create or replace function public.set_log_photo(p_habit uuid, p_path text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_path is not null and p_path not like auth.uid()::text || '/' || p_habit::text || '/%' then
    raise exception 'Ruta de foto inválida.';
  end if;
  update habit_logs set photo_path = p_path
  where habit_id = p_habit and user_id = auth.uid() and log_date = public.user_today(auth.uid());
  if not found then raise exception 'Marcá el hábito antes de subir la foto.'; end if;
end $$;

-- Racha: días con al menos un hábito COMPLETO (count ≥ target).
create or replace function public.streak_as_of(p_user uuid, p_today date)
returns int
language sql stable security definer set search_path = public as $$
  with d as (
    select distinct log_date from habit_logs
    where user_id = p_user and log_date <= p_today and count >= target
  ),
  g as (select log_date, log_date - (row_number() over (order by log_date))::int as grp from d),
  last_day as (select max(log_date) as ld from d)
  select coalesce((
    select count(*)::int from g
    where grp = (select grp from g where log_date = (select ld from last_day))
      and (select ld from last_day) >= p_today - 1
  ), 0);
$$;

-- ¿Cuenta este hábito en el ranking de este grupo? Catálogo siempre; propios solo si se aprobaron ahí.
create or replace function public.habit_counts_in_group(p_habit uuid, p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from habits where id = p_habit and catalog_id is not null)
      or exists (select 1 from habit_reviews where habit_id = p_habit and group_id = p_group and status = 'approved');
$$;

create or replace function public.group_leaderboard(p_group uuid)
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
                     where l.user_id = b.user_id and l.log_date between b.from_date and b.end_date
                       and public.habit_counts_in_group(l.habit_id, p_group)), 0) as total_points,
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

drop function if exists public.group_feed(uuid, int);
create function public.group_feed(p_group uuid, p_limit int default 30)
returns table (log_id uuid, user_id uuid, username text, habit_name text, habit_area text,
               points numeric, count int, target int, unit text, photo_path text, is_private boolean,
               log_date date, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, p.id, p.username,
         case when h.private and l.user_id <> auth.uid() then 'Hábito privado' else h.name end,
         h.area, l.points, l.count, l.target, h.unit,
         case when h.private and l.user_id <> auth.uid() then null else l.photo_path end,
         h.private, l.log_date, l.created_at
  from habit_logs l
  join habits h on h.id = l.habit_id
  join profiles p on p.id = l.user_id
  where public.is_member(p_group)
    and l.user_id in (select m.user_id from group_members m where m.group_id = p_group)
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

-- ───────────── 7. Radar de 6 áreas (docs/DESIGN.md) ─────────────
-- day1   = nivel del quiz (0–3) × 100 / 3.
-- actual = % de cumplimiento de los hábitos del área en los últimos 14 días completos
--          (sin contar hoy); si no hay hábitos en el área, se repite day1.
create or replace function public.area_radar(p_user uuid)
returns table (area text, day1 numeric, actual numeric)
language sql stable security definer set search_path = public as $$
  with prof as (
    select area_scores, timezone, public.user_today(id) as today from profiles
    where id = p_user and public.shares_group_with(p_user)
  ),
  areas(area) as (values ('cuerpo'),('mente'),('sueno'),('alimentacion'),('foco'),('social')),
  days as (
    select h.area, h.id as habit_id, d::date as day
    from habits h, prof,
         generate_series(prof.today - 14, prof.today - 1, interval '1 day') d
    where h.user_id = p_user and not h.archived
      and d::date >= public.local_date(h.created_at, prof.timezone)
  ),
  done as (
    select ds.area, count(*) as possible,
           coalesce(sum(least(l.count, l.target)::numeric / l.target), 0) as achieved
    from days ds
    left join habit_logs l on l.habit_id = ds.habit_id and l.log_date = ds.day
    group by ds.area
  )
  select a.area,
         round(coalesce((prof.area_scores ->> a.area)::numeric, 0) * 100 / 3, 0),
         coalesce(round(100 * done.achieved / nullif(done.possible, 0), 0),
                  round(coalesce((prof.area_scores ->> a.area)::numeric, 0) * 100 / 3, 0))
  from areas a cross join prof
  left join done on done.area = a.area;
$$;

-- ───────────── 8. Progreso de objetivos ─────────────
-- Progreso = Σ (avance de cada registro × goal_step) de sus hábitos desde que se creó + ajustes manuales.
create or replace function public.goal_list(p_user uuid)
returns table (id uuid, title text, kind text, target numeric, unit text, deadline date,
               archived boolean, created_at timestamptz, progress numeric)
language sql stable security definer set search_path = public as $$
  select g.id, g.title, g.kind, g.target, g.unit, g.deadline, g.archived, g.created_at,
         coalesce((select sum(l.count * h.goal_step) from habits h join habit_logs l on l.habit_id = h.id
                   where h.goal_id = g.id), 0)
       + coalesce((select sum(e.amount) from goal_entries e where e.goal_id = g.id), 0)
  from goals g
  where g.user_id = p_user and public.shares_group_with(p_user)
  order by g.archived, g.created_at desc;
$$;

-- ───────────── 9. Fotos (Supabase Storage) ─────────────
-- Bucket privado "evidencias". Ruta: <user_id>/<habit_id>/<archivo>. Máx. 2 MB (la app comprime antes).
create or replace function public.can_see_evidence(p_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[]; owner uuid; habit uuid;
begin
  parts := string_to_array(p_name, '/');
  if array_length(parts, 1) < 3 then return false; end if;
  begin
    owner := parts[1]::uuid; habit := parts[2]::uuid;
  exception when others then return false;
  end;
  if owner = auth.uid() then return true; end if;
  return public.shares_group_with(owner)
     and exists (select 1 from habits where id = habit and user_id = owner and not private);
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('evidencias', 'evidencias', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

    execute 'drop policy if exists "evidencias: ver" on storage.objects';
    execute 'drop policy if exists "evidencias: subir propias" on storage.objects';
    execute 'drop policy if exists "evidencias: borrar propias" on storage.objects';
    execute $p$create policy "evidencias: ver" on storage.objects for select to authenticated
      using (bucket_id = 'evidencias' and public.can_see_evidence(name))$p$;
    execute $p$create policy "evidencias: subir propias" on storage.objects for insert to authenticated
      with check (bucket_id = 'evidencias' and split_part(name, '/', 1) = auth.uid()::text)$p$;
    execute $p$create policy "evidencias: borrar propias" on storage.objects for delete to authenticated
      using (bucket_id = 'evidencias' and split_part(name, '/', 1) = auth.uid()::text)$p$;
  end if;
end $$;

-- ───────────── 10. Permisos de funciones ─────────────
revoke execute on function
  public.validate_habit(), public.open_reviews_for_habit(), public.on_member_joined(),
  public.on_member_left(), public.resolve_review(uuid, uuid), public.set_log_points()
from public, anon, authenticated;

revoke execute on function
  public.vote_habit(uuid, uuid, boolean), public.group_reviews(uuid), public.my_habit_reviews(),
  public.set_habit_done(uuid, boolean), public.add_habit_progress(uuid, int), public.set_log_photo(uuid, text),
  public.streak_as_of(uuid, date), public.habit_counts_in_group(uuid, uuid), public.group_leaderboard(uuid),
  public.group_feed(uuid, int), public.area_radar(uuid), public.goal_list(uuid), public.can_see_evidence(text)
from public, anon;

grant execute on function
  public.vote_habit(uuid, uuid, boolean), public.group_reviews(uuid), public.my_habit_reviews(),
  public.set_habit_done(uuid, boolean), public.add_habit_progress(uuid, int), public.set_log_photo(uuid, text),
  public.group_leaderboard(uuid), public.group_feed(uuid, int), public.area_radar(uuid), public.goal_list(uuid),
  public.can_see_evidence(text)
to authenticated;

-- habit_logs: el cliente ya no inserta/borra directo; todo pasa por las RPC de arriba.
revoke insert, delete on public.habit_logs from authenticated;
