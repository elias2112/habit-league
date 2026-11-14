// Regenera los bloques de datos de las migraciones a partir de content/:
//   003: catálogo de hábitos (content/habits.json)
//   004: preguntas del Juicio y configuración de la liga (content/judgment.json)
//   005: vicios (content/vices.json)
// Uso: npm run catalog   (después, volver a ejecutar en Supabase esa migración y las siguientes)
import { readFileSync, writeFileSync } from 'node:fs'

const q = (v) =>
  v == null ? 'null'
  : typeof v === 'string' ? `'${v.replaceAll("'", "''")}'`
  : typeof v === 'object' ? `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`
  : String(v)

function replaceBlock(file, name, block) {
  const sql = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const re = new RegExp(`-- BEGIN ${name}[\\s\\S]*?-- END ${name}`)
  if (!re.test(sql)) throw new Error(`No encontré los marcadores BEGIN/END ${name} en ${file}`)
  writeFileSync(file, sql.replace(re, `-- BEGIN ${name} (generado por scripts/gen-catalog-sql.mjs; no editar a mano)\n${block}\n-- END ${name}`))
}

// ── 003: catálogo
const { habits } = JSON.parse(readFileSync('content/habits.json', 'utf8'))
const catalogRows = habits.map((h) =>
  `  (${[h.id, h.area, h.name, h.criterion, h.tier, h.target ?? 1, h.unit ?? null, Boolean(h.private_default)].map(q).join(', ')})`)
replaceBlock('supabase/migrations/003_grupo_objetivos_fotos.sql', 'CATALOG', [
  'insert into public.catalog_habits (id, area, name, criterion, tier, target, unit, private_default) values',
  catalogRows.join(',\n'),
  'on conflict (id) do update set area = excluded.area, name = excluded.name, criterion = excluded.criterion,',
  '  tier = excluded.tier, target = excluded.target, unit = excluded.unit, private_default = excluded.private_default;',
].join('\n'))
console.log(`✓ ${habits.length} hábitos → 003`)

// ── 004: Juicio y liga
const j = JSON.parse(readFileSync('content/judgment.json', 'utf8'))
const qs = [
  ...j.questions.map((x, i) => ({ ...x, kind: 'core', sort: i })),
  ...j.bonus.map((x, i) => ({ ...x, kind: 'bonus', type: 'yesno', category: 'bonus', sort: i })),
]
const qRows = qs.map((x) =>
  `  (${[x.id, x.kind, x.text, x.hint ?? null, x.type, x.unit ?? null, x.category, x.params, x.condition ?? null, x.sort].map(q).join(', ')})`)
const config = {
  bonus_per_day: j.bonus_per_day,
  boost_factor: j.league.boost_factor,
  shield_days: j.league.shield_days,
  demote_to_pl: j.league.demote_to_pl,
  milestones: j.league.milestones,
  weekly_chest_bonus: j.league.weekly_chest_bonus,
  stages: j.league.stages,
}
replaceBlock('supabase/migrations/004_liga_juicio_cofre.sql', 'JUDGMENT', [
  'insert into public.judgment_questions (id, kind, text, hint, type, unit, category, params, condition, sort) values',
  qRows.join(',\n'),
  'on conflict (id) do update set kind = excluded.kind, text = excluded.text, hint = excluded.hint, type = excluded.type,',
  '  unit = excluded.unit, category = excluded.category, params = excluded.params, condition = excluded.condition, sort = excluded.sort;',
  `delete from public.judgment_questions where id not in (${qs.map((x) => q(x.id)).join(', ')});`,
  'insert into public.game_config (key, value) values',
  Object.entries(config).map(([k, v]) => `  (${q(k)}, '${JSON.stringify(v).replaceAll("'", "''")}'::jsonb)`).join(',\n'),
  'on conflict (key) do update set value = excluded.value;',
].join('\n'))
console.log(`✓ ${qs.length} preguntas y ${Object.keys(config).length} valores de configuración → 004`)

