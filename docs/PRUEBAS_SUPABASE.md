# Probar la v4 en un proyecto de Supabase aparte (no en el real)

Objetivo: correr las migraciones y probar **reiniciar** y **eliminar cuenta** sobre Supabase de verdad, con cuentas de prueba, sin tocar el proyecto de tu grupo. El plan gratis permite **2 proyectos activos** ([supabase.com/pricing](https://supabase.com/pricing)).

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

Si algún paso da error, copiá el mensaje completo y mandámelo.

**Chequeo:** la 006 sin la 005b tiene que frenarse con "primero ejecutá 005b_respaldo.sql". Si querés comprobarlo, corré la 006 antes que la 005b.

## 3. Apuntar la app al proyecto de prueba (en tu computadora)
1. Copiá `.env.local` a `.env.local.real` (para no perder la configuración real).
2. En `.env.local` poné la *Project URL* y la clave *publishable* del proyecto de prueba (Project Settings → API).
3. `npm run dev` y abrí `http://localhost:5173`.

## 4. Cuentas de prueba
Creá tres cuentas desde la app, con correos que controles (por ejemplo `tu-correo+a@gmail.com`, `+b` y `+c`). Llamalas A, B y C. Para tener las tres sesiones a la vez, usá ventanas de incógnito o navegadores distintos.

## 5. Recorrido
1. **A:** hacé el cuestionario completo, creá un grupo y anotá el código.
2. **B y C:** hacé el cuestionario y uníte al grupo de A.
3. **A:** marcá hábitos, subí una foto, marcá un vicio "lo hice" y desmarcalo. El ×0,9 tiene que volver a ×1,0.
4. **B:** creá un cofre compartido (Grupo → Cofres del grupo) y anotá un aporte. **C:** anotá un aporte en ese cofre.
5. **A:** proponé un cambio (por ejemplo, el peso de un hábito). **B:** votá a favor (queda pendiente: falta otro voto).

## 6. Reiniciar (con B)
1. **B:** Perfil → Cuenta → "Empezar de cero". Revisá que la lista muestre lo que tiene. Escribí el usuario y confirmá.
2. Esperado: B vuelve al cuestionario, sigue en el grupo y su aporte al cofre compartido sigue ahí. En la votación de A desaparece el voto de B (sigue pendiente).
3. Verificación en el SQL Editor (reemplazá el email):
   ```sql
   select (select count(*) from habits h join auth.users u on u.id = h.user_id where u.email = 'tu-correo+b@gmail.com') as habitos,
          (select count(*) from group_members m join auth.users u on u.id = m.user_id where u.email = 'tu-correo+b@gmail.com') as en_grupo,
          (select count(*) from group_chest_entries e join auth.users u on u.id = e.user_id where u.email = 'tu-correo+b@gmail.com') as aportes;
   ```
   Esperado: `habitos = 0`, `en_grupo = 1`, `aportes = 1`.

## 7. Eliminar la cuenta del creador del grupo (con A)
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

## 8. Eliminar al último del grupo
1. **B y C:** eliminen sus cuentas.
2. Esperado: con la última, el grupo se borra: `select count(*) from groups;` devuelve 0.

## 9. Si algo falla
Mandame el mensaje de error y el paso. Un punto a vigilar: borrar el usuario de autenticación desde una función de la base es un patrón usado por la comunidad, no la vía oficial (la oficial usa la clave `service_role` desde un servidor). Si Supabase lo rechaza, la alternativa es una Edge Function con la `service_role`, que **nunca** va en la app.

## 10. Volver al proyecto real
Restaurá `.env.local` desde `.env.local.real`.
