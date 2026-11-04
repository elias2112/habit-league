# Quiz, perfiles y hábitos (v0.1)

> Todo el contenido es propio y editable. **No es un test psicométrico validado** ni tiene respaldo científico: es una herramienta de juego para asignar un punto de partida. Los datos viven en `content/*.json`; este documento es solo una vista legible.

## Cómo se calcula el perfil

1. **Áreas (q1–q2):** cada área elegida en q1 suma 3 de prioridad; el área de q2 suma 2.
2. **Nivel por área (q3–q8):** cada pregunta da 0–3 para su área (cuerpo=q3, sueño=q4, alimentación=q5, conexión=q6, mente=q7, foco=q8).
3. **Ejes de actitud (q9–q20):** tres ejes de 4 preguntas (0–3 cada una, suma 0–12). Alto si suma ≥ 6 (umbral arbitrario).
   - **E**structura: alto = necesita guía y reglas claras
   - **M**omentum: alto = constante hoy
   - **R**esiliencia: alto = retoma rápido tras fallar
4. **Arquetipo:** combinación E/M/R alto-bajo → 8 arquetipos.
5. **Paquete inicial de hábitos:** se eligen hasta 3 áreas (por prioridad; empate → menor nivel primero). Se reparten `start_habits` hábitos entre ellas por turnos. En cada área se prefieren los hábitos de mayor dificultad permitida, donde dificultad máxima = tier del nivel (0–1→1, 2→2, 3→3) + `tier_adjust` del arquetipo, limitado a 1–3.
6. El usuario puede **quitar, cambiar o agregar** hábitos (mínimo 3 activos, ver Normalización).

## Preguntas directas (q21–q24)

Cuatro preguntas más directas (fumar o vapear, alcohol, redes, delivery). **No cambian el arquetipo ni las áreas**: cada opción trae una lista `suggest` de hábitos del catálogo que se agregan al paquete sugerido, o un `vice` para declarar (ver `content/vices.json`); la persona los puede quitar. Las respuestas son privadas. Los hábitos de fumar y alcohol se crean como privados por defecto (`private_default`).

| Pregunta | Sugiere |
|---|---|
| ¿Fumás o vapeás? | A veces → Día sin fumar · Todos los días → declarar el vicio Fumar (×0,9, sin hábito) · Todos los días y quiero dejar → Fumar menos que ayer |
| ¿Cuántos días por semana tomás alcohol? | 3–4 → Día sin alcohol · 5 o más → Máximo 2 tragos |
| ¿Cuántas horas por día en redes? | 2–4 h → Menos de 2 h de redes · Más de 4 h → además, Sin celular la primera hora |
| ¿Cuántas veces por semana delivery o comida rápida? | 3 o más → Día sin delivery |

## Catálogo ampliado (v0.2)

- `auto: false`: el hábito se ve en el catálogo pero **no entra en el paquete automático** del paso 5 (así los paquetes de los vectores de prueba no cambian y nadie recibe "Día sin fumar" sin haberlo pedido).
- `target` / `unit`: se marca por partes (ej. 8 vasos de agua, 4 bloques de 25 min).
- Nuevos: 10.000 pasos, Correr 5 km, Fumar menos que ayer, Día sin fumar, Menos de 2 h de redes, 20 minutos al aire libre, Acostarte a la misma hora, Celular fuera de la cama, Máximo 2 tragos, Día sin alcohol, Día sin delivery, 2 frutas, Sin celular la primera hora, 4 bloques de 25 minutos, Ayudar a alguien, Comer con alguien sin pantallas.
- El catálogo también vive en la base (`catalog_habits`, migración 003), generado con `npm run catalog`: así nadie puede crear un hábito "de catálogo" con otra dificultad.

## Normalización del puntaje

