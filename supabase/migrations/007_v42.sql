-- 007 — Spec v4.2: experiencia, nivel, rango y billetera derivados; dos totales por día (ranking y personal);
--        fuerza base por meta elegida con recompensa compuesta semanal; tienda con precios por área y vales;
--        Juicio desacoplado de la liga; cofres de ahorro en monedas. Ver docs/MODELO_V42.md.
-- Ejecutar DESPUÉS de schema.sql, 002–006 y 007a (respaldo). Se puede re-ejecutar (si re-ejecutás una
-- anterior, re-ejecutá esta). Datos (config, tienda) desde content/ con `npm run catalog`.
--
-- Nadie migra (decisión del dueño, 2026-11-15): la primera vez que corre, BORRA LOS DATOS DE JUEGO DE TODOS
-- (quedan cuentas, grupos, cofres de grupo, el Juicio y la liga) después de verificar el respaldo de la 007a.
-- La liga no se borra acá: queda sin uso hasta que el dueño lo confirme.
-- Principio: se guardan definiciones, fotos del plan y eventos crudos. Nada de totales: experiencia, nivel,
-- rango, monedas y billetera se RECALCULAN.

-- ───────────── 0. Guardas: respaldo 007a hecho y verificado ─────────────
do $$
declare t text; esperado bigint; copia bigint; vivo bigint; filas jsonb;
begin
  if to_regclass('respaldo_v4.hecho') is null or to_regclass('respaldo_v4.reinicio') is null then
    raise exception 'Migración 007 detenida: primero ejecutá 007a_respaldo.sql (respaldo de los datos).';
  end if;
  execute 'select filas from respaldo_v4.hecho order by at desc limit 1' into filas;
  if filas is null then
    raise exception 'Migración 007 detenida: primero ejecutá 007a_respaldo.sql (respaldo de los datos).';
  end if;
  if exists (select 1 from respaldo_v4.reinicio) then return; end if;   -- ya se reinició: nada que verificar
  for t, esperado in select key, value::bigint from jsonb_each_text(filas) loop
    execute format('select count(*) from respaldo_v4.%I', t) into copia;
    execute format('select count(*) from public.%I', t) into vivo;
    if copia <> esperado or vivo <> copia then
      raise exception 'Migración 007 detenida: el respaldo de % no coincide (copia %, original %). Volvé a ejecutar 007a_respaldo.sql y después esta.', t, copia, vivo;
    end if;
  end loop;
  if (filas ->> 'profiles')::bigint is distinct from (select count(*) from public.profiles) or
     ((select count(*) from public.profiles) > 0 and (filas ->> 'profiles')::bigint = 0) then
    raise exception 'Migración 007 detenida: el respaldo de profiles está vacío o incompleto.';
  end if;
end $$;

-- ───────────── 1. Reinicio de todos (una sola vez) ─────────────
-- Conserva: auth.users, profiles (sin el quiz), groups, group_members, group_chests y sus aportes,
-- daily_judgments (Juicio), league_* y user_settings (liga, sin uso hasta que el dueño confirme).
-- Las fotos de Storage NO se borran desde SQL: quedan en el bucket "evidencias" (ver docs/PRUEBAS_SUPABASE.md).
do $$
begin
  if exists (select 1 from respaldo_v4.reinicio) then return; end if;
  delete from public.change_votes;
  delete from public.change_requests;
  delete from public.purchases;
  delete from public.store_optins;
  delete from public.store_items;           -- cada grupo recibe la tienda nueva (sección 10)
  delete from public.plans;                 -- cascade: plan_habits, plan_vices, plan_objectives
  delete from public.vice_days;
  delete from public.vices;
  delete from public.habit_votes;
  delete from public.habits;                -- cascade: habit_logs, habit_reviews
  delete from public.objectives;            -- cascade: objective_events
  delete from public.goals;                 -- cofres personales (cascade: aportes, hitos)
  delete from public.user_notices;
  delete from public.legacy_days;
  delete from public.user_game;
  delete from public.group_config;          -- parámetros votados: se vuelve a la configuración nueva
  if to_regclass('public.vice_slips') is not null then
    execute 'delete from public.vice_slips';
    execute 'delete from public.user_vices';
  end if;
  update public.profiles set archetype = null, area_scores = '{}'::jsonb, quiz_answers = null, quiz_completed_at = null;
  insert into respaldo_v4.reinicio default values;
end $$;

