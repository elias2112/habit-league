-- 006 — Spec v3: plan por día, puntaje recalculado, vicios en tres estados, votación de cambios,
--        Jodita coin (billetera, pool semanal, tienda). Ver docs/MODELO_V3.md.
-- Ejecutar DESPUÉS de schema.sql y 002–005. Se puede re-ejecutar (si re-ejecutás una anterior, re-ejecutá esta).
-- Datos (config, catálogo con pilares, tienda) desde content/ con `npm run catalog`.
--
-- Principio: se guardan definiciones, fotos del plan y eventos crudos. Puntos, multiplicadores, rachas,
-- monedas y saldo se RECALCULAN. Excepción acordada: los días anteriores a esta migración quedan
-- congelados como "legado" (legacy_days) con los puntos que tenían.

-- ───────────── 0. Guarda: un grupo por persona ─────────────
do $$
declare n int; who text;
begin
  select count(*), string_agg(p.username, ', ') into n, who
  from (select user_id from public.group_members group by user_id having count(*) > 1) x
  join public.profiles p on p.id = x.user_id;
  if n > 0 then
    raise exception 'Migración 006 detenida: % persona(s) están en más de un grupo (%). Dejá a cada una en un solo grupo y volvé a ejecutar.', n, who;
  end if;
end $$;
create unique index if not exists group_members_one_group on public.group_members (user_id);

