/**
 * Sugerir nombres de pedido mientras el cajero escribe.
 *
 * Vive aquí y no en la pantalla porque la regla es la que decide **qué
 * nombres existen para el cajero**, y eso ya nos costó caro en otro lado:
 * lo que no sale en la lista, para quien está en la barra, simplemente no
 * está registrado.
 *
 * Dos cosas que la versión vieja hacía mal:
 *
 * 1. Solo empataba por el **principio** del nombre completo. Escribir
 *    «sofia» no encontraba «Ana Sofía», así que el cajero la volvía a
 *    teclear y nacía un nombre nuevo, casi igual, que parte el historial
 *    de esa persona en dos.
 * 2. La lista traía **30 nombres** de 660 registrados. Con eso, el 95% de
 *    la clientela no se podía sugerir aunque estuviera escrita en la base
 *    — y desde la barra se ve idéntico a «no está registrada».
 *
 * El orden importa: primero lo que empieza igual, luego lo que empieza
 * igual en cualquiera de sus palabras, y al final lo que solo lo
 * contiene. Un «contiene» suelto pondría «Marisol» arriba de «Sol».
 */

/** Sin acentos ni mayúsculas: «adri» tiene que encontrar «Adrián». */
export const claveNombre = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function sugerirNombres(
  lista: readonly string[],
  escrito: string,
  max = 12,
): string[] {
  const q = claveNombre(escrito)

  // Sin nada escrito, la lista ya viene ordenada por frecuencia: los de
  // siempre primero. No hay nada que rankear.
  if (!q) return [...lista].slice(0, max)

  const empieza: string[] = []
  const porPalabra: string[] = []
  const contiene: string[] = []

  for (const n of lista) {
    const k = claveNombre(n)
    // Lo ya escrito completo no se sugiere: ofrecerle al cajero el texto
    // que acaba de teclear no es una sugerencia, es ruido que ocupa el
    // lugar de una buena.
    if (k === q) continue
    if (k.startsWith(q)) empieza.push(n)
    else if (k.split(/\s+/).some((p) => p.startsWith(q))) porPalabra.push(n)
    else if (k.includes(q)) contiene.push(n)
  }

  return [...empieza, ...porPalabra, ...contiene].slice(0, max)
}

/**
 * Juntar los nombres aprendidos con la semilla del código, sin repetir.
 *
 * La semilla existe para que una tienda recién abierta no tenga la lista
 * vacía; se va quedando atrás sola conforme se aprenden los de verdad.
 */
export function mezclarConSemilla(
  aprendidos: readonly string[],
  semilla: readonly string[],
): string[] {
  const vistos = new Set(aprendidos.map(claveNombre))
  const lista = [...aprendidos]
  for (const n of semilla) {
    if (!vistos.has(claveNombre(n))) {
      vistos.add(claveNombre(n))
      lista.push(n)
    }
  }
  return lista
}
