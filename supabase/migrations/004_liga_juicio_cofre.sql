-- 004 — Liga de las Tres Transformaciones, Juicio del día y Cofres (docs/JUEGO.md).
-- Ejecutar DESPUÉS de schema.sql, 002 y 003 (SQL Editor de Supabase). Se puede re-ejecutar.
-- Las preguntas y la configuración salen de content/judgment.json (`npm run catalog`).
--
-- Resumen:
--  * Los 100 puntos diarios y el ranking NO cambian. La liga es una capa aparte con PL (puntos de liga).
--  * PL de un día = hábitos ((puntos − 50) / 2,5, de −20 a +20) + Juicio (preguntas de la mañana sobre ayer).
--  * La etapa potencia ×1,5 lo positivo de su categoría (camello: hábitos, león: vicios, niño: disfrute y misiones).
--  * Los días se procesan al abrir la app (league_sync). Ayer espera al Juicio; si no se responde,
--    se procesa al día siguiente solo con los hábitos.

-- ───────────── Configuración y preguntas (desde content/judgment.json) ─────────────
create table if not exists public.game_config (key text primary key, value jsonb not null);
create table if not exists public.judgment_questions (
  id text primary key,
  kind text not null check (kind in ('core','bonus')),
  text text not null,
  hint text,
  type text not null check (type in ('yesno','count','money')),
  unit text,
  category text not null check (category in ('habitos','vicio','disfrute','dinero','bonus')),
  params jsonb not null,
  condition jsonb,
  sort int not null default 0
);
alter table public.game_config enable row level security;
alter table public.judgment_questions enable row level security;
drop policy if exists "config: lectura" on public.game_config;
drop policy if exists "judgment_questions: lectura" on public.judgment_questions;
create policy "config: lectura" on public.game_config for select to authenticated using (true);
create policy "judgment_questions: lectura" on public.judgment_questions for select to authenticated using (true);
grant select on public.game_config, public.judgment_questions to authenticated;