-- ───────────── 1. Configuración ─────────────
-- BEGIN CONFIG3 (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
insert into public.game_config (key, value) values
  ('severity', '{"leve":0.95,"normal":0.9,"grave":0.8}'::jsonb),
  ('multiplierFloor', '0.7'::jsonb),
  ('maxCompletion', '1.5'::jsonb),
  ('coinsAt75', '2'::jsonb),
  ('coinsAt100', '4'::jsonb),
  ('coinThresholdLow', '75'::jsonb),
  ('coinThresholdHigh', '100'::jsonb),
  ('overflowRate', '0.1'::jsonb),
  ('streakStepDays', '7'::jsonb),
  ('streakStepBonus', '0.1'::jsonb),
  ('unpaidSlipStepsLost', '1'::jsonb),
  ('dayCutoffHour', '0'::jsonb),
  ('weekStartsOn', '"monday"'::jsonb),
  ('poolClosesAt', '"sunday 23:59"'::jsonb),
  ('voteWindowHours', '24'::jsonb),
  ('permitResetsCleanStreak', 'true'::jsonb),
  ('minActiveHabits', '3'::jsonb),
  ('maxObjectives', '3'::jsonb),
  ('groupScopeDefaultWeight', '2'::jsonb),
  ('pillars', '[{"id":"cuerpo","name":"Cuerpo","icon":"💪","color":"#FF6B6B"},{"id":"mente","name":"Mente","icon":"🧠","color":"#B4A8FF"},{"id":"dinero","name":"Dinero","icon":"💰","color":"#7BD88F"},{"id":"habilidades","name":"Habilidades","icon":"🛠️","color":"#5AA9FF"},{"id":"creatividad","name":"Creatividad","icon":"🎨","color":"#FF8FD0"},{"id":"carrera","name":"Carrera y estudios","icon":"🎓","color":"#4FD1C5","provisional":true}]'::jsonb),
  ('areaToPillar', '{"cuerpo":"cuerpo","sueno":"cuerpo","alimentacion":"cuerpo","mente":"mente","foco":"mente","social":null}'::jsonb)
on conflict (key) do update set value = excluded.value;
-- END CONFIG3

-- Cambios de parámetros votados por el grupo (rigen desde effective_from).
create table if not exists public.group_config (
  group_id uuid not null references public.groups(id) on delete cascade,
  key text not null,
  value jsonb not null,
  effective_from date not null,
  request_id uuid,
  primary key (group_id, key, effective_from)
);
alter table public.group_config enable row level security;
drop policy if exists "group_config: ver" on public.group_config;
create policy "group_config: ver" on public.group_config for select to authenticated using (public.is_member(group_id));
grant select on public.group_config to authenticated;

create or replace function public.my_group(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from group_members where user_id = p_user limit 1;
$$;

-- Valor de un parámetro para una persona en un día: override del grupo vigente ese día, o el de content/config.json.
create or replace function public.cfg_at(p_user uuid, p_key text, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from group_config where group_id = public.my_group(p_user) and key = p_key and effective_from <= p_day
     order by effective_from desc limit 1),
    (select value from game_config where key = p_key));
$$;
create or replace function public.cfg_num(p_user uuid, p_key text, p_day date)
returns numeric language sql stable security definer set search_path = public as $$
  select (public.cfg_at(p_user, p_key, p_day) #>> '{}')::numeric;
$$;

-- "Hoy" con hora de corte (dayCutoffHour; 0 = medianoche local).
create or replace function public.user_today(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select public.local_date(
    now() - make_interval(hours => coalesce((select (value #>> '{}')::int from game_config where key = 'dayCutoffHour'), 0)),
    coalesce((select timezone from profiles where id = p_user), 'Europe/Madrid'));
$$;

-- Semana: lunes a domingo (weekStartsOn = monday).
create or replace function public.week_start(p_day date)
returns date language sql immutable as $$ select p_day - (extract(isodow from p_day)::int - 1); $$;

-- ───────────── 2. Legado: días anteriores a la migración ─────────────
create table if not exists public.user_game (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  v3_since date not null
);
create table if not exists public.legacy_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  points numeric not null,
  primary key (user_id, day)
);
alter table public.user_game enable row level security;
alter table public.legacy_days enable row level security;
drop policy if exists "user_game: grupo" on public.user_game;
drop policy if exists "legacy: grupo" on public.legacy_days;
create policy "user_game: grupo" on public.user_game for select to authenticated using (public.shares_group_with(user_id));
create policy "legacy: grupo" on public.legacy_days for select to authenticated using (public.shares_group_with(user_id));
grant select on public.user_game, public.legacy_days to authenticated;

-- Congelar con los puntos que tenían (función day_points de 005), solo la primera vez.
insert into public.user_game (user_id, v3_since)
select id, public.user_today(id) from public.profiles
where not exists (select 1 from public.user_game g where g.user_id = profiles.id);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'vice_multiplier')
     and not exists (select 1 from pg_proc where proname = 'score_pure') then
    insert into public.legacy_days (user_id, day, points)
    select d.user_id, d.day, public.day_points(d.user_id, d.day)
    from (
      select distinct l.user_id, l.log_date as day from public.habit_logs l
      union
      select distinct s.user_id, s.day from public.vice_slips s
    ) d
    join public.user_game g on g.user_id = d.user_id
    where d.day < g.v3_since
    on conflict do nothing;
  end if;
end $$;

create or replace function public.v3_since(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select coalesce((select v3_since from user_game where user_id = p_user), date '1900-01-01');
$$;

-- ───────────── 3. Pilares y catálogo ─────────────
alter table public.habits add column if not exists pillar text;
alter table public.habits add column if not exists objective_id uuid;
alter table public.catalog_habits add column if not exists pillar text;

-- BEGIN CATALOG3 (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
update public.catalog_habits set pillar = 'cuerpo' where id = 'caminar_30';
update public.catalog_habits set pillar = 'cuerpo' where id = 'estirar_10';
update public.catalog_habits set pillar = 'cuerpo' where id = 'ejercicio_20';
update public.catalog_habits set pillar = 'cuerpo' where id = 'fuerza_30';
update public.catalog_habits set pillar = 'mente' where id = 'respirar_5';
update public.catalog_habits set pillar = 'mente' where id = 'diario_5';
update public.catalog_habits set pillar = 'mente' where id = 'leer_15';
update public.catalog_habits set pillar = 'mente' where id = 'meditar_15';
update public.catalog_habits set pillar = 'cuerpo' where id = 'pantallas_off_30';
update public.catalog_habits set pillar = 'cuerpo' where id = 'sin_cafeina_tarde';
update public.catalog_habits set pillar = 'cuerpo' where id = 'despertar_fijo';
update public.catalog_habits set pillar = 'cuerpo' where id = 'dormir_7h';
update public.catalog_habits set pillar = 'cuerpo' where id = 'agua_2l';
update public.catalog_habits set pillar = 'cuerpo' where id = 'verdura_2';
update public.catalog_habits set pillar = 'cuerpo' where id = 'cocinar_casa';
update public.catalog_habits set pillar = 'cuerpo' where id = 'sin_ultraprocesados';
update public.catalog_habits set pillar = 'mente' where id = 'planificar_5';
update public.catalog_habits set pillar = 'mente' where id = 'cerrar_dia';
update public.catalog_habits set pillar = 'mente' where id = 'tarea_dificil';
update public.catalog_habits set pillar = 'mente' where id = 'bloque_profundo_45';
update public.catalog_habits set pillar = null where id = 'mensaje_alguien';
update public.catalog_habits set pillar = null where id = 'agradecer';
update public.catalog_habits set pillar = null where id = 'llamada_10';
update public.catalog_habits set pillar = null where id = 'plan_persona';
update public.catalog_habits set pillar = 'cuerpo' where id = 'pasos_10k';
update public.catalog_habits set pillar = 'cuerpo' where id = 'correr_5k';
update public.catalog_habits set pillar = 'cuerpo' where id = 'fumar_menos';
update public.catalog_habits set pillar = 'cuerpo' where id = 'dia_sin_fumar';
update public.catalog_habits set pillar = 'mente' where id = 'redes_2h';
update public.catalog_habits set pillar = 'mente' where id = 'aire_libre_20';
update public.catalog_habits set pillar = 'cuerpo' where id = 'acostarse_fijo';
update public.catalog_habits set pillar = 'cuerpo' where id = 'cama_sin_celular';
update public.catalog_habits set pillar = 'cuerpo' where id = 'max_2_tragos';
update public.catalog_habits set pillar = 'cuerpo' where id = 'dia_sin_alcohol';
update public.catalog_habits set pillar = 'cuerpo' where id = 'sin_delivery';
update public.catalog_habits set pillar = 'cuerpo' where id = 'fruta_2';
update public.catalog_habits set pillar = 'mente' where id = 'celular_manana';
update public.catalog_habits set pillar = 'mente' where id = 'pomodoros_4';
update public.catalog_habits set pillar = null where id = 'ayudar_alguien';
update public.catalog_habits set pillar = null where id = 'comida_compartida';
-- END CATALOG3

create or replace function public.pillar_ok(p_pillar text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from jsonb_array_elements(public.cfg_at(null, 'pillars', current_date)) p where p ->> 'id' = p_pillar);
$$;

-- Hábitos existentes: área → pilar. Conexión sale: se archivan con su historial y se avisa.
create table if not exists public.user_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.user_notices enable row level security;
drop policy if exists "notices: propias" on public.user_notices;
create policy "notices: propias" on public.user_notices for select to authenticated using (user_id = auth.uid());
grant select on public.user_notices to authenticated;

update public.habits h set pillar = public.cfg_at(null, 'areaToPillar', current_date) ->> h.area
where h.pillar is null and h.area is not null and (public.cfg_at(null, 'areaToPillar', current_date) ->> h.area) is not null;

insert into public.user_notices (user_id, text)
select user_id, 'Tu hábito «' || name || '» era del pilar Conexión, que salió del juego. Lo archivamos con su historial intacto. Si lo querés conservar, volvé a agregarlo en otro pilar.'
from public.habits where pillar is null and area = 'social' and not archived;
update public.habits set archived = true where pillar is null and area = 'social' and not archived;

-- Integridad de hábitos (reemplaza la de 003): pilar válido; catálogo manda nombre, pilar y meta.
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
    -- Sin pilar = salió del catálogo (ej. Conexión): no se puede agregar, lo existente sigue igual.
    if c.pillar is null then
      if tg_op = 'INSERT' then raise exception 'Ese hábito ya no está en el catálogo.'; end if;
      return new;
    end if;
    new.name := c.name; new.area := c.area; new.pillar := c.pillar; new.tier := c.tier; new.criterion := c.criterion;
    new.target := c.target; new.unit := c.unit;
  else
    if new.pillar is null and new.area is not null then
      new.pillar := public.cfg_at(null, 'areaToPillar', current_date) ->> new.area;
    end if;
    if tg_op = 'INSERT' and (new.pillar is null or not public.pillar_ok(new.pillar)) then
      raise exception 'Elegí un pilar válido para el hábito.';
    end if;
    if new.goal_id is not null and not exists (select 1 from goals where id = new.goal_id and user_id = new.user_id) then
      raise exception 'Objetivo inexistente.';
    end if;
  end if;
  return new;
end $$;

-- ───────────── 4. Definiciones nuevas ─────────────
create table if not exists public.vices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  suggestion_id text,
  pillar text,
  private boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  catalog_id text,
  title text not null check (char_length(title) between 1 and 80),
  tag text,
  goal_id uuid references public.goals(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Preparada para "eventos" (sin UI en el MVP).
create table if not exists public.objective_events (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.objectives(id) on delete cascade,
  title text not null,
  due_on date,
  done_on date
);

-- ───────────── 5. Plan por día (fotos) ─────────────
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  effective_from date not null,
  created_at timestamptz not null default now(),
  request_id uuid,
  unique (user_id, effective_from)
);
create table if not exists public.plan_habits (
  plan_id uuid not null references public.plans(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  weight int not null check (weight between 1 and 3),
  target numeric check (target is null or target > 0),   -- null = sí/no; número = meta medible
  primary key (plan_id, habit_id)
);
create table if not exists public.plan_vices (
  plan_id uuid not null references public.plans(id) on delete cascade,
  vice_id uuid not null references public.vices(id) on delete cascade,
  weight int not null check (weight between 1 and 3),
  severity text not null check (severity in ('leve','normal','grave')),
  primary key (plan_id, vice_id)
);
create table if not exists public.plan_objectives (
  plan_id uuid not null references public.plans(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  primary key (plan_id, objective_id)
);

-- ───────────── 6. Eventos crudos de vicios ─────────────
create table if not exists public.vice_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  vice_id uuid not null references public.vices(id) on delete cascade,
  day date not null,
  state text not null check (state in ('clean','slipped')),
  primary key (vice_id, day)
);

-- ───────────── 7. Votación, tienda, billetera ─────────────
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('me','group')),
  kind text not null check (kind in ('habit.add','habit.remove','habit.weight','habit.target',
                                     'vice.add','vice.remove','vice.weight','vice.severity',
                                     'objective.add','objective.remove','store.add','store.update','config.set')),
  payload jsonb not null,
  private boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  closes_at timestamptz not null,
  decided_at timestamptz
);
create index if not exists change_requests_group_idx on public.change_requests (group_id, status, created_at desc);
create table if not exists public.change_votes (
  request_id uuid not null references public.change_requests(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('yes','no')),
  created_at timestamptz not null default now(),
  primary key (request_id, voter_id)
);

create table if not exists public.store_catalog (
  slug text primary key,
  name text not null,
  kind text not null check (kind in ('permit','reward')),
  price numeric,
  price_by_weight jsonb,
  weekly_limit int,
  opt_in boolean not null default false,
  conflicts_with text[] not null default '{}',
  per_objective boolean not null default false,
  price_source text
);
-- BEGIN STORE (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
insert into public.store_catalog (slug, name, kind, price, price_by_weight, weekly_limit, opt_in, conflicts_with, per_objective, price_source) values
  ('cerveza', 'Una cerveza', 'permit', 5, null, 6, true, array[]::text[], false, 'dueño'),
  ('trago', 'Un trago', 'permit', 12, null, null, true, array[]::text[], false, 'dueño'),
  ('cigarro', 'Un cigarro', 'permit', 3, null, null, true, array['dejar-fumar']::text[], false, 'sugerencia'),
  ('comer-mal', 'Comer mal (una comida)', 'permit', 10, null, null, true, array[]::text[], false, 'sugerencia'),
  ('antojo-dulce', 'Un antojo dulce', 'permit', 3, null, null, true, array[]::text[], false, 'sugerencia'),
  ('cafe-afuera', 'Café o desayuno afuera', 'reward', 3, null, null, false, array[]::text[], false, 'sugerencia'),
  ('cine', 'Cine', 'reward', 10, null, null, false, array[]::text[], false, 'sugerencia'),
  ('libro', 'Un libro nuevo', 'reward', 15, null, null, false, array[]::text[], false, 'sugerencia'),
  ('cena-afuera', 'Cena afuera', 'reward', 25, null, null, false, array[]::text[], false, 'sugerencia'),
  ('plan-del-grupo', 'Elegir el plan del grupo', 'reward', 6, null, null, false, array[]::text[], false, 'sugerencia'),
  ('pase-habito', 'Pase de un hábito (un día)', 'reward', null, '{"1":2,"2":4,"3":6}'::jsonb, null, false, array[]::text[], false, 'sugerencia'),
  ('comodin-racha', 'Comodín de racha (protege el multiplicador una vez)', 'reward', 10, null, null, false, array[]::text[], false, 'sugerencia'),
  ('dia-libre-objetivo', 'Día libre de un objetivo', 'reward', 8, null, null, false, array[]::text[], true, 'sugerencia'),
  ('premio-grande', 'Premio grande propio', 'reward', null, null, null, false, array[]::text[], false, 'sugerencia')
on conflict (slug) do update set name = excluded.name, kind = excluded.kind, price = excluded.price,
  price_by_weight = excluded.price_by_weight, weekly_limit = excluded.weekly_limit, opt_in = excluded.opt_in,
  conflicts_with = excluded.conflicts_with, per_objective = excluded.per_objective, price_source = excluded.price_source;
-- END STORE

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  slug text,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('permit','reward')),
  price numeric check (price is null or price >= 0),
  price_by_weight jsonb,
  weekly_limit int check (weekly_limit is null or weekly_limit >= 0),
  opt_in boolean not null default false,
  conflicts_with text[] not null default '{}',
  per_objective boolean not null default false,
  price_source text,
  active boolean not null default true,
  unique (group_id, slug)
);
create table if not exists public.store_optins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.store_items(id) on delete cascade,
  primary key (user_id, item_id)
);
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.store_items(id),
  day date not null,
  price_paid numeric not null check (price_paid >= 0),
  vice_id uuid references public.vices(id) on delete set null,
  habit_id uuid references public.habits(id) on delete set null,
  objective_id uuid references public.objectives(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists purchases_user_idx on public.purchases (user_id, day);

-- Sembrar la tienda de cada grupo (y de los grupos nuevos).
create or replace function public.seed_store(p_group uuid)
returns void language sql security definer set search_path = public as $$
  insert into store_items (group_id, slug, name, kind, price, price_by_weight, weekly_limit, opt_in, conflicts_with, per_objective, price_source)
  select p_group, slug, name, kind, price, price_by_weight, weekly_limit, opt_in, conflicts_with, per_objective, price_source
  from store_catalog
  on conflict (group_id, slug) do nothing;
$$;
select public.seed_store(id) from public.groups;
create or replace function public.on_group_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.seed_store(new.id); return new; end $$;
drop trigger if exists groups_seed_store on public.groups;
create trigger groups_seed_store after insert on public.groups for each row execute function public.on_group_created();

-- ───────────── 8. RLS de lo nuevo ─────────────
alter table public.vices enable row level security;
alter table public.objectives enable row level security;
alter table public.objective_events enable row level security;
alter table public.plans enable row level security;
alter table public.plan_habits enable row level security;
alter table public.plan_vices enable row level security;
alter table public.plan_objectives enable row level security;
alter table public.vice_days enable row level security;
alter table public.change_requests enable row level security;
alter table public.change_votes enable row level security;
alter table public.store_catalog enable row level security;
alter table public.store_items enable row level security;
alter table public.store_optins enable row level security;
alter table public.purchases enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vices','objectives','plans','vice_days','store_optins','purchases'] loop
    execute format('drop policy if exists "%s: propios" on public.%I', t, t);
    execute format('create policy "%s: propios" on public.%I for select to authenticated using (user_id = auth.uid())', t, t);
  end loop;
end $$;
drop policy if exists "objective_events: propios" on public.objective_events;
create policy "objective_events: propios" on public.objective_events for select to authenticated
  using (exists (select 1 from public.objectives o where o.id = objective_id and o.user_id = auth.uid()));
drop policy if exists "plan_habits: propios" on public.plan_habits;
drop policy if exists "plan_vices: propios" on public.plan_vices;
drop policy if exists "plan_objectives: propios" on public.plan_objectives;
create policy "plan_habits: propios" on public.plan_habits for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));
create policy "plan_vices: propios" on public.plan_vices for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));
create policy "plan_objectives: propios" on public.plan_objectives for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists "store_catalog: lectura" on public.store_catalog;
drop policy if exists "store_items: grupo" on public.store_items;
drop policy if exists "change_votes: grupo" on public.change_votes;
create policy "store_catalog: lectura" on public.store_catalog for select to authenticated using (true);
create policy "store_items: grupo" on public.store_items for select to authenticated using (public.is_member(group_id));
create policy "change_votes: grupo" on public.change_votes for select to authenticated
  using (exists (select 1 from public.change_requests r where r.id = request_id and public.is_member(r.group_id)));
-- change_requests: se leen vía RPC (los privados se enmascaran); sin select directo.
grant select on public.vices, public.objectives, public.objective_events, public.plans, public.plan_habits, public.plan_vices,
  public.plan_objectives, public.vice_days, public.store_catalog, public.store_items, public.store_optins, public.purchases,
  public.change_votes to authenticated;

-- ───────────── 9. Cálculo puro (porta reference/scoring.mjs y coins.mjs) ─────────────
-- p_habits: [{weight, completion, measurable}]  p_vices: [{weight, severity, state, penalizing}]
-- Se calcula en punto flotante (double precision) y en el mismo orden que reference/scoring.mjs, y se redondea
-- como Math.round(x * 100) / 100: así los casos de medio centavo (ej. 106,625) dan lo mismo que la referencia.
create or replace function public.r2(x double precision)
returns numeric language sql immutable as $$ select (floor(x * 100 + 0.5) / 100)::numeric; $$; -- como Math.round (round() de Postgres en float empata al par)

create or replace function public.score_pure(p_habits jsonb, p_vices jsonb, p_severity jsonb, p_floor numeric, p_max numeric)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  w double precision := 0; wv double precision := 0; acc double precision := 0; b double precision := 0;
  bo double precision := 0; m double precision := 1; raw double precision; h jsonb; v jsonb; cap double precision;
begin
  for h in select * from jsonb_array_elements(coalesce(p_habits, '[]')) loop w := w + (h ->> 'weight')::double precision; end loop;
  for v in select * from jsonb_array_elements(coalesce(p_vices, '[]')) loop wv := wv + (v ->> 'weight')::double precision; end loop;
  if w > 0 then
    for h in select * from jsonb_array_elements(p_habits) loop
      cap := case when coalesce((h ->> 'measurable')::boolean, false) then p_max::double precision else 1 end;
      acc := acc + (h ->> 'weight')::double precision * least(cap, greatest(0, (h ->> 'completion')::double precision));
    end loop;
    b := 100 * acc / w;
  end if;
  if w + wv > 0 then
    for v in select * from jsonb_array_elements(coalesce(p_vices, '[]')) loop
      if v ->> 'state' = 'clean' then bo := bo + 100 * (v ->> 'weight')::double precision / (w + wv); end if;
    end loop;
  end if;
  for v in select * from jsonb_array_elements(coalesce(p_vices, '[]')) loop
    if v ->> 'state' = 'slipped' and coalesce((v ->> 'penalizing')::boolean, true) then
      m := m * (p_severity ->> (v ->> 'severity'))::double precision;
    end if;
  end loop;
  m := greatest(p_floor::double precision, m);
  raw := b + bo;
  return jsonb_build_object('base', public.r2(b), 'bonus', public.r2(bo), 'multiplier', public.r2(m),
                            'total', public.r2(least(100, raw) * m), 'overflow', public.r2(greatest(0, raw - 100) * m));
end $$;

create or replace function public.coins_pure(p_total numeric, p_overflow numeric, p_streak_before int, p_unpaid boolean, p_cfg jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare m numeric; th double precision; after int;
begin
  m := public.r2(1 + (p_cfg ->> 'streakStepBonus')::double precision * floor(p_streak_before / (p_cfg ->> 'streakStepDays')::double precision));
  th := case when p_total >= (p_cfg ->> 'coinThresholdHigh')::numeric then (p_cfg ->> 'coinsAt100')::double precision
             when p_total >= (p_cfg ->> 'coinThresholdLow')::numeric then (p_cfg ->> 'coinsAt75')::double precision else 0 end;
  after := case when p_total >= (p_cfg ->> 'coinThresholdLow')::numeric then p_streak_before + 1 else 0 end;
  if p_unpaid then after := greatest(0, after - ((p_cfg ->> 'streakStepDays')::int * (p_cfg ->> 'unpaidSlipStepsLost')::int)); end if;
  return jsonb_build_object('multiplier', m, 'creditNow', public.r2(th * m::double precision),
                            'toPool', public.r2(p_overflow::double precision * (p_cfg ->> 'overflowRate')::double precision * m::double precision),
                            'streakAfter', after);
end $$;

-- Porta decide() de reference/approval.mjs.
create or replace function public.decide_pure(p_voters int, p_yes int, p_no int, p_window_elapsed boolean)
returns text language sql immutable as $$
  select case
    when p_voters = 0 then 'approved'
    when p_yes > p_voters / 2.0 then 'approved'
    when p_no >= p_voters / 2.0 then 'rejected'
    when not p_window_elapsed then 'pending'
    when p_yes + p_no = 0 then 'approved'
    when p_yes > p_no then 'approved'
    else 'rejected' end;
$$;

-- ───────────── 10. Cálculo con datos ─────────────
create or replace function public.plan_for(p_user uuid, p_day date)
returns uuid language sql stable security definer set search_path = public as $$
  select id from plans where user_id = p_user and effective_from <= p_day order by effective_from desc limit 1;
$$;

-- ¿La recaída de ese vicio ese día está cubierta por un permiso?
create or replace function public.slip_covered(p_vice uuid, p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from purchases pu join store_items si on si.id = pu.item_id
                 where pu.vice_id = p_vice and pu.day = p_day and si.kind = 'permit');
$$;

create or replace function public.day_score(p_user uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pid uuid; habits jsonb; vices jsonb;
begin
  pid := public.plan_for(p_user, p_day);
  if pid is null then
    return jsonb_build_object('base', 0, 'bonus', 0, 'multiplier', 1, 'total', 0, 'overflow', 0);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'weight', ph.weight,
           'measurable', ph.target is not null,
           'completion', case when ph.target is null then (case when coalesce(l.count, 0) >= 1 then 1 else 0 end)
                              else coalesce(l.count, 0)::numeric / ph.target end)), '[]')
    into habits
  from plan_habits ph left join habit_logs l on l.habit_id = ph.habit_id and l.log_date = p_day
  where ph.plan_id = pid;
  select coalesce(jsonb_agg(jsonb_build_object(
           'weight', pv.weight, 'severity', pv.severity, 'state', coalesce(vd.state, 'none'),
           'penalizing', not public.slip_covered(pv.vice_id, p_day))), '[]')
    into vices
  from plan_vices pv left join vice_days vd on vd.vice_id = pv.vice_id and vd.day = p_day
  where pv.plan_id = pid;
  return public.score_pure(habits, vices, public.cfg_at(p_user, 'severity', p_day),
                           public.cfg_num(p_user, 'multiplierFloor', p_day), public.cfg_num(p_user, 'maxCompletion', p_day));
