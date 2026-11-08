# Modelo de datos v3 — IMPLEMENTADO (migración 006, con OK del dueño del 2026-11-08)

Implementa `modifications/SPEC.md` (v3) con las respuestas del dueño del 2026-11-08. Código: `supabase/migrations/006_v3_plan_monedas.sql`, `src/game/*`, pruebas en `tests/v3.test.ts`, `tests/reference/*` y `tests/game.handcalc.test.ts`.

Principio rector: **en la base solo se guardan definiciones, fotos del plan y eventos crudos**. Puntos, multiplicadores, rachas, monedas y saldo se **recalculan** con funciones SQL que portan `reference/*.mjs`.

## 1. Configuración (un único lugar)

- **`content/config.json`**: todos los parámetros de `reference/config.mjs` más los nuevos:

  | Clave | Valor por defecto | Origen |
  |---|---|---|
  | `severity`, `multiplierFloor`, `maxCompletion` | 0,95/0,9/0,8 · 0,70 · 1,5 | spec |
  | `coinsAt75`, `coinsAt100`, `coinThresholdLow/High`, `overflowRate` | 2 · 4 · 75/100 · 0,1 | spec |
  | `streakStepDays`, `streakStepBonus`, `unpaidSlipStepsLost` | 7 · 0,1 · 1 | spec |
  | `dayCutoffHour` | 0 (medianoche local) | respuesta 1 |
  | `voteWindowHours` | 24 | respuesta 2 |
  | `weekStartsOn`, `poolCloses` | lunes · domingo 23:59 local | respuesta 3 |
  | `permitResetsCleanStreak` | `true` | respuesta 5 |
  | `minActiveHabits`, `maxObjectives` | 3 · 3 | spec |
  | `pillars` | Cuerpo, Mente, Dinero, Habilidades, Creatividad, **Carrera y estudios (provisional)** | D y respuesta 6 |
  | `areaToPillar` | sueño y alimentación → cuerpo; foco → mente; conexión → (pendiente, ver P3) | D |

- La app lo importa desde ese archivo; `npm run catalog` lo copia a `game_config` en la base (mecanismo que ya existe).
- **`group_config(group_id, key, value, effective_from, request_id)`**: cambios de parámetros **votados por el grupo**. El valor vigente un día es el último cambio con `effective_from` ≤ ese día; si no hay, el de `content/config.json`.
- Los pilares son datos: los hábitos guardan el `id` del pilar como texto y la base lo valida contra la configuración, no contra una lista fija en el código.

## 2. Un grupo por persona (E)

- Índice único en `group_members(user_id)`. Si ya estás en un grupo, `join_group` y `create_group` dan error.
- **Antes de migrar**, el dueño corre esta consulta en el SQL Editor (Claude no puede ver los datos reales):

  ```sql
  select user_id, count(*) from group_members group by user_id having count(*) > 1;
  ```
  Si devuelve filas, se decide a mano qué grupo conserva cada persona.

## 3. Definiciones (sin números de puntaje)

| Tabla | Campos | Nota |
|---|---|---|
| `habits` (existente) | id, user_id, name, criterion, **pillar**, catalog_id, unit, private, **objective_id**, created_at | `tier`, `target`, `area`, `archived`, `goal_id`, `goal_step`, `xp_value` quedan **deprecados**: el peso y la meta pasan a la foto del plan |
| `vices` (nueva) | id, user_id, name, suggestion_id, pillar, private, created_at | Nombre libre; `content/vices.json` queda como lista de sugerencias para cargar rápido |
| `objectives` (nueva) | id, user_id, catalog_id, title, **tag** (ej. `dejar-fumar`), goal_id (cofre opcional), created_at | Hasta 3 en el plan |
| `objective_events` (nueva, **sin UI**) | id, objective_id, title, due_on, done_on | Preparada para "eventos" (respuesta 7); fuera del MVP |

## 4. Plan por día (fotos con `effective_from`)

