# Habit League

App de hábitos para un grupo de amigos: check diario, puntos, rachas y ranking del grupo. Uso privado, objetivo de costo 0 €.

Lee antes de empezar:
- `docs/PRODUCT.md`: alcance, reglas de juego, decisiones y preguntas abiertas.
- `docs/QUIZ_Y_PERFILES.md`: cómo se calcula el perfil y se sugieren hábitos (vista legible de `content/*.json`).
- `docs/DESIGN.md`: guía visual, radar de 6 áreas y flujo de onboarding.

## Arquetipos de género neutro
Los nombres y textos de arquetipos, quiz y hábitos están redactados sin género gramatical (Estratega, Perfeccionista, Aprendiz, Fénix, Autodidacta, Velocista, Nómada, Espíritu Libre). En la UI mostrar el nombre sin artículo ("Sos Estratega") y mantener esa convención en todo texto nuevo. Los emblemas están en `assets/arquetipos/<id>.svg` (copiados a `public/arquetipos/` para servirlos); el radar de referencia en `assets/radar-ejemplo.svg` (ver `docs/DESIGN.md`).

## Modelo v3/v4/v4.2 (spec del dueño en `modifications/SPEC.md`; diseño en `docs/MODELO_V3.md` y `docs/MODELO_V42.md`)
- **Parámetros: un único lugar, `content/config.json`.** Nada de números del juego escritos en el código. El grupo puede cambiarlos por votación (`group_config`, rige desde el día siguiente).
- **No guardar totales ni multiplicadores:** se guardan definiciones, fotos del plan (`plans` con `effective_from`) y eventos crudos (`habit_logs.count`, `vice_days`). El puntaje (`day_score`), las monedas (`coin_days`) y todo el estado (`game_state`: experiencia, nivel, rango, fuerza base, cofres y billetera) se recalculan. `habit_logs.points` quedó deprecado.
- La lógica pura está en `src/game/*.ts` (puerto de `modifications/reference/*.mjs`) y en SQL (`score_pure`, `coins_pure`, `decide_pure`, `totals_pure`, `strength_week_pure`, `rank_points_pure`, `rank_pure`, `level_pure`, `price_pure`). Deben dar **exactamente** lo mismo: `tests/v3.test.ts` y `tests/v42*.test.ts` las comparan con casos al azar. En SQL se calcula en `double precision` y se redondea como `Math.round` (`r2`).
- Todo cambio de plan, tienda o parámetros se propone (`propose_change`) y se vota (`vote_change`); rige desde el día siguiente. Excepciones: el plan inicial del quiz (`create_initial_plan`) y lo privado con alcance "solo yo".
- Un grupo por persona (MVP).
- **v4:** bloques de hábitos (`habits.block`: general, objetivo, deporte, fuerza), cuestionario por objetivos (`src/game/onboarding.ts` + `content/onboarding.json`, **BORRADOR** pendiente de revisión), reiniciar y eliminar cuenta (`reset_my_data`, `delete_my_account`; la app borra las fotos de Storage antes).
- **v4.2 (007):** dos totales por día (ranking sin «solo yo»; personal para monedas, experiencia, nivel y rango); «solo yo» se agrega directo; experiencia = puntos personales + fuerza base − lo pagado, **el nivel puede bajar**; rangos por continuidad; fuerza base con meta elegida por ejercicio (flexiones, sentadillas, plancha en segundos), recompensa semanal compuesta y días fallados que se saldan («20 extra» o pagar, `strength_settlements`); billetera que puede quedar negativa; tienda con precios por área (respuesta privada en `area_answers`) y vales de grupo por nivel; Juicio desacoplado de la liga y sin premio; cofres de ahorro en monedas.
- Valores de niveles, fuerza base, rangos, precios, vales y cofres: **provisionales** (`content/config.json`, ver `docs/MODELO_V42.md`). La liga se borró en la `008_quitar_liga.sql` (respaldada en `respaldo_v4`); el Juicio y `user_settings` se quedan.
- No se migran datos viejos: `005b_respaldo.sql` (respaldo_v2) antes de la 006, `007a_respaldo.sql` (respaldo_v4) antes de la 007; la 007 reinicia a todos una sola vez. Pruebas sobre Supabase real: `docs/PRUEBAS_SUPABASE.md` (proyecto aparte, nunca con los datos reales).
- Pendientes de revisión del dueño, **no cargar**: catálogo de objetivos y quiz nuevo (`docs/PROPUESTA_CONTENIDO_V3.md`), hábitos para Dinero/Habilidades/Creatividad/Carrera (`docs/MODELO_V3.md` §12). Eventos de objetivos: tabla preparada, sin UI. Recompensas que no son permisos: solo registro.

