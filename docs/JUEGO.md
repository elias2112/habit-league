# La Liga de las Tres Transformaciones (v0.2) — implementada (migración 004)

Capa de juego encima de los hábitos. Inspirada en la parábola de **las tres transformaciones del espíritu** de Nietzsche (*Así habló Zaratustra*, 1883): el **camello** carga y obedece, el **león** se rebela y dice "no", el **niño** juega y crea. Acá se traduce a **disciplina → destrucción (de vicios) → disfrute**. Es una lectura libre para un juego, no una interpretación académica.

Mecánica de ligas por divisiones (tipo ranked de videojuegos), con **nombres propios**: no se copian nombres, escudos ni arte de ningún juego.

## 1. Etapas y divisiones

| Etapa | Divisiones | Qué entrena | Qué rinde más en esta etapa |
|---|---|---|---|
| 🐪 Camello | III → II → I | Disciplina: cumplir el plan | Completar hábitos (×1,5) |
| 🦁 León | III → II → I | Destrucción: romper vicios | Días limpios en el Juicio (×1,5) |
| 🧒 Niño | III → II → I | Disfrute: crear y jugar | Avanzar objetivos, proponer hábitos aprobados, fotos (×1,5) |
| ✨ Zaratustra | única | Lo sostenés todo | — |

- Cada división va de 0 a 100 **PL** (puntos de liga). Al pasar 100 subís de división; si bajás de 0, bajás (nunca por debajo de Camello III).
- **Escudo:** al subir de división tenés 3 días en los que no podés bajar.
- **Prueba de etapa** (para pasar de Camello I a León III, etc.):
  - Camello → León: racha de 7 días con al menos 70 puntos.
  - León → Niño: 10 días limpios en el Juicio (sin vicios declarados) en las últimas 2 semanas.
  - Niño → Zaratustra: completar un objetivo y una racha de 21 días.
- **Temporada** = la duración del reto del grupo (66 días por defecto). Al terminar queda una insignia con el rango final y se reinicia bajando una etapa.

## 2. El Juicio del día

Al **abrir la app por primera vez en el día**, aparece un juicio corto sobre **ayer**. Funciona sin notificaciones; cuando haya push, se puede sumar un recordatorio a la noche.

1. **Hábitos de ayer:** no se pregunta, se calcula (ya está registrado). "Ayer hiciste 4 de 5 → +8 PL".
2. **Preguntas** (solo las que aplican según tu quiz; las podés activar o desactivar en Perfil). Fuente: `content/judgment.json`:

| Pregunta | Respuesta | PL |
|---|---|---|
| ¿Comiste mal (comida chatarra, atracón)? | Sí / No | −5 / +2 |
| ¿Fumaste? ¿Cuántas pitadas o cigarrillos? | 0 / número | +3 / −1 por unidad (máx. −10) |
| ¿Tomaste alcohol? ¿Cuántos tragos? | 0 / número | +2 / −2 por trago después del segundo (máx. −10) |
| ¿Gastaste en algo que no necesitabas? ¿Cuánto? | 0 / monto | +2 / −1 cada 5 € (máx. −10) |
| ¿Ahorraste algo? ¿Cuánto? | monto | +1 cada 5 € (máx. +10) |
| ¿Hiciste algo solo porque lo disfrutás? | Sí / No | +3 / 0 |

3. **Misiones sorpresa:** 2 por día, al azar de una bolsa de 12 (hacer la cama, una buena acción, ordenar 10 minutos, hablar con la familia, aprender algo, caminar sin auriculares…). Sí = +3. Rotan durante la semana y son siempre las mismas para esa persona ese día.
4. **Resultado:** total de PL con el veredicto; aviso si subiste o bajaste de división.

El primer día en la liga no hay Juicio (ayer todavía no jugabas). Si no lo respondés, ayer se cierra solo al día siguiente contando solo los hábitos.

Sistema de honor: el grupo ve tu rango y el total ("Juicio: +12 PL"). Cada persona puede activar en Perfil "Mostrar el detalle de mi Juicio", y entonces el grupo ve también cada respuesta (incluido lo negativo).

## 3. PL del día

```
PL = hábitos + juicio
hábitos = (puntos de ayer − 50) / 2,5        → de −20 a +20
juicio  = suma de la tabla de arriba          → de −35 a +22 aprox.
```

Multiplicador de la etapa (×1,5) sobre la parte que entrena esa etapa. Días sin abrir la app: solo cuenta la parte de hábitos (si no marcaste nada, −20).

**El Juicio no toca los 100 puntos diarios:** sus negativos viven en la liga. Los que sí ajustan los puntos diarios son los **vicios declarados** (×0,9 cada uno) y los **tropiezos** del día (ver `docs/PRODUCT.md`, migración 005); como la parte de hábitos de los PL usa esos puntos ajustados, también se notan en la liga.

## 4. El dinero como juego: el Cofre

- Cada objetivo de **ahorro** es un **cofre** que se llena de monedas: cada check de "Ahorrar X €" y cada "¿Ahorraste algo?" del Juicio deposita monedas.
- **Hitos** al 25, 50, 75 y 100 % con insignia y +PL (5, 10, 15 y 30).
- **El Dragón del gasto:** el gasto innecesario declarado no saca plata del cofre (es tu plata real), pero alimenta al dragón: si el dragón come más de lo que ahorraste en la semana, perdés el bonus semanal de ahorro.
- **Racha de ahorro:** semanas seguidas ahorrando algo → +5 PL por semana.
- **Retos de ahorro** opcionales: "52 semanas" (semana N = N €) o "Día sin gastar" (hábito).
- Opcional en grupo: **cofre compartido** (ej. un viaje juntos), donde cada uno ve cuánto aportó el resto.
- Todo es registro. La app nunca mueve plata real.

## 5. Decisiones (dueño, 2026-11-04)

1. Los negativos afectan **solo la liga**; los 100 puntos diarios y el ranking del reto no cambian.
2. El Juicio es **a la mañana sobre ayer** (sin notificaciones por ahora).
3. El grupo ve el total; cada persona puede **habilitar mostrar el detalle**, también lo negativo.
4. Valores elegidos por Claude (tabla de arriba, editables en `content/judgment.json`), más **misiones sorpresa** positivas que rotan en la semana. Rango máximo: Zaratustra.
5. **Cofre compartido de grupo: sí.**

## 6. Pendiente

- Notificaciones push (recordatorio a la mañana o a la noche).
- Temporadas: reinicio de la liga al terminar el reto del grupo (hoy la liga es por persona y no se reinicia).
