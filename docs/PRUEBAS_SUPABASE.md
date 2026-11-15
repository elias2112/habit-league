# Probar la v4.2 en un proyecto de Supabase aparte (no en el real)

Objetivo: correr todas las migraciones (hasta la **007**) y probar la v4.2 — fuerza base, «solo yo», tienda por áreas, **reiniciar** y **eliminar cuenta** — sobre Supabase de verdad, con cuentas de prueba y **sin tocar el proyecto de tu grupo**. El plan gratis permite **2 proyectos activos** ([supabase.com/pricing](https://supabase.com/pricing)).

## 1. Crear el proyecto de prueba
1. En [supabase.com](https://supabase.com): **New project** → nombre `habit-league-pruebas` → mismo plan gratis.
2. **Authentication → Sign In / Providers → Email**: desactivá "Confirm email" (así las cuentas de prueba entran sin correo).
3. **Authentication → URL Configuration**: en *Site URL* poné `http://localhost:5173`.

## 2. Cargar el esquema completo (SQL Editor, en este orden, una consulta por archivo)
1. `supabase/schema.sql`
2. `supabase/migrations/002_quiz_personas_puntos.sql`
3. `supabase/migrations/003_grupo_objetivos_fotos.sql`
4. `supabase/migrations/004_liga_juicio_cofre.sql`
5. `supabase/migrations/005_vicios.sql`
6. `supabase/migrations/005b_respaldo.sql`
7. `supabase/migrations/006_v3_plan_monedas.sql`
8. `supabase/migrations/007a_respaldo.sql`
9. `supabase/migrations/007_v42.sql`
10. `supabase/migrations/008_quitar_liga.sql`

Si algún paso da error, copiá el mensaje completo y mandámelo.

**Chequeos de la 007** (opcionales, en este proyecto vacío):
- Si corrés la 007 sin la 007a, se frena con "primero ejecutá 007a_respaldo.sql".
- Mirá el respaldo: `select * from respaldo_v4.hecho;` (una fila con las filas copiadas de cada tabla).
- La 007 marca el reinicio: `select * from respaldo_v4.reinicio;` (una fila). Re-ejecutarla no vuelve a borrar nada.

## 3. Apuntar la app al proyecto de prueba (en tu computadora)
1. Copiá `.env.local` a `.env.local.real` (para no perder la configuración real).
2. En `.env.local` poné la *Project URL* y la clave *publishable* del proyecto de prueba (Project Settings → API).
3. `npm run dev` y abrí `http://localhost:5173`.

## 4. Cuentas de prueba
Creá tres cuentas desde la app con correos que controles (por ejemplo `tu-correo+a@gmail.com`, `+b` y `+c`). Llamalas A, B y C. Para tener las tres sesiones a la vez, usá ventanas de incógnito o navegadores distintos.

1. **A:** hacé el cuestionario completo. En **Fuerza** elegí metas (por ejemplo 30 / 20 / 40) y aceptá. En **Vos → áreas**, contestá *Alcohol: Poco* y *Fumar: No*. Al final, creá un grupo y anotá el código.
2. **B:** cuestionario; en **Fuerza** tocá «No quiero»: tiene que aparecer un chiste; tocá «Sigo sin fuerza base». Uníte al grupo de A.
3. **C:** cuestionario con la variante fácil (en algún ejercicio elegí «<10»). Uníte al grupo.

## 5. Datos de prueba (SQL Editor)
Esto adelanta el plan de A 10 días y le carga historia: 9 días de fuerza base completos, **un día fallado** (anteayer al 50 %) y un cofre de ahorro. Reemplazá el correo si usaste otro.

```sql
do $$
declare a uuid; d date; h record; o int;
begin
  select id into a from auth.users where email = 'tu-correo+a@gmail.com';
  d := public.user_today(a);
  update plans set effective_from = d - 10 where user_id = a;            -- el plan rige desde hace 10 días
  for o in 1..10 loop                                                    -- días 10..1 (menos anteayer): completos
    continue when o = 2;
    for h in select hb.id, ph.target from habits hb join plan_habits ph on ph.habit_id = hb.id
             where hb.user_id = a and hb.block in ('fuerza','deporte') loop
      insert into habit_logs (habit_id, log_date, count) values (h.id, d - o, greatest(1, coalesce(h.target, 1)))
      on conflict do nothing;
    end loop;
  end loop;
  for h in select hb.id, ph.target from habits hb join plan_habits ph on ph.habit_id = hb.id
           where hb.user_id = a and hb.block = 'fuerza' loop                -- anteayer: 50 % → día fallado
    insert into habit_logs (habit_id, log_date, count) values (h.id, d - 2, ceil(h.target / 2)) on conflict do nothing;
  end loop;
  insert into goals (user_id, title, kind, target, unit) values (a, 'Celular', 'ahorro', 100, '€');
end $$;
```

## 6. Recorrido de la v4.2
1. **A → Hoy:** arriba, una sola tarjeta con nivel, rango, puntos y billetera. En **Fuerza base** tiene que aparecer «Tenés un día fallado sin saldar» y las recompensas retenidas.
2. **A:** tocá «Hice las 20 extra de …». **B → Grupo → Actividad:** tiene que verse «💪 A hizo las 20 extra…». En A, las recompensas dejan de estar retenidas.
3. **A → Mi plan → Cofres de ahorro:** sumá 55 € a mano al cofre «Celular». En **Tienda → De dónde sale**, *Cofres de ahorro* tiene que dar 3 (hitos de 25 y 50 %).
4. **A → Mi plan:** agregá un hábito del catálogo con «Solo yo». Tiene que mostrar el aviso con el nombre del grupo y agregarse sin votación (rige mañana, con la etiqueta «solo yo»).
5. **A → Mi plan → Flexiones → meta 50 → Todo el grupo → Proponer.** **B y C:** votá a favor en Grupo. Mañana, A y C tienen 50 de meta en flexiones (B no tiene fuerza base: no le aplica).
6. **A → Tienda:** la cerveza cuesta 10 (alcohol «poco» ×2), el cigarro no aparece (fumar «no»), los vales aparecen con 🔒 y «se desbloquea en el nivel 10». Desde **B**, la cerveza cuesta 5 (B no contestó lo mismo).
7. **A → Hoy → Responder el Juicio de ayer:** responde y muestra el total; dice que por ahora no da premio. La billetera no cambia.

## 7. Reiniciar (con B)
1. **B:** anotá un aporte en un cofre del grupo (Grupo → Cofres del grupo). Después, Perfil → Cuenta → "Empezar de cero". Revisá que la lista muestre lo que tiene. Escribí el usuario y confirmá.
2. Esperado: B vuelve al cuestionario, sigue en el grupo y su aporte al cofre compartido sigue ahí. Las respuestas por área de B se borraron (puede volver a contestarlas).
3. Verificación (reemplazá el email):
   ```sql
   select (select count(*) from habits h join auth.users u on u.id = h.user_id where u.email = 'tu-correo+b@gmail.com') as habitos,
          (select count(*) from area_answers x join auth.users u on u.id = x.user_id where u.email = 'tu-correo+b@gmail.com') as areas,
          (select count(*) from strength_settlements x join auth.users u on u.id = x.user_id where u.email = 'tu-correo+b@gmail.com') as saldos,
          (select count(*) from group_members m join auth.users u on u.id = m.user_id where u.email = 'tu-correo+b@gmail.com') as en_grupo,
          (select count(*) from group_chest_entries e join auth.users u on u.id = e.user_id where u.email = 'tu-correo+b@gmail.com') as aportes;
   ```
   Esperado: `habitos = 0`, `areas = 0`, `saldos = 0`, `en_grupo = 1`, `aportes = 1`.

## 8. Eliminar la cuenta del creador del grupo (con A)
1. **A:** Perfil → Cuenta → "Eliminar mi cuenta". Escribí el usuario y confirmá. La app tiene que cerrar sesión.
2. Esperado: el grupo pasa al miembro más antiguo (B o C, el que haya entrado primero). El cofre compartido sigue con los aportes de los demás.
3. Verificación:
   ```sql
   select count(*) as queda_usuario from auth.users where email = 'tu-correo+a@gmail.com';   -- 0
   select g.name, p.username as nuevo_dueno from groups g join profiles p on p.id = g.created_by;
   select c.title, p.username as dueno, (select count(*) from group_chest_entries e where e.chest_id = c.id) as aportes
   from group_chests c join profiles p on p.id = c.created_by;
   ```
4. En **Storage → evidencias**, comprobá que no quedó la carpeta de A.

## 9. Filas huérfanas (después de los pasos 7 y 8)
Todas las filas tienen que dar **0**. Cubre cada tabla que apunta a una persona o a un grupo, incluido `groups.created_by`.

```sql
select donde, n from (
  select 'groups.created_by' as donde, count(*) as n from groups g where not exists (select 1 from profiles p where p.id = g.created_by)
  union all select 'groups sin miembros', count(*) from groups g where not exists (select 1 from group_members m where m.group_id = g.id)
  union all select 'group_members', count(*) from group_members m where not exists (select 1 from profiles p where p.id = m.user_id)
  union all select 'group_chests.created_by', count(*) from group_chests c where not exists (select 1 from profiles p where p.id = c.created_by)
  union all select 'group_chest_entries', count(*) from group_chest_entries e where not exists (select 1 from profiles p where p.id = e.user_id)
  union all select 'profiles sin usuario', count(*) from profiles p where not exists (select 1 from auth.users u where u.id = p.id)
  union all select 'habits', count(*) from habits x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'habit_logs', count(*) from habit_logs x where not exists (select 1 from habits h where h.id = x.habit_id)
  union all select 'plans', count(*) from plans x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'plan_habits', count(*) from plan_habits x where not exists (select 1 from plans p where p.id = x.plan_id)
  union all select 'vices', count(*) from vices x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'vice_days', count(*) from vice_days x where not exists (select 1 from vices v where v.id = x.vice_id)
  union all select 'objectives', count(*) from objectives x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'goals', count(*) from goals x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'goal_entries', count(*) from goal_entries x where not exists (select 1 from goals g where g.id = x.goal_id)
  union all select 'purchases', count(*) from purchases x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'purchases sin artículo', count(*) from purchases x where not exists (select 1 from store_items s where s.id = x.item_id)
  union all select 'store_optins', count(*) from store_optins x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'change_requests', count(*) from change_requests x where not exists (select 1 from profiles p where p.id = x.proposer_id)
  union all select 'change_votes', count(*) from change_votes x where not exists (select 1 from profiles p where p.id = x.voter_id)
  union all select 'strength_settlements', count(*) from strength_settlements x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'area_answers', count(*) from area_answers x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'daily_judgments', count(*) from daily_judgments x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'user_settings', count(*) from user_settings x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'user_notices', count(*) from user_notices x where not exists (select 1 from profiles p where p.id = x.user_id)
  union all select 'fotos sin dueño (Storage)', count(*) from storage.objects o
    where o.bucket_id = 'evidencias' and not exists (select 1 from profiles p where p.id::text = split_part(o.name, '/', 1))
) t order by n desc, donde;
```

## 10. Eliminar al último del grupo
1. **B y C:** eliminen sus cuentas.
2. Esperado: con la última, el grupo se borra: `select count(*) from groups;` devuelve 0. Volvé a correr la consulta del paso 9: todo en 0.

## 11. Si algo falla
Mandame el mensaje de error y el paso. Un punto a vigilar: borrar el usuario de autenticación desde una función de la base es un patrón usado por la comunidad, no la vía oficial (la oficial usa la clave `service_role` desde un servidor). Si Supabase lo rechaza, la alternativa es una Edge Function con la `service_role`, que **nunca** va en la app.

## 12. Volver al proyecto real
Restaurá `.env.local` desde `.env.local.real`.

## 13. En el proyecto real (solo con OK del dueño, después de probar acá)
1. Avisá al grupo que **nadie use la app** durante el cambio.
2. SQL Editor: `007a_respaldo.sql`. Revisá `select * from respaldo_v4.hecho order by at desc limit 1;`.
3. Inmediatamente después, `007_v42.sql`. Si alguien usó la app entre medio, la 007 se frena ("el respaldo de … no coincide"): volvé a correr la 007a y después la 007.
4. La 007 borra los datos de juego de **todos** (quedan cuentas, grupos, cofres de grupo y el Juicio). Las fotos viejas quedan en Storage (la base no las puede borrar); si querés, se borran a mano desde Storage → evidencias.
5. `008_quitar_liga.sql` (quita la liga, después de respaldarla).
6. Publicar la app (push a `main`). Cada persona hace el cuestionario de nuevo.
