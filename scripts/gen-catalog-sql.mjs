// Regenera el bloque del catálogo en la migración 003 a partir de content/habits.json.
// Uso: npm run catalog   (después de editar content/habits.json, y volver a ejecutar 003 en Supabase)
import { readFileSync, writeFileSync } from 'node:fs'

const MIGRATION = 'supabase/migrations/003_grupo_objetivos_fotos.sql'
const { habits } = JSON.parse(readFileSync('content/habits.json', 'utf8'))

const q = (v) => (v == null ? 'null' : typeof v === 'string' ? `'${v.replaceAll("'", "''")}'` : String(v))
const rows = habits.map((h) =>
  `  (${[h.id, h.area, h.name, h.criterion, h.tier, h.target ?? 1, h.unit ?? null, Boolean(h.private_default)].map(q).join(', ')})`)

const block = [
  '-- BEGIN CATALOG (generado por scripts/gen-catalog-sql.mjs; no editar a mano)',
  'insert into public.catalog_habits (id, area, name, criterion, tier, target, unit, private_default) values',
  rows.join(',\n'),
  'on conflict (id) do update set area = excluded.area, name = excluded.name, criterion = excluded.criterion,',
  '  tier = excluded.tier, target = excluded.target, unit = excluded.unit, private_default = excluded.private_default;',
  '-- END CATALOG',
].join('\n')

const sql = readFileSync(MIGRATION, 'utf8')
const re = /-- BEGIN CATALOG[\s\S]*?-- END CATALOG/
if (!re.test(sql)) throw new Error('No encontré los marcadores BEGIN/END CATALOG en ' + MIGRATION)
writeFileSync(MIGRATION, sql.replace(re, block))
console.log(`✓ ${habits.length} hábitos escritos en ${MIGRATION}`)