-- ───────────── 2. Configuración (content/config.json, plana como reference/config.mjs) ─────────────
-- BEGIN CONFIG4 (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
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
  ('maxGoals', '3'::jsonb),
  ('pillars', '[{"id":"cuerpo","name":"Cuerpo","icon":"💪","color":"#FF6B6B"},{"id":"mente","name":"Mente","icon":"🧠","color":"#B4A8FF"},{"id":"dinero","name":"Dinero","icon":"💰","color":"#7BD88F"},{"id":"habilidades","name":"Habilidades","icon":"🛠️","color":"#5AA9FF"},{"id":"creatividad","name":"Creatividad","icon":"🎨","color":"#FF8FD0"},{"id":"carrera","name":"Carrera y estudios","icon":"🎓","color":"#4FD1C5","provisional":true}]'::jsonb),
  ('areaToPillar', '{"cuerpo":"cuerpo","sueno":"cuerpo","alimentacion":"cuerpo","mente":"mente","foco":"mente","social":null}'::jsonb),
  ('xpPerLevel', '300'::jsonb),
  ('strengthExercises', '[{"id":"flexiones","name":"Flexiones","unit":"repeticiones"},{"id":"sentadillas","name":"Sentadillas","unit":"repeticiones"},{"id":"plancha","name":"Plancha","unit":"segundos"}]'::jsonb),
  ('strengthWeight', '3'::jsonb),
  ('strengthTargetStep', '10'::jsonb),
  ('strengthTargetMax', '100'::jsonb),
  ('strengthLevelCapStep', '10'::jsonb),
  ('strengthLevelCapBonus', '10'::jsonb),
  ('strengthRewardBase', '0.5'::jsonb),
  ('strengthRewardDivisor', '100'::jsonb),
  ('strengthEasyTarget', '10'::jsonb),
  ('strengthEasyVariants', '{"flexiones":"flexiones en la pared","sentadillas":"sentarse y pararse de una silla","plancha":"plancha apoyando las rodillas"}'::jsonb),
  ('compound', '{"baseCoins":1,"baseExp":5,"factor":2,"capDay":4,"weekDays":7}'::jsonb),
  ('compoundMissRate', '1'::jsonb),
  ('forgiveRatio', '0.75'::jsonb),
  ('extraReps', '20'::jsonb),
  ('rankPoints', '{"activeDay":1,"missedDay":-2,"floor":0}'::jsonb),
  ('ranks', '[{"name":"Aspirante","minPoints":0,"reward":0},{"name":"Constante","minPoints":10,"reward":10},{"name":"Veterano","minPoints":30,"reward":20},{"name":"Leyenda","minPoints":50,"reward":40}]'::jsonb),
  ('areaPriceMultiplier', '{"poco":2,"mucho":4}'::jsonb),
  ('areas', '{"tabaco":{"noProblem":"hide"},"alcohol":{"noProblem":"hide"},"comida":{"noProblem":"base"},"dulce":{"noProblem":"base"},"redes":{"noProblem":"hide"},"juegos":{"noProblem":"hide"}}'::jsonb),
  ('rankingCountsPersonalHabits', 'false'::jsonb),
  ('personalHabitsGiveExp', 'true'::jsonb),
  ('chestMilestones', '{"25":1,"50":2,"75":3,"100":6}'::jsonb),
  ('chestWeeklySafeBonus', '1'::jsonb)
on conflict (key) do update set value = excluded.value;
-- END CONFIG4

-- ───────────── 3. Cálculo puro (porta reference/levels.mjs y ranks.mjs) ─────────────
-- Nivel desde la experiencia (levelFor).
create or replace function public.level_pure(p_xp numeric, p_per numeric)
returns jsonb language plpgsql immutable set search_path = public as $$
declare lvl int; into_ numeric;
begin
  lvl := floor(p_xp::double precision / p_per::double precision)::int;
  into_ := public.r2(p_xp::double precision - lvl * p_per::double precision);
  return jsonb_build_object('xp', p_xp, 'level', lvl, 'xpIntoLevel', into_, 'xpForNext', p_per,
                            'progress', public.r2(into_::double precision / p_per::double precision));
end $$;

-- Puntos de continuidad (rankPoints): +activeDay si el día llegó al umbral, missedDay si no, nunca menos que floor.
create or replace function public.rank_points_pure(p_totals numeric[], p_rank_points jsonb, p_threshold numeric)
returns int language plpgsql immutable as $$
declare p int := 0; t numeric;
begin
  foreach t in array coalesce(p_totals, '{}') loop
    p := greatest((p_rank_points ->> 'floor')::int,
                  p + case when t >= p_threshold then (p_rank_points ->> 'activeDay')::int else (p_rank_points ->> 'missedDay')::int end);
  end loop;
  return p;
end $$;

-- Rango para unos puntos (rankFor) y premios que se tienen hoy (rankRewardsHeld).
create or replace function public.rank_pure(p_points int, p_ranks jsonb)
returns jsonb language sql immutable as $$
  with r as (select x ->> 'name' as name, (x ->> 'minPoints')::int as min_points, (x ->> 'reward')::numeric as reward
             from jsonb_array_elements(p_ranks) x),
       cur as (select * from r where min_points <= p_points order by min_points desc limit 1),
       nxt as (select * from r where min_points > p_points order by min_points limit 1)
  select jsonb_build_object(
    'points', p_points,
    'name', (select name from cur), 'minPoints', (select min_points from cur), 'reward', (select reward from cur),
    'next', (select jsonb_build_object('name', name, 'minPoints', min_points, 'reward', reward) from nxt),
    'missing', coalesce((select min_points from nxt) - p_points, 0),
    'held', coalesce((select sum(reward) from r where min_points <= p_points), 0));
$$;

-- ───────────── 4. Cofres de ahorro en monedas (antes daban puntos de liga) ─────────────
-- Hitos: por cada cofre de ahorro, las monedas de cada hito que su avance actual alcanza (chestMilestones).
-- «Cofre a salvo»: por cada semana CERRADA desde el primer plan, si ahorraste algo y el gasto que contestaste en
-- el Juicio no superó lo ahorrado (misma regla que tenía la liga), chestWeeklySafeBonus.
create or replace function public.chest_coins(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date; tz text; first date; sun date; g record; m record; prog numeric;
        hits numeric := 0; weekly numeric := 0; saved numeric; spent numeric; weeks int := 0;
begin
  today := public.user_today(p_user);
  select timezone into tz from profiles where id = p_user;
  for g in select id, target from goals where user_id = p_user and kind = 'ahorro' loop
    prog := coalesce((select sum(l.count * h.goal_step) from habits h join habit_logs l on l.habit_id = h.id where h.goal_id = g.id), 0)
          + coalesce((select sum(e.amount) from goal_entries e where e.goal_id = g.id), 0);
    for m in select key::numeric as pct, value::numeric as coins from jsonb_each_text(public.cfg_at(p_user, 'chestMilestones', today)) loop
      if prog * 100 >= g.target * m.pct then hits := hits + m.coins; end if;
    end loop;
  end loop;
  select min(effective_from) into first from plans where user_id = p_user;
  if first is not null then
    sun := public.week_start(first) + 6;
    while sun < public.week_start(today) loop
      select coalesce(sum(l.count * h.goal_step), 0) into saved
      from habit_logs l join habits h on h.id = l.habit_id join goals gg on gg.id = h.goal_id
      where h.user_id = p_user and gg.kind = 'ahorro' and l.log_date between sun - 6 and sun;
      saved := saved + coalesce((select sum(e.amount) from goal_entries e join goals gg on gg.id = e.goal_id
        where e.user_id = p_user and gg.kind = 'ahorro' and e.amount > 0
          and public.local_date(e.created_at, tz) between sun - 6 and sun), 0);
      select coalesce(sum(greatest(0, (answers ->> 'gasto')::numeric)), 0) into spent
      from daily_judgments where user_id = p_user and day between sun - 6 and sun;
      if saved > 0 and saved >= spent then
        weekly := weekly + public.cfg_num(p_user, 'chestWeeklySafeBonus', sun);
        weeks := weeks + 1;
      end if;
      sun := sun + 7;
    end loop;
  end if;
  return jsonb_build_object('milestones', hits, 'weekly', weekly, 'safe_weeks', weeks, 'total', hits + weekly);
end $$;

-- ───────────── 5. Fuerza base: compromiso semanal (porta reference/strength.mjs, compound.mjs, penalty.mjs) ─────────────
-- Variante fácil (quien no llega a 10): el hábito lo marca.
alter table public.habits add column if not exists strength_easy boolean not null default false;

-- Cómo saldó la persona un día fallado (evento crudo, no un total): 20 extra (sistema de honor) o pagar.
create table if not exists public.strength_settlements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  choice text not null check (choice in ('extra','pay')),
  exercise text,                       -- ejercicio fallado (el peor del día), para las 20 extra
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.strength_settlements enable row level security;
drop policy if exists "strength_settlements: grupo" on public.strength_settlements;
create policy "strength_settlements: grupo" on public.strength_settlements for select to authenticated
  using (public.shares_group_with(user_id));
revoke all on public.strength_settlements from anon, authenticated;
grant select on public.strength_settlements to authenticated;   -- se escribe solo vía settle_strength_day

-- Cadena de una semana (weekChain), con el factor de cada día (rewardFactor de las metas de ese día).
-- p_ratios: ratio de cada día cerrado (el peor ejercicio, con tope 1), en orden.
create or replace function public.strength_week_pure(p_ratios double precision[], p_factors double precision[], p_cfg jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  chain int := 0; i int; r double precision; f double precision; k int; st text; out_ jsonb := '[]'::jsonb;
  base_c double precision := (p_cfg -> 'compound' ->> 'baseCoins')::double precision;
  base_e double precision := (p_cfg -> 'compound' ->> 'baseExp')::double precision;
  fac double precision := (p_cfg -> 'compound' ->> 'factor')::double precision;
  cap int := (p_cfg -> 'compound' ->> 'capDay')::int;
  forgive double precision := (p_cfg ->> 'forgiveRatio')::double precision;
  miss double precision := (p_cfg ->> 'compoundMissRate')::double precision;
  dc numeric; de numeric;
begin
  for i in 1 .. coalesce(array_length(p_ratios, 1), 0) loop
    r := p_ratios[i]; f := p_factors[i];
    st := case when r >= 1 then 'done' when r >= forgive then 'forgiven' else 'missed' end;
    if st <> 'missed' then
      chain := chain + 1;
      k := least(chain, cap) - 1;
      dc := public.r2(base_c * fac ^ k); de := public.r2(base_e * fac ^ k);
      f := f * (case when st = 'forgiven' then r else 1 end);
      out_ := out_ || jsonb_build_object('day', i - 1, 'status', st, 'chain', chain,
                'coins', public.r2(dc::double precision * f), 'exp', public.r2(de::double precision * f));
    else
      k := least(chain + 1, cap) - 1;
      dc := public.r2(base_c * fac ^ k); de := public.r2(base_e * fac ^ k);
      chain := 0;
      out_ := out_ || jsonb_build_object('day', i - 1, 'status', st, 'chain', 0, 'coins', 0, 'exp', 0,
                'missedCoins', public.r2(dc::double precision * f * miss), 'missedExp', public.r2(de::double precision * f * miss));
    end if;
  end loop;
  return out_;
end $$;

-- Un día de fuerza base: ratio (dayRatio: el peor ejercicio, cada uno con tope 1), ejercicio peor y factor
-- (rewardFactor: 0,5 + promedio de las metas / 100, redondeado a milésimas). null si ese día no hay fuerza base.
create or replace function public.strength_day(p_user uuid, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  with ex as (
    select h.strength_id, ph.target, least(1, coalesce(l.count, 0)::double precision / ph.target::double precision) as ratio
    from plan_habits ph join habits h on h.id = ph.habit_id
    left join habit_logs l on l.habit_id = h.id and l.log_date = p_day
    where ph.plan_id = public.plan_for(p_user, p_day) and h.block = 'fuerza' and ph.target > 0
  )
  select case when count(*) = 0 then null else jsonb_build_object(
    'ratio', min(ratio),
    'worst', (select strength_id from ex order by ratio, strength_id limit 1),
    'factor', floor((public.cfg_num(p_user, 'strengthRewardBase', p_day)::double precision
                     + avg(target)::double precision / public.cfg_num(p_user, 'strengthRewardDivisor', p_day)::double precision) * 1000 + 0.5) / 1000)
  end from ex;
$$;

-- Estado de la fuerza base, recalculado: recompensas de cada semana (cadena), días fallados y cómo se saldaron.
-- Mientras haya un día fallado sin saldar, las recompensas de fuerza base quedan RETENIDAS (rewardsBlocked) y
-- vuelven al saldarlo. «Pagar» resta las monedas y la experiencia perdidas (puede dejar la billetera negativa).
-- Solo días cerrados; hoy se muestra aparte (today).
create or replace function public.strength_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date; first date; ws date; d date; sd jsonb; cfg jsonb; ch jsonb; x jsonb; i int; choice_ text;
  ratios double precision[]; factors double precision[]; dates date[]; worst text[];
  coins numeric := 0; exp_ numeric := 0; pc numeric := 0; pe numeric := 0; pending int := 0;
  week jsonb := '[]'; pend jsonb := '[]';
begin
  today := public.user_today(p_user);
  select min(effective_from) into first from plans where user_id = p_user;
  if first is not null then
    cfg := jsonb_build_object('compound', public.cfg_at(p_user, 'compound', today), 'forgiveRatio', public.cfg_at(p_user, 'forgiveRatio', today),
                              'compoundMissRate', public.cfg_at(p_user, 'compoundMissRate', today));
    ws := public.week_start(first);
    while ws <= public.week_start(today) loop
      ratios := '{}'; factors := '{}'; dates := '{}'; worst := '{}';
      d := greatest(ws, first);
      while d <= least(ws + 6, today - 1) loop
        sd := public.strength_day(p_user, d);
        if sd is not null then
          ratios := ratios || (sd ->> 'ratio')::double precision;
          factors := factors || (sd ->> 'factor')::double precision;
          dates := dates || d; worst := worst || (sd ->> 'worst');
        end if;
        d := d + 1;
      end loop;
      ch := public.strength_week_pure(ratios, factors, cfg);
      for i in 1 .. coalesce(array_length(dates, 1), 0) loop
        x := (ch -> (i - 1)) || jsonb_build_object('date', dates[i], 'ratio', ratios[i], 'worst', worst[i]);
        if x ->> 'status' = 'missed' then
          select choice into choice_ from strength_settlements where user_id = p_user and day = dates[i];
          x := x || jsonb_build_object('settled', choice_);
          if choice_ = 'pay' then pc := pc + (x ->> 'missedCoins')::numeric; pe := pe + (x ->> 'missedExp')::numeric;
          elsif choice_ is null then pending := pending + 1; pend := pend || x;
          end if;
        else
          coins := coins + (x ->> 'coins')::numeric; exp_ := exp_ + (x ->> 'exp')::numeric;
        end if;
        if ws = public.week_start(today) then week := week || x; end if;
      end loop;
      ws := ws + 7;
    end loop;
  end if;
  return jsonb_build_object(
    'coins', case when pending > 0 then 0 else coins end, 'exp', case when pending > 0 then 0 else exp_ end,
    'held_coins', coins, 'held_exp', exp_,
    'penalty_coins', pc, 'penalty_exp', pe, 'pending', pending, 'blocked', pending > 0,
    'week', week, 'pending_days', pend, 'today', public.strength_day(p_user, today),
    'extra_reps', public.cfg_num(p_user, 'extraReps', today));
end $$;

-- Saldar un día fallado: 'extra' (Hice las 20 extra, sistema de honor; se ve en el feed del grupo) o 'pay'.
-- Una sola vez por día.
create or replace function public.settle_strength_day(p_day date, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st jsonb; x jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_choice not in ('extra','pay') then raise exception 'Elegí: 20 extra o pagar.'; end if;
  st := public.strength_state(auth.uid());
  select e into x from jsonb_array_elements(st -> 'pending_days') e where (e ->> 'date')::date = p_day;
  if x is null then raise exception 'Ese día no tiene nada que saldar.'; end if;
  insert into strength_settlements (user_id, day, choice, exercise) values (auth.uid(), p_day, p_choice, x ->> 'worst');
  return public.strength_state(auth.uid());
end $$;

-- ───────────── 6. Estado derivado: experiencia, nivel, rango y billetera ─────────────
-- Una sola pasada por los días (coin_days). Nada se guarda.
--   experiencia = Σ max(0, total personal del día; de ranking si personalHabitsGiveExp = false) [hoy incluido] + exp de fuerza base − exp pagada; mínimo 0
--   rango       = puntos de continuidad sobre los días CERRADOS
--   billetera   = monedas de días cerrados + pool de semanas cerradas + fuerza base + premios de rango
--                 + cofres − monedas pagadas por días fallados − compras. Puede quedar negativa.
create or replace function public.game_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date; r record; xp_days numeric := 0; closed_totals numeric[] := '{}';
  daily numeric := 0; pool numeric := 0; pool_week numeric := 0;
  t_credit numeric := 0; t_mult numeric := 1; t_streak int := 0;
  st jsonb; ch jsonb; rk jsonb; xp numeric; spent numeric; bal numeric; rp int; give_exp boolean;
begin
  today := public.user_today(p_user);
  give_exp := coalesce((public.cfg_at(p_user, 'personalHabitsGiveExp', today))::text <> 'false', true);
  for r in select * from public.coin_days(p_user) loop
    xp_days := xp_days + greatest(0, case when give_exp then r.total else r.ranking_total end);
    if r.closed then
      daily := daily + r.credit;
      closed_totals := closed_totals || r.total;
    end if;
    if public.week_start(r.day) < public.week_start(today) then pool := pool + r.to_pool; else pool_week := pool_week + r.to_pool; end if;
    if r.day = today then t_credit := r.credit; t_mult := r.multiplier; t_streak := r.streak_before; end if;
  end loop;
  st := public.strength_state(p_user);
  ch := public.chest_coins(p_user);
  rp := public.rank_points_pure(closed_totals, public.cfg_at(p_user, 'rankPoints', today), public.cfg_num(p_user, 'coinThresholdLow', today));
  rk := public.rank_pure(rp, public.cfg_at(p_user, 'ranks', today));
  xp := greatest(0, public.r2((xp_days + (st ->> 'exp')::numeric - (st ->> 'penalty_exp')::numeric)::double precision));
  spent := coalesce((select sum(price_paid) from purchases where user_id = p_user), 0);
  bal := public.r2((daily + pool + (st ->> 'coins')::numeric + (rk ->> 'held')::numeric + (ch ->> 'total')::numeric
                    - (st ->> 'penalty_coins')::numeric - spent)::double precision);
  return jsonb_build_object(
    'level', public.level_pure(xp, public.cfg_num(p_user, 'xpPerLevel', today)),
    'rank', rk,
    'strength', st,
    'wallet', jsonb_build_object(
      'balance', bal,
      'daily', daily, 'pool', pool, 'strength', (st ->> 'coins')::numeric, 'rank_rewards', (rk ->> 'held')::numeric,
      'chests', (ch ->> 'total')::numeric, 'chest_detail', ch, 'penalties', (st ->> 'penalty_coins')::numeric, 'spent', spent,
      'pool_this_week', pool_week, 'today_credit', t_credit, 'today_multiplier', t_mult, 'streak', t_streak));
end $$;

create or replace function public.wallet_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.game_state(p_user) -> 'wallet';
$$;
create or replace function public.level_of(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.game_state(p_user) -> 'level';
$$;

-- ───────────── 7. Juicio de la mañana, sin liga ─────────────
-- Se guarda y se muestra, sin premio (decisión del dueño). Su ahorro puede ir a un cofre y su gasto alimenta
-- «Cofre a salvo». Disponible si ayer ya tenías plan.
create or replace function public.submit_judgment(p_answers jsonb, p_goal uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date; q record; scores jsonb := '{}'::jsonb; total int := 0; sc int; saved numeric;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid()) - 1;
  if exists (select 1 from daily_judgments where user_id = auth.uid() and day = d) then
    raise exception 'Ya respondiste el Juicio de ayer.';
  end if;
  if public.plan_for(auth.uid(), d) is null then
    raise exception 'El Juicio arranca mañana: ayer todavía no tenías plan.';
  end if;
  for q in select * from public.judgment_questions_for(auth.uid(), d) loop
    sc := public.score_answer(q.type, q.params, p_answers -> q.id);
    scores := scores || jsonb_build_object(q.id, sc);
    total := total + sc;
  end loop;
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
  return jsonb_build_object('judgment_total', total, 'scores', scores);
end $$;

-- ¿Se hace esta pregunta? La persona puede activarla o desactivarla (user_settings.judgment_opt); si no, decide su
-- respuesta privada por área (condition: {area, in}). Sin respuesta, se pregunta.
create or replace function public.question_applies(p_condition jsonb, p_user uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare opt text; ans text;
begin
  if p_condition is null then return true; end if;
  select judgment_opt ->> (p_condition ->> 'opt') into opt from user_settings where user_id = p_user;
  if opt = 'true' then return true; end if;
  if opt = 'false' then return false; end if;
  if p_condition ? 'area' then
    select answer into ans from area_answers where user_id = p_user and area = p_condition ->> 'area';
  else
    select quiz_answers ->> (p_condition ->> 'quiz') into ans from profiles where id = p_user;
  end if;
  if ans is null then return true; end if;
  return ans in (select jsonb_array_elements_text(p_condition -> 'in'));
end $$;

create or replace function public.judgment_today()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date; j daily_judgments;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid()) - 1;
  select * into j from daily_judgments where user_id = auth.uid() and day = d;
  return jsonb_build_object(
    'day', d,
    'available', public.plan_for(auth.uid(), d) is not null,
    'submitted', j.user_id is not null,
    'total', j.total,
    'points', round(public.day_points(auth.uid(), d)),
    'multiplier', public.vice_multiplier(auth.uid(), d),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'text', q.text, 'hint', q.hint,
                                   'type', q.type, 'unit', q.unit, 'category', q.category))
                           from public.judgment_questions_for(auth.uid(), d) q), '[]'::jsonb),
    'chests', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title) order by g.created_at desc)
                        from goals g where g.user_id = auth.uid() and g.kind = 'ahorro' and not g.archived), '[]'::jsonb)
  );
