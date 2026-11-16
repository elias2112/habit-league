-- 009 — Ajustes del dueño (2026-11-16): elegir los ejercicios de la fuerza base, cambiar de grupo (crear uno nuevo
--        o unirse a otro saliendo del actual), contenido nuevo (videojuegos, 7.000 pasos) y el momento de cada hábito.
-- Ejecutar DESPUÉS de la 008. Se puede re-ejecutar. El bloque CONTENT9 lo genera `npm run catalog` desde content/:
-- así, al editar hábitos, vicios o el Juicio alcanza con volver a correr esta migración.

-- ───────────── 1. Contenido (catálogo de hábitos con pilar, vicios y preguntas del Juicio) ─────────────
-- BEGIN CONTENT9 (generado por scripts/gen-catalog-sql.mjs; no editar a mano)
insert into public.catalog_habits (id, area, name, criterion, tier, target, unit, private_default, pillar) values
  ('caminar_30', 'cuerpo', 'Caminar 30 minutos', 'Al menos 30 minutos caminando, sumados en el día.', 1, 1, null, false, 'cuerpo'),
  ('estirar_10', 'cuerpo', 'Estirar 10 minutos', '10 minutos de estiramientos o movilidad.', 1, 1, null, false, 'cuerpo'),
  ('ejercicio_20', 'cuerpo', 'Hacer ejercicio 20 minutos', '20 minutos de actividad que te suba el pulso.', 2, 1, null, false, 'cuerpo'),
  ('fuerza_30', 'cuerpo', 'Entrenamiento de fuerza', 'Una sesión de fuerza de al menos 30 minutos.', 3, 1, null, false, 'cuerpo'),
  ('respirar_5', 'mente', 'Respirar o meditar 5 minutos', '5 minutos de respiración o meditación.', 1, 1, null, false, 'mente'),
  ('diario_5', 'mente', 'Escribir en un diario', 'Al menos 5 minutos escribiendo sobre tu día.', 1, 1, null, false, 'mente'),
  ('leer_15', 'mente', 'Leer 15 minutos', '15 minutos de lectura (libro, no redes).', 2, 1, null, false, 'mente'),
  ('meditar_15', 'mente', 'Meditar 15 minutos', '15 minutos de meditación sin interrupciones.', 3, 1, null, false, 'mente'),
  ('pantallas_off_30', 'sueno', 'Pantallas apagadas 30 min antes de dormir', 'Sin pantallas los últimos 30 minutos antes de dormir.', 1, 1, null, false, 'cuerpo'),
  ('sin_cafeina_tarde', 'sueno', 'Sin cafeína después de las 16:00', 'Ninguna bebida con cafeína pasadas las 16:00.', 1, 1, null, false, 'cuerpo'),
  ('despertar_fijo', 'sueno', 'Despertar a la misma hora', 'Despertar dentro de ±30 minutos de tu hora objetivo.', 2, 1, null, false, 'cuerpo'),
  ('dormir_7h', 'sueno', 'Dormir 7 horas o más', 'Dormir al menos 7 horas (lo declarás vos).', 3, 1, null, false, 'cuerpo'),
  ('agua_2l', 'alimentacion', 'Tomar 2 litros de agua', 'Unos 2 litros en el día: 8 vasos de 250 ml.', 1, 8, 'vasos', false, 'cuerpo'),
  ('verdura_2', 'alimentacion', 'Verdura en 2 comidas', 'Verdura en al menos 2 comidas del día.', 1, 2, 'comidas', false, 'cuerpo'),
  ('cocinar_casa', 'alimentacion', 'Cocinar una comida en casa', 'Preparar con tus manos al menos una comida del día.', 2, 1, null, false, 'cuerpo'),
  ('sin_ultraprocesados', 'alimentacion', 'Un día sin ultraprocesados', 'Ninguna comida ultraprocesada en todo el día.', 3, 1, null, false, 'cuerpo'),
  ('planificar_5', 'foco', 'Planificar el día 5 minutos', 'Escribir tus prioridades antes de empezar.', 1, 1, null, false, 'mente'),
  ('cerrar_dia', 'foco', 'Anotar 3 prioridades para mañana', 'Dejar escritas 3 prioridades para el día siguiente.', 1, 1, null, false, 'mente'),
  ('tarea_dificil', 'foco', 'Hacer primero la tarea más difícil', 'Empezar el día con la tarea que más te cuesta.', 2, 1, null, false, 'mente'),
  ('bloque_profundo_45', 'foco', 'Un bloque de trabajo profundo de 45 min', '45 minutos seguidos en una sola tarea, sin distracciones.', 3, 1, null, false, 'mente'),
  ('mensaje_alguien', 'social', 'Escribirle a alguien que querés', 'Enviar un mensaje a un amigo o familiar.', 1, 1, null, false, null),
  ('agradecer', 'social', 'Agradecer a alguien', 'Agradecerle a alguien por algo concreto.', 1, 1, null, false, null),
  ('llamada_10', 'social', 'Llamar a alguien 10 minutos', 'Una llamada o videollamada de al menos 10 minutos.', 2, 1, null, false, null),
  ('plan_persona', 'social', 'Pasar tiempo en persona con alguien', 'Compartir un rato en persona con alguien que te importa.', 3, 1, null, false, null),
  ('pasos_7k', 'cuerpo', '7.000 pasos', 'Llegar a 7.000 pasos en el día (mirá el contador del teléfono). Cargá los pasos del día.', 2, 7000, 'pasos', false, 'cuerpo'),
  ('pasos_10k', 'cuerpo', '10.000 pasos', 'Llegar a 10.000 pasos en el día (podés mirar el contador del teléfono).', 2, 1, null, false, 'cuerpo'),
  ('correr_5k', 'cuerpo', 'Correr 5 km', 'Correr al menos 5 km, de una o en tramos.', 3, 1, null, false, 'cuerpo'),
  ('fumar_menos', 'cuerpo', 'Fumar menos que ayer', 'Fumar menos cigarrillos que el día anterior.', 2, 1, null, true, 'cuerpo'),
  ('dia_sin_fumar', 'cuerpo', 'Día sin fumar', 'Ningún cigarrillo ni vapeo en todo el día.', 3, 1, null, true, 'cuerpo'),
  ('redes_2h', 'mente', 'Menos de 2 h de redes', 'Menos de 2 horas en redes sociales (mirá el tiempo de uso del teléfono).', 2, 1, null, false, 'mente'),
  ('aire_libre_20', 'mente', '20 minutos al aire libre', 'Al menos 20 minutos afuera, sin auriculares.', 1, 1, null, false, 'mente'),
  ('acostarse_fijo', 'sueno', 'Acostarte a la misma hora', 'Ir a la cama dentro de ±30 minutos de tu hora objetivo.', 2, 1, null, false, 'cuerpo'),
  ('cama_sin_celular', 'sueno', 'Celular fuera de la cama', 'Dejar el celular lejos de la cama al acostarte.', 1, 1, null, false, 'cuerpo'),
  ('max_2_tragos', 'alimentacion', 'Máximo 2 tragos', 'Si tomás alcohol, no más de 2 tragos en el día.', 2, 1, null, true, 'cuerpo'),
  ('dia_sin_alcohol', 'alimentacion', 'Día sin alcohol', 'Nada de alcohol en todo el día.', 3, 1, null, true, 'cuerpo'),
  ('sin_delivery', 'alimentacion', 'Día sin delivery', 'Ni delivery ni comida rápida en todo el día.', 2, 1, null, false, 'cuerpo'),
  ('fruta_2', 'alimentacion', '2 frutas', 'Comer al menos 2 frutas en el día.', 1, 2, 'frutas', false, 'cuerpo'),
  ('celular_manana', 'foco', 'Sin celular la primera hora', 'No mirar el celular durante la primera hora después de despertarte.', 1, 1, null, false, 'mente'),
  ('pomodoros_4', 'foco', '4 bloques de 25 minutos', '4 bloques de 25 minutos de trabajo concentrado, con pausas.', 2, 4, 'bloques', false, 'mente'),
  ('ayudar_alguien', 'social', 'Ayudar a alguien', 'Hacer algo concreto por otra persona sin que te lo pida.', 1, 1, null, false, null),
  ('comida_compartida', 'social', 'Comer con alguien sin pantallas', 'Una comida compartida, con los teléfonos guardados.', 2, 1, null, false, null),
  ('hacer_cama', 'foco', 'Hacer la cama', 'Hacer la cama al levantarte.', 1, 1, null, false, 'mente'),
  ('juegos_1h', 'foco', 'Máximo 1 h de videojuegos', 'Jugar como mucho una hora en el día (PC, consola o celular).', 1, 1, null, false, 'mente'),
  ('dia_sin_juegos', 'foco', 'Un día sin videojuegos', 'No jugar videojuegos en todo el día.', 2, 1, null, false, 'mente')