- Cada hábito tiene `tier` 1, 2 o 3 (esfuerzo).
- Puntos de un hábito = `100 × tier / suma de tiers de los hábitos activos` del usuario.
- Un usuario suma **como máximo 100 puntos por día**, sin importar su arquetipo ni cuántos hábitos tenga. La base de datos aplica ese tope.
- El ranking muestra `total_points` y `pct` (puntos / máximo posible desde que entró), para comparar justo aunque alguien se una tarde.
- **Límite conocido:** mide cumplimiento de *tu propio plan*, no esfuerzo absoluto. Alguien podría elegir pocos hábitos fáciles. Mitigaciones propuestas: mínimo de 3 hábitos activos (no aplicado aún en la base) y que el grupo vea los hábitos de todos.

## Preguntas

**Q1** · _objetivos_ · ¿Qué áreas de tu vida querés mejorar ahora mismo? Elegí hasta 3.
_(multi, elegir 1–3)_
- Cuerpo y ejercicio → cuerpo
- Mente y bienestar → mente
- Sueño y descanso → sueno
- Alimentación → alimentacion
- Foco y productividad → foco
- Relaciones y vida social → social

**Q2** · _objetivos_ · ¿Qué resultado te importaría más dentro de 66 días?
- Tener más energía y fuerza → cuerpo
- Sentirme más en calma y con la cabeza clara → mente
- Dormir bien y despertar con energía → sueno
- Comer mejor sin complicarme → alimentacion
- Avanzar en mi trabajo o estudios → foco
- Estar más cerca de la gente que quiero → social

**Q3** · _nivel_ · ¿Cómo es tu actividad física hoy?
- Casi no me muevo (0)
- Me muevo a veces, sin constancia (1)
- Hago ejercicio 2 o 3 veces por semana (2)
- Entreno 4 o más veces por semana (3)

**Q4** · _nivel_ · ¿Cómo dormís últimamente?
- Mal, casi siempre (0)
- De forma irregular (1)
- Bastante bien (2)
- Muy bien y con horarios fijos (3)

**Q5** · _nivel_ · ¿Cómo describirías tu alimentación?
- Improvisada, con mucha comida rápida (0)
- Intento cuidarme pero soy inconsistente (1)
- Bastante ordenada (2)
- Muy cuidada (3)

**Q6** · _nivel_ · ¿Cada cuánto hablás o te ves con gente que te importa?
- Casi nunca (0)
- Una vez al mes (1)
- Una vez por semana (2)
- Casi todos los días (3)

**Q7** · _nivel_ · ¿Cuánto estrés o carga mental sentís en una semana normal?
- Casi todo el tiempo (0)
- Varias veces por semana (1)
- A veces (2)
- Rara vez (3)

**Q8** · _nivel_ · ¿Qué tan seguido llegás a hacer lo que planeaste para el día?
- Casi nunca (0)
- A veces (1)
- Casi siempre (2)
- Siempre (3)

**Q9** · _estructura_ · Cuando empiezo un hábito nuevo, lo que más me ayuda es…
- Hacerlo a mi manera, sin reglas (0)
- Tener una idea y ajustarla sobre la marcha (1)
- Una guía general y me organizo yo (2)
- Un plan paso a paso con recordatorios (3)

**Q10** · _estructura_ · Cuando tengo el día libre, normalmente…
- Improviso y me funciona (0)
- Organizo bastante bien (1)
- Armo una lista pero me cuesta seguirla (2)
- Me cuesta decidir por dónde empezar (3)

**Q11** · _estructura_ · Para mí, las reglas claras y fijas son…
- Una carga (0)
- Un poco molestas (1)
- Útiles (2)
- Necesarias; sin ellas me pierdo (3)

**Q12** · _estructura_ · Un recordatorio diario en la app me parecería…
- Molesto (0)
- Indiferente (1)
- Útil (2)
- Imprescindible (3)

**Q13** · _momentum_ · En las últimas 4 semanas, ¿cuántos días por semana mantuviste alguna rutina?
- Casi ninguno (0)
- 1 o 2 (1)
- 3 a 5 (2)
- Casi todos (3)

