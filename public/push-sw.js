// Notificaciones: lo carga el service worker de la PWA (vite.config.ts → workbox.importScripts).
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const scope = self.registration.scope
  event.waitUntil(self.registration.showNotification(data.title || 'Habit League', {
    body: data.body || '',
    tag: data.tag,
    icon: scope + 'pwa-192.png',
    badge: scope + 'pwa-192.png',
    data: { url: scope },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) if (c.url.startsWith(url) && 'focus' in c) return c.focus()
    return self.clients.openWindow(url)
  })())
})