-- BEGIN JUDGMENT (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
insert into public.judgment_questions (id, kind, text, hint, type, unit, category, params, condition, sort) values
  ('comida', 'core', '¿Comiste mal ayer (chatarra, atracón, nada de verdura)?', null, 'yesno', null, 'vicio', '{"yes":-5,"no":2}'::jsonb, null, 0),
  ('fumar', 'core', '¿Fumaste o vapeaste ayer? ¿Cuántos cigarrillos o sesiones?', 'Contá cada cigarrillo o cada vez que agarraste el vaper.', 'count', 'cigarrillos', 'vicio', '{"zero":3,"free":0,"per_unit":-1,"min":-10}'::jsonb, '{"quiz":"q21","in":["b","c","d"],"opt":"fumar"}'::jsonb, 1),
  ('alcohol', 'core', '¿Tomaste alcohol ayer? ¿Cuántos tragos?', 'Hasta 2 no restan.', 'count', 'tragos', 'vicio', '{"zero":2,"free":2,"per_unit":-2,"min":-10}'::jsonb, '{"quiz":"q22","in":["b","c","d"],"opt":"alcohol"}'::jsonb, 2),
  ('gasto', 'core', '¿Gastaste en algo que no necesitabas? ¿Cuánto?', 'Ese gasto alimenta al Dragón.', 'money', null, 'dinero', '{"zero":2,"per_5":-1,"cap":-10}'::jsonb, null, 3),
  ('ahorro', 'core', '¿Ahorraste algo aparte de tus hábitos? ¿Cuánto?', 'Lo podés guardar en uno de tus cofres.', 'money', null, 'dinero', '{"zero":0,"per_5":1,"cap":10}'::jsonb, null, 4),
  ('disfrute', 'core', '¿Hiciste algo solo porque lo disfrutás?', null, 'yesno', null, 'disfrute', '{"yes":3,"no":0}'::jsonb, null, 5),
  ('cama', 'bonus', '¿Hiciste la cama?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 0),
  ('buena_accion', 'bonus', '¿Hiciste una buena acción por alguien?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 1),
  ('ordenar', 'bonus', '¿Ordenaste algo durante 10 minutos?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 2),
  ('familia', 'bonus', '¿Hablaste con alguien de tu familia?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 3),
  ('aprender', 'bonus', '¿Aprendiste algo nuevo?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 4),
  ('sin_auriculares', 'bonus', '¿Caminaste un rato sin auriculares ni celular?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 5),
  ('cocinar_otros', 'bonus', '¿Cocinaste o preparaste algo para otra persona?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 6),
  ('cumplido', 'bonus', '¿Le hiciste un cumplido sincero a alguien?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 7),
  ('sin_quejas', 'bonus', '¿Pasaste el día sin quejarte?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 8),
  ('comida_sin_celular', 'bonus', '¿Comiste al menos una vez sin el celular?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 9),
  ('agua_despertar', 'bonus', '¿Tomaste un vaso de agua al despertar?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 10),
  ('luz_natural', 'bonus', '¿Te diste 10 minutos de luz natural a la mañana?', null, 'yesno', null, 'bonus', '{"yes":3,"no":0}'::jsonb, null, 11)
on conflict (id) do update set kind = excluded.kind, text = excluded.text, hint = excluded.hint, type = excluded.type,
  unit = excluded.unit, category = excluded.category, params = excluded.params, condition = excluded.condition, sort = excluded.sort;
delete from public.judgment_questions where id not in ('comida', 'fumar', 'alcohol', 'gasto', 'ahorro', 'disfrute', 'cama', 'buena_accion', 'ordenar', 'familia', 'aprender', 'sin_auriculares', 'cocinar_otros', 'cumplido', 'sin_quejas', 'comida_sin_celular', 'agua_despertar', 'luz_natural');
insert into public.game_config (key, value) values
  ('bonus_per_day', '2'::jsonb),
  ('boost_factor', '1.5'::jsonb),
  ('shield_days', '3'::jsonb),
  ('demote_to_pl', '75'::jsonb),
  ('milestones', '{"25":5,"50":10,"75":15,"100":30}'::jsonb),
  ('weekly_chest_bonus', '5'::jsonb),
  ('stages', '[{"id":"camello","name":"Camello","emoji":"🐪","boost":["habitos"],"theme":"Disciplina: cargás el plan y lo cumplís."},{"id":"leon","name":"León","emoji":"🦁","boost":["vicio"],"theme":"Destrucción: le decís que no a lo que te frena."},{"id":"nino","name":"Niño","emoji":"🧒","boost":["disfrute","bonus"],"theme":"Disfrute: jugás, creás y empezás de nuevo."},{"id":"zaratustra","name":"Zaratustra","emoji":"✨","boost":[],"theme":"Lo sostenés todo."}]'::jsonb)
on conflict (key) do update set value = excluded.value;
-- END JUDGMENT

create or replace function public.cfg(p_key text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select value from game_config where key = p_key;
$$;

-- ───────────── Preferencias (solo las ve su dueño) ─────────────
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  share_judgment boolean not null default false,   -- el grupo ve el detalle del Juicio (no solo el total)
  judgment_opt jsonb not null default '{}'::jsonb  -- {"fumar": true|false, "alcohol": true|false}
);
alter table public.user_settings enable row level security;
drop policy if exists "settings: propias" on public.user_settings;
create policy "settings: propias" on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.user_settings to authenticated;

-- ───────────── Juicios, estado de liga y eventos ─────────────
create table if not exists public.daily_judgments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  answers jsonb not null,
  scores jsonb not null,
  total int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
create table if not exists public.league_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stage text not null default 'camello' check (stage in ('camello','leon','nino','zaratustra')),
  division int not null default 3 check (division between 1 and 3),
  pl int not null default 0,
  shield_until date,
  last_day date not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.league_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('dia','semana','dragon','hito','ascenso','descenso')),
  pl int not null default 0,
  note text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists league_events_once on public.league_events (user_id, day, kind)
  where kind in ('dia','semana','dragon');
create index if not exists league_events_user_idx on public.league_events (user_id, created_at desc);

create table if not exists public.goal_milestones (
  goal_id uuid not null references public.goals(id) on delete cascade,
  pct int not null,
  awarded_at timestamptz not null default now(),
  primary key (goal_id, pct)
);

alter table public.daily_judgments enable row level security;
alter table public.league_state enable row level security;
alter table public.league_events enable row level security;
alter table public.goal_milestones enable row level security;
drop policy if exists "judgments: propios" on public.daily_judgments;
drop policy if exists "league_state: grupo" on public.league_state;
drop policy if exists "league_events: propios" on public.league_events;
drop policy if exists "milestones: grupo" on public.goal_milestones;
create policy "judgments: propios" on public.daily_judgments for select to authenticated using (user_id = auth.uid());
create policy "league_state: grupo" on public.league_state for select to authenticated using (public.shares_group_with(user_id));
create policy "league_events: propios" on public.league_events for select to authenticated using (user_id = auth.uid());
create policy "milestones: grupo" on public.goal_milestones for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and public.shares_group_with(g.user_id)));
grant select on public.daily_judgments, public.league_state, public.league_events, public.goal_milestones to authenticated;

-- ───────────── Cofres compartidos de grupo ─────────────
create table if not exists public.group_chests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  target numeric(14,2) not null check (target > 0),
  unit text not null default '€' check (char_length(unit) between 1 and 10),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.group_chest_entries (
  id uuid primary key default gen_random_uuid(),
  chest_id uuid not null references public.group_chests(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount <> 0),
  note text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now()
);
alter table public.group_chests enable row level security;
alter table public.group_chest_entries enable row level security;
drop policy if exists "chests: ver" on public.group_chests;
drop policy if exists "chests: crear" on public.group_chests;
drop policy if exists "chests: archivar" on public.group_chests;
drop policy if exists "chest_entries: ver" on public.group_chest_entries;
drop policy if exists "chest_entries: aportar" on public.group_chest_entries;
drop policy if exists "chest_entries: borrar propias" on public.group_chest_entries;
create policy "chests: ver" on public.group_chests for select to authenticated using (public.is_member(group_id));
create policy "chests: crear" on public.group_chests for insert to authenticated
  with check (public.is_member(group_id) and created_by = auth.uid());
create policy "chests: archivar" on public.group_chests for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "chest_entries: ver" on public.group_chest_entries for select to authenticated
  using (exists (select 1 from public.group_chests c where c.id = chest_id and public.is_member(c.group_id)));
create policy "chest_entries: aportar" on public.group_chest_entries for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.group_chests c where c.id = chest_id and public.is_member(c.group_id) and not c.archived));
create policy "chest_entries: borrar propias" on public.group_chest_entries for delete to authenticated using (user_id = auth.uid());
grant select, insert on public.group_chests to authenticated;
grant update (archived) on public.group_chests to authenticated;
grant select, insert, delete on public.group_chest_entries to authenticated;

-- ───────────── Juicio: preguntas aplicables y puntaje ─────────────
-- Se pregunta si la persona lo activó; no si lo desactivó; si no dijo nada, según su quiz
-- (sin respuestas del quiz, se pregunta).
create or replace function public.question_applies(p_condition jsonb, p_user uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare opt text; ans text;
begin
  if p_condition is null then return true; end if;
  select judgment_opt ->> (p_condition ->> 'opt') into opt from user_settings where user_id = p_user;
  if opt = 'true' then return true; end if;
  if opt = 'false' then return false; end if;
  select quiz_answers ->> (p_condition ->> 'quiz') into ans from profiles where id = p_user;
  if ans is null then return true; end if;
  return ans in (select jsonb_array_elements_text(p_condition -> 'in'));
end $$;

-- Preguntas del Juicio de un día: las fijas que aplican + N misiones sorpresa (siempre las mismas para esa persona ese día).
create or replace function public.judgment_questions_for(p_user uuid, p_day date)
returns setof public.judgment_questions
language sql stable security definer set search_path = public as $$
  (select * from judgment_questions where kind = 'core' and public.question_applies(condition, p_user) order by sort)
  union all
  (select * from judgment_questions where kind = 'bonus'
   order by md5(p_user::text || p_day::text || id)
   limit coalesce((public.cfg('bonus_per_day'))::int, 2));
$$;

create or replace function public.score_answer(p_type text, p_params jsonb, p_value jsonb)
returns int
language plpgsql immutable set search_path = public as $$
declare n numeric; v int;
begin
  if p_value is null or p_value = 'null'::jsonb then return 0; end if;
  if p_type = 'yesno' then
    return case when p_value = 'true'::jsonb then (p_params ->> 'yes')::int else (p_params ->> 'no')::int end;
  end if;
  n := greatest(0, (p_value #>> '{}')::numeric);
  if p_type = 'count' then
    if n = 0 then return (p_params ->> 'zero')::int; end if;
    if n <= (p_params ->> 'free')::numeric then return 0; end if;
    return greatest((p_params ->> 'min')::int, ((p_params ->> 'per_unit')::numeric * (n - (p_params ->> 'free')::numeric))::int);
  end if;
  -- money: cada 5 € (o fracción) suma per_5, con tope cap
  if n = 0 then return (p_params ->> 'zero')::int; end if;
  v := ((p_params ->> 'per_5')::numeric * ceil(n / 5))::int;
  return case when (p_params ->> 'per_5')::numeric < 0 then greatest(v, (p_params ->> 'cap')::int)
              else least(v, (p_params ->> 'cap')::int) end;
end $$;

-- PL de hábitos de un día: (puntos − 50) / 2,5, entre −20 y +20; sin ningún registro, −20.
create or replace function public.habits_pl(p_user uuid, p_day date)
returns int
language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then -20
              else greatest(-20, least(20, round((coalesce(sum(points), 0) - 50) / 2.5)))::int end
  from habit_logs where user_id = p_user and log_date = p_day;
$$;

-- Estado del Juicio de AYER para quien llama (para la pantalla Hoy).
create or replace function public.judgment_today()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date; j daily_judgments; pts numeric; done int; total int; last date;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid()) - 1;
  select last_day into last from league_state where user_id = auth.uid();
  select * into j from daily_judgments where user_id = auth.uid() and day = d;
  select coalesce(sum(points), 0), count(*) filter (where count >= target) into pts, done
  from habit_logs where user_id = auth.uid() and log_date = d;
  select count(*) into total from habits where user_id = auth.uid() and not archived;
  return jsonb_build_object(
    'day', d,
    -- El primer día en la liga no hay Juicio (ayer todavía no jugabas).
    'available', last is not null and d > last,
    'submitted', j.user_id is not null,
    'total', j.total,
    'points', round(pts),
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

-- ───────────── Liga: pruebas, ascensos y descensos ─────────────
create or replace function public.stage_next(p_stage text) returns text language sql immutable as $$
  select case p_stage when 'camello' then 'leon' when 'leon' then 'nino' when 'nino' then 'zaratustra' else 'zaratustra' end;
$$;
create or replace function public.stage_prev(p_stage text) returns text language sql immutable as $$
  select case p_stage when 'zaratustra' then 'nino' when 'nino' then 'leon' when 'leon' then 'camello' else 'camello' end;
$$;
create or replace function public.stage_rank(p_stage text) returns int language sql immutable as $$
  select case p_stage when 'camello' then 1 when 'leon' then 2 when 'nino' then 3 when 'zaratustra' then 4 else 0 end;
$$;

-- Pruebas para pasar de etapa (evaluadas con datos hasta p_day).
create or replace function public.trial_passed(p_user uuid, p_stage text, p_day date)
returns boolean
language sql stable security definer set search_path = public as $$
  select case p_stage
    -- Camello → León: 7 días seguidos con al menos 70 puntos.
    when 'camello' then (
      select count(*) = 7 from generate_series(p_day - 6, p_day, interval '1 day') d
      where (select coalesce(sum(points), 0) from habit_logs where user_id = p_user and log_date = d::date) >= 70)
    -- León → Niño: 10 días limpios (Juicio sin ningún vicio negativo) en los últimos 14.
    when 'leon' then (
      select count(*) >= 10 from daily_judgments j
      where j.user_id = p_user and j.day between p_day - 13 and p_day
        and not exists (select 1 from jsonb_each_text(j.scores) s
                        join judgment_questions q on q.id = s.key
                        where q.category = 'vicio' and s.value::int < 0))
    -- Niño → Zaratustra: un objetivo completo y racha de 21 días.
    when 'nino' then (
      public.streak_as_of(p_user, p_day) >= 21 and exists (
        select 1 from public.goal_list(p_user) g where g.progress >= g.target))
    else false end;
$$;

create or replace function public.league_apply(p_user uuid, p_delta int, p_day date)
returns void
language plpgsql security definer set search_path = public as $$
declare s league_state; shield int; nxt text;
begin
  shield := coalesce((public.cfg('shield_days'))::int, 3);
  select * into s from league_state where user_id = p_user for update;
  s.pl := s.pl + p_delta;

  while s.pl >= 100 and s.stage <> 'zaratustra' loop
    if s.division > 1 then
      s.division := s.division - 1;
      s.pl := s.pl - 100;
      s.shield_until := p_day + shield;
      insert into league_events (user_id, day, kind, note) values (p_user, p_day, 'ascenso', s.stage || ' ' || s.division);
    elsif public.trial_passed(p_user, s.stage, p_day) then
      nxt := public.stage_next(s.stage);
      s.stage := nxt;
      s.division := case when nxt = 'zaratustra' then 1 else 3 end;
      s.pl := s.pl - 100;
      s.shield_until := p_day + shield;
      insert into league_events (user_id, day, kind, note) values (p_user, p_day, 'ascenso', nxt || ' ' || s.division);
    else
      s.pl := 100; -- tope: falta la prueba de etapa
      exit;
    end if;
  end loop;
  if s.stage = 'zaratustra' and s.pl > 100 then s.pl := 100; end if;

  if s.pl < 0 then
    if (s.shield_until is not null and p_day <= s.shield_until) or (s.stage = 'camello' and s.division = 3) then
      s.pl := 0;
    else
      if s.stage = 'zaratustra' then s.stage := 'nino'; s.division := 1;
      elsif s.division < 3 then s.division := s.division + 1;
      else s.stage := public.stage_prev(s.stage); s.division := 1;
      end if;
      s.pl := coalesce((public.cfg('demote_to_pl'))::int, 75);
      insert into league_events (user_id, day, kind, note) values (p_user, p_day, 'descenso', s.stage || ' ' || s.division);
    end if;
  end if;

  update league_state set stage = s.stage, division = s.division, pl = s.pl, shield_until = s.shield_until, updated_at = now()
  where user_id = p_user;
end $$;

-- Procesa un día: hábitos + Juicio (si hay), con el potenciador de la etapa del momento.
create or replace function public.league_process_day(p_user uuid, p_day date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  st text; boost text[]; factor numeric; h int; j daily_judgments; part int; total int; detail jsonb; k text; v text; cat text;
begin
  if exists (select 1 from league_events where user_id = p_user and day = p_day and kind = 'dia') then return; end if;
  select stage into st from league_state where user_id = p_user;
  select array(select jsonb_array_elements_text(s -> 'boost'))
    into boost from jsonb_array_elements(public.cfg('stages')) s where s ->> 'id' = st;
  factor := coalesce((public.cfg('boost_factor'))::numeric, 1.5);

  h := public.habits_pl(p_user, p_day);
  total := case when h > 0 and 'habitos' = any(boost) then round(h * factor) else h end;
  detail := jsonb_build_object('habits_pl', h, 'stage', st);

  select * into j from daily_judgments where user_id = p_user and day = p_day;
  if j.user_id is not null then
    for k, v in select key, value from jsonb_each_text(j.scores) loop
      select category into cat from judgment_questions where id = k;
      part := v::int;
      if part > 0 and cat = any(boost) then part := round(part * factor); end if;
      total := total + part;
    end loop;
    detail := detail || jsonb_build_object('judgment', j.total);
  end if;

  insert into league_events (user_id, day, kind, pl, detail) values (p_user, p_day, 'dia', total, detail)
  on conflict do nothing;
  perform public.league_apply(p_user, total, p_day);
end $$;

-- Cierre semanal del Cofre (domingo): si ahorraste algo y el Dragón (gastos innecesarios) no comió más que eso, bonus.
create or replace function public.league_process_week(p_user uuid, p_sunday date)
returns void
language plpgsql security definer set search_path = public as $$
declare tz text; saved numeric; spent numeric; bonus int;
begin
  select timezone into tz from profiles where id = p_user;
  select coalesce(sum(l.count * h.goal_step), 0) into saved
  from habit_logs l join habits h on h.id = l.habit_id join goals g on g.id = h.goal_id
  where h.user_id = p_user and g.kind = 'ahorro' and l.log_date between p_sunday - 6 and p_sunday;
  saved := saved + coalesce((select sum(e.amount) from goal_entries e join goals g on g.id = e.goal_id
    where e.user_id = p_user and g.kind = 'ahorro' and e.amount > 0
      and public.local_date(e.created_at, tz) between p_sunday - 6 and p_sunday), 0);
  select coalesce(sum(greatest(0, (answers ->> 'gasto')::numeric)), 0) into spent
  from daily_judgments where user_id = p_user and day between p_sunday - 6 and p_sunday;

  bonus := coalesce((public.cfg('weekly_chest_bonus'))::int, 5);
  if saved > 0 and saved >= spent then
    insert into league_events (user_id, day, kind, pl, note, detail)
    values (p_user, p_sunday, 'semana', bonus, 'Cofre a salvo esta semana', jsonb_build_object('ahorro', saved, 'gasto', spent))
    on conflict do nothing;
    if found then perform public.league_apply(p_user, bonus, p_sunday); end if;
  elsif spent > saved then
    insert into league_events (user_id, day, kind, pl, note, detail)
    values (p_user, p_sunday, 'dragon', 0, 'El Dragón se comió el bonus del Cofre', jsonb_build_object('ahorro', saved, 'gasto', spent))
    on conflict do nothing;
  end if;
end $$;

-- Hitos de los cofres de ahorro (25/50/75/100 %), una sola vez cada uno.
create or replace function public.league_process_milestones(p_user uuid, p_day date)
returns void
language plpgsql security definer set search_path = public as $$
declare g record; m record;
begin
  for g in select * from public.goal_list(p_user) where kind = 'ahorro' and not archived loop
    for m in select key::int as pct, value::int as pl from jsonb_each_text(public.cfg('milestones')) order by key::int loop
      if g.progress * 100 >= g.target * m.pct then
        insert into goal_milestones (goal_id, pct) values (g.id, m.pct) on conflict do nothing;
        if found then
          insert into league_events (user_id, day, kind, pl, note, detail)
          values (p_user, p_day, 'hito', m.pl, 'Cofre «' || g.title || '» al ' || m.pct || ' %', jsonb_build_object('goal_id', g.id, 'pct', m.pct));
          perform public.league_apply(p_user, m.pl, p_day);
        end if;
      end if;
    end loop;
  end loop;
end $$;

-- Pone al día la liga de quien llama y devuelve su estado.
-- Procesa hasta anteayer siempre; ayer solo si ya respondió el Juicio.
create or replace function public.league_sync_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare today date; s league_state; d date; upto date;
begin
  today := public.user_today(p_user);
  insert into league_state (user_id, last_day) values (p_user, today - 1) on conflict do nothing;
  select * into s from league_state where user_id = p_user for update;
  upto := case when exists (select 1 from daily_judgments where user_id = p_user and day = today - 1) then today - 1 else today - 2 end;
  d := s.last_day + 1;
  while d <= upto loop
    perform public.league_process_day(p_user, d);
    if extract(isodow from d) = 7 then perform public.league_process_week(p_user, d); end if;
    update league_state set last_day = d where user_id = p_user;
    d := d + 1;
  end loop;
  perform public.league_process_milestones(p_user, today);
end $$;

create or replace function public.league_sync()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare s league_state;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform public.league_sync_user(auth.uid());
  select * into s from league_state where user_id = auth.uid();
  return jsonb_build_object('stage', s.stage, 'division', s.division, 'pl', s.pl, 'shield_until', s.shield_until,
    'trial_ready', s.pl >= 100 and s.division = 1 and s.stage <> 'zaratustra');
end $$;

-- Responder el Juicio de ayer. p_goal: cofre (objetivo de ahorro) donde guardar lo ahorrado.
create or replace function public.submit_judgment(p_answers jsonb, p_goal uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date; q record; scores jsonb := '{}'::jsonb; total int := 0; sc int; saved numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid()) - 1;
  if exists (select 1 from daily_judgments where user_id = auth.uid() and day = d) then
    raise exception 'Ya respondiste el Juicio de ayer.';
  end if;
  perform public.league_sync_user(auth.uid());
  if (select last_day from league_state where user_id = auth.uid()) >= d then
    raise exception 'El Juicio arranca mañana: ayer todavía no estabas en la liga.';
  end if;
  for q in select * from public.judgment_questions_for(auth.uid(), d) loop
    sc := public.score_answer(q.type, q.params, p_answers -> q.id);
    scores := scores || jsonb_build_object(q.id, sc);
    total := total + sc;
  end loop;
  -- Se guardan solo las respuestas a preguntas que se hicieron.
  insert into daily_judgments (user_id, day, answers, scores, total)
  values (auth.uid(), d,
          (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(p_answers) where scores ? key),
          scores, total);

  saved := nullif(p_answers ->> 'ahorro', '')::numeric;
  if saved > 0 and p_goal is not null then
    if not exists (select 1 from goals where id = p_goal and user_id = auth.uid() and kind = 'ahorro') then
      raise exception 'Cofre inexistente.';
    end if;
    insert into goal_entries (goal_id, user_id, amount, note) values (p_goal, auth.uid(), saved, 'Juicio del ' || to_char(d, 'DD/MM'));
  end if;

  return public.league_sync() || jsonb_build_object('judgment_total', total, 'scores', scores);
end $$;

-- ───────────── Lecturas para la UI ─────────────
-- Liga del grupo: etapa, división, PL y el último Juicio (detalle solo si la persona lo comparte, o si sos vos).
create or replace function public.group_league(p_group uuid)
returns table (user_id uuid, username text, display_name text, archetype text, stage text, division int, pl int,
               last_day date, last_total int, last_detail jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.archetype,
         coalesce(s.stage, 'camello'), coalesce(s.division, 3), coalesce(s.pl, 0),
         j.day, j.total,
         case when p.id = auth.uid() or coalesce(us.share_judgment, false) then
           (select jsonb_agg(jsonb_build_object('text', q.text, 'answer', j.answers -> q.id, 'score', (j.scores ->> q.id)::int) order by q.kind, q.sort)
            from judgment_questions q where j.scores ? q.id)
         end
  from group_members m
  join profiles p on p.id = m.user_id
  left join league_state s on s.user_id = p.id
  left join user_settings us on us.user_id = p.id
  left join lateral (select * from daily_judgments dj where dj.user_id = p.id order by dj.day desc limit 1) j on true
  where m.group_id = p_group and public.is_member(p_group)
  order by public.stage_rank(coalesce(s.stage, 'camello')) desc, coalesce(s.division, 3), coalesce(s.pl, 0) desc, p.username;
$$;

create or replace function public.group_chest_list(p_group uuid)
returns table (id uuid, title text, target numeric, unit text, archived boolean, created_by uuid, created_at timestamptz,
               total numeric, contributions jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.target, c.unit, c.archived, c.created_by, c.created_at,
         coalesce((select sum(e.amount) from group_chest_entries e where e.chest_id = c.id), 0),
         coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'username', x.username, 'amount', x.amount) order by x.amount desc)
                   from (select e.user_id, p.username, sum(e.amount) as amount
                         from group_chest_entries e join profiles p on p.id = e.user_id
                         where e.chest_id = c.id group by e.user_id, p.username) x), '[]'::jsonb)
  from group_chests c
  where c.group_id = p_group and public.is_member(p_group)
  order by c.archived, c.created_at desc;
$$;

-- ───────────── Permisos de funciones ─────────────
revoke execute on function
  public.cfg(text), public.question_applies(jsonb, uuid), public.judgment_questions_for(uuid, date),
  public.score_answer(text, jsonb, jsonb), public.habits_pl(uuid, date), public.trial_passed(uuid, text, date),
  public.league_apply(uuid, int, date), public.league_process_day(uuid, date), public.league_process_week(uuid, date),
  public.league_process_milestones(uuid, date), public.league_sync_user(uuid),
  public.stage_next(text), public.stage_prev(text), public.stage_rank(text)
from public, anon, authenticated;

revoke execute on function
  public.judgment_today(), public.league_sync(), public.submit_judgment(jsonb, uuid),
  public.group_league(uuid), public.group_chest_list(uuid)
from public, anon;

grant execute on function
  public.judgment_today(), public.league_sync(), public.submit_judgment(jsonb, uuid),
  public.group_league(uuid), public.group_chest_list(uuid)
to authenticated;
