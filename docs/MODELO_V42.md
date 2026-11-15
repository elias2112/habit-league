# Modelo v4.2 (migraciones 007a y 007)

Spec del dueño: `modifications/SPEC.md` v4.2 y `modifications/PROMPT_TANDA_2.md`. Decisiones del dueño del 2026-11-15 al pie. La lógica pura está en `src/game/*.ts` (puerto de `modifications/reference/*.mjs`, 90 pruebas en `tests/reference/`) y en SQL; las pruebas `tests/v42*.test.ts` comparan las dos.

## Principio
Se guardan definiciones, fotos del plan y eventos crudos. **Nada de totales**: experiencia, nivel, rango, monedas y billetera se recalculan (`game_state`).

## Migraciones
- **007a_respaldo.sql**: copia todas las tablas (cuentas, grupos, juego, cofres, liga, Juicio) a `respaldo_v4`, sin acceso desde la app. Mientras la 007 no reinició, cada corrida refresca la copia; después no la toca.
- **008_quitar_liga.sql**: ver «Liga».
- **007_v42.sql**:
  1. Se frena si no hay respaldo o si el respaldo no coincide con las tablas vivas (alguien usó la app entre medio).
  2. **Reinicio de todos, una sola vez** (`respaldo_v4.reinicio`): borra planes, hábitos, registros, vicios, objetivos, cofres personales, propuestas, compras, avisos, parámetros votados (`group_config`) y la tienda de cada grupo (se vuelve a sembrar con el catálogo nuevo). Quedan cuentas, grupos, cofres del grupo, el Juicio y la liga. Las fotos de Storage no se pueden borrar desde SQL.
  3. Configuración plana (`CONFIG4`, desde `content/config.json`), catálogo de tienda (`STORE4`, desde `content/store.json`).
  4. El resto de las secciones, abajo.

## Qué se guarda (nuevo)
| Tabla / columna | Qué es | Quién la ve |
|---|---|---|
| `plan_habits.scope`, `plan_vices.scope` | `plan-inicial` / `grupo` / `solo-yo` (parte de la foto del plan) | quien ve el plan |
| `habits.strength_easy` | ejercicio de fuerza base en variante fácil | dueño (como `habits`) |
| `strength_settlements` (user, day, choice `extra`/`pay`, exercise) | cómo se saldó un día fallado: evento, no total | grupo (el feed muestra solo «20 extra») |
| `area_answers` (user, area, `no`/`poco`/`mucho`) | respuesta privada por área (tienda y Juicio) | **solo su dueño** |
| `store_catalog`/`store_items`: `area`, `unlock_level`, `group_only`, `registry_only` | precios por área y vales de grupo | grupo |
| `profiles.quiz_answers.v42` | respuestas del cuestionario, incluidos los 2 textos libres | nadie desde la app |

La meta de cada ejercicio de fuerza base es `plan_habits.target` del hábito de bloque `fuerza` (ya era parte de la foto del plan): no hizo falta una tabla aparte. `plans.training_level` se eliminó.

## Qué se calcula
- **Dos totales por día** (`totals_pure` = `dayTotals`): *personal* (todo) y *ranking* (sin «solo yo»). `day_score` devuelve el personal y `ranking`; `day_points` (ranking del grupo) usa el de ranking.
- **Monedas** (`coin_days`): con el total personal.
- **Fuerza base** (`strength_state`): por cada semana, la cadena Variante A (`strength_week_pure` = `weekChain`) con el factor de las metas de cada día (`rewardFactor`). Día = el peor ejercicio (`dayRatio`). Días fallados: saldados con «extra» (nada), con «pagar» (resta monedas y experiencia) o pendientes.
- **Experiencia** = Σ max(0, total personal) + experiencia de fuerza base − experiencia pagada; mínimo 0. **El nivel puede bajar.**
- **Rango** (`rank_points_pure`, `rank_pure`): puntos de continuidad sobre días cerrados; premios de los rangos alcanzados hoy.
- **Cofres de ahorro** (`chest_coins`): hitos según el avance actual de cada cofre + «Cofre a salvo» por semana cerrada.
- **Billetera** = días cerrados + pool de semanas cerradas + fuerza base + premios de rango + cofres − pagado por días fallados − compras. Puede quedar negativa: bloquea compras.
- **Tope de la meta** (`strength_cap` = `maxTargetFor`): 100 + 10 cada 10 niveles.
- **Precio** (`price_pure` = `priceOf`) y oculto (`item_hidden`), con la respuesta privada; `my_store()` devuelve mi tienda sin exponer las respuestas.

## Reglas de cambio
- Agregar un hábito o vicio con «solo yo»: **directo** (sin votación), queda `solo-yo`, rige mañana. Su peso, meta, gravedad y sacarlo: también directo.
- Todo lo que cuenta para el ranking se vota (alcance «solo yo» o «todo el grupo»), incluida la **meta de la fuerza base** (de a 10, hasta el tope del nivel). Con «todo el grupo», la meta se cambia en ese ejercicio a cada miembro que tenga fuerza base.
- La fuerza base no se saca ni cambia de peso.

## Juicio de la mañana
Desacoplado de la liga: se guarda y se muestra, **sin premio**. Disponible si ayer tenías plan. Su ahorro puede ir a un cofre y su gasto cuenta para «Cofre a salvo». Las preguntas de fumar y alcohol se hacen si en el cuestionario contestaste *poco* o *mucho* en esa área (sin respuesta, se pregunta); la persona puede forzarlas en Perfil.

## Liga
Sin uso desde la 007. La **008** (`008_quitar_liga.sql`, confirmada por el dueño el 2026-11-15) vuelve a respaldar `league_state`, `league_events` y `goal_milestones` en `respaldo_v4` (`*_008`) y después borra esas tablas, las funciones de la liga y sus parámetros. Se quedan el Juicio y `user_settings` (preferencias del Juicio). Los parámetros de liga de `content/judgment.json` se siguen copiando a la 004 por compatibilidad; la 008 los borra.

## Valores provisionales (content/config.json)
xpPerLevel 300 · tope +10 cada 10 niveles · factor 0,5 + meta/100 · variante fácil con meta 10 y sus nombres · plancha en segundos · Variante A con tope desde el día 4 (8 monedas, 40 de experiencia) · compoundMissRate 1 · rangos 10/30/50 con premios 10/20/40 · vales en niveles 10/20/30 a 15/40/60 · cofres: hitos 1/2/3/6 monedas y 1 por semana (antes 5/10/15/30 y 5 puntos de liga, ÷5).

## Supuestos tomados al implementar (a confirmar)
1. Mientras haya un día fallado sin saldar, las recompensas de fuerza base quedan **retenidas** y vuelven al saldarlo (no se pierden).
2. Los cambios de un «solo yo» que no son agregar ni el peso (meta, gravedad, sacarlo) también son directos, porque no cuentan para el ranking.
3. Los cambios de vicios con alcance «solo yo» siguen aprobándose sin votación por privacidad (regla anterior), aunque el vicio cuente para el ranking.
4. Las respuestas por área se contestan una sola vez (reiniciar las borra).
5. Los hitos del cofre se calculan con el avance actual: si sacás plata y bajás de un hito, ese premio se quita.
6. «Cofre a salvo» cuenta las semanas cerradas desde el primer plan.
7. Al rechazar la fuerza base: un chiste (rotan los 5) insiste una vez y deja seguir sin fuerza base. La spec dice "deja elegir algo extra": no está definido qué.
8. Con la pantalla de áreas desaparecieron las sugerencias que hacían las 4 preguntas directas (hábitos sugeridos y el vicio «fumar»).