| Tabla | Campos |
|---|---|
| `plans` | id, user_id, effective_from (date), created_at, request_id · **único (user_id, effective_from)** |
| `plan_habits` | plan_id, habit_id, **weight 1–3**, **target** (null = hábito de sí/no; número = meta medible, hasta 150 %) |
| `plan_vices` | plan_id, vice_id, **weight 1–3**, **severity** (leve/normal/grave) |
| `plan_objectives` | plan_id, objective_id (máx. 3) |

- `plan_for(user, día)` devuelve la foto más reciente con `effective_from` ≤ día (porta `plan.mjs`).
- Un cambio aprobado el día D crea la foto D+1, copiando la vigente y aplicando el cambio. Si ya existe una foto D+1 (otro cambio aprobado ese mismo día), se modifica esa: sigue siendo futura y no reescribe el pasado.
- Mínimo 3 hábitos: la base rechaza un cambio que deje la foto con menos de 3.

## 5. Eventos crudos del día

| Tabla | Campos | Nota |
|---|---|---|
| `habit_logs` (existente) | habit_id, user_id, log_date, **count**, photo_path | `points` queda deprecado y **se elimina el trigger `set_log_points`**. Sí/no: count 1. Medible: cantidad hecha |
| `vice_days` (nueva) | user_id, vice_id, day, **state** (`clean` / `slipped`) | Sin fila = `none`. Una fila por vicio y día, así que no puede estar limpio y en recaída a la vez. Desmarcar = borrar la fila → **vuelve a ×1,0 (regresión del bug)** |

Solo se registra el día de hoy, según la zona horaria y la hora de corte (`dayCutoffHour`).

## 6. Cálculo (funciones SQL; nada acumulado)

- **`day_score(user, día)`** → `base, bonus, multiplier, total, overflow`. Porta `scoring.mjs` usando la foto del plan de ese día, `habit_logs` y `vice_days`. `penalizing = false` si hay una **compra de permiso** para ese vicio ese día. El redondeo a 2 decimales va solo al final.
- **`clean_streak(user, vicio, día)`** → "días sin": avanza solo con `clean`; `none` lo corta; `slipped` lo reinicia (también con permiso, según `permitResetsCleanStreak`).
- **`coin_days(user)`** → por día: total, excedente, racha anterior, multiplicador, monedas del día y monedas al pool. Porta `coins.mjs` recorriendo los días en orden desde la primera foto del plan.
- **`wallet(user)`** = monedas de los días cerrados + pool de las semanas cerradas − compras. También devuelve el pool de la semana en curso (visible, todavía sin cobrar).
- **`group_leaderboard`**: suma de `day_score.total` por día; `pct` = total / (100 × días desde que entró). Desaparece el filtro por grupo de la 003, porque ahora un hábito solo entra al plan una vez aprobado.
- **Contacto con la liga (004), que no se toca (A):** la liga ya usaba los puntos del día en los PL de hábitos y en la prueba del Camello. Pasan a leer `day_score.total`. Las monedas no entran en la liga.

## 7. Votación (`approval.mjs`)

| Tabla | Campos |
|---|---|
| `change_requests` | id, group_id, proposer_id, **scope** (`me` / `group`), **kind**, payload (jsonb), status, created_at, **closes_at** (= creación + `voteWindowHours`), decided_at, effective_from |
| `change_votes` | request_id, voter_id, vote (`yes` / `no`) |

- **Tipos (`kind`):** `habit.add`, `habit.remove`, `habit.weight`, `habit.target`, `vice.add`, `vice.remove`, `vice.weight`, `vice.severity`, `objective.add`, `objective.remove`, `store.add`, `store.update`, `config.set`.
- **Resolución:** `decide()` portado a SQL. Se evalúa al votar y al leer las votaciones, así que una votación vencida se resuelve sola sin tareas programadas.
- **Al aprobarse:** con alcance "solo yo" se aplica a la foto del día siguiente de quien propuso; con "todo el grupo", a la de cada miembro (ver P4). Los cambios de tienda y configuración van a `store_items` y `group_config`, con `effective_from`.
- **Excepción (F):** un hábito **privado** con alcance "solo yo" se aprueba sin votación (igual rige desde mañana).
- El feed muestra cada cambio y su resultado. Los privados aparecen como "Hábito privado" más su peso.
- Reemplaza `habit_reviews` y `habit_votes` (003).

