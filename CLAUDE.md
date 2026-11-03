# Habit League

App de hábitos para un grupo de amigos: check diario, XP, rachas y ranking del grupo. Uso privado, objetivo de costo 0 €.

Lee antes de empezar:
- `docs/PRODUCT.md`: alcance, reglas de juego, decisiones y preguntas abiertas.
- `docs/QUIZ_Y_PERFILES.md`: cómo se calcula el perfil y se sugieren hábitos (vista legible de `content/*.json`).
- `docs/DESIGN.md`: guía visual y flujo de onboarding.

## Contenido como datos
`content/quiz.json`, `content/archetypes.json` y `content/habits.json` son la fuente de verdad del quiz. La app los importa (`src/lib/quiz.ts`); no hardcodear preguntas en componentes. `content/test_vectors.json` trae entradas con la salida esperada; `tests/quiz.test.ts` verifica que el algoritmo las cumpla.

## Stack
- Vite + React + TypeScript, Tailwind CSS v4 (tokens de `docs/DESIGN.md` en `src/index.css`)
- PWA con `vite-plugin-pwa`
- Supabase (Auth, Postgres, Realtime) vía `@supabase/supabase-js`
- Base de datos: `supabase/schema.sql` y luego `supabase/migrations/002_quiz_personas_puntos.sql` (ejecutar en ese orden). La clave en el cliente es la *publishable key* de Supabase.
- Hosting: GitHub Pages vía Actions (`.github/workflows/deploy.yml`). La app vive bajo `/<repo>/`: usar `import.meta.env.BASE_URL` / `appUrl()`, nunca rutas absolutas `/...`.

## Reglas de trabajo
- Idioma de la interfaz y de los textos: español rioplatense (voseo), igual que `content/`.
- No inventar datos, estudios, estadísticas ni testimonios en la UI.
- No copiar nombre, logo, textos ni arte de la app de referencia (Life Reset). Solo la mecánica.
- Toda tabla nueva lleva Row Level Security. Los datos de un usuario solo los ven él y quienes comparten grupo con él.
- Supabase ya no expone tablas nuevas de `public` automáticamente: toda tabla o columna editable nueva necesita `grant` explícito a `authenticated`, y toda función nueva `revoke execute ... from public, anon`.
- Nunca commitear claves. Usar `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y mantener `.env.example`. La clave `service_role` jamás va en el cliente.
- El quiz es un juego propio, no un test psicológico validado. No presentarlo como diagnóstico ni inventar estudios o porcentajes de eficacia.
- Los puntos los calcula la base de datos (trigger `set_log_points`); el cliente nunca envía puntos.
- Si algo no está definido en `docs/PRODUCT.md` (marcado [ABIERTO]), preguntar al dueño en vez de decidir en silencio.
- Verificar límites o precios de servicios externos con búsqueda antes de depender de ellos.
- `npm test` debe pasar: `tests/sql.test.ts` (esquema + 002 sobre PGlite con stub de auth) y `tests/quiz.test.ts`.

## Pendientes conocidos
- Las políticas RLS y triggers están probados en PGlite con un stub de auth; falta una prueba manual sobre Supabase real con dos cuentas.
- La columna `habits.xp_value` (y `habit_logs.xp`) quedaron deprecadas; eliminarlas cuando se confirme que no se usan.
- Mínimo de 3 hábitos activos: solo lo exige la UI por ahora.
- Los registros creados antes de la migración 002 quedan con `points = 0`.
- Radar de 6 áreas: v2 (usará `profiles.area_scores`, que hoy guarda el nivel 0–3 por área).
- Notificaciones push en iOS requieren que la PWA esté en la pantalla de inicio.
- Tipografías e ilustraciones sin decidir.
