// Envía los recordatorios que tocan ahora (agua y fuerza base). Lo corre .github/workflows/recordatorios.yml una vez
// por hora. Necesita (secrets de GitHub, nunca en la app): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// VITE_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY. La base decide a quién y qué (push_due); acá solo se envía.
import webpush from 'web-push'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY })) {
  // Sin secrets todavía: no es un error (el dueño los carga cuando quiera activar los avisos).
  if (!v) { console.log(`Recordatorios desactivados: falta el secret ${k}.`); process.exit(0) }
}
webpush.setVapidDetails(VAPID_SUBJECT || 'https://github.com/elias2112/habit-league', VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const rpc = async (fn, body = {}) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

const due = await rpc('push_due')
let sent = 0, gone = 0, failed = 0
for (const n of due ?? []) {
  try {
    await webpush.sendNotification(
      { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
      JSON.stringify({ title: n.title, body: n.body, tag: n.kind }),
      { TTL: 60 * 60 },
    )
    sent++
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await rpc('drop_push_subscription', { p_endpoint: n.endpoint }); gone++ }
    else { failed++; console.error('No se pudo enviar:', e.statusCode ?? '', e.body ?? e.message) }
  }
}
console.log(`Recordatorios: ${sent} enviados, ${gone} suscripciones vencidas borradas, ${failed} con error.`)
