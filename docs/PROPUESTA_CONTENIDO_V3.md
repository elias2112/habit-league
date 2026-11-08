# Propuesta de contenido v3 — PARA REVISAR (nada de esto está cargado)

Pedido del dueño (2026-11-08): objetivos a partir de las plantillas actuales más "dejar de fumar" (punto 6); vectores del quiz generados por Claude, con una muestra para revisar (punto 7). Sin afirmaciones ni plazos que no estén en las plantillas.

## 1. Catálogo de objetivos

Los textos salen de `content/goals.json` (plantillas actuales); solo "Dejar de fumar" es nuevo. Formato: nombre · pilar · etiqueta (para la tienda) · qué genera.

| Objetivo | Pilar | Etiqueta | Genera |
|---|---|---|---|
| Ahorrar para algo | Dinero | `ahorrar` | Un cofre de ahorro y el hábito "Ahorrar {cuota} €" (la cuota sale del monto y la fecha que pone la persona) |
| Leer | Mente | `leer` | Hábito con meta medible "Leer {n} páginas" (libros × páginas por libro / días) |
| Escribir | Creatividad | `escribir` | Hábito con meta medible "Escribir {n} palabras" (palabras totales / días) |
| Dejar de fumar | Cuerpo | `dejar-fumar` | Sugiere los hábitos del catálogo "Fumar menos que ayer" y "Día sin fumar", y el vicio "Fumar o vapear" para marcar cada día. Con esta etiqueta, la tienda no ofrece el cigarro |
| Otro objetivo | (lo elige la persona) | — | Hábito "Avanzar en «{título}» 30 minutos" |

Preguntas para vos:
- ¿"Leer" va en Mente o en Habilidades?
- En "Dejar de fumar", ¿la gravedad sugerida del vicio es normal o grave?

## 2. Quiz nuevo: estructura propuesta

Orden pedido en la spec: objetivos → nivel y dificultad → actitud.

1. **Objetivos:** "¿Qué querés lograr en estos días? Elegí hasta 3" (catálogo de arriba, o uno propio).
2. **Nivel por pilar (0–3):** una pregunta por pilar.
   - **Se mantienen:** q3 actividad física, q4 sueño y q5 alimentación (las tres en Cuerpo, que toma el promedio), q7 estrés y q8 cumplir lo planeado (en Mente, con promedio).
   - **Sale:** q6 "¿Cada cuánto ves gente…?" (Conexión).
   - **Faltan 4 preguntas nuevas, para que las escribas o apruebes:**
     - Dinero: por ejemplo, "¿Qué tan ordenada tenés tu plata?"
     - Habilidades: por ejemplo, "¿Cuánto tiempo le dedicás a aprender algo?"
     - Creatividad: por ejemplo, "¿Cada cuánto hacés algo creativo?"
     - Carrera y estudios: por ejemplo, "¿Cómo vas con tu trabajo o tus estudios?"

     Las opciones serían de 0 a 3, con el mismo formato que las actuales.
3. **Dificultad:** en el paquete, cada hábito sugerido trae "¿Cuánto te cuesta esto?" (peso 1–3). Ya está hecho en la app.
4. **Actitud:** las 12 preguntas actuales (q9–q20), los 3 ejes y los 8 arquetipos, sin cambios.
5. **Directas (q21–q24):** sin cambios. Fumar a diario sin querer dejar → sugiere seguir el vicio.

**Paquete sugerido (propuesta):**
- Primero, los hábitos que generan los objetivos elegidos.
- Después, hábitos generales del catálogo para los pilares de menor nivel, con la regla actual de dificultad (nivel → dificultad máxima, más el ajuste del arquetipo).
- No pongo límite de cantidad (respuesta 7: "no limites nada por ahora").

## 3. Muestra de vectores (para revisar)

Calculados a mano con la estructura de arriba. Las preguntas nuevas se anotan con nombres provisorios (`nivel_dinero`, etc.).

**Vector A: "ahorro y fumar".** Objetivos: Ahorrar para algo, Dejar de fumar. Niveles: cuerpo 1 (q3 = 1, q4 = 1, q5 = 1), mente 2 (q7 = 2, q8 = 2), dinero 0, habilidades 1, creatividad 1, carrera 2. Actitud: toda en "a" (0). Directas: q21 = c.
- Arquetipo: Espíritu Libre (emr), con ajuste de dificultad −1.
- Radar Día 1: cuerpo 33, mente 67, dinero 0, habilidades 33, creatividad 33, carrera 67.
- Paquete:
  - De los objetivos: Ahorrar (cofre), Fumar menos que ayer, Día sin fumar.
  - Generales: los fáciles (dificultad 1) de los pilares de menor nivel: dinero (no tiene catálogo todavía), cuerpo → Caminar 30 minutos y Estirar 10 minutos.
- Vicio: Fumar o vapear.

**Vector B: "escritura".** Objetivos: Escribir. Niveles: todo 3. Actitud: toda en "d" (3). Directas: todo "a".
- Arquetipo: Estratega (EMR).
- Radar Día 1: cuerpo 100, mente 100, dinero 100, habilidades 100, creatividad 100, carrera 100.
- Paquete:
  - Del objetivo: Escribir N palabras.
  - Generales: los difíciles (dificultad 3) de Cuerpo y Mente: Entrenamiento de fuerza, Meditar 15 minutos.
- Sin vicios.

**Vector C: "otro objetivo".** Objetivo: "Aprender guitarra" (propio, pilar Habilidades). Niveles: todo 2. Actitud: toda en "c" (2). Directas: q23 = d.
- Arquetipo: Estratega (EMR: 8 ≥ 6 en los tres ejes).
- Radar Día 1: todo 67.
- Paquete:
  - Del objetivo: Avanzar en «Aprender guitarra» 30 minutos.
  - Directas: Menos de 2 h de redes, Sin celular la primera hora.
  - Generales: dificultad media (2) de Cuerpo y Mente.

Cuando apruebes las secciones 1 y 2 (y escribas o apruebes las 4 preguntas nuevas), genero el conjunto completo de vectores, reemplazo el quiz y ajusto `tests/quiz.test.ts`. Hasta entonces la app usa el quiz actual: los hábitos de Conexión ya no se sugieren y el plan se crea con el modelo v3.
