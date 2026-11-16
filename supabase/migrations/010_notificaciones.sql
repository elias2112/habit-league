-- 010 — Notificaciones (pedido del dueño, 2026-11-16): recordatorios de tomar agua y de la fuerza base para quien
-- tiene la app en la pantalla de inicio. Ejecutar DESPUÉS de la 009. Se puede re-ejecutar.
-- Quién manda: .github/workflows/recordatorios.yml (una vez por hora) llama a push_due() con la clave service_role
-- (secret de GitHub; nunca en la app) y envía con web-push. push_due() solo la puede llamar service_role.

-- Suscripciones del navegador (una por dispositivo).
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Preferencias: horas locales de cada recordatorio.
create table if not exists public.push_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  water boolean not null default true,
  water_hours int[] not null default '{11,14,17,20}',
  strength boolean not null default true,
  strength_hour int not null default 19 check (strength_hour between 0 and 23),
  updated_at timestamptz not null default now()
);

-- Lo enviado (evita repetir si el cron corre dos veces o se atrasa).
create table if not exists public.push_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  day date not null,
  slot int not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, day, slot)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_prefs enable row level security;
alter table public.push_log enable row level security;
drop policy if exists "push_subscriptions: propias" on public.push_subscriptions;
drop policy if exists "push_prefs: propias" on public.push_prefs;
create policy "push_subscriptions: propias" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push_prefs: propias" on public.push_prefs for select to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions, public.push_prefs, public.push_log from anon, authenticated;
grant select on public.push_subscriptions, public.push_prefs to authenticated;   -- se escriben solo vía RPC

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 then raise exception 'Suscripción inválida.'; end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
  insert into push_prefs (user_id) values (auth.uid()) on conflict do nothing;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.set_push_prefs(p_water boolean, p_water_hours int[], p_strength boolean, p_strength_hour int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from unnest(coalesce(p_water_hours, '{}')) h where h not between 0 and 23) or p_strength_hour not between 0 and 23 then
    raise exception 'Hora inválida.';
  end if;
  insert into push_prefs (user_id, water, water_hours, strength, strength_hour, updated_at)
  values (auth.uid(), p_water, coalesce(p_water_hours, '{}'), p_strength, p_strength_hour, now())
  on conflict (user_id) do update set water = excluded.water, water_hours = excluded.water_hours, strength = excluded.strength,
    strength_hour = excluded.strength_hour, updated_at = now();
end $$;

-- Avisos que tocan ahora. Una hora local h cuenta hasta h+2 (por si el cron se atrasa) y cada aviso sale una vez por
-- día y horario (push_log). Fuerza base: solo si la persona la tiene y todavía no la completó hoy.
-- Agua: si tiene el hábito de agua con meta, le dice cuánto lleva.
create or replace function public.push_due()
returns table (endpoint text, p256dh text, auth text, user_id uuid, kind text, title text, body text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare r record; lh int; today date; slot int; sd jsonb; water_count numeric; water_target numeric;
begin
  for r in select pp.*, p.timezone from push_prefs pp join profiles p on p.id = pp.user_id
           where exists (select 1 from push_subscriptions s where s.user_id = pp.user_id) loop
    lh := extract(hour from now() at time zone r.timezone)::int;
    today := public.user_today(r.user_id);

    if r.water then
      select max(h) into slot from unnest(r.water_hours) h where lh >= h and lh < h + 2;
      if slot is not null then
        insert into push_log (user_id, kind, day, slot) values (r.user_id, 'agua', today, slot) on conflict do nothing;
        if found then
          select coalesce(l.count, 0), ph.target into water_count, water_target
          from plan_habits ph join habits hb on hb.id = ph.habit_id
          left join habit_logs l on l.habit_id = hb.id and l.log_date = today
          where ph.plan_id = public.plan_for(r.user_id, today) and hb.catalog_id = 'agua_2l' limit 1;
          return query select s.endpoint, s.p256dh, s.auth, r.user_id, 'agua'::text, '💧 Tomá agua'::text,
            case when water_target is not null then format('Llevás %s de %s %s hoy.', water_count::int, water_target::int,
                   coalesce((select unit from catalog_habits where id = 'agua_2l'), 'vasos'))
                 else 'Un vaso ahora.' end
          from push_subscriptions s where s.user_id = r.user_id;
        end if;
      end if;
    end if;

    if r.strength and lh >= r.strength_hour and lh < r.strength_hour + 2 then
      sd := public.strength_day(r.user_id, today);
      if sd is not null and (sd ->> 'ratio')::numeric < 1 then
        insert into push_log (user_id, kind, day, slot) values (r.user_id, 'fuerza', today, r.strength_hour) on conflict do nothing;
        if found then
          return query select s.endpoint, s.p256dh, s.auth, r.user_id, 'fuerza'::text, '💪 Fuerza base'::text,
            'Te falta la fuerza base de hoy. Cada día seguido de la semana paga más.'::text
          from push_subscriptions s where s.user_id = r.user_id;
        end if;
      end if;
    end if;
  end loop;
  delete from push_log where day < current_date - 7;   -- se guarda solo una semana
end $$;

-- Para el envío: borrar suscripciones vencidas (el servicio de notificaciones respondió 404/410).
create or replace function public.drop_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;

revoke execute on function public.push_due(), public.drop_push_subscription(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.push_due(), public.drop_push_subscription(text) to service_role';
  end if;
end $$;
revoke execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text),
  public.set_push_prefs(boolean, int[], boolean, int) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text),
  public.set_push_prefs(boolean, int[], boolean, int) to authenticated;