end $$;

-- Puntos del día que usan el ranking y la liga: legado congelado antes de la migración; fórmula nueva después.
create or replace function public.day_points(p_user uuid, p_day date)
returns numeric language sql stable security definer set search_path = public as $$
  select case when p_day < public.v3_since(p_user)
              then coalesce((select points from legacy_days where user_id = p_user and day = p_day), 0)
              else (public.day_score(p_user, p_day) ->> 'total')::numeric end;
$$;

-- Compatibilidad con 004/005 (judgment_today los usa): el multiplicador del día sale del puntaje recalculado.
create or replace function public.vice_multiplier(p_user uuid, p_day date)
returns numeric language sql stable security definer set search_path = public as $$
  select (public.day_score(p_user, p_day) ->> 'multiplier')::numeric;
$$;
create or replace function public.slip_penalty(p_user uuid, p_day date)
returns int language sql stable as $$ select 0; $$;

-- "Días sin" de un vicio hasta un día: solo cuentan 'clean' explícitos y seguidos.
create or replace function public.clean_streak(p_vice uuid, p_day date)
returns int language plpgsql stable security definer set search_path = public as $$
declare d date := p_day; n int := 0; st text;
begin
  loop
    select state into st from vice_days where vice_id = p_vice and day = d;
    exit when st is distinct from 'clean';
    n := n + 1; d := d - 1;
  end loop;
  return n;