## 8. Tienda y billetera (`store.mjs`, `catalog.json`)

| Tabla | Campos |
|---|---|
| `store_items` | id, group_id, slug, kind (`permit` / `reward`), name, price, price_by_weight, weekly_limit, opt_in, conflicts_with[], per_objective, **price_source** (`dueño` / `sugerencia`), active |
| `store_optins` | user_id, item_id (los permisos de comida y sustancias aparecen solo si la persona los activa) |
| `purchases` | id, user_id, item_id, day, price_paid, vice_id (permiso), habit_id (pase), objective_id, created_at |

- El catálogo inicial sale de `reference/catalog.json` (copiado a `content/store.json`) y se siembra en cada grupo. Las modificaciones se votan.
- `buy_item()` porta `canBuy`. Valida, en este orden: conflicto con un objetivo (por la etiqueta del objetivo), límite semanal (semana local de lunes a domingo) y monedas suficientes según `wallet()`.
- **Permiso:** se elige qué vicio cubre (`vice_id`). Esa recaída no multiplica y no baja la racha de monedas.
- La UI marca los precios "sugerencia, a calibrar". No hay recargo por objetivo de ahorro (respuesta 8).

## 9. Qué se reemplaza

| Hoy | Pasa a |
|---|---|
| `habit_reviews`, `habit_votes` (003) | `change_requests`, `change_votes` |
| `user_vices`, `vice_slips`, `vice_catalog` y sus funciones (005) | `vices`, `plan_vices`, `vice_days` |
| Trigger `set_log_points`, `habit_counts_in_group`, `adjusted_points`, `vice_multiplier` | `day_score()` |
| Dificultad 1–4 | Peso 1–3 (lo que hoy está en 4 pasa a 3) |
| Objetivos (`goals`) de lectura, escritura y otros | `objectives` |
| Objetivos de ahorro (`goals` tipo ahorro) y cofres de grupo | **Se mantienen como cofres**, aparte de las monedas (C) |

## 10. Migración de datos existentes

1. **Comprobación previa:** la consulta de varios grupos (sección 2). Si hay casos, se resuelven antes.
2. **Hábitos activos:** una foto inicial por persona con `effective_from` = el día de su primer hábito o registro, peso = `min(tier, 3)` y meta = `target` si es mayor a 1.
3. **Vicios declarados (005):** pasan a `vices` + `plan_vices` con gravedad normal y peso 1. **Cambia el significado:** antes era ×0,9 todos los días; ahora no hace nada salvo el día que marcás "lo hice" (o suma bono si marcás "no lo hice").
4. **Tropiezos (005):** pasan a `vice_days` como recaída, solo los de vicios del catálogo. Uno sin vicio declarado crea el vicio en la lista de la persona.
5. **Objetivos (`goals`) que no son de ahorro:** pasan a `objectives`. Si alguien tiene más de 3, quedan los 3 más nuevos y se avisa.
6. **Áreas a pilares:** según `areaToPillar`. Conexión: ver P3.
7. **Días pasados:** ver P2.

## 11. Pruebas

- Las 52 pruebas de `reference/` portadas a TypeScript (vitest), con `content/config.json` como única fuente de números.
- Los mismos casos de puntaje y monedas contra las funciones SQL en PGlite, para que el puerto SQL no se desvíe.
- Casos nuevos: zona horaria, hora de corte, cambio de semana (pool y límite semanal), un cambio aprobado que rige desde mañana y no reescribe el pasado, la votación vencida, y la **regresión del bug** (marcar recaída, desmarcar, volver a ×1,0).

## 12. Propuesta de hábitos para los pilares nuevos (D) — revisar, no se carga nada sin OK

Criterios autodeclarados, sin afirmaciones de salud. Formato: nombre · peso sugerido · meta medible si corresponde.

**Dinero**
- Anotar los gastos del día · 1
- Revisar el presupuesto 10 minutos · 1
- Un día sin compras innecesarias · 2
- Separar el ahorro del día · 2

