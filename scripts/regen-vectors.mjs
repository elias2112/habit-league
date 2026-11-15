// Recalcula la salida esperada de content/test_vectors.json con el algoritmo actual y muestra el diff de la
// clasificación (ejes, código y arquetipo). Uso: npx vite-node scripts/regen-vectors.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs'
import { computeProfile } from '../src/lib/quiz.ts'
const f = 'content/test_vectors.json'
const vectors = JSON.parse(readFileSync(f, 'utf8'))
let changes = 0
for (const v of vectors) {
  const now = computeProfile(v.answers)
  for (const k of ['axes', 'code', 'archetype', 'priority', 'level', 'areas', 'habits']) {
    if (JSON.stringify(now[k]) !== JSON.stringify(v.expected[k])) {
      changes++
      console.log(`- ${v.name} · ${k}: ${JSON.stringify(v.expected[k])} → ${JSON.stringify(now[k])}`)
    }
  }
  v.expected = now
}
console.log(changes ? `${changes} diferencia(s)` : `Sin diferencias en los ${vectors.length} vectores.`)
if (process.argv.includes('--write') && changes) writeFileSync(f, JSON.stringify(vectors, null, 2) + '\n')