end $$;

-- Racha: días con al menos un hábito COMPLETO. Antes de la migración, con la meta guardada en el registro;
-- después, con la meta del plan de ese día.
create or replace function public.streak_as_of(p_user uuid, p_today date)
returns int language sql stable security definer set search_path = public as $$
  with d as (
    select distinct l.log_date from habit_logs l
    left join lateral (select ph.target from plan_habits ph
                       where ph.plan_id = public.plan_for(p_user, l.log_date) and ph.habit_id = l.habit_id) t on true
    where l.user_id = p_user and l.log_date <= p_today
      and case when l.log_date < public.v3_since(p_user) then l.count >= l.target else l.count >= coalesce(t.target, 1) end
  ),
  g as (select log_date, log_date - (row_number() over (order by log_date))::int as grp from d),
  last_day as (select max(log_date) as ld from d)
  select coalesce((
    select count(*)::int from g
    where grp = (select grp from g where log_date = (select ld from last_day))
      and (select ld from last_day) >= p_today - 1
  ), 0);
$$;

-- ¿Hubo una recaída sin permiso ese día? (baja la racha de monedas)
create or replace function public.unpaid_slip(p_user uuid, p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from vice_days vd join plan_vices pv on pv.vice_id = vd.vice_id and pv.plan_id = public.plan_for(p_user, p_day)
                 where vd.user_id = p_user and vd.day = p_day and vd.state = 'slipped' and not public.slip_covered(vd.vice_id, p_day));
$$;

-- Monedas día por día, desde la primera foto del plan hasta hoy (hoy queda abierto).
create or replace function public.coin_days(p_user uuid)
returns table (day date, total numeric, overflow numeric, streak_before int, multiplier numeric, credit numeric, to_pool numeric, closed boolean)
language plpgsql stable security definer set search_path = public as $$
declare d date; today date; streak int := 0; s jsonb; c jsonb; cfg jsonb;
begin
  today := public.user_today(p_user);
  select min(effective_from) into d from plans where user_id = p_user;
  if d is null then return; end if;
  d := greatest(d, public.v3_since(p_user));
  while d <= today loop
    cfg := jsonb_build_object(
      'coinsAt75', public.cfg_at(p_user, 'coinsAt75', d), 'coinsAt100', public.cfg_at(p_user, 'coinsAt100', d),
      'coinThresholdLow', public.cfg_at(p_user, 'coinThresholdLow', d), 'coinThresholdHigh', public.cfg_at(p_user, 'coinThresholdHigh', d),
      'overflowRate', public.cfg_at(p_user, 'overflowRate', d), 'streakStepDays', public.cfg_at(p_user, 'streakStepDays', d),
      'streakStepBonus', public.cfg_at(p_user, 'streakStepBonus', d), 'unpaidSlipStepsLost', public.cfg_at(p_user, 'unpaidSlipStepsLost', d));
    s := public.day_score(p_user, d);
    c := public.coins_pure((s ->> 'total')::numeric, (s ->> 'overflow')::numeric, streak, public.unpaid_slip(p_user, d), cfg);
    day := d; total := (s ->> 'total')::numeric; overflow := (s ->> 'overflow')::numeric;
    streak_before := streak; multiplier := (c ->> 'multiplier')::numeric;
    credit := (c ->> 'creditNow')::numeric; to_pool := (c ->> 'toPool')::numeric; closed := d < today;
    return next;
    streak := (c ->> 'streakAfter')::int;
    d := d + 1;
  end loop;
end $$;

-- Billetera: días cerrados + pool de semanas cerradas − compras. El pool de esta semana se ve pero no se cobra.
create or replace function public.wallet_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with cd as (select * from public.coin_days(p_user)),
       t as (select public.user_today(p_user) as today)
  select jsonb_build_object(
    'balance', round(
        coalesce((select sum(credit) from cd where closed), 0)
      + coalesce((select sum(to_pool) from cd, t where public.week_start(cd.day) < public.week_start(t.today)), 0)
      - coalesce((select sum(price_paid) from purchases where user_id = p_user), 0), 2),
    'pool_this_week', round(coalesce((select sum(to_pool) from cd, t where public.week_start(cd.day) = public.week_start(t.today)), 0), 2),
    'today_credit', coalesce((select credit from cd, t where cd.day = t.today), 0),
    'today_multiplier', coalesce((select multiplier from cd, t where cd.day = t.today), 1),
    'streak', coalesce((select streak_before from cd, t where cd.day = t.today), 0)
  );
$$;