end $$;

-- ───────────── 8. Dos totales por día: ranking y personal (porta reference/ranking.mjs) ─────────────
-- Cada hábito/vicio del plan lleva su alcance: 'plan-inicial' (cuestionario), 'grupo' (votado para todo el grupo)
-- o 'solo-yo' (agregado por la persona, directo). «Solo yo» no cuenta para el ranking (rankingCountsPersonalHabits);
-- el total PERSONAL (todo) da monedas, experiencia, nivel y rango.
alter table public.plan_habits add column if not exists scope text not null default 'plan-inicial';
alter table public.plan_habits drop constraint if exists plan_habits_scope_check;
alter table public.plan_habits add constraint plan_habits_scope_check check (scope in ('plan-inicial','grupo','solo-yo'));
alter table public.plan_vices add column if not exists scope text not null default 'plan-inicial';
alter table public.plan_vices drop constraint if exists plan_vices_scope_check;
alter table public.plan_vices add constraint plan_vices_scope_check check (scope in ('plan-inicial','grupo','solo-yo'));

-- dayTotals: { personal: dayPoints(todo), ranking: dayPoints(sin «solo yo») }
create or replace function public.totals_pure(p_habits jsonb, p_vices jsonb, p_severity jsonb, p_floor numeric, p_max numeric,
                                              p_counts_personal boolean)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'personal', public.score_pure(p_habits, p_vices, p_severity, p_floor, p_max),
    'ranking', public.score_pure(
      (select coalesce(jsonb_agg(x order by i), '[]') from jsonb_array_elements(coalesce(p_habits, '[]')) with ordinality t(x, i)
       where p_counts_personal or x ->> 'scope' is distinct from 'solo-yo'),
      (select coalesce(jsonb_agg(x order by i), '[]') from jsonb_array_elements(coalesce(p_vices, '[]')) with ordinality t(x, i)
       where p_counts_personal or x ->> 'scope' is distinct from 'solo-yo'),
      p_severity, p_floor, p_max));