**Q14** · _momentum_ · ¿Cuándo fue la última vez que sentiste orgullo por tu constancia?
- Hace tanto que no me acuerdo (0)
- Hace meses (1)
- Hace unas semanas (2)
- Esta semana (3)

**Q15** · _momentum_ · ¿Qué tan predecibles son tus días?
- Muy caóticos (0)
- Cambian de semana en semana (1)
- Bastante predecibles (2)
- Muy predecibles (3)

**Q16** · _momentum_ · ¿Qué confianza tenés en poder sostener una rutina diaria durante 7 días seguidos?
- Ninguna confianza (0)
- Poca confianza (1)
- Bastante confianza (2)
- Mucha confianza (3)

**Q17** · _resiliencia_ · Si me salteo un día de mi rutina, normalmente…
- La abandono (0)
- Tardo semanas en retomarla (1)
- La retomo en unos días (2)
- La retomo al día siguiente (3)

**Q18** · _resiliencia_ · Cuando fallo un día, lo que suelo pensar es…
- Prefiero no intentarlo más (0)
- Ya arruiné todo (1)
- Me molesta, pero sigo (2)
- Pasa, mañana sigo (3)

**Q19** · _resiliencia_ · Cuando una semana sale mal, yo…
- Dejo todo (0)
- Pierdo la motivación varios días (1)
- Espero a la semana siguiente para volver (2)
- Ajusto el plan y sigo (3)

**Q20** · _resiliencia_ · Competir con amigos en esto me…
- Presiona o me desanima (0)
- Motiva solo si voy ganando (1)
- Motiva si estoy cerca (2)
- Motiva aunque vaya último (3)

## Arquetipos

| Código | Arquetipo | Hábitos iniciales | Ajuste dificultad |
|---|---|---|---|
| EMR | Estratega | 5 | +0 |
| EMr | Perfeccionista | 4 | +0 |
| EmR | Aprendiz | 3 | +0 |
| Emr | Fénix | 3 | -1 |
| eMR | Autodidacta | 5 | +0 |
| eMr | Velocista | 4 | +0 |
| emR | Nómada | 3 | +0 |
| emr | Espíritu Libre | 3 | -1 |

### Estratega — _Ya tenés el sistema; ahora lo afinás._
Valorás los planes claros, ya sostenés rutinas y te recuperás rápido cuando algo falla. Tu desafío es mantener el ritmo sin caer en la monotonía.
- Fortalezas: Rutinas ya armadas, Retomás rápido
- Ojo con: Aburrirte de lo mismo

### Perfeccionista — _Constante, pero un tropiezo te pesa._
Sostenés rutinas y te gustan los planes claros, pero un día fallado puede hacerte sentir que se arruinó todo. Un día perdido no es el fin del camino.
- Fortalezas: Constancia, Orden
- Ojo con: Tomar un día fallado como un fracaso total

### Aprendiz — _Necesitás guía y siempre volvés a levantarte._
Todavía no tenés un ritmo estable, pero buscás estructura y retomás cuando algo sale mal. Un plan paso a paso, con pocos hábitos, es lo tuyo.
- Fortalezas: Retomás después de fallar, Apertura a la guía
- Ojo con: Querer hacer demasiado de golpe

### Fénix — _Empezás de nuevo, y con apoyo._
Necesitás estructura, tu constancia actual es baja y los tropiezos te cuestan. Lo mejor es arrancar con pocos hábitos fáciles y apoyarte en el grupo.
- Fortalezas: Ganas de cambiar, Disposición a pedir apoyo
- Ojo con: Abandonar tras los primeros tropiezos

### Autodidacta — _Te organizás por tu cuenta y sostenés el ritmo._
Te organizás con autonomía, sos constante y flexible: ajustás sobre la marcha y seguís. Probá hábitos nuevos sin perder tu base.
- Fortalezas: Autonomía, Constancia, Flexibilidad
- Ojo con: Dispersarte con demasiadas ideas