## Contenido como datos
`content/quiz.json`, `content/archetypes.json`, `content/habits.json`, `content/goals.json`, `content/judgment.json` (Juicio y liga, ver `docs/JUEGO.md`) y `content/vices.json` (vicios y tropiezos) son la fuente de verdad. La app los importa (`src/lib/quiz.ts`, `src/lib/goals.ts`); no hardcodear preguntas ni hábitos en componentes. `content/test_vectors.json` trae entradas con la salida esperada; `tests/quiz.test.ts` verifica que el algoritmo las cumpla.
- Al editar `content/habits.json`, `content/judgment.json`, `content/vices.json`, `content/config.json` o `content/store.json`: correr `npm run catalog` (regenera los bloques de datos de las migraciones 003 a 007; la configuración y la tienda van en la 007) y volver a ejecutar en Supabase esa migración **y todas las siguientes** (las posteriores redefinen funciones de las anteriores).
- Hábitos nuevos del catálogo van con `auto: false` salvo que se quiera que entren al paquete automático (cambia la salida de los vectores).

## Stack
- Vite + React + TypeScript, Tailwind CSS v4 (tokens de `docs/DESIGN.md` en `src/index.css`)
- PWA con `vite-plugin-pwa`
- Supabase (Auth, Postgres, Realtime, Storage) vía `@supabase/supabase-js`
- Base de datos, en este orden: `supabase/schema.sql`, `supabase/migrations/002` a `006` (con `005b` antes de la 006) `007a`, `007` y `008`. Todas se pueden re-ejecutar, **en orden**: las posteriores redefinen funciones de las anteriores. La clave en el cliente es la *publishable key*.
- Hosting: GitHub Pages vía Actions (`.github/workflows/deploy.yml`). La app vive bajo `/<repo>/`: usar `import.meta.env.BASE_URL` / `appUrl()`, nunca rutas absolutas `/...`.

## Reglas de trabajo
- Idioma de la interfaz y de los textos: español rioplatense (voseo), igual que `content/`, y sin género gramatical cuando se habla de la persona.
- No inventar datos, estudios, estadísticas ni testimonios en la UI.
- No copiar nombre, logo, textos ni arte de la app de referencia (Life Reset). Solo la mecánica.
- Toda tabla nueva lleva Row Level Security. Los datos de un usuario solo los ven él y quienes comparten grupo con él. Excepciones deliberadas: `profiles.quiz_answers` solo lo escribe su dueño y nadie lo lee desde la app; la tabla `habits` solo la lee su dueño (los compañeros la ven vía RPC, con los privados enmascarados).
- Supabase ya no expone tablas nuevas de `public` automáticamente: toda tabla o columna editable nueva necesita `grant` explícito a `authenticated`; nada para `anon`; toda función nueva `revoke execute ... from public, anon`.
- Los checks (`habit_logs`) solo se escriben vía RPC (`set_habit_done`, `add_habit_progress`, `set_log_photo`). Los puntos los calcula la base (trigger `set_log_points`); el cliente nunca envía puntos.
- El Juicio se calcula en la base (`submit_judgment`) y no da premio. Experiencia, rango, monedas y saldos de fuerza base los calcula la base (`game_state`, `settle_strength_day`); el cliente nunca envía totales.
- Nunca commitear claves. Usar `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y mantener `.env.example`. La clave `service_role` jamás va en el cliente.
- El quiz es un juego propio, no un test psicológico validado. No presentarlo como diagnóstico ni inventar estudios o porcentajes de eficacia.
- Si algo no está definido en `docs/PRODUCT.md` (marcado [ABIERTO]), preguntar al dueño en vez de decidir en silencio.
- Verificar límites o precios de servicios externos con búsqueda antes de depender de ellos.
- `npm test` debe pasar: `tests/reference/*` (las 90 pruebas del dueño, copia literal con `node scripts/copy-reference-tests.mjs`), `tests/v42.test.ts`, `tests/v42.pasos.test.ts`, `tests/onboarding.test.ts`, `tests/game.handcalc.test.ts` (casos a mano), `tests/v3.test.ts`, `tests/sql.test.ts`, `tests/judgment.test.ts` (arnés común en `tests/harness.ts`) (migraciones sobre PGlite con stub de auth y storage) y `tests/quiz.test.ts`.

## Pendientes conocidos
- RLS, triggers y storage probados en PGlite con stubs; falta una prueba manual sobre Supabase real con dos cuentas.
- Apple Health vía Atajos de iOS: propuesto, sin hacer.
- Notificaciones push: sin hacer.
- Admin: Elías resetea contraseñas desde el SQL Editor (README → Administración); nadie puede ver contraseñas.
- Fotos: 1 GB gratis de Storage y 5 GB/mes de transferencia; no hay borrado automático de fotos viejas.
- La columna `habits.xp_value` (y `habit_logs.xp`) quedaron deprecadas; eliminarlas cuando se confirme que no se usan.
- Mínimo de 3 hábitos activos: solo lo exige la UI.
- Los registros creados antes de la migración 002 quedan con `points = 0`.
- Sin backups automáticos en el plan gratis de Supabase.
- Notificaciones push en iOS requieren que la PWA esté en la pantalla de inicio.
- Tipografías sin decidir.
