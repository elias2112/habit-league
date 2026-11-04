# Habit League — Documento de producto (v0)

App de hábitos para un grupo de amigos, con ranking por XP y rachas. Uso privado, costo objetivo: 0 €.

> Convención de este documento:
> - **[VISTO]** = observado en el video de la app de referencia (Life Reset).
> - **[PROPUESTA]** = decisión mía, editable.
> - **[ABIERTO]** = hay que decidirlo antes o durante el desarrollo.
> No copiar marca, nombre, logo, textos ni arte de la app de referencia. Solo se toma la idea de mecánica.

## 1. Qué se vio en el video de referencia

El video (5:30) muestra casi solo el **onboarding** de una app llamada "Life Reset". **No se vio la pantalla principal de uso diario**, así que no sabemos cómo se marcan las tareas ni cómo se calcula el XP real.

[VISTO]
- Reto de **66 días** ("Campaña"), con curva de formación de hábito como argumento.
- Cuestionario largo (~20 preguntas) para personalizar el plan: áreas de vida, objetivo, nivel, sueño, alimentación, etc.
- Permiso de lectura de Apple Health (pasos, sueño, entrenamientos).
- "Hoja de retador" con gráfico radar de 6 pilares (Cuerpo, Mente, Descanso, Combustible, Conexión, Propósito) y estadísticas por pilar; vista "Día 1" vs "Día 66".
- "Tipos de reinicio" (arquetipos: El Luchador, El Reconstructor, El Buscador, El Optimizador, El Disciplinado, El Esforzado, El Iniciador).
- Misiones medidas (correr, horas dormidas, diario…) que "suben de nivel" pilares.
- **Ranking global por XP** con nombre de usuario, racha (llama) y posición propia resaltada.
- **Contrato de racha**: el usuario elige comprometerse a 7, 14, 30 o 50 días.
- Notificaciones diarias (recordatorio, ritual diario, resumen semanal).

## 2. Qué copiamos y qué no (MVP)

| Idea de la referencia | MVP |
|---|---|
| Reto de duración fija (66 días) | Sí, configurable por grupo |
| XP por acciones | Sí |
| Ranking | Sí, pero **solo entre amigos del grupo** (no global) |
| Rachas | Sí |
| Contrato de racha | Sí, versión simple (v1.1) |
| Cuestionario de onboarding | **Sí** (20 preguntas propias, ver `docs/QUIZ_Y_PERFILES.md`) |
| Apple Health | **Más adelante**, vía Atajos de iOS (gratis, solo iPhone, a probar). Una PWA no puede leerlo directo |
| Arquetipos | **Sí**: 8 arquetipos propios (actitud) × 6 áreas de vida (objetivos) |
| Radar de 6 áreas | **Sí** (fórmula en `docs/DESIGN.md`) |
| Texto de "estudios" / testimonios / cifras | **No**. No inventar datos científicos |

## 3. Decisiones tomadas

- **Plataforma:** PWA (web instalable en la pantalla de inicio). Un solo código para iPhone y Android, sin App Store.
  - Limitación verificada: en iOS las notificaciones push web **solo funcionan si el usuario agrega la app a la pantalla de inicio**, y el permiso debe pedirse tras un gesto del usuario (un botón). Fuente: [Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications).
