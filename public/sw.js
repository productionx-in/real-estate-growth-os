/* RE by PX service worker — Web Push alerts (M1-6).
 * Shows a system notification for each push and opens the lead when it is tapped.
 * No offline caching: the app always needs live data, and a stale cache would show wrong leads. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'RE by PX', body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'RE by PX'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      requireInteraction: true,
      data: { url: payload.url || '/select-org' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/select-org', self.location.origin)
  // Only ever navigate within this app's own origin.
  if (target.origin !== self.location.origin) return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === target.origin && 'focus' in w) {
          w.navigate(target.href)
          return w.focus()
        }
      }
      return self.clients.openWindow(target.href)
    })
  )
})
