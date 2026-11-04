# Habit League

App de hábitos para un grupo de amigos: check diario, puntos, rachas y ranking del grupo. Uso privado, objetivo de costo 0 €.

Lee antes de empezar:
- `docs/PRODUCT.md`: alcance, reglas de juego, decisiones y preguntas abiertas.
- `docs/QUIZ_Y_PERFILES.md`: cómo se calcula el perfil y se sugieren hábitos (vista legible de `content/*.json`).
- `docs/DESIGN.md`: guía visual, radar de 6 áreas y flujo de onboarding.

## Arquetipos de género neutro
Los nombres y textos de arquetipos, quiz y hábitos están redactados sin género gramatical (Estratega, Perfeccionista, Aprendiz, Fénix, Autodidacta, Velocista, Nómada, Espíritu Libre). En la UI mostrar el nombre sin artículo ("Sos Estratega") y mantener esa convención en todo texto nuevo. Los emblemas están en `assets/arquetipos/<id>.svg` (copiados a `public/arquetipos/` para servirlos); el radar de referencia en `assets/radar-ejemplo.svg` (ver `docs/DESIGN.md`).

## Contenido como datos
`content/quiz.json`, `content/archetypes.json`, `content/habits.json` y `content/goals.json` son la fuente de verdad. La app los importa (`src/lib/quiz.ts`, `src/lib/goals.ts`); no hardcodear preguntas ni hábitos en componentes. `content/test_vectors.json` trae entradas con la salida esperada; `tests/quiz.test.ts` verifica que el algoritmo las cumpla.
- Al editar `content/habits.json`: correr `npm run catalog` (regenera el bloque del catálogo en la migración 003) y volver a ejecutar 003 en Supabase.
- Hábitos nuevos del catálogo van con `auto: false` salvo que se quiera que entren al paquete automático (cambia la salida de los vectores).

## Stack
- Vite + React + TypeScript, Tailwind CSS v4 (tokens de `docs/DESIGN.md` en `src/index.css`)
- PWA con `vite-plugin-pwa`
- Supabase (Auth, Postgres, Realtime, Storage) vía `@supabase/supabase-js`
- Base de datos, en este orden: `supabase/schema.sql`, `supabase/migrations/002_quiz_personas_puntos.sql`, `supabase/migrations/003_grupo_objetivos_fotos.sql`. Todas se pueden re-ejecutar. La clave en el cliente es la *publishable key*.
- Hosting: GitHub Pages vía Actions (`.github/workflows/deploy.yml`). La app vive bajo `/<repo>/`: usar `import.meta.env.BASE_URL` / `appUrl()`, nunca rutas absolutas `/...`.

## Reglas de trabajo
- Idioma de la interfaz y de los textos: español rioplatense (voseo), igual que `content/`, y sin género gramatical cuando se habla de la persona.
- No inventar datos, estudios, estadísticas ni testimonios en la UI.
- No copiar nombre, logo, textos ni arte de la app de referencia (Life Reset). Solo la mecánica.
- Toda tabla nueva lleva Row Level Security. Los datos de un usuario solo los ven él y quienes comparten grupo con él. Excepciones deliberadas: `profiles.quiz_answers` solo lo escribe su dueño y nadie lo lee desde la app; la tabla `habits` solo la lee su dueño (los compañeros la ven vía RPC, con los privados enmascarados).
- Supabase ya no expone tablas nuevas de `public` automáticamente: toda tabla o columna editable nueva necesita `grant` explícito a `authenticated`; nada para `anon`; toda función nueva `revoke execute ... from public, anon`.
- Los checks (`habit_logs`) solo se escriben vía RPC (`set_habit_done`, `add_habit_progress`, `set_log_photo`). Los puntos los calcula la base (trigger `set_log_points`); el cliente nunca envía puntos.
- Nunca commitear claves. Usar `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y mantener `.env.example`. La clave `service_role` jamás va en el cliente.
- El quiz es un juego propio, no un test psicológico validado. No presentarlo como diagnóstico ni inventar estudios o porcentajes de eficacia.
- Si algo no está definido en `docs/PRODUCT.md` (marcado [ABIERTO]), preguntar al dueño en vez de decidir en silencio.
- Verificar límites o precios de servicios externos con búsqueda antes de depender de ellos.
- `npm test` debe pasar: `tests/sql.test.ts` (schema + 002 + 003 sobre PGlite con stub de auth y storage) y `tests/quiz.test.ts`.

## Pendientes conocidos
- RLS, triggers y storage probados en PGlite con stubs; falta una prueba manual sobre Supabase real con dos cuentas.
- Apple Health vía Atajos de iOS: propuesto, sin hacer.
- Fotos: 1 GB gratis de Storage y 5 GB/mes de transferencia; no hay borrado automático de fotos viejas.
- La columna `habits.xp_value` (y `habit_logs.xp`) quedaron deprecadas; eliminarlas cuando se confirme que no se usan.
- Mínimo de 3 hábitos activos: solo lo exige la UI.
- Los registros creados antes de la migración 002 quedan con `points = 0`.
- Sin backups automáticos en el plan gratis de Supabase.
- Notificaciones push en iOS requieren que la PWA esté en la pantalla de inicio.
- Tipografías sin decidir.
