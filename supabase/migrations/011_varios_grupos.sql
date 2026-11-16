-- 011 — Varios grupos por persona (pedido del dueño, 2026-11-16). Ejecutar DESPUÉS de la 010. Se puede re-ejecutar.
-- Decisiones del dueño:
--   · Un cambio de tu plan que cuenta para el ranking lo votan TODOS tus grupos: se aprueba si se aprueba en todos
--     (si uno lo rechaza, queda rechazado). Lo «solo yo», lo privado y lo directo no se vota, como antes.
--   · Monedas, experiencia, nivel, rango y fuerza base son personales: se calculan con content/config.json.
--   · Lo de cada grupo: su ranking (con las reglas que vote ese grupo), su tienda, sus votaciones y su feed.

-- ───────────── 1. Se puede estar en varios grupos ─────────────
drop index if exists public.group_members_one_group;
alter table public.change_requests add column if not exists batch_id uuid;
create index if not exists change_requests_batch_idx on public.change_requests (batch_id) where batch_id is not null;

-- ───────────── 2. Reglas: personales (config) y de cada grupo ─────────────
-- Personales: content/config.json (las reglas votadas por un grupo ya no cambian monedas ni experiencia de nadie).
create or replace function public.cfg_at(p_user uuid, p_key text, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from game_config where key = p_key;
$$;
-- De un grupo: lo que votó ese grupo (rige desde effective_from), o config.
create or replace function public.cfg_group(p_group uuid, p_key text, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from group_config where group_id = p_group and key = p_key and effective_from <= p_day
     order by effective_from desc limit 1),
    (select value from game_config where key = p_key));