-- ───────────── 11. Plan inicial (quiz) y lo que pasa en el día ─────────────
-- Plan inicial: rige desde HOY y sin votación. Solo si la persona todavía no tiene plan.
-- p_habits: [{catalog_id} | {name, pillar, criterion, unit}] + weight (1–3) + target (opcional) + private (solo catálogo)
-- p_vices:  [{name, suggestion_id, weight, severity}]   p_objectives: [{title, tag, catalog_id, goal_id}]
create or replace function public.create_initial_plan(p_habits jsonb, p_vices jsonb default '[]', p_objectives jsonb default '[]')
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; d date; h jsonb; v jsonb; o jsonb; hid uuid; vid uuid; oid_ uuid; mn int; mx int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from plans where user_id = auth.uid()) then raise exception 'Ya tenés un plan: los cambios se proponen y rigen desde mañana.'; end if;
  d := public.user_today(auth.uid());
  mn := public.cfg_num(auth.uid(), 'minActiveHabits', d);
  mx := public.cfg_num(auth.uid(), 'maxObjectives', d);
  if jsonb_array_length(coalesce(p_habits, '[]')) < mn then raise exception 'Necesitás al menos % hábitos.', mn; end if;
  if jsonb_array_length(coalesce(p_objectives, '[]')) > mx then raise exception 'Hasta % objetivos.', mx; end if;
  insert into user_game (user_id, v3_since) values (auth.uid(), d) on conflict do nothing;
  insert into plans (user_id, effective_from) values (auth.uid(), d) returning id into pid;
  for h in select * from jsonb_array_elements(p_habits) loop
    insert into habits (user_id, name, catalog_id, pillar, criterion, unit, private)
    values (auth.uid(), coalesce(h ->> 'name', 'x'), h ->> 'catalog_id', h ->> 'pillar', h ->> 'criterion', h ->> 'unit',
            coalesce((h ->> 'private')::boolean, false) and h ->> 'catalog_id' is not null)
    returning id into hid;
    insert into plan_habits (plan_id, habit_id, weight, target)
    values (pid, hid, coalesce((h ->> 'weight')::int, 2),
            coalesce(nullif(h ->> 'target', '')::numeric, (select case when target > 1 then target end from habits where id = hid)));
  end loop;
  for v in select * from jsonb_array_elements(coalesce(p_vices, '[]')) loop
    insert into vices (user_id, name, suggestion_id) values (auth.uid(), v ->> 'name', v ->> 'suggestion_id') returning id into vid;
    insert into plan_vices (plan_id, vice_id, weight, severity) values (pid, vid, coalesce((v ->> 'weight')::int, 1), coalesce(v ->> 'severity', 'normal'));
  end loop;
  for o in select * from jsonb_array_elements(coalesce(p_objectives, '[]')) loop
    insert into objectives (user_id, title, tag, catalog_id, goal_id)
    values (auth.uid(), o ->> 'title', o ->> 'tag', o ->> 'catalog_id', nullif(o ->> 'goal_id', '')::uuid) returning id into oid_;
    insert into plan_objectives (plan_id, objective_id) values (pid, oid_);
  end loop;
  return pid;
end $$;

-- Estado de un vicio hoy: 'clean', 'slipped' o 'none' (borra). Desmarcar vuelve a x1,0.
create or replace function public.set_vice_state(p_vice uuid, p_state text)
returns void language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if not exists (select 1 from vices where id = p_vice and user_id = auth.uid()) then raise exception 'Vicio inexistente.'; end if;
  if p_state not in ('none','clean','slipped') then raise exception 'Estado inválido.'; end if;
  d := public.user_today(auth.uid());
  if p_state = 'none' then
    delete from vice_days where vice_id = p_vice and day = d;
  else
    insert into vice_days (user_id, vice_id, day, state) values (auth.uid(), p_vice, d, p_state)
    on conflict (vice_id, day) do update set state = excluded.state;
  end if;
end $$;

-- Marcar completo: con meta medible, la cantidad de la meta del plan de hoy.
create or replace function public.set_habit_done(p_habit uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare h habits; d date; t numeric;
begin
  select * into h from habits where id = p_habit and user_id = auth.uid();
  if h.id is null then raise exception 'Hábito inexistente.'; end if;
  d := public.user_today(auth.uid());
  if p_done then
    select ph.target into t from plan_habits ph where ph.plan_id = public.plan_for(auth.uid(), d) and ph.habit_id = p_habit;
    insert into habit_logs (habit_id, log_date, count) values (p_habit, d, greatest(1, ceil(coalesce(t, h.target, 1)))::int)
    on conflict (habit_id, log_date) do update set count = excluded.count;
  else
    delete from habit_logs where habit_id = p_habit and log_date = d;
  end if;
end $$;

-- Los puntos ya no se congelan en cada registro (`points` queda deprecado).
drop trigger if exists habit_logs_set_points on public.habit_logs;
-- El circuito de aprobación de 003 queda reemplazado por change_requests.
drop trigger if exists habits_open_reviews on public.habits;
drop trigger if exists group_members_joined on public.group_members;
drop trigger if exists group_members_left on public.group_members;

-- Un grupo por persona en las RPC.
create or replace function public.create_group(p_name text, p_duration int default 66)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from group_members where user_id = auth.uid()) then raise exception 'Ya estás en un grupo. Por ahora cada persona juega en uno solo.'; end if;
  insert into groups (name, created_by, duration_days, start_date)
  values (trim(p_name), auth.uid(), p_duration, public.user_today(auth.uid())) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;