$$;

-- Puntaje del día: los campos de siempre son el total PERSONAL; 'ranking' trae el del ranking.
create or replace function public.day_score(p_user uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pid uuid; habits jsonb; vices jsonb; t jsonb;
begin
  pid := public.plan_for(p_user, p_day);
  if pid is null then
    return jsonb_build_object('base', 0, 'bonus', 0, 'multiplier', 1, 'total', 0, 'overflow', 0,
      'ranking', jsonb_build_object('base', 0, 'bonus', 0, 'multiplier', 1, 'total', 0, 'overflow', 0));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'weight', ph.weight, 'scope', ph.scope,
           'measurable', ph.target is not null,
           'completion', case when ph.target is null then (case when coalesce(l.count, 0) >= 1 then 1 else 0 end)
                              else coalesce(l.count, 0)::numeric / ph.target end) order by ph.habit_id), '[]')
    into habits
  from plan_habits ph left join habit_logs l on l.habit_id = ph.habit_id and l.log_date = p_day
  where ph.plan_id = pid;
  select coalesce(jsonb_agg(jsonb_build_object(
           'weight', pv.weight, 'scope', pv.scope, 'severity', pv.severity, 'state', coalesce(vd.state, 'none'),
           'penalizing', not public.slip_covered(pv.vice_id, p_day)) order by pv.vice_id), '[]')
    into vices
  from plan_vices pv left join vice_days vd on vd.vice_id = pv.vice_id and vd.day = p_day
  where pv.plan_id = pid;
  t := public.totals_pure(habits, vices, public.cfg_at(p_user, 'severity', p_day),
                          public.cfg_num(p_user, 'multiplierFloor', p_day), public.cfg_num(p_user, 'maxCompletion', p_day),
                          coalesce((public.cfg_at(p_user, 'rankingCountsPersonalHabits', p_day))::text = 'true', false));
  return (t -> 'personal') || jsonb_build_object('ranking', t -> 'ranking');
end $$;

-- Puntos del día para el ranking del grupo: total de RANKING (sin «solo yo»).
create or replace function public.day_points(p_user uuid, p_day date)
returns numeric language sql stable security definer set search_path = public as $$
  select (public.day_score(p_user, p_day) -> 'ranking' ->> 'total')::numeric;
$$;

-- Monedas día por día (con el total PERSONAL), desde el primer plan hasta hoy (hoy queda abierto).
drop function if exists public.coin_days(uuid);
create function public.coin_days(p_user uuid)
returns table (day date, total numeric, ranking_total numeric, overflow numeric, streak_before int, multiplier numeric,
               credit numeric, to_pool numeric, closed boolean)
language plpgsql stable security definer set search_path = public as $$
declare d date; today date; streak int := 0; s jsonb; c jsonb; cfg jsonb;
begin
  today := public.user_today(p_user);
  select min(effective_from) into d from plans where user_id = p_user;
  if d is null then return; end if;
  while d <= today loop
    cfg := jsonb_build_object(
      'coinsAt75', public.cfg_at(p_user, 'coinsAt75', d), 'coinsAt100', public.cfg_at(p_user, 'coinsAt100', d),
      'coinThresholdLow', public.cfg_at(p_user, 'coinThresholdLow', d), 'coinThresholdHigh', public.cfg_at(p_user, 'coinThresholdHigh', d),
      'overflowRate', public.cfg_at(p_user, 'overflowRate', d), 'streakStepDays', public.cfg_at(p_user, 'streakStepDays', d),
      'streakStepBonus', public.cfg_at(p_user, 'streakStepBonus', d), 'unpaidSlipStepsLost', public.cfg_at(p_user, 'unpaidSlipStepsLost', d));
    s := public.day_score(p_user, d);
    c := public.coins_pure((s ->> 'total')::numeric, (s ->> 'overflow')::numeric, streak, public.unpaid_slip(p_user, d), cfg);
    day := d; total := (s ->> 'total')::numeric; ranking_total := (s -> 'ranking' ->> 'total')::numeric;
    overflow := (s ->> 'overflow')::numeric;
    streak_before := streak; multiplier := (c ->> 'multiplier')::numeric;
    credit := (c ->> 'creditNow')::numeric; to_pool := (c ->> 'toPool')::numeric; closed := d < today;
    return next;
    streak := (c ->> 'streakAfter')::int;
    d := d + 1;
  end loop;
end $$;

-- Foto del día siguiente: copia también el alcance de cada hábito y vicio.
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
    insert into plan_habits (plan_id, habit_id, weight, target, scope) select pid, habit_id, weight, target, scope from plan_habits where plan_id = cur;
    insert into plan_vices (plan_id, vice_id, weight, severity, scope) select pid, vice_id, weight, severity, scope from plan_vices where plan_id = cur;
    insert into plan_objectives (plan_id, objective_id) select pid, objective_id from plan_objectives where plan_id = cur;
  end if;
  return pid;
end $$;