$$;
create or replace function public.cfg_for(p_user uuid, p_group uuid, p_key text, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_group is null then public.cfg_at(p_user, p_key, p_day) else public.cfg_group(p_group, p_key, p_day) end;
$$;
create or replace function public.cfg_for_num(p_user uuid, p_group uuid, p_key text, p_day date)
returns numeric language sql stable security definer set search_path = public as $$
  select (public.cfg_for(p_user, p_group, p_key, p_day) #>> '{}')::numeric;
$$;

-- Puntaje del día con las reglas de un grupo (o personales si p_group es null).
create or replace function public.day_score_in(p_user uuid, p_day date, p_group uuid)
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
  t := public.totals_pure(habits, vices, public.cfg_for(p_user, p_group, 'severity', p_day),
                          public.cfg_for_num(p_user, p_group, 'multiplierFloor', p_day), public.cfg_for_num(p_user, p_group, 'maxCompletion', p_day),
                          coalesce((public.cfg_for(p_user, p_group, 'rankingCountsPersonalHabits', p_day))::text = 'true', false));
  return (t -> 'personal') || jsonb_build_object('ranking', t -> 'ranking');
end $$;

-- Puntaje personal (monedas, experiencia, nivel, rango).
create or replace function public.day_score(p_user uuid, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.day_score_in(p_user, p_day, null);
$$;

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
           coalesce((select sum((public.day_score_in(b.user_id, gs::date, p_group) -> 'ranking' ->> 'total')::numeric)
                     from generate_series(b.from_date, least(b.end_date, b.today), interval '1 day') gs), 0) as total,
           public.game_state(b.user_id) as st
    from base b
  )
  select p.id, p.username, p.display_name, p.archetype,
         round(s.total, 2),
         100.0 * greatest(0, least(s.end_date, s.today) - s.from_date + 1),
         round(100.0 * s.total / nullif(100.0 * greatest(0, least(s.end_date, s.today) - s.from_date + 1), 0), 1),
         public.streak_as_of(p.id, s.today),
         (public.day_score_in(p.id, s.today, p_group) ->> 'multiplier')::numeric,
         (s.st -> 'level' ->> 'level')::int,
         s.st -> 'rank' ->> 'name'
  from scored s join profiles p on p.id = s.user_id
  order by s.total desc, p.username;
$$;

-- ───────────── 3. Votación en todos tus grupos ─────────────
drop function if exists public.propose_change(text, text, jsonb);
create or replace function public.propose_change(p_scope text, p_kind text, p_payload jsonb, p_group uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid; gg uuid; batch uuid; tmp uuid; id_ uuid; priv boolean; direct boolean; d date; pid uuid; n int; mn int; hb habits; cap int; step int; lvl int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  -- Grupo donde se propone: el elegido (si sos parte) o el primero al que entraste.
  if p_group is not null then
    if not exists (select 1 from group_members where group_id = p_group and user_id = auth.uid()) then
      raise exception 'No sos parte de ese grupo.';
    end if;
    g := p_group;
  else
    select group_id into g from group_members where user_id = auth.uid() order by joined_at, group_id limit 1;
  end if;
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
  if priv or direct or p_scope = 'group' then
    -- Directo, privado, o para todo un grupo: una sola propuesta, en ese grupo.
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
  end if;
  -- Un cambio de MI plan que cuenta para el ranking lo vota cada uno de mis grupos (decisión del dueño, 2026-11-16):
  -- una propuesta por grupo, con el mismo batch_id; se aplica una vez, cuando se aprueba en todos, y si un grupo la
  -- rechaza, queda rechazada en todos.
  batch := gen_random_uuid();
  for gg in select group_id from group_members where user_id = auth.uid() order by joined_at, group_id loop
    insert into change_requests (group_id, proposer_id, scope, kind, payload, private, closes_at, batch_id)
    values (gg, auth.uid(), p_scope, p_kind, p_payload, priv,
            now() + make_interval(hours => public.cfg_num(auth.uid(), 'voteWindowHours', d)::int), batch)
    returning id into tmp;
    if gg = g then id_ := tmp; end if;
  end loop;
  for gg in select group_id from group_members where user_id = auth.uid() loop
    perform public.resolve_requests(gg);
  end loop;
  return id_;
end $$;

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
      if r.batch_id is null then
        if st = 'approved' then perform public.apply_change(r.id); end if;
      elsif st = 'rejected' then
        -- Un grupo lo rechazó: queda rechazado en todos.
        update change_requests set status = 'rejected', decided_at = now() where batch_id = r.batch_id and status = 'pending';
      elsif not exists (select 1 from change_requests where batch_id = r.batch_id and status <> 'approved') then
        perform public.apply_change(r.id);   -- el último grupo en aprobar lo aplica, una sola vez
      end if;
    end if;
  end loop;
end $$;

-- ───────────── 4. Tienda: la de cualquiera de tus grupos (la billetera es una sola) ─────────────
create or replace function public.buy_item(p_item uuid, p_vice uuid default null, p_habit uuid default null, p_objective uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it store_items; d date; tags text[]; bought int; price numeric; w int; bal numeric; st jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into it from store_items where id = p_item and active and group_id in (select group_id from group_members where user_id = auth.uid());
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

drop function if exists public.my_store();
create or replace function public.my_store(p_group uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d date; lvl int; tags text[]; cfg jsonb; g uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid());
  select m.group_id into g from group_members m where m.user_id = auth.uid() and (p_group is null or m.group_id = p_group)
  order by (m.group_id = p_group) desc nulls last, m.joined_at limit 1;
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
    where si.group_id = g and si.active and not public.item_hidden(auth.uid(), si)), '[]');
end $$;

-- ───────────── 5. Entrar, crear y salir (sin salir de los otros grupos) ─────────────
drop function if exists public.create_group(text, int, boolean);
drop function if exists public.join_group(text, boolean);
drop function if exists public.leave_group();
drop function if exists public.leave_group_of(uuid);

-- Sacar a una persona de UN grupo. Si lo creó, pasa al miembro más antiguo; si queda vacío, se borra. Sus cofres
-- compartidos pasan al dueño del grupo; sus votos pendientes ahí se borran. Su plan, monedas y nivel siguen igual.
create or replace function public.leave_group_of(p_user uuid, p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
declare heir uuid; owner uuid;
begin
  if not exists (select 1 from group_members where group_id = p_group and user_id = p_user) then return; end if;
  select created_by into owner from groups where id = p_group;
  select user_id into heir from group_members where group_id = p_group and user_id <> p_user order by joined_at, user_id limit 1;
  if heir is null then
    delete from groups where id = p_group;
    return;
  end if;
  if owner = p_user then
    update groups set created_by = heir where id = p_group;
    owner := heir;
  end if;
  update group_chests set created_by = owner where group_id = p_group and created_by = p_user;
  delete from change_votes v using change_requests r where v.request_id = r.id and r.group_id = p_group and v.voter_id = p_user;
  delete from group_members where group_id = p_group and user_id = p_user;
  perform public.resolve_requests(p_group);
end $$;

create or replace function public.create_group(p_name text, p_duration int default 66)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
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
  insert into group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform public.leave_group_of(auth.uid(), p_group);
end $$;

-- ───────────── 6. Reiniciar y eliminar la cuenta, con varios grupos ─────────────
create or replace function public.wipe_game_data(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
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
  for g in select group_id from group_members where user_id = p_user loop perform public.resolve_requests(g); end loop;
end $$;

create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g uuid; heir uuid;
begin
  if me is null then raise exception 'No autenticado'; end if;
  if p_confirm is distinct from (select username from profiles where id = me) then
    raise exception 'Para confirmar, escribí tu nombre de usuario exacto.';
  end if;
  perform public.wipe_game_data(me);
  for g in select group_id from group_members where user_id = me loop
    perform public.leave_group_of(me, g);
  end loop;
  -- Grupos que creó y donde ya no está: pasan al miembro más antiguo o se borran.
  for g in select id from groups where created_by = me loop
    select user_id into heir from group_members where group_id = g and user_id <> me order by joined_at limit 1;
    if heir is null then delete from groups where id = g; else update groups set created_by = heir where id = g; end if;
  end loop;
  delete from auth.users where id = me;                      -- cascade: perfil y todo lo que cuelga de él
end $$;

-- ───────────── 7. Mi día: los nombres de todos mis grupos ─────────────
create or replace function public.my_day()
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date; pid uuid; st jsonb; grp text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  d := public.user_today(auth.uid());
  pid := public.plan_for(auth.uid(), d);
  st := public.game_state(auth.uid());
  select string_agg(g.name, ' y ' order by m.joined_at) into grp from groups g join group_members m on m.group_id = g.id where m.user_id = auth.uid();
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
        'photo_path', l.photo_path, 'block', h.block, 'strength_id', h.strength_id, 'objective_id', h.objective_id, 'cue', h.cue)
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

-- ───────────── 90. Permisos ─────────────
revoke execute on function public.cfg_group(uuid, text, date), public.cfg_for(uuid, uuid, text, date),
  public.cfg_for_num(uuid, uuid, text, date), public.day_score_in(uuid, date, uuid), public.day_score(uuid, date),
  public.leave_group_of(uuid, uuid), public.resolve_requests(uuid), public.wipe_game_data(uuid), public.cfg_at(uuid, text, date)
from public, anon, authenticated;
revoke execute on function public.propose_change(text, text, jsonb, uuid), public.my_store(uuid), public.create_group(text, int),
  public.join_group(text), public.leave_group(uuid), public.buy_item(uuid, uuid, uuid, uuid), public.group_leaderboard(uuid),
  public.delete_my_account(text), public.my_day()
from public, anon;
grant execute on function public.propose_change(text, text, jsonb, uuid), public.my_store(uuid), public.create_group(text, int),
  public.join_group(text), public.leave_group(uuid), public.buy_item(uuid, uuid, uuid, uuid), public.group_leaderboard(uuid),
  public.delete_my_account(text), public.my_day()
to authenticated;