create or replace function public.join_group(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select id into gid from groups where invite_code = lower(trim(p_code));
  if gid is null then raise exception 'Código de invitación inválido'; end if;
  if exists (select 1 from group_members where user_id = auth.uid() and group_id <> gid) then
    raise exception 'Ya estás en otro grupo. Por ahora cada persona juega en uno solo.';
  end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

-- ───────────── 12. Votación de cambios ─────────────
-- Copia (o reutiliza) la foto del día siguiente de una persona.
create or replace function public.next_plan(p_user uuid, p_request uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare eff date; cur uuid; pid uuid;
begin
  eff := public.user_today(p_user) + 1;
  select id into pid from plans where user_id = p_user and effective_from = eff;
  if pid is not null then return pid; end if;
  cur := public.plan_for(p_user, eff);
  insert into plans (user_id, effective_from, request_id) values (p_user, eff, p_request) returning id into pid;
  if cur is not null then
    insert into plan_habits (plan_id, habit_id, weight, target) select pid, habit_id, weight, target from plan_habits where plan_id = cur;
    insert into plan_vices (plan_id, vice_id, weight, severity) select pid, vice_id, weight, severity from plan_vices where plan_id = cur;
    insert into plan_objectives (plan_id, objective_id) select pid, objective_id from plan_objectives where plan_id = cur;
  end if;
  return pid;
end $$;

-- Aplica un cambio aprobado. Alcance 'me': a quien propuso. 'group': a cada miembro (peso inicial groupScopeDefaultWeight).
create or replace function public.apply_change(p_req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r change_requests; u uuid; pid uuid; p jsonb; hid uuid; vid uuid; oid_ uuid; w int; ref habits; refv vices;
begin
  select * into r from change_requests where id = p_req;
  p := r.payload;

  if r.kind in ('store.add','store.update','config.set') then
    if r.kind = 'store.add' then
      insert into store_items (group_id, name, kind, price, weekly_limit, opt_in, price_source)
      values (r.group_id, p ->> 'name', coalesce(p ->> 'kind', 'reward'), (p ->> 'price')::numeric, nullif(p ->> 'weekly_limit', '')::int,
              coalesce((p ->> 'opt_in')::boolean, false), 'propuesta del grupo');
    elsif r.kind = 'store.update' then
      update store_items set
        price = coalesce((p ->> 'price')::numeric, price),
        weekly_limit = case when p ? 'weekly_limit' then nullif(p ->> 'weekly_limit', '')::int else weekly_limit end,
        active = coalesce((p ->> 'active')::boolean, active)
      where id = (p ->> 'item_id')::uuid and group_id = r.group_id;
    else
      insert into group_config (group_id, key, value, effective_from, request_id)
      values (r.group_id, p ->> 'key', p -> 'value', public.user_today(r.proposer_id) + 1, r.id)
      on conflict (group_id, key, effective_from) do update set value = excluded.value, request_id = excluded.request_id;
    end if;
    return;
  end if;

  if (p ? 'habit_id') then select * into ref from habits where id = (p ->> 'habit_id')::uuid; end if;
  if (p ? 'vice_id') then select * into refv from vices where id = (p ->> 'vice_id')::uuid; end if;

  for u in select case when r.scope = 'me' then r.proposer_id else m.user_id end
           from group_members m where m.group_id = r.group_id and (r.scope = 'group' or m.user_id = r.proposer_id) loop
    pid := public.next_plan(u, r.id);
    w := case when u = r.proposer_id then coalesce((p ->> 'weight')::int, 2)
              else coalesce(public.cfg_num(u, 'groupScopeDefaultWeight', public.user_today(u) + 1)::int, 2) end;

    if r.kind = 'habit.add' then
      if p ->> 'catalog_id' is not null and exists (
           select 1 from plan_habits ph join habits h on h.id = ph.habit_id where ph.plan_id = pid and h.catalog_id = p ->> 'catalog_id') then
        continue;
      end if;
      insert into habits (user_id, name, catalog_id, pillar, criterion, unit, private)
      values (u, coalesce(p ->> 'name', 'x'), p ->> 'catalog_id', p ->> 'pillar', p ->> 'criterion', p ->> 'unit',
              coalesce((p ->> 'private')::boolean, false) and p ->> 'catalog_id' is not null and u = r.proposer_id)
      returning id into hid;
      insert into plan_habits (plan_id, habit_id, weight, target)
      values (pid, hid, w, coalesce(nullif(p ->> 'target', '')::numeric, (select case when target > 1 then target end from habits where id = hid)));

    elsif r.kind in ('habit.remove','habit.weight','habit.target') then
      -- Para 'group' se busca el mismo hábito en cada persona (mismo catálogo o mismo nombre).
      select ph.habit_id into hid from plan_habits ph join habits h on h.id = ph.habit_id
      where ph.plan_id = pid and (h.id = ref.id or (r.scope = 'group' and (
              (ref.catalog_id is not null and h.catalog_id = ref.catalog_id) or (ref.catalog_id is null and lower(h.name) = lower(ref.name)))))
      limit 1;
      continue when hid is null;
      if r.kind = 'habit.remove' then delete from plan_habits where plan_id = pid and habit_id = hid;
      elsif r.kind = 'habit.weight' then update plan_habits set weight = (p ->> 'weight')::int where plan_id = pid and habit_id = hid;
      else update plan_habits set target = nullif(p ->> 'target', '')::numeric where plan_id = pid and habit_id = hid;
      end if;

    elsif r.kind = 'vice.add' then
      insert into vices (user_id, name, suggestion_id) values (u, p ->> 'name', p ->> 'suggestion_id') returning id into vid;
      insert into plan_vices (plan_id, vice_id, weight, severity) values (pid, vid, w, coalesce(p ->> 'severity', 'normal'));

    elsif r.kind in ('vice.remove','vice.weight','vice.severity') then
      select pv.vice_id into vid from plan_vices pv join vices v on v.id = pv.vice_id
      where pv.plan_id = pid and (v.id = refv.id or (r.scope = 'group' and lower(v.name) = lower(refv.name))) limit 1;
      continue when vid is null;
      if r.kind = 'vice.remove' then delete from plan_vices where plan_id = pid and vice_id = vid;
      elsif r.kind = 'vice.weight' then update plan_vices set weight = (p ->> 'weight')::int where plan_id = pid and vice_id = vid;
      else update plan_vices set severity = p ->> 'severity' where plan_id = pid and vice_id = vid;
      end if;

    elsif r.kind = 'objective.add' then
      continue when (select count(*) from plan_objectives where plan_id = pid) >= public.cfg_num(u, 'maxObjectives', public.user_today(u) + 1);
      insert into objectives (user_id, title, tag, catalog_id) values (u, p ->> 'title', p ->> 'tag', p ->> 'catalog_id') returning id into oid_;
      insert into plan_objectives (plan_id, objective_id) values (pid, oid_);

    elsif r.kind = 'objective.remove' then
      delete from plan_objectives where plan_id = pid and (objective_id = (p ->> 'objective_id')::uuid
        or (r.scope = 'group' and objective_id in (select id from objectives where user_id = u
            and lower(title) = (select lower(title) from objectives where id = (p ->> 'objective_id')::uuid))));
    end if;
  end loop;
end $$;

-- Resuelve las votaciones pendientes del grupo (al leer, votar o proponer) y aplica las aprobadas.
create or replace function public.resolve_requests(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; st text; voters int; yes int; no int;
begin
  for r in select * from change_requests where group_id = p_group and status = 'pending' order by created_at for update loop
    select count(*) into voters from group_members where group_id = p_group and user_id <> r.proposer_id;
    select count(*) filter (where v.vote = 'yes'), count(*) filter (where v.vote = 'no') into yes, no
    from change_votes v join group_members m on m.user_id = v.voter_id and m.group_id = p_group
    where v.request_id = r.id and v.voter_id <> r.proposer_id;
    st := public.decide_pure(voters, yes, no, now() >= r.closes_at);
    if st <> 'pending' then
      update change_requests set status = st, decided_at = now() where id = r.id;
      if st = 'approved' then perform public.apply_change(r.id); end if;
    end if;
  end loop;
end $$;

-- Proponer un cambio. Hábito/vicio privado con alcance 'me': se aprueba sin votar (votarlo lo revelaría).
create or replace function public.propose_change(p_scope text, p_kind text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid; id_ uuid; priv boolean; d date; pid uuid; n int; mn int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  g := public.my_group(auth.uid());
  if g is null then raise exception 'Primero uníte a un grupo o creá uno.'; end if;
  d := public.user_today(auth.uid());
  if p_kind in ('store.add','store.update','config.set') and p_scope <> 'group' then
    raise exception 'Los cambios de tienda y configuración son siempre para todo el grupo.';
  end if;
  if p_kind = 'habit.remove' and p_scope = 'me' then
    pid := public.plan_for(auth.uid(), d + 1);
    select count(*) into n from plan_habits where plan_id = pid;
    mn := public.cfg_num(auth.uid(), 'minActiveHabits', d + 1);
    if n <= mn then raise exception 'Necesitás al menos % hábitos: agregá otro antes de sacar este.', mn; end if;
  end if;
  if (p_payload ? 'weight') and (p_payload ->> 'weight')::int not between 1 and 3 then raise exception 'El peso va de 1 a 3.'; end if;
  priv := p_scope = 'me' and (
       coalesce((p_payload ->> 'private')::boolean, false)
    or exists (select 1 from habits where id = nullif(p_payload ->> 'habit_id', '')::uuid and private)
    or p_kind like 'vice.%');
  insert into change_requests (group_id, proposer_id, scope, kind, payload, private, closes_at)
  values (g, auth.uid(), p_scope, p_kind, p_payload, priv,
          now() + make_interval(hours => public.cfg_num(auth.uid(), 'voteWindowHours', d)::int))
  returning id into id_;
  if priv then
    update change_requests set status = 'approved', decided_at = now() where id = id_;
    perform public.apply_change(id_);
  end if;
  perform public.resolve_requests(g);
  return id_;
end $$;

create or replace function public.vote_change(p_request uuid, p_vote text)
returns text language plpgsql security definer set search_path = public as $$
declare r change_requests;
begin
  select * into r from change_requests where id = p_request;
  if r.id is null or not public.is_member(r.group_id) then raise exception 'Votación inexistente.'; end if;
  if r.proposer_id = auth.uid() then raise exception 'No podés votar tu propio cambio.'; end if;
  perform public.resolve_requests(r.group_id);
  if (select status from change_requests where id = p_request) <> 'pending' then raise exception 'Esa votación ya terminó.'; end if;
  insert into change_votes (request_id, voter_id, vote) values (p_request, auth.uid(), p_vote)
  on conflict (request_id, voter_id) do update set vote = excluded.vote, created_at = now();
  perform public.resolve_requests(r.group_id);
  return (select status from change_requests where id = p_request);
end $$;

-- Votaciones del grupo. Lo privado se muestra como "privado" + peso, sin nombre.
create or replace function public.group_requests(p_group uuid)
returns table (id uuid, proposer_id uuid, proposer text, scope text, kind text, payload jsonb, private boolean, status text,
               yes int, no int, voters int, my_vote text, created_at timestamptz, closes_at timestamptz, decided_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_group) then return; end if;
  perform public.resolve_requests(p_group);
  return query
  select r.id, r.proposer_id, p.username, r.scope, r.kind,
         case when r.private and r.proposer_id <> auth.uid() then jsonb_build_object('weight', r.payload -> 'weight') else r.payload end,
         r.private, r.status,
         (select count(*)::int from change_votes v where v.request_id = r.id and v.vote = 'yes'),
         (select count(*)::int from change_votes v where v.request_id = r.id and v.vote = 'no'),
         (select count(*)::int from group_members m where m.group_id = r.group_id and m.user_id <> r.proposer_id),
         (select v.vote from change_votes v where v.request_id = r.id and v.voter_id = auth.uid()),
         r.created_at, r.closes_at, r.decided_at
  from change_requests r join profiles p on p.id = r.proposer_id
  where r.group_id = p_group and (r.status = 'pending' or r.decided_at > now() - interval '7 days')
  order by (r.status = 'pending') desc, r.created_at desc;
end $$;

-- ───────────── 13. Tienda ─────────────
create or replace function public.buy_item(p_item uuid, p_vice uuid default null, p_habit uuid default null, p_objective uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it store_items; d date; tags text[]; bought int; price numeric; w int; bal numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into it from store_items where id = p_item and group_id = public.my_group(auth.uid()) and active;
  if it.id is null then raise exception 'Artículo inexistente.'; end if;
  d := public.user_today(auth.uid());
  if it.opt_in and not exists (select 1 from store_optins where user_id = auth.uid() and item_id = p_item) then
    raise exception 'Activá este artículo en tu tienda antes de comprarlo.';
  end if;
  select coalesce(array_agg(o.tag) filter (where o.tag is not null), '{}') into tags
  from plan_objectives po join objectives o on o.id = po.objective_id where po.plan_id = public.plan_for(auth.uid(), d);
  if it.conflicts_with && tags then return jsonb_build_object('ok', false, 'reason', 'conflicto-objetivo'); end if;
  select count(*) into bought from purchases where user_id = auth.uid() and item_id = p_item and public.week_start(day) = public.week_start(d);
  if it.weekly_limit is not null and bought >= it.weekly_limit then return jsonb_build_object('ok', false, 'reason', 'limite-semanal'); end if;
  if it.kind = 'permit' and (p_vice is null or not exists (select 1 from vices where id = p_vice and user_id = auth.uid())) then
    raise exception 'Elegí qué vicio cubre el permiso.';
  end if;
  if it.price_by_weight is not null then
    select weight into w from plan_habits where plan_id = public.plan_for(auth.uid(), d) and habit_id = p_habit;
    if w is null then raise exception 'Elegí un hábito de tu plan.'; end if;
    price := (it.price_by_weight ->> w::text)::numeric;
  else
    price := it.price;
  end if;
  if price is null then raise exception 'Este artículo todavía no tiene precio.'; end if;
  bal := (public.wallet_of(auth.uid()) ->> 'balance')::numeric;
  if bal < price then return jsonb_build_object('ok', false, 'reason', 'monedas-insuficientes'); end if;
  insert into purchases (user_id, item_id, day, price_paid, vice_id, habit_id, objective_id)
  values (auth.uid(), p_item, d, price, p_vice, p_habit, p_objective);
  return jsonb_build_object('ok', true, 'price', price);
end $$;

create or replace function public.set_optin(p_item uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from store_items where id = p_item and public.is_member(group_id)) then raise exception 'Artículo inexistente.'; end if;
  if p_on then insert into store_optins (user_id, item_id) values (auth.uid(), p_item) on conflict do nothing;
  else delete from store_optins where user_id = auth.uid() and item_id = p_item; end if;
end $$;

-- ───────────── 14. Lecturas para la UI ─────────────
-- Mi día: plan vigente con pesos, metas, registros, vicios con estado y "días sin", puntaje y billetera.
create or replace function public.my_day()
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date; pid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid());
  pid := public.plan_for(auth.uid(), d);
  return jsonb_build_object(
    'day', d,
    'has_plan', pid is not null,
    'score', public.day_score(auth.uid(), d),
    'wallet', public.wallet_of(auth.uid()),
    'habits', coalesce((select jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', h.name, 'criterion', h.criterion, 'pillar', h.pillar, 'catalog_id', h.catalog_id, 'unit', h.unit,
        'private', h.private, 'weight', ph.weight, 'target', ph.target, 'count', coalesce(l.count, 0), 'photo_path', l.photo_path)
        order by h.created_at)
      from plan_habits ph join habits h on h.id = ph.habit_id
      left join habit_logs l on l.habit_id = h.id and l.log_date = d
      where ph.plan_id = pid), '[]'),
    'vices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'weight', pv.weight, 'severity', pv.severity,
        'state', coalesce(vd.state, 'none'), 'covered', public.slip_covered(v.id, d),
        'clean_days', public.clean_streak(v.id, case when vd.state = 'clean' then d else d - 1 end))
        order by v.created_at)
      from plan_vices pv join vices v on v.id = pv.vice_id
      left join vice_days vd on vd.vice_id = v.id and vd.day = d
      where pv.plan_id = pid), '[]'),
    'objectives', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'tag', o.tag, 'goal_id', o.goal_id))
      from plan_objectives po join objectives o on o.id = po.objective_id where po.plan_id = pid), '[]'),
    'tomorrow_changes', exists (select 1 from plans where user_id = auth.uid() and effective_from > d),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'text', n.text)) from user_notices n
                         where n.user_id = auth.uid() and n.read_at is null), '[]')
  );