- **Datos compartidos:** Supabase (Postgres + Auth + Realtime).
  - Plan gratuito (según [supabase.com/pricing](https://supabase.com/pricing.md), consultado el 2026-11-03): 500 MB de base de datos, 50.000 usuarios activos/mes, 5 GB de egress, 2 proyectos activos, **el proyecto se pausa tras 1 semana de inactividad**. Para un grupo que lo usa a diario no debería pausarse; si todos dejan de entrar una semana, hay que reactivarlo a mano.
- **Competencia:** ranking por XP + rachas, dentro de un grupo con código de invitación.

## 4. Stack propuesto [PROPUESTA]

- Vite + React + TypeScript
- Tailwind CSS
- `vite-plugin-pwa` (manifest + service worker)
- `@supabase/supabase-js`
- Hosting: **GitHub Pages** (gratis con repo público; 100 GB/mes de tráfico según docs.github.com, consultado el 2026-11-03). URL: https://elias2112.github.io/habit-league/

## 5. Reglas de juego [PROPUESTA — todo editable]

- Cada hábito tiene una **dificultad (tier 1, 2 o 3; 4 = Muy difícil, solo hábitos propios)**. Los puntos de un hábito = `100 × tier / suma de tiers de los hábitos activos del usuario`.
- **Normalización:** cada usuario suma como máximo **100 puntos por día**, sin importar su arquetipo ni cuántos hábitos tenga. La base de datos aplica el tope (migración `002`).
- Un hábito se marca **una vez por día**, solo el día de hoy según la zona horaria del usuario.
- **Por partes:** un hábito puede tener meta diaria (ej. 8 vasos). Cada parte suma su fracción de puntos; la racha solo cuenta hábitos completos.
- **Fotos:** se puede subir una foto como evidencia de un check (lo que comiste, el entrenamiento). La ve solo el grupo; nunca la de un hábito privado. Se comprime a ~1080 px para cuidar el 1 GB gratis de Storage.
- **Hábitos propios con aprobación** (decidido 2026-11-04): cada persona puede proponer un hábito propio y su peso. Se define una vez y **cada grupo vota por separado**: se aprueba con **≥ 50 % del resto del grupo** a favor; se rechaza con > 50 % en contra. Mientras está pendiente se puede marcar; si se aprueba, suman también esos días; si se rechaza, no suman nunca en ese grupo. Los del catálogo no necesitan aprobación. Agregar hábitos no da más puntos (se normaliza a 100).
- Un hábito propio no se puede modificar después de creado (solo bajarle la dificultad): para cambiarlo, se archiva y se propone otro.
- **Privados:** los hábitos del catálogo se pueden marcar como privados (el grupo ve "Hábito privado", sin nombre ni foto). Los propios no, porque el grupo tiene que poder aprobarlos.
- **Objetivos:** una meta (comprar algo, leer, escribir, otra) arma un hábito diario a partir de la cantidad y la fecha, y muestra una barra de progreso. Plantillas en `content/goals.json` (sin IA, costo 0).
- **Respuestas del quiz privadas:** solo las ve quien respondió (las preguntas directas tocan temas como fumar o tomar alcohol).
- El ranking muestra `total_points` y `pct` (puntos / máximo posible desde que el miembro entró), para comparar justo.
- Un día cuenta para la **racha** si se completa **al menos un hábito** (completo, no parcial) [ABIERTO: ¿o todos?].
- La racha se rompe si pasa un día completo sin ningún hábito.
- Sistema de honor: no hay verificación; el grupo ve lo que cada uno marca.
- **Límite conocido:** el puntaje mide cumplimiento del *propio plan*. Con pocos hábitos fáciles se puede llegar a 100. Mitigación propuesta: mínimo 3 hábitos activos (la UI debe exigirlo; la base de datos todavía no) y que el grupo vea los hábitos de todos.
- [ABIERTO] ¿Permitir marcar el día de ayer?
- [ABIERTO] Bonus por racha: no incluido.

## 6. Pantallas del MVP

1. Login / registro (email + contraseña, o magic link).
2. Crear grupo / unirse con código.
3. **Hoy**: lista de mis hábitos con check; XP del día y racha actual.
4. **Ranking** del grupo: posición, usuario, XP total, racha.
5. **Mis hábitos**: crear, editar, archivar.
6. **Perfil**: nombre, zona horaria.

## 7. Hoja de ruta

- **Fase 0 — Cimientos:** proyecto Vite+React+PWA, Supabase conectado, auth (hecho: app deployada).
- **Fase 0.5 — Identidad:** quiz, arquetipos, catálogo de hábitos y guía visual (`content/`, `docs/DESIGN.md`).
- **Fase 1 — Núcleo:** grupos, hábitos, check diario, ranking (usar `supabase/schema.sql`).
- **Fase 2 — Pegajoso:** rachas visibles, feed del grupo, recordatorios push, contrato de racha.
- **Fase 3 — Extras:** pilares/radar, arquetipos, retos semanales con penitencia, insignias.

## 8. Preguntas abiertas para el dueño

1. ¿Cuántos amigos serían? (afecta nada técnico en el plan gratuito, pero sí el diseño del ranking).
2. ¿Racha por "al menos un hábito" o por "todos los hábitos"?
3. ¿Nombre de la app?
4. ¿Todos usan iPhone, Android o mezcla? (importa para las notificaciones).
5. ¿Retos con penitencia/apuesta (solo registro, sin dinero real en la app)?
