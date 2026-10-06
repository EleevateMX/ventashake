/* global self */
// El service worker de Shakeaholic Rewards.
//
// Hace UNA cosa: recibir avisos push y enseñarlos. No guarda la app en
// caché a propósito: la tienda publica cambios de menú y precios varias
// veces por semana, y una copia vieja servida desde el teléfono es peor
// que pedir la página. Instalarse en Android no necesita caché.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = { titulo: 'Shakeaholic', cuerpo: '', datos: {} }
  try { d = { ...d, ...e.data.json() } } catch { d.cuerpo = e.data ? e.data.text() : '' }
  e.waitUntil(self.registration.showNotification(d.titulo, {
    body: d.cuerpo,
    icon: '/icono-192.png',
    badge: '/icono-192.png',
    data: d.datos || {},
    tag: d.datos && d.datos.tag ? String(d.datos.tag) : undefined,
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const ir = e.notification.data && e.notification.data.ir ? `/?ir=${e.notification.data.ir}` : '/'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) {
      if ('focus' in c) { c.navigate(ir).catch(() => {}); return c.focus() }
    }
    return self.clients.openWindow(ir)
  }))
})
