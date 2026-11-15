// Copia literal de modifications/reference/*.test.mjs a tests/reference/*.test.ts: solo cambian los imports.
// Uso: node scripts/copy-reference-tests.mjs [nombre ...]   (sin nombres: todos)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const src = 'modifications/reference'
const names = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(src).filter((f) => f.endsWith('.test.mjs')).map((f) => f.replace('.test.mjs', ''))
for (const n of names) {
  let s = readFileSync(`${src}/${n}.test.mjs`, 'utf8').replace(/\r\n/g, '\n')
  s = s.replace("import test from 'node:test';", "import { test } from 'vitest';")
    .replace(/from '\.\/catalog\.json' with \{ type: 'json' \};/g, "from '../../content/store.json';")
    .replace(/from '\.\/([a-z]+)\.mjs';/g, "from '../../src/game/$1';")
  writeFileSync(`tests/reference/${n}.test.ts`, `// @ts-nocheck — copia literal de modifications/reference/${n}.test.mjs (fuente de verdad del dueño); solo cambian los imports.\n` + s)
  console.log('✓', n)
}