**Habilidades**
- Practicar un idioma 15 minutos · 2
- Aprender algo nuevo y anotarlo · 1
- Practicar un instrumento 20 minutos · 2
- Clase o curso 30 minutos · 2

**Creatividad**
- Escribir · 2 · meta medible: 300 palabras
- Dibujar o pintar 15 minutos · 1
- Avanzar un proyecto creativo 30 minutos · 2
- Sacar una foto pensada · 1

**Carrera y estudios (provisional)**
- Estudiar 45 minutos · 3
- Avanzar el CV o el portfolio 20 minutos · 1
- Leer algo de tu campo 15 minutos · 1

"Un bloque de trabajo profundo de 45 min" (hoy en Foco) podría ir acá o en Mente; por la regla D va a Mente.

## 13. Respuestas del dueño (2026-11-08) y cómo quedaron

- **P1:** el plan del quiz rige desde hoy y sin votación (`create_initial_plan`).
- **P2:** días anteriores a la migración congelados en `legacy_days`. **Elegido: sumados en el ranking con etiqueta** ("incl. X de legado"; `group_leaderboard.legacy_points`).
- **P3:** los hábitos de Conexión salen del catálogo (quedan sin pilar) y los existentes se archivan con aviso (`user_notices`).
- **P4:** "todo el grupo" agrega al plan de cada miembro; peso de quien propone para esa persona y `groupScopeDefaultWeight` (2) para los demás; rige desde el día siguiente de cada uno.
- **P5:** pase, comodín y día libre: solo registro (se compran y salen en el feed; no cambian cálculos).
- **P6 y P7:** propuesta en `docs/PROPUESTA_CONTENIDO_V3.md`, pendiente de revisión.
- **P8:** cada persona toma su propio "día siguiente".
- Hábitos de la sección 12: **no cargados**, pendientes de revisión.

## 14. Preguntas originales (P1–P8)

- **P1. Plan inicial:** el plan que sale del quiz, ¿rige desde **hoy** y **sin votación**? Si rige desde mañana, el primer día no se puede jugar.
- **P2. Días pasados:** al pasar al cálculo nuevo, los días ya jugados se recalculan con la fórmula nueva, y el ranking histórico cambia (por ejemplo, el caso del orden de marcado o el ×0,9 permanente de los vicios). ¿Se acepta, o se congelan los totales de los días anteriores a la migración como "legado"? Congelar es guardar totales, que va contra la regla 4, pero solo para el pasado.
- **P3. Conexión:** ¿se sacan del catálogo sus 6 hábitos? ¿Qué pasa con quien ya tiene alguno: se mueven a Mente, quedan sin pilar o se archivan?
- **P4. Alcance "todo el grupo" en cosas personales:** por ejemplo, "agregar Correr 5 km a todo el grupo" o "peso 3 de Leer para todos los que lo tengan". ¿Ese es el significado? Para tienda y configuración, el alcance es siempre del grupo.
- **P5. Efectos de las recompensas:** la spec no los define. ¿El "pase de un hábito" cuenta el hábito como hecho ese día? ¿El "comodín de racha" evita perder un escalón una vez? ¿Qué hace el "día libre de un objetivo"? Si no se definen, en el MVP quedan como compras sin efecto en el juego, solo registro.
- **P6. Catálogo de objetivos:** la spec dice que cada objetivo genera hábitos sugeridos, pero no trae el catálogo. Propuesta: partir de las plantillas actuales (ahorrar para algo, leer, escribir, otro) más "dejar de fumar" (etiqueta `dejar-fumar`). ¿Lo armás vos o te propongo textos?
- **P7. Quiz nuevo:** al cambiar el orden y el contenido (objetivos primero), los `test_vectors.json` actuales dejan de aplicar. ¿Mandás vectores nuevos, o los genero yo y los revisás?
- **P8. "Día siguiente" en cambios de grupo:** si hay amigos en distintas zonas horarias, ¿cada persona toma su propio día siguiente? Propuesta: sí.