end $$;

create or replace function public.dismiss_notice(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update user_notices set read_at = now() where id = p_id and user_id = auth.uid();
$$;

-- Pesos de los amigos (plan vigente). Privados: "Hábito privado" + peso. Los vicios se muestran sin nombre.
create or replace function public.group_plans(p_group uuid)
returns table (user_id uuid, username text, habits jsonb, vices jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.username,
    coalesce((select jsonb_agg(jsonb_build_object(
        'name', case when h.private and p.id <> auth.uid() then 'Hábito privado' else h.name end,
        'pillar', h.pillar, 'weight', ph.weight, 'target', ph.target, 'unit', h.unit) order by ph.weight desc, h.name)
      from plan_habits ph join habits h on h.id = ph.habit_id
      where ph.plan_id = public.plan_for(p.id, public.user_today(p.id))), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object(
        'name', case when p.id = auth.uid() then v.name else 'Vicio' end, 'weight', pv.weight, 'severity', pv.severity))
      from plan_vices pv join vices v on v.id = pv.vice_id
      where pv.plan_id = public.plan_for(p.id, public.user_today(p.id))), '[]')
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = p_group and public.is_member(p_group)
  order by p.username;
$$;

-- Ranking: legado (días anteriores a la migración) + fórmula nueva, sumados; legado aparte para etiquetarlo.
drop function if exists public.group_leaderboard(uuid);
create function public.group_leaderboard(p_group uuid)
returns table (user_id uuid, username text, display_name text, archetype text,
               total_points numeric, legacy_points numeric, max_points numeric, pct numeric, streak int, multiplier numeric)
language sql stable security definer set search_path = public as $$
  with base as (
    select m.user_id,
           greatest(g.start_date, public.local_date(m.joined_at, p.timezone)) as from_date,
           g.start_date + g.duration_days - 1 as end_date,
           public.user_today(m.user_id) as today
    from groups g join group_members m on m.group_id = g.id join profiles p on p.id = m.user_id
    where g.id = p_group and public.is_member(p_group)
  ),
  days as (
    select b.user_id, b.today, b.from_date, b.end_date, gs::date as day
    from base b, generate_series(b.from_date, least(b.end_date, b.today), interval '1 day') gs
  ),
  scored as (
    select b.user_id, b.today, b.from_date, b.end_date,
           coalesce((select sum(public.day_points(d.user_id, d.day)) from days d where d.user_id = b.user_id), 0) as total,
           coalesce((select sum(public.day_points(d.user_id, d.day)) from days d
                     where d.user_id = b.user_id and d.day < public.v3_since(b.user_id)), 0) as legacy
    from base b
  )
  select p.id, p.username, p.display_name, p.archetype,
         round(s.total, 2), round(s.legacy, 2),
         100.0 * greatest(0, least(s.end_date, s.today) - s.from_date + 1),
         round(100.0 * s.total / nullif(100.0 * greatest(0, least(s.end_date, s.today) - s.from_date + 1), 0), 1),
         public.streak_as_of(p.id, s.today),
         (public.day_score(p.id, s.today) ->> 'multiplier')::numeric
  from scored s join profiles p on p.id = s.user_id
  order by s.total desc, p.username;
$$;

