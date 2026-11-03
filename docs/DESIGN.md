# Guía visual (v0.1) — estilo oscuro tipo RPG

Dirección: fondo oscuro, acentos de color, sensación de "misiones, XP y niveles". **Identidad propia**: nada de nombre, logo, tipografía ni ilustraciones de la app de referencia.

## Colores (tokens)
Contraste calculado (WCAG, relación de luminancia) contra fondo `#0E1116`; todos ≥ 4,5:1 para texto.

| Token | Hex | Uso | Contraste sobre fondo |
|---|---|---|---|
| `--bg` | `#0E1116` | Fondo | — |
| `--surface` | `#171B22` | Tarjetas | — |
| `--surface-2` | `#1F2530` | Tarjetas elevadas / inputs | — |
| `--border` | `#2B3340` | Bordes | — |
| `--text` | `#E8ECF2` | Texto principal | 16,0 |
| `--text-muted` | `#9AA4B2` | Texto secundario | 7,5 |
| `--primary` | `#8B7CFF` | Botones, selección | 5,8 (texto oscuro `#0E1116` sobre botón: 5,8) |
| `--xp` | `#F5C451` | Puntos / XP | 11,6 |
| `--streak` | `#FF7A45` | Racha | 7,3 |

Color por área (también para íconos y barras de progreso):
`cuerpo #FF6B6B` · `mente #B4A8FF` · `sueno #5AA9FF` · `alimentacion #7BD88F` · `foco #4FD1C5` · `social #FF8FD0`
(Foco turquesa verificado ≥ 4,5:1 sobre fondo y tarjetas.) No usar solo el color para distinguir áreas: acompañar con ícono y nombre.

## Tipografía [ABIERTO]
Una fuente de títulos con carácter (para nombres de arquetipo, niveles, números grandes) y una sans legible para el resto. Elegirlas y verificar su licencia antes de usarlas.

## Componentes clave
- **Tarjeta de hábito:** ícono del área, nombre, criterio ("Se cumple si…") en texto suave, botón de check grande (zona táctil ≥ 44 px).
- **Barra del día:** puntos de hoy sobre 100 (viene de `habit_logs.points`).
- **Racha:** número + llama, color `--streak`.
- **Ranking:** posición, usuario, arquetipo, `total_points`, `pct`, racha; fila propia resaltada.
- **Tarjeta de arquetipo:** nombre, frase, descripción, fortalezas y "ojo con" (de `content/archetypes.json`).
- **Radar de 6 áreas** [v2]: usa `profiles.area_scores`.

## Flujo del onboarding
1. Bienvenida → 2. Quiz (20 preguntas, una por pantalla, barra de progreso, botón atrás) → 3. Resultado: arquetipo + paquete de hábitos sugerido → 4. Editar paquete (quitar/cambiar/agregar; mínimo 3) → 5. Crear grupo o unirse con código.

## Ilustración
[ABIERTO] Opciones sin riesgo de derechos: íconos propios o de una librería con licencia clara (verificar licencia), formas geométricas y gradientes. No generar ni copiar arte de personajes existentes.

## Accesibilidad mínima
Respetar `prefers-reduced-motion` (animaciones de XP opcionales), tamaño de texto escalable, foco visible en teclado.