-- Aplica un cambio aprobado. Alcance 'me': a quien propuso (lo que agrega queda «solo yo»).
-- 'group': a cada miembro (peso inicial groupScopeDefaultWeight; lo que agrega queda 'grupo').
-- Fuerza base: la meta se busca por ejercicio (strength_id) en cada persona.
create or replace function public.apply_change(p_req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r change_requests; u uuid; pid uuid; p jsonb; hid uuid; vid uuid; oid_ uuid; w int; ref habits; refv vices; sc text;
begin
  select * into r from change_requests where id = p_req;
  p := r.payload;
  sc := case when r.scope = 'me' then 'solo-yo' else 'grupo' end;

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
      -- Un hábito ligado a un cofre (goal_id, goal_step) solo se liga en el plan de quien lo propone.
      insert into habits (user_id, name, catalog_id, pillar, criterion, unit, private, goal_id, goal_step, block, objective_id)
      values (u, coalesce(p ->> 'name', 'x'), p ->> 'catalog_id', p ->> 'pillar', p ->> 'criterion', p ->> 'unit',
              coalesce((p ->> 'private')::boolean, false) and p ->> 'catalog_id' is not null and u = r.proposer_id,
              case when u = r.proposer_id then nullif(p ->> 'goal_id', '')::uuid end,
              coalesce(case when u = r.proposer_id then nullif(p ->> 'goal_step', '')::numeric end, 1),
              case when coalesce(p ->> 'block', 'general') = 'objetivo' and u <> r.proposer_id then 'general' else coalesce(p ->> 'block', 'general') end,
              case when u = r.proposer_id then nullif(p ->> 'objective_id', '')::uuid end)
      returning id into hid;
      insert into plan_habits (plan_id, habit_id, weight, target, scope)
      values (pid, hid, w, coalesce(nullif(p ->> 'target', '')::numeric, (select case when target > 1 then target end from habits where id = hid)), sc);

    elsif r.kind in ('habit.remove','habit.weight','habit.target') then
      -- Para 'group' se busca el mismo hábito en cada persona (mismo ejercicio de fuerza, mismo catálogo o mismo nombre).
      select ph.habit_id into hid from plan_habits ph join habits h on h.id = ph.habit_id
      where ph.plan_id = pid and (h.id = ref.id or (r.scope = 'group' and (
              (ref.strength_id is not null and h.strength_id = ref.strength_id)
           or (ref.strength_id is null and ref.catalog_id is not null and h.catalog_id = ref.catalog_id)
           or (ref.strength_id is null and ref.catalog_id is null and lower(h.name) = lower(ref.name)))))
      limit 1;
      continue when hid is null;
      if r.kind = 'habit.remove' then delete from plan_habits where plan_id = pid and habit_id = hid;
      elsif r.kind = 'habit.weight' then update plan_habits set weight = (p ->> 'weight')::int where plan_id = pid and habit_id = hid;
      else update plan_habits set target = nullif(p ->> 'target', '')::numeric where plan_id = pid and habit_id = hid;
      end if;

    elsif r.kind = 'vice.add' then
      insert into vices (user_id, name, suggestion_id) values (u, p ->> 'name', p ->> 'suggestion_id') returning id into vid;
      insert into plan_vices (plan_id, vice_id, weight, severity, scope) values (pid, vid, w, coalesce(p ->> 'severity', 'normal'), sc);

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

-- ¿Ese hábito o vicio está como «solo yo» en el plan de mañana de la persona?
create or replace function public.is_solo_yo(p_user uuid, p_habit uuid, p_vice uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from plan_habits where plan_id = public.plan_for(p_user, public.user_today(p_user) + 1)
                 and habit_id = p_habit and scope = 'solo-yo')
      or exists (select 1 from plan_vices where plan_id = public.plan_for(p_user, public.user_today(p_user) + 1)
                 and vice_id = p_vice and scope = 'solo-yo');
$$;

-- Proponer un cambio. Directo, sin votación (decisión del dueño, 2026-11-15):
--   · agregar un hábito o vicio «solo yo» (alcance 'me');
--   · cambiar el peso, la meta o la gravedad, o sacar, un hábito o vicio que ya es «solo yo» (no cuenta para el ranking).
-- Todo lo que cuenta para el ranking (incluida la meta de la fuerza base) se vota, con alcance 'me' o 'group'.
-- Rige desde mañana en todos los casos.
create or replace function public.propose_change(p_scope text, p_kind text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid; id_ uuid; priv boolean; direct boolean; d date; pid uuid; n int; mn int; hb habits; cap int; step int; lvl int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  g := public.my_group(auth.uid());
  if g is null then raise exception 'Primero uníte a un grupo o creá uno.'; end if;
  d := public.user_today(auth.uid());
  if p_scope not in ('me','group') then raise exception 'Alcance inválido.'; end if;
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
  if p_kind = 'training.level' then
    raise exception 'El nivel de entrenamiento ya no existe: cambiá la meta de cada ejercicio.';
  end if;
  if p_kind = 'habit.add' and p_payload ->> 'block' = 'fuerza' then
    raise exception 'La fuerza base ya está en tu plan: cambiá la meta de cada ejercicio.';
  end if;
  if p_payload ? 'habit_id' then select * into hb from habits where id = nullif(p_payload ->> 'habit_id', '')::uuid; end if;
  if hb.block = 'fuerza' then
    if p_kind in ('habit.remove','habit.weight') then
      raise exception 'La fuerza base no se saca ni cambia de peso: se ajusta la meta de cada ejercicio.';
    end if;
    if p_kind = 'habit.target' then
      -- Meta con botones de a strengthTargetStep, hasta el tope del nivel (maxTargetFor).
      step := public.cfg_num(auth.uid(), 'strengthTargetStep', d)::int;
      lvl := (public.level_of(auth.uid()) ->> 'level')::int;
      cap := public.strength_cap(auth.uid(), lvl, d);
      if (p_payload ->> 'target')::numeric is null or (p_payload ->> 'target')::numeric not between step and cap
         or (p_payload ->> 'target')::numeric % step <> 0 then
        raise exception 'La meta va de % a % de a %.', step, cap, step;
      end if;
    end if;
  end if;
  if p_kind = 'habit.remove' then
    if exists (select 1 from habits where id = nullif(p_payload ->> 'habit_id', '')::uuid and block = 'deporte')
       and (select count(*) from plan_habits ph join habits h on h.id = ph.habit_id
            where ph.plan_id = public.plan_for(auth.uid(), d + 1) and h.block = 'deporte') <= 1 then
      raise exception 'Todos tienen un deporte o actividad: agregá otro antes de sacar este.';
    end if;
  end if;
  direct := p_scope = 'me' and (
       p_kind in ('habit.add','vice.add')
    or (p_kind in ('habit.remove','habit.weight','habit.target','vice.remove','vice.weight','vice.severity')
        and public.is_solo_yo(auth.uid(), nullif(p_payload ->> 'habit_id', '')::uuid, nullif(p_payload ->> 'vice_id', '')::uuid)));
  priv := p_scope = 'me' and (
       coalesce((p_payload ->> 'private')::boolean, false)
    or exists (select 1 from habits where id = nullif(p_payload ->> 'habit_id', '')::uuid and private)
    or p_kind like 'vice.%');
  insert into change_requests (group_id, proposer_id, scope, kind, payload, private, closes_at)
  values (g, auth.uid(), p_scope, p_kind, p_payload, priv,
          now() + make_interval(hours => public.cfg_num(auth.uid(), 'voteWindowHours', d)::int))
  returning id into id_;
  if priv or direct then
    update change_requests set status = 'approved', decided_at = now() where id = id_;
    perform public.apply_change(id_);
  end if;
  perform public.resolve_requests(g);
  return id_;
end $$;

-- Tope de la meta de fuerza base según el nivel (maxTargetFor): 100 hasta el nivel 9, +10 cada 10 niveles.
create or replace function public.strength_cap(p_user uuid, p_level int, p_day date)
returns int language sql stable security definer set search_path = public as $$
  select (public.cfg_num(p_user, 'strengthTargetMax', p_day)
        + public.cfg_num(p_user, 'strengthLevelCapBonus', p_day) * floor(greatest(0, p_level) / public.cfg_num(p_user, 'strengthLevelCapStep', p_day)))::int;
$$;

-- Pesos de los amigos (plan vigente), con el alcance. Privados: "Hábito privado" + peso. Vicios sin nombre.
drop function if exists public.group_plans(uuid);
create function public.group_plans(p_group uuid)
returns table (user_id uuid, username text, habits jsonb, vices jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.username,
    coalesce((select jsonb_agg(jsonb_build_object(
        'name', case when h.private and p.id <> auth.uid() then 'Hábito privado' else h.name end,
        'pillar', h.pillar, 'weight', ph.weight, 'target', ph.target, 'unit', h.unit, 'block', h.block, 'scope', ph.scope)
        order by h.block, ph.weight desc, h.name)
      from plan_habits ph join habits h on h.id = ph.habit_id
      where ph.plan_id = public.plan_for(p.id, public.user_today(p.id))), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object(
        'name', case when p.id = auth.uid() then v.name else 'Vicio' end, 'weight', pv.weight, 'severity', pv.severity, 'scope', pv.scope))
      from plan_vices pv join vices v on v.id = pv.vice_id
      where pv.plan_id = public.plan_for(p.id, public.user_today(p.id))), '[]')
  from group_members m join profiles p on p.id = m.user_id
  where m.group_id = p_group and public.is_member(p_group)
  order by p.username;
$$;

-- Ranking del grupo: suma del total de RANKING de cada día (sin «solo yo»), con nivel y rango.
drop function if exists public.group_leaderboard(uuid);
create function public.group_leaderboard(p_group uuid)
returns table (user_id uuid, username text, display_name text, archetype text,
               total_points numeric, max_points numeric, pct numeric, streak int, multiplier numeric, level int, rank text)
language sql stable security definer set search_path = public as $$
  with base as (
    select m.user_id,
           greatest(g.start_date, public.local_date(m.joined_at, p.timezone)) as from_date,
           g.start_date + g.duration_days - 1 as end_date,
           public.user_today(m.user_id) as today
    from groups g join group_members m on m.group_id = g.id join profiles p on p.id = m.user_id
    where g.id = p_group and public.is_member(p_group)
  ),
  scored as (
    select b.*,
           coalesce((select sum(public.day_points(b.user_id, gs::date))
                     from generate_series(b.from_date, least(b.end_date, b.today), interval '1 day') gs), 0) as total,
           public.game_state(b.user_id) as st
    from base b
  )
  select p.id, p.username, p.display_name, p.archetype,
         round(s.total, 2),
         100.0 * greatest(0, least(s.end_date, s.today) - s.from_date + 1),
         round(100.0 * s.total / nullif(100.0 * greatest(0, least(s.end_date, s.today) - s.from_date + 1), 0), 1),
         public.streak_as_of(p.id, s.today),
         (public.day_score(p.id, s.today) ->> 'multiplier')::numeric,
         (s.st -> 'level' ->> 'level')::int,
         s.st -> 'rank' ->> 'name'
  from scored s join profiles p on p.id = s.user_id
  order by s.total desc, p.username;
$$;

-- ───────────── 9. Plan inicial (cuestionario v4.2) ─────────────
-- Rige desde HOY y sin votación. Solo si la persona todavía no tiene plan. Todo lo del plan inicial queda 'plan-inicial'.
-- p_habits:     [{catalog_id | name, pillar, criterion, unit}, weight 1–3, target?, private? (solo catálogo),
--                block ('general'|'objetivo'|'deporte'), objective_index? (0..), goal_step?]
-- p_vices:      [{name, suggestion_id, weight, severity}]
-- p_objectives: [{title, catalog_id, tag, pillar, unit, target_value, start_value, deadline, chest?: {title, target, deadline}}]
-- p_strength:   {"targets": {"flexiones": 30, "sentadillas": 20, "plancha": 40}}   meta de cada ejercicio (botones de a 10)
--               {"easy": true}                                                     variante fácil (meta strengthEasyTarget)
--               null o "declined"                                                  sin fuerza base
drop function if exists public.create_initial_plan(jsonb, jsonb, jsonb, int);
create or replace function public.create_initial_plan(p_habits jsonb, p_vices jsonb default '[]', p_objectives jsonb default '[]',
                                                      p_strength jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pid uuid; d date; h jsonb; v jsonb; o jsonb; ex jsonb; hid uuid; vid uuid; oid_ uuid; gid uuid;
  mx int; idx int; oids uuid[] := '{}'; gids uuid[] := '{}'; easy boolean; t numeric; step int; cap int; nm text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from plans where user_id = auth.uid()) then raise exception 'Ya tenés un plan: los cambios se proponen y rigen desde mañana.'; end if;
  d := public.user_today(auth.uid());
  mx := public.cfg_num(auth.uid(), 'maxGoals', d);
  if jsonb_array_length(coalesce(p_objectives, '[]')) > mx then raise exception 'Hasta % objetivos.', mx; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p_habits, '[]')) x where x ->> 'block' = 'deporte') then
    raise exception 'Elegí tu deporte o actividad física.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_habits, '[]')) x where x ->> 'block' = 'fuerza') then
    raise exception 'La fuerza base se elige aparte (meta de cada ejercicio).';
  end if;
  easy := coalesce((p_strength ->> 'easy')::boolean, false) and jsonb_typeof(p_strength) = 'object';
  step := public.cfg_num(auth.uid(), 'strengthTargetStep', d)::int;
  cap := public.strength_cap(auth.uid(), 0, d);   -- todos empiezan en nivel 0

  insert into plans (user_id, effective_from) values (auth.uid(), d) returning id into pid;

  for o in select * from jsonb_array_elements(coalesce(p_objectives, '[]')) loop
    gid := null;
    if o ? 'chest' then
      insert into goals (user_id, title, kind, target, unit, deadline)
      values (auth.uid(), coalesce(o -> 'chest' ->> 'title', o ->> 'title'), 'ahorro', (o -> 'chest' ->> 'target')::numeric, '€',
              nullif(o -> 'chest' ->> 'deadline', '')::date)
      returning id into gid;
    end if;
    insert into objectives (user_id, title, tag, catalog_id, pillar, unit, target_value, start_value, deadline, goal_id)
    values (auth.uid(), o ->> 'title', o ->> 'tag', o ->> 'catalog_id', o ->> 'pillar', o ->> 'unit',
            nullif(o ->> 'target_value', '')::numeric, nullif(o ->> 'start_value', '')::numeric, nullif(o ->> 'deadline', '')::date, gid)
    returning id into oid_;
    insert into plan_objectives (plan_id, objective_id) values (pid, oid_);
    oids := array_append(oids, oid_);
    gids := array_append(gids, gid);
  end loop;

  for h in select * from jsonb_array_elements(p_habits) loop
    idx := nullif(h ->> 'objective_index', '')::int;
    insert into habits (user_id, name, catalog_id, pillar, criterion, unit, private, block, objective_id, goal_id, goal_step)
    values (auth.uid(), coalesce(h ->> 'name', 'x'), h ->> 'catalog_id', h ->> 'pillar', h ->> 'criterion', h ->> 'unit',
            coalesce((h ->> 'private')::boolean, false) and h ->> 'catalog_id' is not null,
            coalesce(h ->> 'block', 'general'),
            case when idx is not null then oids[idx + 1] end,
            case when idx is not null then gids[idx + 1] end,
            coalesce(nullif(h ->> 'goal_step', '')::numeric, 1))
    returning id into hid;
    insert into plan_habits (plan_id, habit_id, weight, target)
    values (pid, hid, coalesce((h ->> 'weight')::int, 2),
            coalesce(nullif(h ->> 'target', '')::numeric, (select case when target > 1 then target end from habits where id = hid)));
  end loop;

  -- Fuerza base: flexiones, sentadillas y plancha con la meta elegida (o la variante fácil). Si la rechazó, nada.
  if jsonb_typeof(p_strength) = 'object' then
    for ex in select * from jsonb_array_elements(public.cfg_at(auth.uid(), 'strengthExercises', d)) loop
      if easy then
        t := public.cfg_num(auth.uid(), 'strengthEasyTarget', d);
        nm := public.cfg_at(auth.uid(), 'strengthEasyVariants', d) ->> (ex ->> 'id');
        nm := upper(left(nm, 1)) || substr(nm, 2);
      else
        t := nullif(p_strength -> 'targets' ->> (ex ->> 'id'), '')::numeric;
        if t is null or t < step or t > cap or t % step <> 0 then
          raise exception 'La meta de % va de % a % de a %.', lower(ex ->> 'name'), step, cap, step;
        end if;
        nm := ex ->> 'name';
      end if;
      insert into habits (user_id, name, pillar, unit, block, strength_id, strength_easy)
      values (auth.uid(), nm, 'cuerpo', ex ->> 'unit', 'fuerza', ex ->> 'id', easy) returning id into hid;
      insert into plan_habits (plan_id, habit_id, weight, target)
      values (pid, hid, public.cfg_num(auth.uid(), 'strengthWeight', d)::int, t);
    end loop;
  end if;

  for v in select * from jsonb_array_elements(coalesce(p_vices, '[]')) loop
    insert into vices (user_id, name, suggestion_id) values (auth.uid(), v ->> 'name', v ->> 'suggestion_id') returning id into vid;
    insert into plan_vices (plan_id, vice_id, weight, severity) values (pid, vid, coalesce((v ->> 'weight')::int, 1), coalesce(v ->> 'severity', 'normal'));
  end loop;
  return pid;