// ── 005: vicios
const vj = JSON.parse(readFileSync('content/vices.json', 'utf8'))
replaceBlock('supabase/migrations/005_vicios.sql', 'VICES', [
  'insert into public.vice_catalog (id, name, area, slip, slip_penalty) values',
  vj.vices.map((v) => `  (${[v.id, v.name, v.area, v.slip, v.slip_penalty].map(q).join(', ')})`).join(',\n'),
  'on conflict (id) do update set name = excluded.name, area = excluded.area, slip = excluded.slip, slip_penalty = excluded.slip_penalty;',
  `insert into public.game_config (key, value) values ('vice_multiplier', '${JSON.stringify(vj.multiplier)}'::jsonb)`,
  'on conflict (key) do update set value = excluded.value;',
].join('\n'))
console.log(`✓ ${vj.vices.length} vicios → 005`)

// ── 006: configuración v3, catálogo con pilares y tienda
const M6 = 'supabase/migrations/006_v3_plan_monedas.sql'
const cfg = JSON.parse(readFileSync('content/config.json', 'utf8'))
const flat = {
  severity: cfg.scoring.severity,
  multiplierFloor: cfg.scoring.multiplierFloor,
  maxCompletion: cfg.scoring.maxCompletion,
  ...cfg.coins, ...cfg.time, ...cfg.rules,
  pillars: cfg.pillars,
  areaToPillar: cfg.areaToPillar,
  xpPerLevel: cfg.levels.xpPerLevel,
  strengthExercises: cfg.strength.exercises,
  strengthTargets: Object.fromEntries(cfg.strength.exercises.map((e) => [e.id, e.targets])),
  strengthWeight: cfg.strength.weight,
  strengthDefaultLevel: cfg.strength.defaultLevel,
}
const jl = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`
replaceBlock(M6, 'CONFIG3', [
  'insert into public.game_config (key, value) values',
  Object.entries(flat).map(([k, v]) => `  (${q(k)}, ${jl(v)})`).join(',\n'),
  'on conflict (key) do update set value = excluded.value;',
].join('\n'))
console.log(`✓ ${Object.keys(flat).length} parámetros → 006`)

// Pilar de cada hábito del catálogo según areaToPillar; sin pilar (Conexión) = fuera del catálogo nuevo.
// Catálogo completo con pilar (upsert): así un hábito nuevo del catálogo llega con solo re-ejecutar la 006.
replaceBlock(M6, 'CATALOG3', [
  'insert into public.catalog_habits (id, area, name, criterion, tier, target, unit, private_default, pillar) values',
  habits.map((h) => `  (${[h.id, h.area, h.name, h.criterion, h.tier, h.target ?? 1, h.unit ?? null, Boolean(h.private_default), cfg.areaToPillar[h.area] ?? null].map(q).join(', ')})`).join(',\n'),
  'on conflict (id) do update set area = excluded.area, name = excluded.name, criterion = excluded.criterion, tier = excluded.tier,',
  '  target = excluded.target, unit = excluded.unit, private_default = excluded.private_default, pillar = excluded.pillar;',
].join('\n'))
console.log(`✓ pilares de ${habits.length} hábitos → 006 (${habits.filter((h) => !cfg.areaToPillar[h.area]).length} quedan fuera)`)

const store = JSON.parse(readFileSync('content/store.json', 'utf8'))
const arr = (a) => `array[${(a ?? []).map(q).join(', ')}]::text[]`
replaceBlock(M6, 'STORE', [
  'insert into public.store_catalog (slug, name, kind, price, price_by_weight, weekly_limit, opt_in, conflicts_with, per_objective, price_source) values',
  store.items.map((i) => `  (${[q(i.id), q(i.name), q(i.kind), q(i.price ?? null), i.priceByWeight ? jl(i.priceByWeight) : 'null',
    q(i.weeklyLimit ?? null), q(Boolean(i.optIn)), arr(i.conflictsWith), q(Boolean(i.perObjective)),
    q(i.priceSource === 'dueño' ? 'dueño' : 'sugerencia')].join(', ')})`).join(',\n'),
  'on conflict (slug) do update set name = excluded.name, kind = excluded.kind, price = excluded.price,',
  '  price_by_weight = excluded.price_by_weight, weekly_limit = excluded.weekly_limit, opt_in = excluded.opt_in,',
  '  conflicts_with = excluded.conflicts_with, per_objective = excluded.per_objective, price_source = excluded.price_source;',
].join('\n'))
console.log(`✓ ${store.items.length} artículos de tienda → 006`)
