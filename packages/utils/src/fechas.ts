/**
 * La fecha del negocio es la de **Mérida**, no la del reloj del navegador
 * ni la de UTC.
 *
 * Esto no es purismo: `vw_ventas_diarias` agrupa por
 * `created_at at time zone 'America/Merida'`, y el Dashboard comparaba
 * contra `new Date().toISOString().slice(0, 10)`, que es UTC. Mérida está
 * en UTC−6 todo el año, así que **a partir de las 18:00 locales el "hoy"
 * de UTC ya es mañana**: la tarjeta "Ventas de hoy" encontraba un día que
 * no existe en la vista y mostraba $0 con 0 órdenes. Todas las tardes,
 * desde las 6 hasta el cierre a las 10:30.
 *
 * Y estaba calculado como constante de módulo, así que una pestaña dejada
 * abierta nunca cambiaba de día: al otro día seguía preguntando por ayer.
 * Por eso esto es una función y se llama en cada refresco.
 */
const ZONA = 'America/Merida'

/** "2026-09-17" en la zona de la tienda. */
export function hoyEnMerida(cuando: Date = new Date()): string {
  // `en-CA` da exactamente AAAA-MM-DD, que es lo que compara la vista.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(cuando)
}

/** "12:34" en la zona de la tienda, para sellar un refresco. */
export function horaEnMerida(cuando: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(cuando)
}

/**
 * "hace 3 s" / "hace 2 min". Para que un panel que dice "en vivo" pueda
 * demostrarlo: sin este sello, un panel congelado y uno al día se ven
 * exactamente igual.
 */
export function hace(desde: Date, ahora: Date = new Date()): string {
  const s = Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 1000))
  if (s < 60) return `hace ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  return `hace ${h} h`
}