end $$;

-- ───────────── 10. Tienda: precios por área y vales de grupo (porta reference/store.mjs) ─────────────
alter table public.store_catalog
  add column if not exists area text,
  add column if not exists unlock_level int not null default 0,
  add column if not exists group_only boolean not null default false,
  add column if not exists registry_only boolean not null default false;
alter table public.store_items
  add column if not exists area text,
  add column if not exists unlock_level int not null default 0,
  add column if not exists group_only boolean not null default false,
  add column if not exists registry_only boolean not null default false;

-- BEGIN STORE4 (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
insert into public.store_catalog (slug, name, kind, price, price_by_weight, weekly_limit, opt_in, conflicts_with, per_objective, price_source,
  area, unlock_level, group_only, registry_only) values
  ('cerveza', 'Una cerveza', 'permit', 5, null, 6, true, array[]::text[], false, 'dueño', 'alcohol', 0, false, false),
  ('trago', 'Un trago', 'permit', 12, null, null, true, array[]::text[], false, 'dueño', 'alcohol', 0, false, false),
  ('cigarro', 'Un cigarro', 'permit', 3, null, null, true, array['dejar-fumar']::text[], false, 'sugerencia', 'tabaco', 0, false, false),
  ('comer-mal', 'Comer mal (una comida)', 'permit', 10, null, null, true, array[]::text[], false, 'sugerencia', 'comida', 0, false, false),
  ('antojo-dulce', 'Un antojo dulce', 'permit', 3, null, null, true, array[]::text[], false, 'sugerencia', 'dulce', 0, false, false),
  ('sesion-juego', 'Una sesión de juego', 'permit', 4, null, null, true, array[]::text[], false, 'sugerencia', 'juegos', 0, false, false),
  ('cafe-afuera', 'Café o desayuno afuera', 'reward', 3, null, null, false, array[]::text[], false, 'real aproximado, no verificado', null, 0, false, false),
  ('cine', 'Cine', 'reward', 10, null, null, false, array[]::text[], false, 'real aproximado, no verificado', null, 0, false, false),
  ('libro', 'Un libro nuevo', 'reward', 15, null, null, false, array[]::text[], false, 'real aproximado, no verificado', null, 0, false, false),
  ('cena-afuera', 'Cena afuera', 'reward', 25, null, null, false, array[]::text[], false, 'real aproximado, no verificado', null, 0, false, false),
  ('plan-del-grupo', 'Elegir el plan del grupo', 'reward', 6, null, null, false, array[]::text[], false, 'sugerencia', null, 0, false, false),
  ('pase-habito', 'Pase de un hábito (un día)', 'reward', null, '{"1":2,"2":4,"3":6}'::jsonb, null, false, array[]::text[], false, 'sugerencia', null, 0, false, false),
  ('comodin-racha', 'Comodín de racha (protege el multiplicador una vez)', 'reward', 10, null, null, false, array[]::text[], false, 'sugerencia', null, 0, false, false),
  ('dia-libre-objetivo', 'Día libre de un objetivo', 'reward', 8, null, null, false, array[]::text[], true, 'sugerencia', null, 0, false, false),
  ('premio-grande', 'Premio grande propio', 'reward', null, null, null, false, array[]::text[], false, 'lo define quien lo propone (precio real) y lo vota el grupo', null, 0, false, false),
  ('vale-10-off', 'Próxima juntada del grupo: pagás 10 % menos', 'reward', 15, null, 1, false, array[]::text[], false, 'sugerencia: el dueño dio la idea y el nivel es mío; niveles y precios sin definir', null, 10, true, true),
  ('vale-no-pagas', 'Próxima juntada del grupo: no pagás', 'reward', 40, null, 1, false, array[]::text[], false, 'sugerencia: el dueño dio la idea y el nivel es mío; niveles y precios sin definir', null, 20, true, true),
  ('vale-cena', 'El grupo te debe una cena afuera', 'reward', 60, null, 1, false, array[]::text[], false, 'sugerencia: el dueño dio la idea y el nivel es mío; niveles y precios sin definir', null, 30, true, true)
on conflict (slug) do update set name = excluded.name, kind = excluded.kind, price = excluded.price,
  price_by_weight = excluded.price_by_weight, weekly_limit = excluded.weekly_limit, opt_in = excluded.opt_in,
  conflicts_with = excluded.conflicts_with, per_objective = excluded.per_objective, price_source = excluded.price_source,
  area = excluded.area, unlock_level = excluded.unlock_level, group_only = excluded.group_only, registry_only = excluded.registry_only;
-- END STORE4

create or replace function public.seed_store(p_group uuid)
returns void language sql security definer set search_path = public as $$
  insert into store_items (group_id, slug, name, kind, price, price_by_weight, weekly_limit, opt_in, conflicts_with, per_objective,
                           price_source, area, unlock_level, group_only, registry_only)
  select p_group, slug, name, kind, price, price_by_weight, weekly_limit, opt_in, conflicts_with, per_objective,
         price_source, area, unlock_level, group_only, registry_only
  from store_catalog
  on conflict (group_id, slug) do nothing;
$$;
-- Tras el reinicio (sección 1) cada grupo recibe la tienda nueva; los artículos que ya están no se tocan.
select public.seed_store(id) from public.groups;

-- Respuesta PRIVADA de cada persona a "¿cuánto te pasa con…?" por área (no / poco / mucho). Solo la ve su dueño;
-- los precios se calculan en la base. Se contesta en el cuestionario (una vez; reiniciar la borra).
create table if not exists public.area_answers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  area text not null,
  answer text not null check (answer in ('no','poco','mucho')),
  primary key (user_id, area)
);
alter table public.area_answers enable row level security;
drop policy if exists "area_answers: propias" on public.area_answers;
create policy "area_answers: propias" on public.area_answers for select to authenticated using (user_id = auth.uid());
revoke all on public.area_answers from anon, authenticated;
grant select on public.area_answers to authenticated;

