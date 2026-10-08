/* global self, caches, setTimeout, URL, fetch */
/*
 * Kiosko: abrir aunque no haya internet (08/10/26).
 *
 * Primero la RED, siempre. Solo si la red no contesta se sirve la ultima
 * copia guardada. Asi, con internet, el kiosko siempre corre la version
 * nueva (una copia vieja servida desde la cache seria peor que no tener
 * esto: la tienda cambia precios y pantallas seguido), y sin internet una
 * recarga no deja la caja en blanco.
 *
 * Solo toca lo del propio kiosko (la pagina y sus archivos). Las consultas
 * a la base van a otro dominio y no pasan por aqui: sin internet fallan y
 * la app usa su respaldo (src/lib/respaldo.ts).
 */
const CACHE = 'kiosko-sin-internet-v1'
// Sin internet, con la red de la tienda viva, una peticion no falla: se
// queda esperando. Pasado esto se sirve la copia.
const ESPERA_MS = 8000

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

function conLimite(promesa) {
  return Promise.race([
    promesa,
    new Promise((_, no) => setTimeout(() => no(new Error('sin respuesta')), ESPERA_MS)),
  ])
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/sw.js') return
  const esPagina = req.mode === 'navigate'
  const clave = esPagina ? '/index.html' : req

  e.respondWith((async () => {
    try {
      const res = await conLimite(fetch(req))
      if (res.ok && res.type === 'basic') {
        const copia = res.clone()
        caches.open(CACHE).then((c) => c.put(clave, copia)).catch(() => {})
      }
      return res
    } catch (err) {
      const guardada = await caches.match(clave)
      if (guardada) return guardada
      throw err
    }
  })())
})
