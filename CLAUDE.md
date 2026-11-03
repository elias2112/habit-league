# Habit League

App de hábitos para un grupo de amigos: check diario, XP, rachas y ranking del grupo. Uso privado, objetivo de costo 0 €.

Lee `docs/PRODUCT.md` antes de empezar: contiene el alcance, las reglas de juego, las decisiones tomadas y las preguntas abiertas.

## Stack
- Vite + React + TypeScript, Tailwind CSS
- PWA con `vite-plugin-pwa`
- Supabase (Auth, Postgres, Realtime) vía `@supabase/supabase-js`
- Esquema de base de datos en `supabase/schema.sql`

## Reglas de trabajo
- Idioma de la interfaz y de los textos: español.
- No inventar datos, estudios, estadísticas ni testimonios en la UI.
- No copiar nombre, logo, textos ni arte de la app de referencia (Life Reset). Solo la mecánica.
- Toda tabla nueva lleva Row Level Security. Los datos de un usuario solo los ven él y quienes comparten grupo con él.
- Nunca commitear claves. Usar `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y mantener `.env.example`. La clave `service_role` jamás va en el cliente.
- Si algo no está definido en `docs/PRODUCT.md` (marcado [ABIERTO]), preguntar al dueño en vez de decidir en silencio.
- Verificar límites o precios de servicios externos con búsqueda antes de depender de ellos.

## Primer encargo sugerido
1. Crear el proyecto Vite + React + TS + Tailwind y configurar la PWA (manifest, iconos, service worker).
2. Crear el proyecto en Supabase, ejecutar `supabase/schema.sql` y **corregir cualquier error**: el SQL se probó en Postgres local pero no sus políticas RLS ni sobre Supabase real.
3. Auth por email y pantalla de perfil (username).
4. Crear grupo / unirse con código (RPC `create_group`, `join_group`).
5. Pantalla "Hoy": hábitos con check y XP del día.
6. Pantalla "Ranking" con `group_leaderboard`.
7. Pruebas de las funciones SQL (racha y ranking) con casos de borde: cambio de día, zona horaria, días saltados.

## Pendientes conocidos
- Tests del SQL: `npm test` (PGlite + stub de `auth`). Cualquier cambio en `schema.sql` debe pasar `tests/sql.test.ts`.
- Supabase ya no expone tablas nuevas de `public` automáticamente: toda tabla nueva necesita `grant` explícito a `authenticated`.
- La racha cuenta "al menos un hábito por día" (decisión abierta).
- Notificaciones push en iOS requieren que la PWA esté agregada a la pantalla de inicio.
- Hosting: GitHub Pages vía Actions (`.github/workflows/deploy.yml`). La app vive bajo `/<repo>/`: usar `import.meta.env.BASE_URL` / `appUrl()`, nunca rutas absolutas `/...`.