### Velocista — _Arrancás fuerte; el desafío es el largo plazo._
Tenés impulso y autonomía, pero cuando algo falla tendés a soltar. Los retos largos y el grupo te ayudan a no apagarte.
- Fortalezas: Impulso, Autonomía
- Ojo con: Soltar todo tras un mal tramo

### Nómada — _Libre y sin ritmo fijo, pero resiliente._
Preferís tu propio camino y todavía no tenés un ritmo estable, pero te recuperás bien. Empezar liviano y flexible te funciona.
- Fortalezas: Resiliencia, Independencia
- Ojo con: Falta de rutina fija

### Espíritu Libre — _Las reglas no son lo tuyo; empezá liviano._
No te gustan las reglas fijas y sostener cuesta. Lo mejor es empezar con pocos hábitos fáciles y que la competencia con amigos haga de motor.
- Fortalezas: Creatividad, Independencia
- Ojo con: Abandonar cuando se vuelve rutina

## Catálogo de hábitos

### Cuerpo
| Hábito | Se cumple si… | Tier |
|---|---|---|
| Caminar 30 minutos | Al menos 30 minutos caminando, sumados en el día. | 1 |
| Estirar 10 minutos | 10 minutos de estiramientos o movilidad. | 1 |
| Hacer ejercicio 20 minutos | 20 minutos de actividad que te suba el pulso. | 2 |
| Entrenamiento de fuerza | Una sesión de fuerza de al menos 30 minutos. | 3 |

### Mente
| Hábito | Se cumple si… | Tier |
|---|---|---|
| Respirar o meditar 5 minutos | 5 minutos de respiración o meditación. | 1 |
| Escribir en un diario | Al menos 5 minutos escribiendo sobre tu día. | 1 |
| Leer 15 minutos | 15 minutos de lectura (libro, no redes). | 2 |
| Meditar 15 minutos | 15 minutos de meditación sin interrupciones. | 3 |

### Sueño
| Hábito | Se cumple si… | Tier |
|---|---|---|
| Pantallas apagadas 30 min antes de dormir | Sin pantallas los últimos 30 minutos antes de dormir. | 1 |
| Sin cafeína después de las 16:00 | Ninguna bebida con cafeína pasadas las 16:00. | 1 |
| Despertar a la misma hora | Despertar dentro de ±30 minutos de tu hora objetivo. | 2 |
| Dormir 7 horas o más | Dormir al menos 7 horas (lo declarás vos). | 3 |

### Alimentación
| Hábito | Se cumple si… | Tier |
|---|---|---|
| Tomar 2 litros de agua | Llegar a unos 2 litros de agua en el día. | 1 |
| Verdura en 2 comidas | Verdura en al menos 2 comidas del día. | 1 |
| Cocinar una comida en casa | Preparar al menos una comida vos mismo. | 2 |
| Un día sin ultraprocesados | Ninguna comida ultraprocesada en todo el día. | 3 |

### Foco
| Hábito | Se cumple si… | Tier |
|---|---|---|
| Planificar el día 5 minutos | Escribir tus prioridades antes de empezar. | 1 |
| Anotar 3 prioridades para mañana | Dejar escritas 3 prioridades para el día siguiente. | 1 |
| Hacer primero la tarea más difícil | Empezar el día con la tarea que más te cuesta. | 2 |
| Un bloque de trabajo profundo de 45 min | 45 minutos seguidos en una sola tarea, sin distracciones. | 3 |

### Conexión
| Hábito | Se cumple si… | Tier |
|---|---|---|
| Escribirle a alguien que querés | Enviar un mensaje a un amigo o familiar. | 1 |
| Agradecer a alguien | Agradecerle a alguien por algo concreto. | 1 |
| Llamar a alguien 10 minutos | Una llamada o videollamada de al menos 10 minutos. | 2 |
| Pasar tiempo en persona con alguien | Compartir un rato en persona con alguien que te importa. | 3 |