create or replace function public.set_area_answers(p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text; areas jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from area_answers where user_id = auth.uid()) then
    raise exception 'Ya contestaste estas preguntas.';
  end if;
  areas := public.cfg_at(auth.uid(), 'areas', public.user_today(auth.uid()));
  for k, v in select key, value from jsonb_each_text(coalesce(p_answers, '{}')) loop
    if not areas ? k then raise exception 'Área inválida: %', k; end if;
    if v not in ('no','poco','mucho') then raise exception 'Respuesta inválida: %', v; end if;
    insert into area_answers (user_id, area, answer) values (auth.uid(), k, v);
  end loop;
end $$;

-- priceOf: precio base (o por peso); con área y respuesta: «no» → base u oculto (null), poco ×2, mucho ×4.
create or replace function public.price_pure(p_price numeric, p_by_weight jsonb, p_weight int, p_area text, p_answer text, p_cfg jsonb)
returns numeric language sql immutable as $$
  select case
    when base is null or p_area is null or p_answer is null then base
    when p_answer = 'no' then case when p_cfg -> 'areas' -> p_area ->> 'noProblem' = 'base' then base end
    else base * (p_cfg -> 'areaPriceMultiplier' ->> p_answer)::numeric end
  from (select case when p_by_weight is not null then (p_by_weight ->> p_weight::text)::numeric else p_price end as base) b;
$$;

create or replace function public.store_cfg(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('areas', public.cfg_at(p_user, 'areas', public.user_today(p_user)),
                            'areaPriceMultiplier', public.cfg_at(p_user, 'areaPriceMultiplier', public.user_today(p_user)));
$$;

-- availableFor: choca con un objetivo, o el área no es un problema y se oculta.
create or replace function public.item_hidden(p_user uuid, p_item store_items)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_item.area is not null
     and (select answer from area_answers where user_id = p_user and area = p_item.area) = 'no'
     and public.store_cfg(p_user) -> 'areas' -> p_item.area ->> 'noProblem' = 'hide', false);
$$;