on conflict (id) do update set area = excluded.area, name = excluded.name, criterion = excluded.criterion, tier = excluded.tier,
  target = excluded.target, unit = excluded.unit, private_default = excluded.private_default, pillar = excluded.pillar;
insert into public.vice_catalog (id, name, area, slip, slip_penalty) values
  ('fumar', 'Fumar o vapear', 'cuerpo', 'Hoy fumé', 10),
  ('alcohol', 'Tomar alcohol', 'alimentacion', 'Hoy tomé', 15),
  ('chatarra', 'Comida chatarra o delivery', 'alimentacion', 'Hoy comí chatarra', 10),
  ('dulces', 'Dulces y gaseosas', 'alimentacion', 'Hoy me pasé con lo dulce', 5),
  ('redes', 'Redes sociales de más', 'mente', 'Hoy me pasé con las redes', 5),
  ('trasnochar', 'Trasnochar', 'sueno', 'Anoche me acosté muy tarde', 10),
  ('apuestas', 'Apuestas', 'foco', 'Hoy aposté', 15),
  ('videojuegos', 'Videojuegos de más', 'foco', 'Hoy jugué de más', 5)
on conflict (id) do update set name = excluded.name, area = excluded.area, slip = excluded.slip, slip_penalty = excluded.slip_penalty;
insert into public.judgment_questions (id, kind, text, hint, type, unit, category, params, condition, sort) values
  ('comida', 'core', '¿Comiste mal ayer (chatarra, atracón, nada de verdura)?', null, 'yesno', null, 'vicio', '{"yes":-5,"no":2}'::jsonb, null, 0),
  ('fumar', 'core', '¿Fumaste o vapeaste ayer? ¿Cuántos cigarrillos o sesiones?', 'Contá cada cigarrillo o cada vez que agarraste el vaper.', 'count', 'cigarrillos', 'vicio', '{"zero":3,"free":0,"per_unit":-1,"min":-10}'::jsonb, '{"area":"tabaco","in":["poco","mucho"],"opt":"fumar"}'::jsonb, 1),
  ('alcohol', 'core', '¿Tomaste alcohol ayer? ¿Cuántos tragos?', 'Hasta 2 no restan.', 'count', 'tragos', 'vicio', '{"zero":2,"free":2,"per_unit":-2,"min":-10}'::jsonb, '{"area":"alcohol","in":["poco","mucho"],"opt":"alcohol"}'::jsonb, 2),
  ('juegos', 'core', '¿Jugaste videojuegos ayer? ¿Cuántas horas?', 'Contá el total del día, redondeado. La primera hora no resta.', 'count', 'horas', 'vicio', '{"zero":2,"free":1,"per_unit":-2,"min":-8}'::jsonb, '{"area":"juegos","in":["poco","mucho"],"opt":"juegos"}'::jsonb, 3),
  ('gasto', 'core', '¿Gastaste en algo que no necesitabas? ¿Cuánto?', 'Ese gasto alimenta al Dragón.', 'money', null, 'dinero', '{"zero":2,"per_5":-1,"cap":-10}'::jsonb, null, 4),
  ('ahorro', 'core', '¿Ahorraste algo aparte de tus hábitos? ¿Cuánto?', 'Lo podés guardar en uno de tus cofres.', 'money', null, 'dinero', '{"zero":0,"per_5":1,"cap":10}'::jsonb, null, 5),
  ('disfrute', 'core', '¿Hiciste algo solo porque lo disfrutás?', null, 'yesno', null, 'disfrute', '{"yes":3,"no":0}'::jsonb, null, 6),
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
delete from public.judgment_questions where id not in ('comida', 'fumar', 'alcohol', 'juegos', 'gasto', 'ahorro', 'disfrute', 'cama', 'buena_accion', 'ordenar', 'familia', 'aprender', 'sin_auriculares', 'cocinar_otros', 'cumplido', 'sin_quejas', 'comida_sin_celular', 'agua_despertar', 'luz_natural');
-- END CONTENT9