-- Actividad del grupo: registros, cambios votados y compras (todo visible; privados enmascarados).
create or replace function public.group_activity(p_group uuid, p_limit int default 40)
returns table (at timestamptz, kind text, user_id uuid, username text, text text, detail jsonb)
language sql stable security definer set search_path = public as $$
  select * from (
    select l.created_at, 'log', p.id, p.username,
           case when h.private and p.id <> auth.uid() then 'Hábito privado' else h.name end,
           jsonb_build_object('count', l.count, 'unit', h.unit, 'photo_path', case when h.private and p.id <> auth.uid() then null else l.photo_path end)
    from habit_logs l join habits h on h.id = l.habit_id join profiles p on p.id = l.user_id
    where public.is_member(p_group) and l.user_id in (select user_id from group_members where group_id = p_group)
    union all
    select coalesce(r.decided_at, r.created_at), 'change', p.id, p.username, r.kind,
           jsonb_build_object('status', r.status, 'scope', r.scope,
                              'payload', case when r.private and p.id <> auth.uid() then jsonb_build_object('weight', r.payload -> 'weight') else r.payload end)
    from change_requests r join profiles p on p.id = r.proposer_id
    where r.group_id = p_group and public.is_member(p_group)
    union all
    select pu.created_at, 'purchase', p.id, p.username, si.name, jsonb_build_object('price', pu.price_paid, 'kind', si.kind)
    from purchases pu join store_items si on si.id = pu.item_id join profiles p on p.id = pu.user_id
    where si.group_id = p_group and public.is_member(p_group)
  ) x order by 1 desc limit least(greatest(p_limit, 1), 100);
$$;

-- Radar por pilares (config): día 1 = promedio del nivel del quiz de las áreas que caen en el pilar;
-- actual = cumplimiento de los hábitos del pilar en el plan de cada uno de los últimos 14 días.
drop function if exists public.area_radar(uuid);
create function public.area_radar(p_user uuid)
returns table (area text, day1 numeric, actual numeric)
language sql stable security definer set search_path = public as $$
  with prof as (
    select area_scores, public.user_today(id) as today from profiles where id = p_user and public.shares_group_with(p_user)
  ),
  pillars as (select x ->> 'id' as id from jsonb_array_elements(public.cfg_at(p_user, 'pillars', current_date)) x),
  d1 as (
    select pl.id, round(avg((prof.area_scores ->> m.key)::numeric) * 100 / 3, 0) as v
    from pillars pl cross join prof
    join jsonb_each_text(public.cfg_at(p_user, 'areaToPillar', current_date)) m on m.value = pl.id
    where prof.area_scores ? m.key
    group by pl.id
  ),
  days as (
    select h.pillar, ph.weight, ph.target, l.count, gs::date as day
    from prof, generate_series(prof.today - 14, prof.today - 1, interval '1 day') gs
    join plan_habits ph on ph.plan_id = public.plan_for(p_user, gs::date)
    join habits h on h.id = ph.habit_id
    left join habit_logs l on l.habit_id = h.id and l.log_date = gs::date
  ),
  act as (
    select pillar, round(100 * avg(case when target is null then (case when coalesce(count, 0) >= 1 then 1 else 0 end)
                                        else least(1, coalesce(count, 0) / target) end), 0) as v
    from days group by pillar
  )
  select pl.id, coalesce(d1.v, 0), coalesce(act.v, d1.v, 0)
  from pillars pl cross join prof
  left join d1 on d1.id = pl.id left join act on act.pillar = pl.id;
$$;

-- ───────────── 15. Migración de datos existentes ─────────────
do $$
declare u record; pid uuid; d date;
begin
  for u in select g.user_id, g.v3_since from user_game g
           where not exists (select 1 from plans p where p.user_id = g.user_id)
             and exists (select 1 from habits h where h.user_id = g.user_id and not h.archived and h.pillar is not null) loop
    insert into plans (user_id, effective_from) values (u.user_id, u.v3_since) returning id into pid;
    insert into plan_habits (plan_id, habit_id, weight, target)
    select pid, h.id, least(greatest(h.tier, 1), 3), case when h.target > 1 then h.target end
    from habits h where h.user_id = u.user_id and not h.archived and h.pillar is not null;
    -- Vicios declarados (005) → vicios con estados (normal, peso 1).
    if to_regclass('public.user_vices') is not null then
      insert into vices (id, user_id, name, suggestion_id)
      select uv.id, uv.user_id, uv.name, uv.vice_id from user_vices uv
      where uv.user_id = u.user_id and uv.ended_on is null on conflict do nothing;
      insert into plan_vices (plan_id, vice_id, weight, severity)
      select pid, uv.id, 1, 'normal' from user_vices uv where uv.user_id = u.user_id and uv.ended_on is null on conflict do nothing;
      -- Tropiezos de hoy en adelante → recaída (los anteriores ya están en el legado).
      insert into vices (user_id, name, suggestion_id)
      select distinct s.user_id, vc.name, s.vice_id from vice_slips s join vice_catalog vc on vc.id = s.vice_id
      where s.user_id = u.user_id and s.day >= u.v3_since
        and not exists (select 1 from vices v where v.user_id = s.user_id and v.suggestion_id = s.vice_id);
      insert into plan_vices (plan_id, vice_id, weight, severity)
      select pid, v.id, 1, 'normal' from vices v where v.user_id = u.user_id on conflict do nothing;
      insert into vice_days (user_id, vice_id, day, state)
      select s.user_id, v.id, s.day, 'slipped' from vice_slips s join vices v on v.user_id = s.user_id and v.suggestion_id = s.vice_id
      where s.user_id = u.user_id and s.day >= u.v3_since on conflict do nothing;
    end if;
    -- Objetivos que no son de ahorro (los de ahorro siguen como cofres). Hasta 3, los más nuevos.
    insert into objectives (user_id, title, goal_id)
    select g.user_id, g.title, g.id from goals g
    where g.user_id = u.user_id and g.kind <> 'ahorro' and not g.archived
      and not exists (select 1 from objectives o where o.goal_id = g.id)
    order by g.created_at desc limit 3;
    insert into plan_objectives (plan_id, objective_id)
    select pid, o.id from objectives o where o.user_id = u.user_id on conflict do nothing;
  end loop;
end $$;

-- Las RPC de 005 quedan fuera de uso.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'declare_vice') then
    revoke execute on function public.declare_vice(text, text), public.end_vice(uuid), public.log_slip(text, boolean) from authenticated;
  end if;
end $$;

-- ───────────── 16. Permisos de funciones ─────────────
revoke execute on function
  public.my_group(uuid), public.cfg_at(uuid, text, date), public.cfg_num(uuid, text, date), public.v3_since(uuid),
  public.pillar_ok(text), public.r2(double precision), public.score_pure(jsonb, jsonb, jsonb, numeric, numeric), public.coins_pure(numeric, numeric, int, boolean, jsonb),
  public.plan_for(uuid, date), public.slip_covered(uuid, date), public.day_score(uuid, date), public.day_points(uuid, date),
  public.clean_streak(uuid, date), public.unpaid_slip(uuid, date), public.coin_days(uuid), public.wallet_of(uuid),
  public.next_plan(uuid, uuid), public.apply_change(uuid), public.resolve_requests(uuid), public.seed_store(uuid),
  public.on_group_created(), public.vice_multiplier(uuid, date), public.slip_penalty(uuid, date)
from public, anon, authenticated;
revoke execute on function
  public.create_initial_plan(jsonb, jsonb, jsonb), public.set_vice_state(uuid, text), public.set_habit_done(uuid, boolean),
  public.create_group(text, int), public.join_group(text), public.propose_change(text, text, jsonb), public.vote_change(uuid, text),
  public.group_requests(uuid), public.buy_item(uuid, uuid, uuid, uuid), public.set_optin(uuid, boolean), public.my_day(),
  public.dismiss_notice(uuid), public.group_plans(uuid), public.group_leaderboard(uuid), public.group_activity(uuid, int),
  public.area_radar(uuid), public.user_today(uuid), public.week_start(date), public.decide_pure(int, int, int, boolean)
from public, anon;
grant execute on function
  public.create_initial_plan(jsonb, jsonb, jsonb), public.set_vice_state(uuid, text), public.set_habit_done(uuid, boolean),
  public.create_group(text, int), public.join_group(text), public.propose_change(text, text, jsonb), public.vote_change(uuid, text),
  public.group_requests(uuid), public.buy_item(uuid, uuid, uuid, uuid), public.set_optin(uuid, boolean), public.my_day(),
  public.dismiss_notice(uuid), public.group_plans(uuid), public.group_leaderboard(uuid), public.group_activity(uuid, int),
  public.area_radar(uuid), public.user_today(uuid)
to authenticated;