create or replace function public.buy_item(p_item uuid, p_vice uuid default null, p_habit uuid default null, p_objective uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it store_items; d date; tags text[]; bought int; price numeric; w int; bal numeric; st jsonb;
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
  if it.conflicts_with && tags or public.item_hidden(auth.uid(), it) then
    return jsonb_build_object('ok', false, 'reason', 'conflicto-objetivo');
  end if;
  st := public.game_state(auth.uid());
  if it.unlock_level > (st -> 'level' ->> 'level')::int then return jsonb_build_object('ok', false, 'reason', 'nivel-insuficiente'); end if;
  select count(*) into bought from purchases where user_id = auth.uid() and item_id = p_item and public.week_start(day) = public.week_start(d);
  if it.weekly_limit is not null and bought >= it.weekly_limit then return jsonb_build_object('ok', false, 'reason', 'limite-semanal'); end if;
  if it.kind = 'permit' and (p_vice is null or not exists (select 1 from vices where id = p_vice and user_id = auth.uid())) then
    raise exception 'Elegí qué vicio cubre el permiso.';
  end if;
  if it.price_by_weight is not null then
    select weight into w from plan_habits where plan_id = public.plan_for(auth.uid(), d) and habit_id = p_habit;
    if w is null then raise exception 'Elegí un hábito de tu plan.'; end if;
  end if;
  price := public.price_pure(it.price, it.price_by_weight, w, it.area,
                             (select answer from area_answers where user_id = auth.uid() and area = it.area), public.store_cfg(auth.uid()));
  if price is null then raise exception 'Este artículo todavía no tiene precio.'; end if;
  bal := (st -> 'wallet' ->> 'balance')::numeric;
  if bal < price then return jsonb_build_object('ok', false, 'reason', 'monedas-insuficientes'); end if;   -- negativa también
  insert into purchases (user_id, item_id, day, price_paid, vice_id, habit_id, objective_id)
  values (auth.uid(), p_item, d, price, p_vice, p_habit, p_objective);
  return jsonb_build_object('ok', true, 'price', price);
end $$;

-- Mi tienda: artículos del grupo con MI precio (según mis respuestas por área), sin mostrar las respuestas.
-- Los ocultos por área no aparecen. price null = depende del peso del hábito (price_by_weight).
create or replace function public.my_store()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date; lvl int; tags text[]; cfg jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid());
  lvl := (public.level_of(auth.uid()) ->> 'level')::int;
  cfg := public.store_cfg(auth.uid());
  select coalesce(array_agg(o.tag) filter (where o.tag is not null), '{}') into tags
  from plan_objectives po join objectives o on o.id = po.objective_id where po.plan_id = public.plan_for(auth.uid(), d);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', si.id, 'slug', si.slug, 'name', si.name, 'kind', si.kind, 'weekly_limit', si.weekly_limit, 'opt_in', si.opt_in,
      'opted', exists (select 1 from store_optins o where o.user_id = auth.uid() and o.item_id = si.id),
      'per_objective', si.per_objective, 'price_by_weight', si.price_by_weight,
      'price', case when si.price_by_weight is null then public.price_pure(si.price, null, null, si.area,
                 (select answer from area_answers a where a.user_id = auth.uid() and a.area = si.area), cfg) end,
      'unlock_level', si.unlock_level, 'locked', si.unlock_level > lvl, 'group_only', si.group_only, 'registry_only', si.registry_only,
      'conflict', si.conflicts_with && tags,
      'bought_this_week', (select count(*) from purchases pu where pu.user_id = auth.uid() and pu.item_id = si.id
                           and public.week_start(pu.day) = public.week_start(d)))
      order by si.kind, si.unlock_level, si.name)
    from store_items si
    where si.group_id = public.my_group(auth.uid()) and si.active and not public.item_hidden(auth.uid(), si)), '[]');
end $$;

-- El nivel de entrenamiento (v4) se reemplaza por la meta de cada ejercicio.
alter table public.plans drop column if exists training_level;

-- ───────────── 11. Reiniciar: también borra los días saldados y las respuestas por área ─────────────
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
  delete from daily_judgments where user_id = p_user;       -- liga
  delete from league_events where user_id = p_user;
  delete from league_state where user_id = p_user;
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

-- ───────────── 20. Lecturas para la UI ─────────────
-- Mi día: plan vigente con pesos, metas, alcance, registros, vicios, puntajes (personal y ranking), y el estado
-- derivado (nivel, rango, billetera, fuerza base) calculado una sola vez.
create or replace function public.my_day()
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date; pid uuid; st jsonb; grp text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid());
  pid := public.plan_for(auth.uid(), d);
  st := public.game_state(auth.uid());
  select g.name into grp from groups g where g.id = public.my_group(auth.uid());
  return jsonb_build_object(
    'day', d,
    'has_plan', pid is not null,
    'group_name', grp,
    'score', public.day_score(auth.uid(), d),
    'wallet', st -> 'wallet',
    'level', st -> 'level',
    'rank', st -> 'rank',
    'strength', st -> 'strength',
    'strength_cap', public.strength_cap(auth.uid(), (st -> 'level' ->> 'level')::int, d),
    'habits', coalesce((select jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', h.name, 'criterion', h.criterion, 'pillar', h.pillar, 'catalog_id', h.catalog_id, 'unit', h.unit,
        'private', h.private, 'weight', ph.weight, 'target', ph.target, 'scope', ph.scope, 'count', coalesce(l.count, 0),
        'photo_path', l.photo_path, 'block', h.block, 'strength_id', h.strength_id, 'objective_id', h.objective_id)
        order by h.created_at)
      from plan_habits ph join habits h on h.id = ph.habit_id
      left join habit_logs l on l.habit_id = h.id and l.log_date = d
      where ph.plan_id = pid), '[]'),
    'vices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'weight', pv.weight, 'severity', pv.severity, 'scope', pv.scope,
        'state', coalesce(vd.state, 'none'), 'covered', public.slip_covered(v.id, d),
        'clean_days', public.clean_streak(v.id, case when vd.state = 'clean' then d else d - 1 end))
        order by v.created_at)
      from plan_vices pv join vices v on v.id = pv.vice_id
      left join vice_days vd on vd.vice_id = v.id and vd.day = d
      where pv.plan_id = pid), '[]'),
    'objectives', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'tag', o.tag, 'goal_id', o.goal_id,
        'pillar', o.pillar, 'unit', o.unit, 'target_value', o.target_value, 'start_value', o.start_value, 'deadline', o.deadline))
      from plan_objectives po join objectives o on o.id = po.objective_id where po.plan_id = pid), '[]'),
    'tomorrow_changes', exists (select 1 from plans where user_id = auth.uid() and effective_from > d),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'text', n.text)) from user_notices n
                         where n.user_id = auth.uid() and n.read_at is null), '[]')
  );
end $$;

-- Actividad del grupo: registros, cambios votados, compras y «Hice las 20 extra» de la fuerza base.
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
           jsonb_build_object('status', r.status, 'scope', r.scope, 'private', r.private and p.id <> auth.uid(),
                              'payload', case when r.private and p.id <> auth.uid() then jsonb_build_object('weight', r.payload -> 'weight') else r.payload end)
    from change_requests r join profiles p on p.id = r.proposer_id
    where r.group_id = p_group and public.is_member(p_group)
    union all
    select pu.created_at, 'purchase', p.id, p.username, si.name, jsonb_build_object('price', pu.price_paid, 'kind', si.kind)
    from purchases pu join store_items si on si.id = pu.item_id join profiles p on p.id = pu.user_id
    where si.group_id = p_group and public.is_member(p_group)
    union all
    select s.created_at, 'strength_extra', p.id, p.username, s.exercise,
           jsonb_build_object('day', s.day, 'reps', public.cfg_num(s.user_id, 'extraReps', s.day))
    from strength_settlements s join profiles p on p.id = s.user_id
    where s.choice = 'extra' and public.is_member(p_group) and s.user_id in (select user_id from group_members where group_id = p_group)
  ) x order by 1 desc limit least(greatest(p_limit, 1), 100);
$$;

-- Los cofres dejan de dar puntos de liga (ahora dan monedas, sección 4). La liga no se borra: queda sin uso.
create or replace function public.league_process_week(p_user uuid, p_sunday date)
returns void language plpgsql security definer set search_path = public as $$ begin end $$;
create or replace function public.league_process_milestones(p_user uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$ begin end $$;

-- ───────────── 90. Permisos de funciones ─────────────
-- Internas (las usan otras funciones): nadie las llama desde la app.
revoke execute on function
  public.level_pure(numeric, numeric), public.rank_points_pure(numeric[], jsonb, numeric), public.rank_pure(int, jsonb),
  public.chest_coins(uuid), public.strength_state(uuid), public.game_state(uuid),
  public.totals_pure(jsonb, jsonb, jsonb, numeric, numeric, boolean), public.coin_days(uuid), public.is_solo_yo(uuid, uuid, uuid),
  public.strength_cap(uuid, int, date), public.day_score(uuid, date), public.day_points(uuid, date),
  public.next_plan(uuid, uuid), public.apply_change(uuid), public.wallet_of(uuid), public.level_of(uuid),
  public.league_process_week(uuid, date), public.league_process_milestones(uuid, date),
  public.strength_week_pure(double precision[], double precision[], jsonb), public.strength_day(uuid, date),
  public.price_pure(numeric, jsonb, int, text, text, jsonb), public.store_cfg(uuid), public.item_hidden(uuid, public.store_items),
  public.seed_store(uuid), public.wipe_game_data(uuid)
from public, anon, authenticated;
-- RPC de la app: solo con sesión.
revoke execute on function
  public.submit_judgment(jsonb, uuid), public.judgment_today(), public.propose_change(text, text, jsonb), public.my_day(),
  public.group_plans(uuid), public.group_leaderboard(uuid), public.settle_strength_day(date, text),
  public.create_initial_plan(jsonb, jsonb, jsonb, jsonb), public.group_activity(uuid, int),
  public.set_area_answers(jsonb), public.my_store(), public.buy_item(uuid, uuid, uuid, uuid)
from public, anon;
grant execute on function
  public.submit_judgment(jsonb, uuid), public.judgment_today(), public.propose_change(text, text, jsonb), public.my_day(),
  public.group_plans(uuid), public.group_leaderboard(uuid), public.settle_strength_day(date, text),
  public.create_initial_plan(jsonb, jsonb, jsonb, jsonb), public.group_activity(uuid, int),
  public.set_area_answers(jsonb), public.my_store(), public.buy_item(uuid, uuid, uuid, uuid)
to authenticated;
