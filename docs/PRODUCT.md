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
| Cuestionario de onboarding | **No** en MVP (el usuario crea sus hábitos a mano) |
| Apple Health | **No**. Una PWA no puede leer Apple Health [PROPUESTA: dejar fuera] |
| Arquetipos / radar de 6 pilares | **No** en MVP; posible v2 |
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
- Hosting estático gratuito [ABIERTO: elegir entre Vercel, Cloudflare Pages o Netlify; verificar límites vigentes antes de decidir]

## 5. Reglas de juego [PROPUESTA — todo editable]

- Cada hábito tiene un valor de XP (por defecto 10).
- Marcar un hábito como hecho un día = ese XP, **una vez por día por hábito**.
- Un día cuenta para la **racha** si se completa **al menos un hábito** [ABIERTO: ¿o todos los hábitos del día?].
- Racha se rompe si pasa un día completo sin ningún hábito.
- Bonus por racha (ej. +10% por cada 7 días) [ABIERTO: definir fórmula; no incluido en el SQL inicial].
- El "día" se define según la zona horaria de cada usuario (por defecto `Europe/Madrid`).
- Sistema de honor: no hay verificación; el grupo ve el feed de lo que cada uno marca. [ABIERTO: ¿permitir marcar días pasados? Por defecto no.]

## 6. Pantallas del MVP

1. Login / registro (email + contraseña, o magic link).
2. Crear grupo / unirse con código.
3. **Hoy**: lista de mis hábitos con check; XP del día y racha actual.
4. **Ranking** del grupo: posición, usuario, XP total, racha.
5. **Mis hábitos**: crear, editar, archivar.
6. **Perfil**: nombre, zona horaria.

## 7. Hoja de ruta

- **Fase 0 — Cimientos:** proyecto Vite+React+PWA, Supabase conectado, auth.
- **Fase 1 — Núcleo:** grupos, hábitos, check diario, ranking (usar `supabase/schema.sql`).
- **Fase 2 — Pegajoso:** rachas visibles, feed del grupo, recordatorios push, contrato de racha.
- **Fase 3 — Extras:** pilares/radar, arquetipos, retos semanales con penitencia, insignias.

## 8. Preguntas abiertas para el dueño

1. ¿Cuántos amigos serían? (afecta nada técnico en el plan gratuito, pero sí el diseño del ranking).
2. ¿Racha por "al menos un hábito" o por "todos los hábitos"?
3. ¿Nombre de la app?
4. ¿Todos usan iPhone, Android o mezcla? (importa para las notificaciones).
5. ¿Retos con penitencia/apuesta (solo registro, sin dinero real en la app)?