-- ───────────── 2. Fuerza base: se eligen los ejercicios ─────────────
-- p_strength: {"targets": {"flexiones": 30, "plancha": 40}}         solo los ejercicios elegidos, cada uno con su meta
--             {"easy": true, "exercises": ["flexiones", "plancha"]}  variante fácil de los elegidos (sin lista = todos)
--             null o "declined"                                     sin fuerza base
create or replace function public.create_initial_plan(p_habits jsonb, p_vices jsonb default '[]', p_objectives jsonb default '[]',
                                                      p_strength jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pid uuid; d date; h jsonb; v jsonb; o jsonb; ex jsonb; hid uuid; vid uuid; oid_ uuid; gid uuid;
  mx int; idx int; oids uuid[] := '{}'; gids uuid[] := '{}'; easy boolean; t numeric; step int; cap int; nm text; nex int := 0;
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
      -- Solo los ejercicios elegidos: los de "targets" o, en la variante fácil, los de "exercises" (sin lista = todos).
      if easy then
        continue when p_strength ? 'exercises' and not (p_strength -> 'exercises') ? (ex ->> 'id');
      else
        continue when not coalesce(p_strength -> 'targets', '{}'::jsonb) ? (ex ->> 'id');
      end if;
      nex := nex + 1;
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
    if nex = 0 then raise exception 'Elegí al menos un ejercicio de fuerza base (o decí que no).'; end if;
  end if;

  for v in select * from jsonb_array_elements(coalesce(p_vices, '[]')) loop
    insert into vices (user_id, name, suggestion_id) values (auth.uid(), v ->> 'name', v ->> 'suggestion_id') returning id into vid;
    insert into plan_vices (plan_id, vice_id, weight, severity) values (pid, vid, coalesce((v ->> 'weight')::int, 1), coalesce(v ->> 'severity', 'normal'));
  end loop;
  return pid;
end $$;


-- ───────────── 3. Grupos: cambiar de grupo ─────────────
-- Sacar a una persona de su grupo. Si creó el grupo, pasa al miembro más antiguo; si queda vacío, se borra.
-- Sus cofres compartidos pasan al dueño del grupo. Sus datos de juego (plan, monedas, nivel) quedan: son suyos.
create or replace function public.leave_group_of(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g uuid; heir uuid; owner uuid;
begin
  g := public.my_group(p_user);
  if g is null then return; end if;
  select created_by into owner from groups where id = g;
  select user_id into heir from group_members where group_id = g and user_id <> p_user order by joined_at, user_id limit 1;
  if heir is null then
    delete from groups where id = g;                       -- queda vacío: se borra (cascade)
    return;
  end if;
  if owner = p_user then
    update groups set created_by = heir where id = g;
    owner := heir;
  end if;
  update group_chests set created_by = owner where group_id = g and created_by = p_user;
  delete from change_votes v using change_requests r where v.request_id = r.id and r.group_id = g and v.voter_id = p_user;
  delete from group_members where group_id = g and user_id = p_user;
  perform public.resolve_requests(g);
end $$;

-- Crear un grupo. Con p_leave = true, primero sale del grupo actual (un grupo por persona).
drop function if exists public.create_group(text, int);
create or replace function public.create_group(p_name text, p_duration int default 66, p_leave boolean default false)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from group_members where user_id = auth.uid()) then
    if not p_leave then raise exception 'Ya estás en un grupo. Para crear otro, salís del actual.'; end if;
    perform public.leave_group_of(auth.uid());
  end if;
  insert into groups (name, created_by, duration_days, start_date)
  values (trim(p_name), auth.uid(), p_duration, public.user_today(auth.uid())) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

-- Unirse con un código. Con p_leave = true, primero sale del grupo actual.
drop function if exists public.join_group(text);
create or replace function public.join_group(p_code text, p_leave boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select id into gid from groups where invite_code = lower(trim(p_code));
  if gid is null then raise exception 'Código de invitación inválido'; end if;
  if exists (select 1 from group_members where user_id = auth.uid() and group_id <> gid) then
    if not p_leave then raise exception 'Ya estás en otro grupo. Para entrar a este, salís del actual.'; end if;
    perform public.leave_group_of(auth.uid());
  end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

-- Salir del grupo (sin entrar a otro).
create or replace function public.leave_group()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform public.leave_group_of(auth.uid());
end $$;

-- ───────────── 4. ¿Cuándo lo hacés? (momento de cada hábito) ─────────────
-- Atar cada hábito a un momento del día ("después del desayuno"). Es personal: se cambia directo, no cuenta para
-- ningún cálculo y lo ve solo su dueño (habits solo la lee su dueño).
alter table public.habits add column if not exists cue text;
alter table public.habits drop constraint if exists habits_cue_check;
alter table public.habits add constraint habits_cue_check check (cue is null or char_length(cue) between 1 and 60);

create or replace function public.set_habit_cue(p_habit uuid, p_cue text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  update habits set cue = nullif(trim(p_cue), '') where id = p_habit and user_id = auth.uid();
  if not found then raise exception 'Hábito inexistente.'; end if;
end $$;

-- Mi día, con el momento de cada hábito.
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
revoke execute on function public.leave_group_of(uuid) from public, anon, authenticated;
revoke execute on function public.create_initial_plan(jsonb, jsonb, jsonb, jsonb), public.create_group(text, int, boolean),
  public.join_group(text, boolean), public.leave_group(), public.set_habit_cue(uuid, text), public.my_day() from public, anon;
grant execute on function public.create_initial_plan(jsonb, jsonb, jsonb, jsonb), public.create_group(text, int, boolean),
  public.join_group(text, boolean), public.leave_group(), public.set_habit_cue(uuid, text), public.my_day() to authenticated;
